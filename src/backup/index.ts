import {
  type Db,
  exportSnapshot,
  type RestoreResult,
  restoreSnapshot,
  type Snapshot,
} from "@/data";
import { wipe } from "@/security/crypto";
import { getOwnerSecret, setBackupState, useSession } from "@/security/session";

import {
  backupFileName,
  createDriveClient,
  DriveError,
  type DriveFile,
  pruneBackups,
} from "./drive";
import { decryptBackup, encryptBackup } from "./format";
import { forgetDriveToken, requestDriveToken } from "./oauth";

/**
 * Copias de seguridad: une la instantánea de datos, el cifrado y Google Drive.
 * La interfaz solo usa lo que se exporta desde aquí.
 */

export {
  BACKUP_REMINDER_DAYS,
  BACKUPS_TO_KEEP,
  DriveError,
  type DriveFile,
  isBackupDue,
} from "./drive";
export { BackupError, readBackupHeader } from "./format";
export { isDriveConfigured } from "./oauth";

// Al bloquear, el permiso de Google se descarta junto con la clave y los datos.
useSession.subscribe((state, previous) => {
  if (previous.status === "unlocked" && state.status !== "unlocked") forgetDriveToken();
});

export interface BackupFileContent {
  readonly name: string;
  readonly content: string;
  readonly createdAt: string;
}

/** Exporta todas las tablas y las cifra con la clave derivada del secreto del owner. */
export const createBackupFile = async (db: Db, now = new Date()): Promise<BackupFileContent> => {
  const createdAt = now.toISOString();
  const snapshot = await exportSnapshot(db, createdAt);
  const secret = getOwnerSecret();
  try {
    return {
      name: backupFileName(createdAt),
      content: await encryptBackup(snapshot, secret, createdAt),
      createdAt,
    };
  } finally {
    wipe(secret);
  }
};

/** Ejecuta una operación de Drive; si Google rechaza el token, lo olvida. */
const withDrive = async <T>(run: (token: string) => Promise<T>): Promise<T> => {
  // Lo primero es pedir el token: la ventana de Google debe nacer del gesto del usuario.
  const token = await requestDriveToken();
  try {
    return await run(token);
  } catch (error) {
    if (error instanceof DriveError && error.reason === "auth") forgetDriveToken();
    throw error;
  }
};

/** Sube una copia cifrada a Drive y deja solo las más recientes. */
export const backupToDrive = (db: Db): Promise<DriveFile> =>
  withDrive(async (token) => {
    const client = createDriveClient(token);
    const file = await createBackupFile(db);
    const uploaded = await client.upload(file.name, file.content);
    await setBackupState({ lastBackupAt: file.createdAt, fileId: uploaded.id });
    // Si la limpieza falla, la copia nueva ya está a salvo: se reintenta en la siguiente.
    await pruneBackups(client).catch(() => 0);
    return uploaded;
  });

export const listDriveBackups = (): Promise<ReadonlyArray<DriveFile>> =>
  withDrive((token) => createDriveClient(token).list());

export const downloadDriveBackup = (id: string): Promise<string> =>
  withDrive((token) => createDriveClient(token).download(id));

/** Descifra una copia con el secreto que da la frase. Lanza `BackupError`. */
export const openBackup = (content: string, secret: Uint8Array): Promise<Snapshot> =>
  decryptBackup(content, secret);

/** Escribe en la base de datos una copia ya descifrada. */
export const restoreBackup = (db: Db, snapshot: Snapshot): RestoreResult =>
  restoreSnapshot(db, snapshot);
