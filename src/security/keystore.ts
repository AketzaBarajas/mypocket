import { z } from "zod";

import type { Bytes } from "./crypto";
import { NO_ATTEMPTS, type PinAttempts, type PinEnvelope } from "./pin";

/**
 * Almacén local `mypocket-keystore` (IndexedDB, fuera de Evolu). Guarda el
 * secreto del owner solo envuelto —por passkey y por PIN— y la configuración
 * propia de este dispositivo. Nada de aquí se sincroniza.
 */

const bytes = z.custom<Bytes>((value) => value instanceof Uint8Array, "Se esperaban bytes");

const sealedSchema = z.object({ iv: bytes, ciphertext: bytes });

const keystoreSchema = z.object({
  version: z.literal(1),
  /** Envoltura por PIN: siempre existe. */
  pin: sealedSchema.extend({ salt: bytes, iterations: z.number().int().positive() }),
  /** Envoltura biométrica: solo si el dispositivo soporta PRF. */
  passkey: sealedSchema.extend({ credentialId: bytes }).nullable(),
  attempts: z.object({
    failed: z.number().int().nonnegative(),
    lastFailedAt: z.number().nullable(),
  }),
  relayUrl: z.string(),
  backup: z.object({
    lastBackupAt: z.string().nullable(),
    fileId: z.string().nullable(),
  }),
  /** La bienvenida sigue pendiente (cuentas y categorías) o ya terminó. */
  onboarding: z.enum(["pending", "done"]),
  createdAt: z.string(),
});

export type Keystore = z.infer<typeof keystoreSchema>;
export type PasskeyEnvelope = NonNullable<Keystore["passkey"]>;

export const newKeystore = (input: {
  readonly pin: PinEnvelope;
  readonly passkey: PasskeyEnvelope | null;
  readonly relayUrl: string;
  readonly onboarding: Keystore["onboarding"];
  readonly createdAt: string;
}): Keystore => ({
  version: 1,
  pin: input.pin,
  passkey: input.passkey,
  attempts: { ...NO_ATTEMPTS },
  relayUrl: input.relayUrl,
  backup: { lastBackupAt: null, fileId: null },
  onboarding: input.onboarding,
  createdAt: input.createdAt,
});

const STORE = "keystore";
const KEY = "main";

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Fallo de IndexedDB"));
  });

const open = (name: string): Promise<IDBDatabase> => {
  const req = indexedDB.open(name, 1);
  req.onupgradeneeded = () => {
    req.result.createObjectStore(STORE);
  };
  return request(req);
};

const withStore = async <T>(
  name: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const db = await open(name);
  try {
    const transaction = db.transaction(STORE, mode);
    const done = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Fallo de IndexedDB"));
      transaction.onabort = () => reject(transaction.error ?? new Error("Transacción abortada"));
    });
    const result = await request(run(transaction.objectStore(STORE)));
    await done;
    return result;
  } finally {
    db.close();
  }
};

export interface KeystoreStore {
  /** Lee el almacén. `null` si este dispositivo aún no está configurado. */
  readonly read: () => Promise<Keystore | null>;
  readonly write: (keystore: Keystore) => Promise<void>;
  /** Lee, transforma y escribe. Devuelve el resultado, o `null` si no hay almacén. */
  readonly update: (change: (current: Keystore) => Keystore) => Promise<Keystore | null>;
  readonly setAttempts: (attempts: PinAttempts) => Promise<void>;
  /** Borra el almacén: sin él, la base de datos cifrada queda ilegible. */
  readonly destroy: () => Promise<void>;
}

/** Crea el acceso a un almacén. El nombre solo cambia en el perfil demo. */
export const createKeystoreStore = (name = "mypocket-keystore"): KeystoreStore => {
  const read = async (): Promise<Keystore | null> => {
    const raw = await withStore<unknown>(name, "readonly", (store) => store.get(KEY));
    if (raw === undefined) return null;
    const parsed = keystoreSchema.safeParse(raw);
    // Un almacén ilegible equivale a no tenerlo: se restaura con la frase.
    return parsed.success ? parsed.data : null;
  };

  const write = async (keystore: Keystore): Promise<void> => {
    await withStore(name, "readwrite", (store) => store.put(keystoreSchema.parse(keystore), KEY));
  };

  const update = async (change: (current: Keystore) => Keystore): Promise<Keystore | null> => {
    const current = await read();
    if (current === null) return null;
    const next = change(current);
    await write(next);
    return next;
  };

  return {
    read,
    write,
    update,
    setAttempts: async (attempts) => {
      await update((current) => ({ ...current, attempts: { ...attempts } }));
    },
    destroy: () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase(name);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error ?? new Error("No se pudo borrar el almacén"));
        req.onblocked = () => resolve();
      }),
  };
};
