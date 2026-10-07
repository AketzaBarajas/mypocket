import { expect, test } from "@playwright/test";

import { go, onboard, quickAdd } from "./helpers";

/** Único destino externo permitido sin conectar Drive: el relay de sincronización. */
const RELAY_HOST = "free.evoluhq.com";

test("la app solo habla con su propio origen y con el relay", async ({ page, baseURL }) => {
  const own = new URL(baseURL ?? "http://localhost:4173").host;
  const external = new Set<string>();
  const note = (url: string) => {
    const { protocol, host } = new URL(url);
    if (protocol === "data:" || protocol === "blob:") return;
    if (host !== own) external.add(host);
  };
  page.on("request", (request) => note(request.url()));
  page.on("websocket", (socket) => note(socket.url()));

  await onboard(page);
  await quickAdd(page, { amount: "9,90", category: "Supermercado", concept: "Compra" });
  for (const route of ["/movimientos", "/cuentas", "/plan", "/analisis", "/importar", "/ajustes"]) {
    await go(page, route);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  }

  expect([...external].filter((host) => host !== RELAY_HOST)).toEqual([]);
});

test("la política de seguridad de contenido solo admite scripts propios", async ({ page }) => {
  await page.goto("/");
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute("content");
  expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain(`wss://${RELAY_HOST}`);
  expect(csp).toContain("https://www.googleapis.com");
  expect(csp).not.toContain("accounts.google.com");
  expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
});
