import { create } from "zustand";

import {
  closeDb,
  type Db,
  DEFAULT_RELAY_URL,
  generateOwnerSecret,
  mnemonicToSecret,
  openDb,
  secretToMnemonic,
} from "@/data";

import { type Bytes, UnsealError, wipe } from "./crypto";
import { createKeystoreStore, type Keystore, newKeystore } from "./keystore";
import {
  detectPasskeySupport,
  evaluatePrf,
  PasskeyError,
  type PasskeyFailure,
  type PasskeySupport,
  registerPasskey,
} from "./passkey";
import {
  NO_ATTEMPTS,
  type PinAttempts,
  registerFailure,
  remainingWait,
  unwrapWithPin,
  unwrapWithPrf,
  wrapWithPin,
  wrapWithPrf,
} from "./pin";

/**
 * Sesión de la app: arranca siempre bloqueada, desbloquea con passkey o PIN y,
 * al bloquear, cierra Evolu y descarta de memoria la clave y los datos.
 */

/** Perfil demo aislado para desarrollo. En producción la condición es falsa y se elimina. */
export const IS_DEMO = import.meta.env.DEV && import.meta.env.VITE_DEMO_PROFILE === "1";

const DEMO_SECRET = new Uint8Array([
  0x6d, 0x79, 0x70, 0x6f, 0x63, 0x6b, 0x65, 0x74, 0x2d, 0x64, 0x65, 0x6d, 0x6f, 0x2d, 0x30, 0x31,
]);

const WIPE_FLAG = "mypocket.wipe";

export type SessionStatus = "booting" | "new" | "locked" | "unlocked";

export interface SessionState {
  readonly status: SessionStatus;
  /** Instancia abierta de Evolu. Solo existe con la sesión desbloqueada. */
  readonly db: Db | null;
  /** Este dispositivo tiene una passkey registrada. */
  readonly hasPasskey: boolean;
  readonly passkeySupport: PasskeySupport;
  readonly attempts: PinAttempts;
  readonly onboarding: Keystore["onboarding"];
  readonly relayUrl: string;
  readonly backup: Keystore["backup"];
  /** Ruta a la que volver tras desbloquear. */
  readonly returnTo: string | null;
}

export const useSession = create<SessionState>(() => ({
  status: "booting",
  db: null,
  hasPasskey: false,
  passkeySupport: "unknown",
  attempts: NO_ATTEMPTS,
  onboarding: "pending",
  relayUrl: DEFAULT_RELAY_URL,
  backup: { lastBackupAt: null, fileId: null },
  returnTo: null,
}));

const keystore = createKeystoreStore(IS_DEMO ? "mypocket-keystore-demo" : "mypocket-keystore");

/** Secreto del owner en claro. Solo vive en memoria y solo mientras está desbloqueado. */
let ownerSecret: Bytes | null = null;

const fromKeystore = (stored: Keystore): Partial<SessionState> => ({
  hasPasskey: stored.passkey !== null,
  attempts: stored.attempts,
  onboarding: stored.onboarding,
  relayUrl: stored.relayUrl,
  backup: stored.backup,
});

/** Elimina los archivos de OPFS de la app (la base SQLite cifrada). */
const clearOpfs = async (): Promise<void> => {
  try {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const name of root.keys()) names.push(name);
    await Promise.all(
      names.map((name) => root.removeEntry(name, { recursive: true }).catch(() => undefined)),
    );
  } catch {
    // Sin OPFS (navegación privada) no hay nada que borrar.
  }
};

const takeWipeFlag = (): boolean => {
  try {
    const pending = window.localStorage.getItem(WIPE_FLAG) === "1";
    if (pending) window.localStorage.removeItem(WIPE_FLAG);
    return pending;
  } catch {
    return false;
  }
};

const enter = async (secret: Bytes, relayUrl: string | null, extra: Partial<SessionState>) => {
  const db = await openDb({
    ownerSecret: new Uint8Array(secret),
    relayUrl,
    ...(IS_DEMO ? { appName: "mypocket-demo" } : {}),
  });
  ownerSecret = secret;
  useSession.setState({ status: "unlocked", db, ...extra });
  // Pide al navegador que no borre los datos si falta espacio en disco.
  void navigator.storage.persist().catch(() => false);
};

