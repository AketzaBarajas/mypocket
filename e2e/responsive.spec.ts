import { expect, test } from "@playwright/test";

import { expectNoHorizontalOverflow, go, onboard, quickAdd } from "./helpers";

const ROUTES = [
  "/",
  "/movimientos",
  "/cuentas",
  "/plan",
  "/plan?pestana=metas",
  "/plan?pestana=recurrentes",
  "/analisis",
  "/analisis?pestana=categorias",
  "/importar",
  "/ajustes",
  "/ajustes?seccion=seguridad",
  "/ajustes?seccion=copias",
];

const VIEWPORTS = [
  { name: "móvil", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "escritorio", width: 1440, height: 900 },
];

test("ninguna pantalla se desborda en móvil, tablet ni escritorio", async ({ page }) => {
  test.setTimeout(180_000);
  await onboard(page);
  await quickAdd(page, { amount: "23,45", category: "Supermercado", concept: "Compra semanal" });
  await quickAdd(page, { amount: "1850", type: "Ingreso", category: "Nómina" });

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    for (const route of ROUTES) {
      await test.step(`${viewport.name} ${route}`, async () => {
        await go(page, route);
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
        await expectNoHorizontalOverflow(page);
      });
    }
  }
  expect(errors).toEqual([]);
});

test("con animaciones reducidas la app sigue mostrando sus datos", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await onboard(page);
  await quickAdd(page, { amount: "10", category: "Supermercado" });
  await go(page, "/");
  await expect(page.getByText("−10,00 €").first()).toBeVisible();
});
