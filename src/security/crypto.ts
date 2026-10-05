/**
 * Primitivas criptográficas sobre WebCrypto: AES-GCM 256 para envolver,
 * HKDF-SHA256 para derivar claves de material ya fuerte y PBKDF2-SHA256 para
 * derivarlas del PIN.
 */

export type Bytes = Uint8Array<ArrayBuffer>;

const encoder = new TextEncoder();

export const utf8 = (text: string): Bytes => encoder.encode(text);

export const randomBytes = (length: number): Bytes =>
  crypto.getRandomValues(new Uint8Array(length));

/** Copia unos bytes a un `ArrayBuffer` propio (WebCrypto no acepta SharedArrayBuffer). */
export const toBytes = (source: ArrayBufferLike | ArrayBufferView): Bytes => {
  const view = ArrayBuffer.isView(source)
    ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
    : new Uint8Array(source);
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy;
};

/** Sobrescribe un secreto en memoria cuando deja de hacer falta. */
export const wipe = (bytes: Uint8Array | null | undefined): void => {
  bytes?.fill(0);
};

export const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export const fromBase64Url = (text: string): Bytes => {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const AES = { name: "AES-GCM", length: 256 } as const;
const IV_BYTES = 12;

/** Iteraciones de PBKDF2 para el PIN (el mínimo recomendado por OWASP para SHA-256). */
export const PBKDF2_ITERATIONS = 600_000;

/**
 * Deriva una clave AES-GCM 256 con HKDF-SHA256. `info` separa los usos: la
 * misma entrada con otro `info` da una clave independiente.
 */
export const hkdfKey = async (keyMaterial: Uint8Array, info: string): Promise<CryptoKey> => {
  const base = await crypto.subtle.importKey("raw", toBytes(keyMaterial), "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: utf8(info) },
    base,
    AES,
    false,
    ["encrypt", "decrypt"],
  );
};

/** Deriva una clave AES-GCM 256 de un PIN con PBKDF2-SHA256 y sal aleatoria. */
export const pbkdf2Key = async (
  secret: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> => {
  const base = await crypto.subtle.importKey("raw", utf8(secret), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: toBytes(salt), iterations },
    base,
    AES,
    false,
    ["encrypt", "decrypt"],
  );
};

export interface Sealed {
  readonly iv: Bytes;
  readonly ciphertext: Bytes;
}

/** Cifra con AES-GCM y un IV aleatorio de 96 bits. */
export const seal = async (key: CryptoKey, plaintext: Uint8Array): Promise<Sealed> => {
  const iv = randomBytes(IV_BYTES);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, toBytes(plaintext));
  return { iv, ciphertext: new Uint8Array(ciphertext) };
};

/** Fallo de autenticación al descifrar: clave incorrecta o datos alterados. */
export class UnsealError extends Error {
  constructor() {
    super("No se pudo descifrar: la clave no es correcta o los datos están dañados.");
    this.name = "UnsealError";
  }
}

/** Descifra con AES-GCM. Lanza `UnsealError` si la clave no es la correcta. */
export const unseal = async (key: CryptoKey, sealed: Sealed): Promise<Bytes> => {
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toBytes(sealed.iv) },
      key,
      toBytes(sealed.ciphertext),
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new UnsealError();
  }
};