/** Arranque: resuelve un borrado pendiente y decide entre bienvenida y bloqueo. */
export const bootSession = async (): Promise<void> => {
  if (useSession.getState().status !== "booting") return;

  if (takeWipeFlag()) await clearOpfs();

  if (IS_DEMO) {
    await enter(new Uint8Array(DEMO_SECRET), null, { onboarding: "done", hasPasskey: false });
    return;
  }

  const [stored, passkeySupport] = await Promise.all([
    keystore.read().catch(() => null),
    detectPasskeySupport(),
  ]);
  if (stored === null) {
    useSession.setState({ status: "new", passkeySupport });
    return;
  }
  useSession.setState({ status: "locked", passkeySupport, ...fromKeystore(stored) });
};

/** Bloquea: cierra Evolu y descarta la clave y los datos de memoria. */
export const lockSession = async (returnTo: string | null = null): Promise<void> => {
  const { db, status } = useSession.getState();
  if (status !== "unlocked" || IS_DEMO) return;
  useSession.setState({ status: "locked", db: null, returnTo });
  wipe(ownerSecret);
  ownerSecret = null;
  if (db) await closeDb(db).catch(() => undefined);
};

export const setReturnTo = (returnTo: string | null): void => {
  useSession.setState({ returnTo });
};

/* ───────────────────────── Alta del dispositivo ───────────────────────── */

export interface SetupInput {
  /** Secreto nuevo, o el recuperado de la frase al restaurar. */
  readonly secret: Bytes;
  readonly pin: string;
  /** Intentar registrar una passkey (requiere venir de un gesto del usuario). */
  readonly withPasskey: boolean;
  readonly mode: "create" | "restore";
}

export interface SetupResult {
  /** `null` si la passkey quedó registrada o no se pidió; si no, el motivo. */
  readonly passkeyFailure: PasskeyFailure | null;
}

/**
 * Configura este dispositivo: registra la passkey (si procede), envuelve el
 * secreto con passkey y PIN, lo guarda en el keystore y abre la base de datos.
 */
export const setupDevice = async (input: SetupInput): Promise<SetupResult> => {
  let passkey: Keystore["passkey"] = null;
  let passkeyFailure: PasskeyFailure | null = null;

  if (input.withPasskey) {
    try {
      // Primero la passkey: el navegador exige que la petición nazca del gesto.
      const registered = await registerPasskey();
      passkey = {
        credentialId: registered.credentialId,
        ...(await wrapWithPrf(input.secret, registered.prfOutput)),
      };
      wipe(registered.prfOutput);
    } catch (error) {
      passkeyFailure = error instanceof PasskeyError ? error.reason : "failed";
    }
  }

  const stored = newKeystore({
    pin: await wrapWithPin(input.secret, input.pin),
    passkey,
    relayUrl: DEFAULT_RELAY_URL,
    // Al restaurar, cuentas y categorías llegan del relay: no hay nada que precargar.
    onboarding: input.mode === "restore" ? "done" : "pending",
    createdAt: new Date().toISOString(),
  });
  await keystore.write(stored);
  await enter(input.secret, stored.relayUrl, fromKeystore(stored));
  return { passkeyFailure };
};

export const createSecret = generateOwnerSecret;
export { mnemonicToSecret, secretToMnemonic };

/* ───────────────────────── Desbloqueo ───────────────────────── */

export type UnlockResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "wrong-pin"; readonly waitMs: number }
  | { readonly ok: false; readonly reason: "wait"; readonly waitMs: number }
  | { readonly ok: false; readonly reason: PasskeyFailure | "no-passkey" | "no-keystore" };

const unlockWith = async (secret: Bytes, stored: Keystore): Promise<UnlockResult> => {
  if (stored.attempts.failed > 0) await keystore.setAttempts(NO_ATTEMPTS);
  await enter(secret, stored.relayUrl, { ...fromKeystore(stored), attempts: NO_ATTEMPTS });
  return { ok: true };
};

