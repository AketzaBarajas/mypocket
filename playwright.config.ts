import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
// Sin los navegadores de Playwright descargados se puede usar el del sistema:
// PW_CHANNEL=msedge (o chrome) pnpm test:e2e
const channel = process.env["PW_CHANNEL"];

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(channel ? { channel } : {}),
  },
  projects: [
    {
      name: "movil",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, hasTouch: true },
    },
    {
      name: "escritorio",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      testMatch: /(importar|responsive)\.spec\.ts/,
    },
  ],
  webServer: {
    command: "pnpm build && pnpm preview",
    // Por URL y no por puerto: Vite escucha en `localhost`, que en Windows puede
    // ser solo IPv6, y la comprobación por puerto mira 127.0.0.1.
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env["CI"],
    timeout: 180_000,
  },
});
