import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Zona horaria de negocio: los workers de Vitest heredan el entorno.
process.env["TZ"] = "Europe/Madrid";

// Convención: `*.test.ts` corre en Node (dominio, criptografía, datos) y
// `*.test.tsx` corre en jsdom (componentes).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify("test"),
    __RELAY_ORIGINS__: JSON.stringify(["wss://free.evoluhq.com"]),
  },
  test: {
    coverage: {
      provider: "v8",
      include: ["src/domain/**/*.ts"],
      exclude: ["src/domain/**/*.test.ts", "src/domain/**/index.ts", "src/domain/types.ts"],
      thresholds: { lines: 90 },
      reporter: ["text-summary", "html"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts"],
          setupFiles: ["./src/test/setup.node.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["./src/test/setup.dom.ts"],
        },
      },
    ],
  },
});