/** Desbloquea con Face ID, huella o Windows Hello: PRF → KEK → secreto. */
export const unlockWithPasskey = async (): Promise<UnlockResult> => {
  const stored = await keystore.read();
  if (stored === null) return { ok: false, reason: "no-keystore" };
  if (stored.passkey === null) return { ok: false, reason: "no-passkey" };
  try {
    const prfOutput = await evaluatePrf(stored.passkey.credentialId);
    const secret = await unwrapWithPrf(stored.passkey, prfOutput);
    wipe(prfOutput);
    return await unlockWith(secret, stored);
  } catch (error) {
    if (error instanceof PasskeyError) return { ok: false, reason: error.reason };
    return { ok: false, reason: "failed" };
  }
};

/**
 * Desbloquea con el PIN. Tras 5 fallos seguidos aplica una espera que se
 * duplica con cada fallo. Nunca borra datos.
 */
export const unlockWithPin = async (pin: string, now = Date.now()): Promise<UnlockResult> => {
  const stored = await keystore.read();
  if (stored === null) return { ok: false, reason: "no-keystore" };

  const waiting = remainingWait(stored.attempts, now);
  if (waiting > 0) return { ok: false, reason: "wait", waitMs: waiting };

  try {
    return await unlockWith(await unwrapWithPin(stored.pin, pin), stored);
  } catch (error) {
    if (!(error instanceof UnsealError)) throw error;
    const attempts = registerFailure(stored.attempts, now);
    await keystore.setAttempts(attempts);
    useSession.setState({ attempts });
    return { ok: false, reason: "wrong-pin", waitMs: remainingWait(attempts, now) };
  }
};

/* ───────────────────────── Con la sesión abierta ───────────────────────── */

const requireSecret = (): Bytes => {
  if (ownerSecret === null) throw new Error("La sesión está bloqueada.");
  return ownerSecret;
};

/** Copia del secreto para derivar la clave de las copias de seguridad. */
export const getOwnerSecret = (): Bytes => new Uint8Array(requireSecret());

/** Comprueba la identidad con el PIN sin tocar la sesión. */
const verifyPin = async (pin: string): Promise<boolean> => {
  const stored = await keystore.read();
  if (stored === null) return false;
  if (remainingWait(stored.attempts, Date.now()) > 0) return false;
  try {
    wipe(await unwrapWithPin(stored.pin, pin));
    return true;
  } catch {
    const attempts = registerFailure(stored.attempts, Date.now());
    await keystore.setAttempts(attempts);
    useSession.setState({ attempts });
    return false;
  }
};

const verifyPasskey = async (): Promise<boolean> => {
  const stored = await keystore.read();
  if (stored?.passkey == null) return false;
  try {
    const prfOutput = await evaluatePrf(stored.passkey.credentialId);
    wipe(await unwrapWithPrf(stored.passkey, prfOutput));
    wipe(prfOutput);
    return true;
  } catch {
    return false;
  }
};

export type Reauth =
  { readonly method: "pin"; readonly pin: string } | { readonly method: "passkey" };

/** Vuelve a pedir passkey o PIN antes de una acción sensible. */
export const reauthenticate = (auth: Reauth): Promise<boolean> =>
  auth.method === "pin" ? verifyPin(auth.pin) : verifyPasskey();

/** Frase de 12 palabras. Pide passkey o PIN de nuevo. */
export const revealMnemonic = async (auth: Reauth): Promise<string | null> =>
  (await reauthenticate(auth)) ? secretToMnemonic(requireSecret()) : null;

export const changePin = async (auth: Reauth, newPin: string): Promise<boolean> => {
  if (!(await reauthenticate(auth))) return false;
  const pin = await wrapWithPin(requireSecret(), newPin);
  const next = await keystore.update((current) => ({ ...current, pin, attempts: NO_ATTEMPTS }));
  if (next) useSession.setState(fromKeystore(next));
  return next !== null;
};

/** Registra (o vuelve a registrar) la passkey de este dispositivo. */
export const enrollPasskey = async (): Promise<PasskeyFailure | null> => {
  try {
    const registered = await registerPasskey();
    const passkey = {
      credentialId: registered.credentialId,
      ...(await wrapWithPrf(requireSecret(), registered.prfOutput)),
    };
    wipe(registered.prfOutput);
    const next = await keystore.update((current) => ({ ...current, passkey }));
    if (next) useSession.setState(fromKeystore(next));
    return null;
  } catch (error) {
    return error instanceof PasskeyError ? error.reason : "failed";
  }
};

