import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/** Relay gratuito oficial de Evolu (valor por defecto de `transports`). */
const DEFAULT_RELAY_ORIGIN = "wss://free.evoluhq.com";

/**
 * Inserta la CSP como `<meta>` solo en el build de producción. En desarrollo
 * Vite necesita scripts en línea y un WebSocket propio para el HMR.
 */
const cspPlugin = (relayOrigins: ReadonlyArray<string>): Plugin => ({
  name: "mypocket-csp",
  apply: "build",
  transformIndexHtml: {
    order: "post",
    handler: () => {
      const policy = [
        "default-src 'self'",
        // SQLite WASM necesita compilar WebAssembly.
        "script-src 'self' 'wasm-unsafe-eval'",
        "worker-src 'self'",
        // Motion y visx escriben estilos en línea (atributo style).
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self'",
        "img-src 'self' data: blob:",
        // Drive se usa solo por su API REST; el permiso se pide en una ventana aparte.
        `connect-src 'self' ${relayOrigins.join(" ")} https://www.googleapis.com`,
        "manifest-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; ");
      return [
        {
          tag: "meta",
          attrs: { "http-equiv": "Content-Security-Policy", content: policy },
          injectTo: "head-prepend",
        },
      ];
    },
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const extraRelays = (env["VITE_RELAY_ORIGINS"] ?? "")
    .split(/[\s,]+/)
    .filter((origin) => origin.startsWith("wss://"));
  const relayOrigins = [...new Set([DEFAULT_RELAY_ORIGIN, ...extraRelays])];

  return {
    cacheDir: ".vite",
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(process.env["npm_package_version"] ?? "0.0.0"),
      __RELAY_ORIGINS__: JSON.stringify(relayOrigins),
    },
    optimizeDeps: {
      // Recomendado por el ejemplo oficial react-vite-pwa de Evolu.
      exclude: ["@evolu/sqlite-wasm", "kysely", "@evolu/react-web"],
    },
    worker: { format: "es" },
    build: {
      target: "es2023",
      sourcemap: false,
    },
    server: { port: 5173, strictPort: true },
    preview: { port: 4173, strictPort: true },
    plugins: [
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
        routesDirectory: "./src/routes",
        generatedRouteTree: "./src/routeTree.gen.ts",
      }),
      react(),
      tailwindcss(),
      cspPlugin(relayOrigins),
      VitePWA({
        registerType: "prompt",
        injectRegister: false,
        includeAssets: ["favicon.svg", "apple-touch-icon.png"],
        manifest: {
          name: "MyPocket",
          short_name: "MyPocket",
          description: "Finanzas personales privadas, cifradas de extremo a extremo.",
          lang: "es-ES",
          dir: "ltr",
          start_url: "/",
          scope: "/",
          display: "standalone",
          orientation: "any",
          theme_color: "#09090B",
          background_color: "#09090B",
          categories: ["finance", "productivity"],
          icons: [
            { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
            { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
            {
              src: "maskable-icon-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
          shortcuts: [
            { name: "Nuevo gasto", url: "/?nuevo=gasto" },
            { name: "Nuevo ingreso", url: "/?nuevo=ingreso" },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,ico,wasm,woff2,webmanifest}"],
          // El WASM de SQLite supera el límite por defecto de 2 MiB.
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
          cleanupOutdatedCaches: true,
          navigateFallback: "index.html",
          navigateFallbackDenylist: [/^\/oauth\.html/],
        },
        devOptions: { enabled: false },
      }),
    ],
  };
});
