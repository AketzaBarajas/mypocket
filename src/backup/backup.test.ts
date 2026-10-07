import { createIdFromString } from "@evolu/common";
import { describe, expect, it } from "vitest";

import { SCHEMA_VERSION } from "@/data/schema";
import {
  parseSnapshot,
  type Snapshot,
  snapshotRowCount,
  validateSnapshotRow,
} from "@/data/snapshot";

import {
  backupFileName,
  BACKUPS_TO_KEEP,
  createDriveClient,
  type DriveClient,
  DriveError,
  type DriveFile,
  type FetchFn,
  isBackupDue,
  pruneBackups,
} from "./drive";
import { BackupError, decryptBackup, encryptBackup, readBackupHeader } from "./format";
import { buildAuthUrl, parseOAuthResponse } from "./oauth";

const secret = new Uint8Array(16).fill(7);
const otherSecret = new Uint8Array(16).fill(8);
const createdAt = "2026-10-07T09:30:00.000Z";

const ACCOUNT_ID: string = createIdFromString("test:account");

const snapshot: Snapshot = {
  schemaVersion: SCHEMA_VERSION,
  exportedAt: createdAt,
  tables: {
    account: [
      {
        id: ACCOUNT_ID,
        name: "BBVA débito",
        emoji: "💳",
        color: "blue",
        type: "checking",
        openingBalance: 125000,
        openingDate: "2026-01-01",
        isLiquid: 1,
        includeInNetWorth: 1,
        archived: 0,
        sortOrder: 0,
        isDeleted: 0,
      },
    ],
    setting: [],
  },
};

const failure = async (run: () => unknown): Promise<string> => {
  try {
    await run();
  } catch (error) {
    if (error instanceof BackupError || error instanceof DriveError) return error.reason;
    throw error;
  }
  return "no-error";
};

describe("formato de la copia cifrada", () => {
  it("es ilegible sin la frase y lleva un encabezado en claro", async () => {
    const file = await encryptBackup(snapshot, secret, createdAt);
    expect(file).not.toContain("BBVA");
    expect(file).not.toContain("125000");
    const parsed = JSON.parse(file) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      format: "mypocket-backup",
      version: 1,
      schemaVersion: SCHEMA_VERSION,
      createdAt,
    });
    expect(typeof parsed.iv).toBe("string");
    expect(readBackupHeader(file)).toEqual({
      version: 1,
      schemaVersion: SCHEMA_VERSION,
      createdAt,
    });
  });

  it("se recupera íntegra con el mismo secreto", async () => {
    const file = await encryptBackup(snapshot, secret, createdAt);
    expect(await decryptBackup(file, secret)).toEqual(snapshot);
  });

  it("cada copia usa un IV distinto", async () => {
    const first = JSON.parse(await encryptBackup(snapshot, secret, createdAt)) as { iv: string };
    const second = JSON.parse(await encryptBackup(snapshot, secret, createdAt)) as { iv: string };
    expect(first.iv).not.toBe(second.iv);
  });

  it("con otra frase no se abre", async () => {
    const file = await encryptBackup(snapshot, secret, createdAt);
    expect(await failure(() => decryptBackup(file, otherSecret))).toBe("wrong-key");
  });

  it("detecta un archivo manipulado", async () => {
    const file = JSON.parse(await encryptBackup(snapshot, secret, createdAt)) as {
      ciphertext: string;
    };
    const flipped = file.ciphertext.startsWith("A") ? "B" : "A";
    const tampered = JSON.stringify({ ...file, ciphertext: flipped + file.ciphertext.slice(1) });
    expect(await failure(() => decryptBackup(tampered, secret))).toBe("wrong-key");
  });

  it("rechaza lo que no es una copia y las copias de versiones futuras", async () => {
    expect(await failure(() => decryptBackup("no es json", secret))).toBe("not-a-backup");
    expect(await failure(() => decryptBackup('{"hola":1}', secret))).toBe("not-a-backup");
    const file = JSON.parse(await encryptBackup(snapshot, secret, createdAt)) as object;
    const future = JSON.stringify({ ...file, schemaVersion: SCHEMA_VERSION + 1 });
    expect(await failure(() => decryptBackup(future, secret))).toBe("newer-version");
    expect(await failure(() => readBackupHeader(future))).toBe("newer-version");
  });
});

