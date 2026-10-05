import {
  type Bytes,
  hkdfKey,
  PBKDF2_ITERATIONS,
  pbkdf2Key,
  randomBytes,
  seal,
  type Sealed,
  unseal,
} from "./crypto";

export const PIN_LENGTH = 6;

export const isValidPin = (pin: string): boolean => /^\d{6}$/.test(pin);

/** PIN demasiado fácil: todos los dígitos iguales o una escalera. */
export const isWeakPin = (pin: string): boolean =>
  /^(\d)\1{5}$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin);

/* ───────────────────────── Envoltura por PIN ───────────────────────── */

export interface PinEnvelope extends Sealed {
  readonly salt: Bytes;
  readonly iterations: number;
}

/** Envuelve el secreto con una KEK derivada del PIN (PBKDF2-SHA256, sal aleatoria). */
export const wrapWithPin = async (secret: Uint8Array, pin: string): Promise<PinEnvelope> => {
  const salt = randomBytes(16);
  const key = await pbkdf2Key(pin, salt, PBKDF2_ITERATIONS);
  return { ...(await seal(key, secret)), salt, iterations: PBKDF2_ITERATIONS };
};

/** Desenvuelve el secreto con el PIN. Lanza `UnsealError` si el PIN no es correcto. */
export const unwrapWithPin = async (envelope: PinEnvelope, pin: string): Promise<Bytes> =>
  unseal(await pbkdf2Key(pin, envelope.salt, envelope.iterations), envelope);

/* ───────────────────────── Envoltura por passkey (PRF) ───────────────────────── */

/** Etiqueta de dominio de la KEK biométrica. */
export const PRF_KEK_INFO = "mypocket/kek/prf/v1";

/** La salida de 32 bytes del PRF pasa por HKDF-SHA256 y da la KEK. */
export const wrapWithPrf = async (secret: Uint8Array, prfOutput: Uint8Array): Promise<Sealed> =>
  seal(await hkdfKey(prfOutput, PRF_KEK_INFO), secret);

export const unwrapWithPrf = async (sealed: Sealed, prfOutput: Uint8Array): Promise<Bytes> =>
  unseal(await hkdfKey(prfOutput, PRF_KEK_INFO), sealed);

/* ───────────────────────── Espera exponencial ───────────────────────── */

export interface PinAttempts {
  /** Fallos consecutivos desde el último acierto. */
  readonly failed: number;
  /** Marca de tiempo (ms) del último fallo. */
  readonly lastFailedAt: number | null;
}

export const NO_ATTEMPTS: PinAttempts = { failed: 0, lastFailedAt: null };

/** A partir de este número de fallos consecutivos hay que esperar. */
export const FREE_ATTEMPTS = 5;
const BASE_WAIT_MS = 30_000;
/** Tope de la espera, para que un despiste no bloquee durante semanas. */
export const MAX_WAIT_MS = 24 * 60 * 60 * 1000;

/**
 * Espera tras un número de fallos consecutivos: tras 5 fallos, 30 s, y se
 * duplica en cada fallo siguiente (60 s, 120 s…), con un tope de 24 horas.
 * Nunca se borran datos por fallos.
 */
export const waitAfterFailures = (failed: number): number => {
  if (failed < FREE_ATTEMPTS) return 0;
  const doublings = Math.min(failed - FREE_ATTEMPTS, 30);
  return Math.min(BASE_WAIT_MS * 2 ** doublings, MAX_WAIT_MS);
};

/** Milisegundos que faltan para poder volver a intentarlo (0 si ya se puede). */
export const remainingWait = (attempts: PinAttempts, now: number): number => {
  if (attempts.lastFailedAt === null) return 0;
  // Si el reloj se atrasa a mano, el tiempo transcurrido cuenta como 0.
  const elapsed = Math.max(0, now - attempts.lastFailedAt);
  return Math.max(0, waitAfterFailures(attempts.failed) - elapsed);
};

export const registerFailure = (attempts: PinAttempts, now: number): PinAttempts => ({
  failed: attempts.failed + 1,
  lastFailedAt: now,
});

/** "30 s", "2 min", "1 h 5 min" */
export const formatWait = (milliseconds: number): string => {
  const seconds = Math.ceil(milliseconds / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
};
