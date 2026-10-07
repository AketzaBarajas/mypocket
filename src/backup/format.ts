import { z } from "zod";

import { SCHEMA_VERSION } from "@/data/schema";
import { parseSnapshot, type Snapshot } from "@/data/snapshot";
import {
  type Bytes,
  fromBase64Url,
  hkdfKey,
  seal,
  toBase64Url,
  unseal,
  UnsealError,
  utf8,
} from "@/security/crypto";

/**
 * Formato de las copias de seguridad: un JSON con un encabezado en claro
 * (formato, versión, fecha e IV) y los datos comprimidos y cifrados con
 * AES-GCM 256. La clave se deriva del secreto del owner con HKDF-SHA256, así
 * que la copia solo se abre con la frase de 12 palabras.
 */

export const BACKUP_FORMAT = "mypocket-backup";
export const BACKUP_VERSION = 1;
/** Separa la clave de las copias del resto de usos del secreto. */
export const BACKUP_KEY_INFO = "mypocket/backup/v1";

const backupFileSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().positive(),
  schemaVersion: z.number().int().positive(),
  createdAt: z.string(),
  compression: z.enum(["gzip", "none"]),
  iv: z.string().min(1),
  ciphertext: z.string().min(1),
});

export type BackupFile = z.infer<typeof backupFileSchema>;
export type BackupHeader = Pick<BackupFile, "version" | "schemaVersion" | "createdAt">;

export type BackupFailure = "not-a-backup" | "newer-version" | "wrong-key" | "corrupt";

const MESSAGES: Record<BackupFailure, string> = {
  "not-a-backup": "Este archivo no es una copia de MyPocket.",
  "newer-version": "La copia es de una versión más nueva de MyPocket. Actualiza la app.",
  "wrong-key": "La frase no abre esta copia. Comprueba que es la frase con la que se hizo.",
  corrupt: "La copia está dañada y no se puede leer.",
};

export class BackupError extends Error {
  readonly reason: BackupFailure;
  constructor(reason: BackupFailure) {
    super(MESSAGES[reason]);
    this.name = "BackupError";
    this.reason = reason;
  }
}

const transform = async (
  bytes: Bytes,
  stream: CompressionStream | DecompressionStream,
): Promise<Bytes> => {
  const writer = stream.writable.getWriter();
  void writer.write(bytes).then(() => writer.close());
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
};

const canCompress = (): boolean => typeof CompressionStream !== "undefined";

/** Cifra una instantánea. Devuelve el texto del archivo de copia. */
export const encryptBackup = async (
  snapshot: Snapshot,
  secret: Uint8Array,
  createdAt: string,
): Promise<string> => {
  const plain = utf8(JSON.stringify(snapshot));
  const compression = canCompress() ? "gzip" : "none";
  const payload =
    compression === "gzip" ? await transform(plain, new CompressionStream("gzip")) : plain;
  const sealed = await seal(await hkdfKey(secret, BACKUP_KEY_INFO), payload);
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    schemaVersion: snapshot.schemaVersion,
    createdAt,
    compression,
    iv: toBase64Url(sealed.iv),
    ciphertext: toBase64Url(sealed.ciphertext),
  };
  return JSON.stringify(file);
};

const parseFile = (text: string): BackupFile => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError("not-a-backup");
  }
  const parsed = backupFileSchema.safeParse(raw);
  if (!parsed.success) throw new BackupError("not-a-backup");
  if (parsed.data.version > BACKUP_VERSION || parsed.data.schemaVersion > SCHEMA_VERSION) {
    throw new BackupError("newer-version");
  }
  return parsed.data;
};

/** Lee el encabezado en claro sin descifrar nada. Lanza `BackupError`. */
export const readBackupHeader = (text: string): BackupHeader => {
  const { version, schemaVersion, createdAt } = parseFile(text);
  return { version, schemaVersion, createdAt };
};

/** Descifra una copia con el secreto del owner. Lanza `BackupError`. */
export const decryptBackup = async (text: string, secret: Uint8Array): Promise<Snapshot> => {
  const file = parseFile(text);
  let payload: Bytes;
  try {
    payload = await unseal(await hkdfKey(secret, BACKUP_KEY_INFO), {
      iv: fromBase64Url(file.iv),
      ciphertext: fromBase64Url(file.ciphertext),
    });
  } catch (error) {
    throw new BackupError(error instanceof UnsealError ? "wrong-key" : "corrupt");
  }
  try {
    const plain =
      file.compression === "gzip"
        ? await transform(payload, new DecompressionStream("gzip"))
        : payload;
    const snapshot = parseSnapshot(JSON.parse(new TextDecoder().decode(plain)));
    if (snapshot === null) throw new BackupError("corrupt");
    return snapshot;
  } catch {
    throw new BackupError("corrupt");
  }
};
