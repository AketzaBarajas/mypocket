import { z } from "zod";

/**
 * Cliente mínimo de Google Drive sobre `fetch`, limitado a la carpeta oculta
 * de la app (appDataFolder). Google solo recibe archivos ya cifrados.
 */

const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FIELDS = "id,name,createdTime,size";

/** Copias que se conservan en Drive; las más antiguas se borran. */
export const BACKUPS_TO_KEEP = 8;

/** Días sin copia a partir de los cuales Inicio lo avisa. */
export const BACKUP_REMINDER_DAYS = 7;

/** Nunca se ha hecho una copia, o la última tiene más de una semana. */
export const isBackupDue = (lastBackupAt: string | null, now: number): boolean =>
  lastBackupAt === null ||
  now - new Date(lastBackupAt).getTime() > BACKUP_REMINDER_DAYS * 24 * 60 * 60 * 1000;

const fileSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  createdTime: z.string(),
  // Drive devuelve el tamaño como texto.
  size: z.coerce.number().nonnegative().optional(),
});
const listSchema = z.object({ files: z.array(fileSchema) });

export interface DriveFile {
  readonly id: string;
  readonly name: string;
  /** Marca ISO 8601 de subida. */
  readonly createdTime: string;
  readonly size: number;
}

export type DriveFailure = "auth" | "popup" | "offline" | "quota" | "unknown";

const MESSAGES: Record<DriveFailure, string> = {
  auth: "Google no ha dado permiso. Vuelve a intentarlo y acepta el acceso a Drive.",
  popup:
    "El navegador ha bloqueado la ventana de Google. Permite las ventanas emergentes de MyPocket e inténtalo de nuevo.",
  offline: "No hay conexión con Google Drive. Comprueba tu conexión.",
  quota: "No queda espacio en tu Google Drive.",
  unknown: "Google Drive ha devuelto un error. Inténtalo de nuevo en un momento.",
};

export class DriveError extends Error {
  readonly reason: DriveFailure;
  constructor(reason: DriveFailure) {
    super(MESSAGES[reason]);
    this.name = "DriveError";
    this.reason = reason;
  }
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface DriveClient {
  /** Copias de la carpeta de la app, de la más reciente a la más antigua. */
  readonly list: () => Promise<ReadonlyArray<DriveFile>>;
  readonly upload: (name: string, content: string) => Promise<DriveFile>;
  readonly download: (id: string) => Promise<string>;
  readonly remove: (id: string) => Promise<void>;
}

const toFile = (raw: z.infer<typeof fileSchema>): DriveFile => ({
  id: raw.id,
  name: raw.name,
  createdTime: raw.createdTime,
  size: raw.size ?? 0,
});

export const createDriveClient = (
  token: string,
  // `fetch` pierde su `this` si se guarda suelto: se llama siempre desde aquí.
  fetchFn: FetchFn = (input, init) => fetch(input, init),
): DriveClient => {
  const call = async (url: string, init: RequestInit = {}): Promise<Response> => {
    let response: Response;
    try {
      response = await fetchFn(url, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
      });
    } catch {
      throw new DriveError("offline");
    }
    if (response.ok) return response;
    if (response.status === 401) throw new DriveError("auth");
    if (response.status === 403) {
      const body = await response.text().catch(() => "");
      throw new DriveError(/storageQuotaExceeded/i.test(body) ? "quota" : "auth");
    }
    throw new DriveError("unknown");
  };

  const parse = async <T>(response: Response, schema: z.ZodType<T>): Promise<T> => {
    const parsed = schema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new DriveError("unknown");
    return parsed.data;
  };

  return {
    list: async () => {
      const query = new URLSearchParams({
        spaces: "appDataFolder",
        fields: `files(${FIELDS})`,
        orderBy: "createdTime desc",
        pageSize: "100",
      });
      const { files } = await parse(await call(`${API}?${query.toString()}`), listSchema);
      return files.map(toFile);
    },

    upload: async (name, content) => {
      const boundary = `mypocket-${crypto.randomUUID()}`;
      const metadata = { name, parents: ["appDataFolder"], mimeType: "application/json" };
      const body = [
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        JSON.stringify(metadata),
        `--${boundary}`,
        "Content-Type: application/json",
        "",
        content,
        `--${boundary}--`,
        "",
      ].join("\r\n");
      const response = await call(`${UPLOAD}?uploadType=multipart&fields=${FIELDS}`, {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      });
      return toFile(await parse(response, fileSchema));
    },

    download: async (id) => (await call(`${API}/${encodeURIComponent(id)}?alt=media`)).text(),

    remove: async (id) => {
      await call(`${API}/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
  };
};

/** Borra las copias antiguas y deja las `keep` más recientes. Devuelve cuántas borró. */
export const pruneBackups = async (
  client: DriveClient,
  keep = BACKUPS_TO_KEEP,
): Promise<number> => {
  const files = [...(await client.list())].sort((a, b) =>
    b.createdTime.localeCompare(a.createdTime),
  );
  const old = files.slice(keep);
  for (const file of old) await client.remove(file.id);
  return old.length;
};

/** "mypocket-2026-10-07T09-30-00Z.mpbackup.json" */
export const backupFileName = (createdAt: string): string =>
  `mypocket-${createdAt.replace(/\.\d+Z$/, "Z").replace(/:/g, "-")}.mpbackup.json`;