describe("instantánea", () => {
  it("valida la forma y cuenta las filas", () => {
    expect(parseSnapshot(snapshot)).toEqual(snapshot);
    expect(parseSnapshot({ tables: {} })).toBeNull();
    expect(snapshotRowCount(snapshot)).toBe(1);
    expect(snapshotRowCount(snapshot, "account")).toBe(1);
    expect(snapshotRowCount(snapshot, "transaction")).toBe(0);
  });

  it("valida cada fila con los tipos del schema antes de escribirla", () => {
    const [row] = snapshot.tables.account ?? [];
    const values = validateSnapshotRow("account", row!);
    expect(values).toMatchObject({ id: ACCOUNT_ID, name: "BBVA débito", openingBalance: 125000 });
    expect(values?.isDeleted).toBe(0);
    expect(validateSnapshotRow("account", { ...row, isDeleted: 1 })?.isDeleted).toBe(1);
  });

  it("descarta las filas con datos que el schema no admite", () => {
    const [row] = snapshot.tables.account ?? [];
    expect(validateSnapshotRow("account", { ...row, type: "bitcoin" })).toBeNull();
    expect(validateSnapshotRow("account", { ...row, openingBalance: -5 })).toBeNull();
    expect(validateSnapshotRow("account", { ...row, id: "no es un id" })).toBeNull();
    expect(validateSnapshotRow("account", { name: "Sin id" })).toBeNull();
  });

  it("una columna obligatoria vacía se omite sin tirar la fila", () => {
    const [row] = snapshot.tables.account ?? [];
    const values = validateSnapshotRow("account", { ...row, emoji: null });
    expect(values).not.toBeNull();
    expect(values).not.toHaveProperty("emoji");
  });
});

/* ───────────────────────── Google Drive ───────────────────────── */

interface Call {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: string;
}

const fakeDrive = (initial: ReadonlyArray<DriveFile> = []) => {
  const files = new Map(initial.map((file) => [file.id, { ...file, content: "" }]));
  const calls: Call[] = [];
  let sequence = 0;

  const fetchFn: FetchFn = (url, init = {}) => {
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? init.body : "";
    calls.push({ url, method, headers: init.headers as Record<string, string>, body });
    const json = (value: unknown) => Promise.resolve(Response.json(value));

    if (method === "POST") {
      const name = /"name":"([^"]+)"/.exec(body)?.[1] ?? "";
      const content = body.split("\r\n").at(-3) ?? "";
      sequence += 1;
      const file = {
        id: `new-${sequence}`,
        name,
        createdTime: `2026-10-07T10:00:0${sequence}.000Z`,
        size: content.length,
        content,
      };
      files.set(file.id, file);
      return json({ ...file, size: String(file.size) });
    }
    const id = decodeURIComponent(/files\/([^?]+)/.exec(url)?.[1] ?? "");
    if (method === "DELETE") {
      files.delete(id);
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (url.includes("alt=media")) {
      const file = files.get(id);
      return Promise.resolve(new Response(file?.content ?? "", { status: file ? 200 : 404 }));
    }
    return json({
      files: [...files.values()]
        .sort((a, b) => b.createdTime.localeCompare(a.createdTime))
        .map(({ id: fileId, name, createdTime, size }) => ({
          id: fileId,
          name,
          createdTime,
          size,
        })),
    });
  };
  return { fetchFn, calls, files };
};

const oldFile = (day: number): DriveFile => ({
  id: `old-${day}`,
  name: `mypocket-${day}.mpbackup.json`,
  createdTime: `2026-09-${String(day).padStart(2, "0")}T08:00:00.000Z`,
  size: 10,
});

