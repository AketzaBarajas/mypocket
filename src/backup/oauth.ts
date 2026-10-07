import { toBase64Url } from "@/security/crypto";

import { DriveError } from "./drive";

/**
 * Permiso de Google Drive sin scripts de terceros. En lugar de cargar Google
 * Identity Services (que solo existe como script remoto de accounts.google.com
 * y chocaría con la CSP), se hace a mano el mismo flujo implícito de OAuth 2.0:
 * una ventana emergente va a Google y vuelve a `/oauth.html`, una página
 * estática de este mismo origen que entrega el token a la app.
 *
 * El token dura una hora, solo sirve para la carpeta oculta de la app y vive
 * únicamente en memoria. En el navegador no se puede renovar en segundo plano:
 * por eso cada copia necesita un toque.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
/** Nombre del mensaje y del canal que usa `public/oauth.js`. */
export const OAUTH_CHANNEL = "mypocket-oauth";
export const OAUTH_REDIRECT_PATH = "/oauth.html";

const WAIT_LIMIT_MS = 5 * 60_000;
/** Margen tras volver a la app sin respuesta antes de darlo por cancelado. */
const FOCUS_GRACE_MS = 2000;

export const googleClientId = (): string => (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "").trim();

/** Esta compilación tiene un ID de cliente de Google configurado. */
export const isDriveConfigured = (): boolean => googleClientId() !== "";

export const buildAuthUrl = (clientId: string, origin: string, state: string): string => {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}${OAUTH_REDIRECT_PATH}`,
    response_type: "token",
    scope: SCOPE,
    state,
    include_granted_scopes: "true",
  });
  return `${AUTH_URL}?${params.toString()}`;
};

export interface OAuthToken {
  readonly token: string;
  /** Milisegundos de validez desde que se recibió. */
  readonly expiresInMs: number;
}

/**
 * Interpreta el fragmento con el que Google vuelve a `/oauth.html`. Devuelve
 * `null` si no trae token o si el `state` no es el que pidió esta app.
 */
export const parseOAuthResponse = (fragment: string, expectedState: string): OAuthToken | null => {
  const params = new URLSearchParams(fragment.replace(/^#/, ""));
  const token = params.get("access_token");
  if (token === null || token === "" || params.get("state") !== expectedState) return null;
  const seconds = Number(params.get("expires_in") ?? "3600");
  return { token, expiresInMs: (Number.isFinite(seconds) && seconds > 0 ? seconds : 3600) * 1000 };
};

let cached: { readonly token: string; readonly expiresAt: number } | null = null;

/** Olvida el token en memoria (al bloquear, o si Google lo rechaza). */
export const forgetDriveToken = (): void => {
  cached = null;
};

/**
 * Pide a Google un token de acceso a la carpeta de la app. Debe llamarse
 * directamente desde un gesto del usuario: abre una ventana emergente.
 */
export const requestDriveToken = (): Promise<string> => {
  if (cached !== null && cached.expiresAt - Date.now() > 60_000) {
    return Promise.resolve(cached.token);
  }
  const clientId = googleClientId();
  if (clientId === "") return Promise.reject(new DriveError("auth"));

  const state = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const popup = window.open(
    buildAuthUrl(clientId, window.location.origin, state),
    OAUTH_CHANNEL,
    "popup,width=480,height=680",
  );
  if (popup === null) return Promise.reject(new DriveError("popup"));

  return new Promise<string>((resolve, reject) => {
    const channel =
      typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(OAUTH_CHANNEL);
    let graceTimer: number | undefined;

    const finish = (result: OAuthToken | null) => {
      window.clearTimeout(limitTimer);
      window.clearTimeout(graceTimer);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("focus", onFocus);
      channel?.close();
      if (result === null) {
        reject(new DriveError("auth"));
        return;
      }
      cached = { token: result.token, expiresAt: Date.now() + result.expiresInMs };
      resolve(result.token);
    };

    const receive = (data: unknown) => {
      if (typeof data !== "object" || data === null) return;
      const { type, fragment } = data as { readonly type?: unknown; readonly fragment?: unknown };
      if (type !== OAUTH_CHANNEL || typeof fragment !== "string") return;
      finish(parseOAuthResponse(fragment, state));
    };
    // La respuesta llega por dos vías: `postMessage` al abridor y, por si Google
    // corta esa relación entre ventanas, un BroadcastChannel del mismo origen.
    const onMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin) receive(event.data);
    };
    // Al volver a la app sin respuesta, la ventana se cerró sin dar permiso.
    const onFocus = () => {
      window.clearTimeout(graceTimer);
      graceTimer = window.setTimeout(() => finish(null), FOCUS_GRACE_MS);
    };
    const limitTimer = window.setTimeout(() => finish(null), WAIT_LIMIT_MS);

    window.addEventListener("message", onMessage);
    window.addEventListener("focus", onFocus);
    if (channel) channel.onmessage = (event: MessageEvent) => receive(event.data);
  });
};
