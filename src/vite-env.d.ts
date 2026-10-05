/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

/** Versión de package.json, inyectada por Vite. */
declare const __APP_VERSION__: string;

/** Orígenes de relay permitidos por la CSP de esta compilación. */
declare const __RELAY_ORIGINS__: ReadonlyArray<string>;

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_RELAY_ORIGINS?: string;
  readonly VITE_DEMO_PROFILE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