describe("cliente de Google Drive", () => {
  it("sube a la carpeta oculta de la app con el token", async () => {
    const drive = fakeDrive();
    const client = createDriveClient("token-123", drive.fetchFn);
    const file = await client.upload("copia.mpbackup.json", '{"cifrado":true}');
    expect(file).toMatchObject({ id: "new-1", name: "copia.mpbackup.json", size: 16 });

    const [call] = drive.calls;
    expect(call?.url).toContain(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    );
    expect(call?.headers.Authorization).toBe("Bearer token-123");
    expect(call?.headers["Content-Type"]).toMatch(/^multipart\/related; boundary=/);
    expect(call?.body).toContain('"parents":["appDataFolder"]');
    expect(await client.download(file.id)).toBe('{"cifrado":true}');
  });

  it("lista solo la carpeta de la app, de la más reciente a la más antigua", async () => {
    const drive = fakeDrive([oldFile(1), oldFile(3), oldFile(2)]);
    const files = await createDriveClient("t", drive.fetchFn).list();
    expect(files.map((file) => file.id)).toEqual(["old-3", "old-2", "old-1"]);
    expect(drive.calls[0]?.url).toContain("spaces=appDataFolder");
  });

  it("conserva las 8 copias más recientes y borra las demás", async () => {
    const drive = fakeDrive(Array.from({ length: 10 }, (_, index) => oldFile(index + 1)));
    const client = createDriveClient("t", drive.fetchFn);
    await client.upload("nueva.mpbackup.json", "x");
    expect(await pruneBackups(client)).toBe(3);
    const left = await client.list();
    expect(left).toHaveLength(BACKUPS_TO_KEEP);
    expect(left[0]?.id).toBe("new-1");
    expect(left.map((file) => file.id)).not.toContain("old-1");
    expect(left.map((file) => file.id)).not.toContain("old-3");
    expect(await pruneBackups(client)).toBe(0);
  });

  it("traduce los errores de Google", async () => {
    const respond =
      (status: number, body = ""): FetchFn =>
      () =>
        Promise.resolve(new Response(body, { status }));
    const list = (fetchFn: FetchFn) => () => createDriveClient("t", fetchFn).list();
    expect(await failure(list(respond(401)))).toBe("auth");
    expect(await failure(list(respond(403, '{"reason":"storageQuotaExceeded"}')))).toBe("quota");
    expect(await failure(list(respond(403)))).toBe("auth");
    expect(await failure(list(respond(500)))).toBe("unknown");
    expect(await failure(list(respond(200, "no es json")))).toBe("unknown");
    expect(await failure(list(() => Promise.reject(new TypeError("offline"))))).toBe("offline");
  });

  it("avisa de la copia pendiente a partir de los 7 días", () => {
    const now = Date.parse("2026-10-07T12:00:00.000Z");
    expect(isBackupDue(null, now)).toBe(true);
    expect(isBackupDue("2026-10-01T12:00:00.000Z", now)).toBe(false);
    expect(isBackupDue("2026-09-30T12:00:00.000Z", now)).toBe(false);
    expect(isBackupDue("2026-09-30T11:59:59.000Z", now)).toBe(true);
  });

  it("nombra las copias por su fecha", () => {
    expect(backupFileName(createdAt)).toBe("mypocket-2026-10-07T09-30-00Z.mpbackup.json");
  });

  it("pruneBackups ordena por fecha aunque la lista llegue desordenada", async () => {
    const files = [oldFile(1), oldFile(5), oldFile(3)];
    const removed: string[] = [];
    const client: DriveClient = {
      list: () => Promise.resolve(files),
      upload: () => Promise.reject(new Error("no se usa")),
      download: () => Promise.reject(new Error("no se usa")),
      remove: (id) => {
        removed.push(id);
        return Promise.resolve();
      },
    };
    expect(await pruneBackups(client, 1)).toBe(2);
    expect(removed.sort()).toEqual(["old-1", "old-3"]);
  });
});

describe("permiso de Google sin scripts de terceros", () => {
  it("pide solo la carpeta de la app y vuelve a /oauth.html", () => {
    const url = new URL(
      buildAuthUrl("cliente.apps.googleusercontent.com", "https://mypocket.app", "abc"),
    );
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "cliente.apps.googleusercontent.com",
      redirect_uri: "https://mypocket.app/oauth.html",
      response_type: "token",
      scope: "https://www.googleapis.com/auth/drive.appdata",
      state: "abc",
    });
  });

  it("acepta la respuesta solo si el state coincide", () => {
    const fragment = "#state=abc&access_token=ya29.token&token_type=Bearer&expires_in=3599";
    expect(parseOAuthResponse(fragment, "abc")).toEqual({
      token: "ya29.token",
      expiresInMs: 3_599_000,
    });
    expect(parseOAuthResponse(fragment, "otro")).toBeNull();
    expect(parseOAuthResponse("error=access_denied&state=abc", "abc")).toBeNull();
    expect(parseOAuthResponse("access_token=t&state=abc", "abc")?.expiresInMs).toBe(3_600_000);
  });
});
