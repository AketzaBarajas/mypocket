import { type Bytes, randomBytes, toBytes, utf8 } from "./crypto";

/**
 * Passkey de plataforma con la extensión PRF de WebAuthn. El PRF devuelve 32
 * bytes deterministas ligados a la credencial y a una sal: con ellos se deriva
 * la clave que desenvuelve el secreto del owner. Sin verificación del usuario
 * (Face ID, huella, Windows Hello) no hay salida, y la salida nunca se guarda.
 */

/** Sal fija de la app para el PRF. Cambiarla invalidaría las envolturas existentes. */
const PRF_SALT = utf8("mypocket/prf-salt/v1");

const RP_NAME = "MyPocket";

export type PasskeySupport =
  /** El navegador declara soporte de PRF con autenticador de plataforma. */
  | "supported"
  /** No se puede saber hasta intentarlo (navegadores sin `getClientCapabilities`). */
  | "unknown"
  /** Sin WebAuthn, sin autenticador de plataforma o sin PRF. */
  | "unsupported";

/** Comprueba si este navegador puede desbloquear con passkey y PRF. */
export const detectPasskeySupport = async (): Promise<PasskeySupport> => {
  if (
    typeof window === "undefined" ||
    !window.isSecureContext ||
    typeof PublicKeyCredential === "undefined"
  ) {
    return "unsupported";
  }
  try {
    if (typeof PublicKeyCredential.getClientCapabilities === "function") {
      const capabilities = await PublicKeyCredential.getClientCapabilities();
      if (capabilities.userVerifyingPlatformAuthenticator === false) return "unsupported";
      const prf = capabilities["extension:prf"];
      if (prf === true) return "supported";
      if (prf === false) return "unsupported";
    }
    const hasPlatform = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return hasPlatform ? "unknown" : "unsupported";
  } catch {
    return "unsupported";
  }
};

export type PasskeyFailure =
  /** El usuario canceló o el navegador no permitió la petición (sin gesto). */
  | "cancelled"
  /** La credencial se creó, pero el autenticador no ofrece PRF. */
  | "prf-unavailable"
  | "unsupported"
  | "failed";

export class PasskeyError extends Error {
  readonly reason: PasskeyFailure;
  constructor(reason: PasskeyFailure) {
    super(`Passkey: ${reason}`);
    this.name = "PasskeyError";
    this.reason = reason;
  }
}

const toPasskeyError = (error: unknown): PasskeyError => {
  if (error instanceof PasskeyError) return error;
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "AbortError") {
      return new PasskeyError("cancelled");
    }
    if (error.name === "NotSupportedError" || error.name === "SecurityError") {
      return new PasskeyError("unsupported");
    }
  }
  return new PasskeyError("failed");
};

const prfFirst = (credential: PublicKeyCredential): Bytes | null => {
  const first = credential.getClientExtensionResults().prf?.results?.first;
  if (first === undefined) return null;
  const bytes = toBytes(first);
  return bytes.length === 32 ? bytes : null;
};

const asPublicKeyCredential = (credential: Credential | null): PublicKeyCredential => {
  if (!(credential instanceof PublicKeyCredential)) throw new PasskeyError("failed");
  return credential;
};

/** Evalúa el PRF de una passkey ya registrada. Pide verificación del usuario. */
export const evaluatePrf = async (credentialId: Uint8Array): Promise<Bytes> => {
  try {
    const credential = asPublicKeyCredential(
      await navigator.credentials.get({
        publicKey: {
          challenge: randomBytes(32),
          rpId: window.location.hostname,
          allowCredentials: [{ type: "public-key", id: toBytes(credentialId) }],
          userVerification: "required",
          timeout: 60_000,
          extensions: { prf: { eval: { first: PRF_SALT } } },
        },
      }),
    );
    const output = prfFirst(credential);
    if (output === null) throw new PasskeyError("prf-unavailable");
    return output;
  } catch (error) {
    throw toPasskeyError(error);
  }
};

export interface RegisteredPasskey {
  readonly credentialId: Bytes;
  readonly prfOutput: Bytes;
}

/**
 * Registra una passkey de plataforma (clave residente, verificación del
 * usuario obligatoria) con PRF. Si el autenticador no devuelve el PRF al
 * crear, se pide una segunda verificación para evaluarlo.
 */
export const registerPasskey = async (): Promise<RegisteredPasskey> => {
  try {
    const credential = asPublicKeyCredential(
      await navigator.credentials.create({
        publicKey: {
          challenge: randomBytes(32),
          rp: { name: RP_NAME, id: window.location.hostname },
          user: { id: randomBytes(16), name: RP_NAME, displayName: RP_NAME },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 },
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            residentKey: "required",
            requireResidentKey: true,
            userVerification: "required",
          },
          attestation: "none",
          timeout: 60_000,
          extensions: { prf: { eval: { first: PRF_SALT } } },
        },
      }),
    );

    const credentialId = toBytes(credential.rawId);
    const prf = credential.getClientExtensionResults().prf;
    const immediate = prfFirst(credential);
    if (immediate !== null) return { credentialId, prfOutput: immediate };
    if (prf?.enabled !== true) throw new PasskeyError("prf-unavailable");
    return { credentialId, prfOutput: await evaluatePrf(credentialId) };
  } catch (error) {
    throw toPasskeyError(error);
  }
};

/** Nombre de la biometría de este dispositivo, para los textos de la interfaz. */
export const biometryLabel = (): string => {
  const agent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(agent)) return "Face ID";
  if (agent.includes("Macintosh")) return navigator.maxTouchPoints > 1 ? "Face ID" : "Touch ID";
  if (agent.includes("Android")) return "huella";
  if (agent.includes("Windows")) return "Windows Hello";
  return "biometría";
};
