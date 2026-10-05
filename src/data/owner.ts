import { Mnemonic, mnemonicToOwnerSecret, OwnerSecret, ownerSecretToMnemonic } from "@evolu/common";

/**
 * Secreto del owner. El resto de la app lo trata como bytes opacos; aquí se
 * traduce a los tipos de Evolu.
 *
 * Se usan 16 bytes, que equivalen a una frase BIP-39 de 12 palabras. Evolu
 * admite también 20, 24, 28 y 32 bytes: para pasar a 24 palabras bastaría con
 * cambiar esta constante a 32.
 */
export const OWNER_SECRET_BYTES = 16;
export const MNEMONIC_WORDS = 12;

/** Genera un secreto nuevo con el generador criptográfico del navegador. */
export const generateOwnerSecret = (): Uint8Array<ArrayBuffer> =>
  crypto.getRandomValues(new Uint8Array(OWNER_SECRET_BYTES));

/** Valida unos bytes como secreto de owner. Lanza si la longitud no es válida. */
export const toOwnerSecret = (bytes: Uint8Array): OwnerSecret => OwnerSecret.orThrow(bytes);

/** Frase de recuperación de un secreto (12 palabras en inglés, BIP-39). */
export const secretToMnemonic = (bytes: Uint8Array): string =>
  ownerSecretToMnemonic(toOwnerSecret(bytes));

/** Limpia una frase escrita a mano: minúsculas y espacios simples. */
export const normalizeMnemonic = (phrase: string): string =>
  phrase.trim().toLowerCase().split(/\s+/).filter(Boolean).join(" ");

/**
 * Convierte una frase de recuperación en el secreto que representa. Devuelve
 * `null` si no es una frase BIP-39 válida de 12 palabras.
 */
export const mnemonicToSecret = (phrase: string): Uint8Array<ArrayBuffer> | null => {
  const normalized = normalizeMnemonic(phrase);
  if (normalized.split(" ").length !== MNEMONIC_WORDS) return null;
  const parsed = Mnemonic.fromUnknown(normalized);
  if (!parsed.ok) return null;
  const secret = mnemonicToOwnerSecret(parsed.value);
  if (secret.length !== OWNER_SECRET_BYTES) return null;
  // Copia propia: el llamador puede sobrescribirla al terminar.
  return new Uint8Array(secret);
};