export const removePasskey = async (): Promise<void> => {
  const next = await keystore.update((current) => ({ ...current, passkey: null }));
  if (next) useSession.setState(fromKeystore(next));
};

export const finishOnboarding = async (): Promise<void> => {
  useSession.setState({ onboarding: "done" });
  await keystore.update((current) => ({ ...current, onboarding: "done" }));
};

export const setBackupState = async (backup: Keystore["backup"]): Promise<void> => {
  useSession.setState({ backup });
  await keystore.update((current) => ({ ...current, backup }));
};

/** Orígenes de relay que permite la CSP de esta compilación. */
export const allowedRelayOrigins = (): ReadonlyArray<string> => __RELAY_ORIGINS__;

export type RelayCheck = "ok" | "invalid" | "not-in-csp";

/** Valida una URL de relay: debe ser `wss://` y estar permitida por la CSP. */
export const checkRelayUrl = (url: string): RelayCheck => {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return "invalid";
  }
  if (parsed.protocol !== "wss:") return "invalid";
  // En desarrollo no hay CSP, así que cualquier relay es alcanzable.
  if (import.meta.env.DEV) return "ok";
  return allowedRelayOrigins().includes(parsed.origin) ? "ok" : "not-in-csp";
};

/** Cambia el relay y vuelve a abrir la base de datos con el nuevo transporte. */
export const setRelayUrl = async (url: string): Promise<void> => {
  const relayUrl = url.trim();
  const secret = requireSecret();
  await keystore.update((current) => ({ ...current, relayUrl }));
  const { db } = useSession.getState();
  useSession.setState({ db: null, status: "booting", relayUrl });
  if (db) await closeDb(db).catch(() => undefined);
  await enter(secret, relayUrl, { relayUrl });
};

/**
 * Borra los datos de este dispositivo. Evolu 8 aún no implementa
 * `deleteDatabase`, así que se hace en dos pasos: se destruye el keystore
 * (borrado criptográfico: sin el secreto, el SQLite cifrado es ilegible) y, tras
 * recargar, se eliminan los archivos de OPFS antes de que arranque ningún worker.
 */
export const wipeDevice = async (): Promise<void> => {
  const { db } = useSession.getState();
  useSession.setState({ status: "booting", db: null });
  wipe(ownerSecret);
  ownerSecret = null;
  if (db) await closeDb(db).catch(() => undefined);
  await keystore.destroy();
  try {
    window.localStorage.setItem(WIPE_FLAG, "1");
  } catch {
    await clearOpfs();
  }
  window.location.replace("/");
};

/* ───────────────────────── Bloqueo automático ───────────────────────── */

let autoLockMinutes = 5;
let hiddenAt: number | null = null;
let lockTimer: number | undefined;

export const setAutoLockMinutes = (minutes: number): void => {
  autoLockMinutes = minutes;
};

const currentPath = (): string => `${window.location.pathname}${window.location.search}`;

/**
 * Bloquea tras N minutos en segundo plano. El temporizador cubre el caso de la
 * pestaña que sigue viva; la comprobación al volver cubre el de iOS, que
 * congela los temporizadores de las apps en segundo plano.
 */
export const installAutoLock = (): (() => void) => {
  const onVisibilityChange = () => {
    if (useSession.getState().status !== "unlocked") return;
    const limit = autoLockMinutes * 60_000;

    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      window.clearTimeout(lockTimer);
      lockTimer = window.setTimeout(() => void lockSession(currentPath()), limit);
      return;
    }
    window.clearTimeout(lockTimer);
    if (hiddenAt !== null && Date.now() - hiddenAt >= limit) void lockSession(currentPath());
    hiddenAt = null;
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  return () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.clearTimeout(lockTimer);
  };
};

/** Estado de la persistencia del almacenamiento, para Ajustes. */
export const isStoragePersisted = async (): Promise<boolean> => {
  try {
    return await navigator.storage.persisted();
  } catch {
    return false;
  }
};
