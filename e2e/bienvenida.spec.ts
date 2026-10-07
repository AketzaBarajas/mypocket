import { expect, test } from "@playwright/test";

import { go, onboard, typePin, unlock } from "./helpers";

test("bienvenida completa: frase, PIN, cuentas y categorías hasta Inicio", async ({ page }) => {
  await onboard(page);
  await expect(page.getByText("Patrimonio neto").first()).toBeVisible();

  await go(page, "/cuentas");
  for (const account of [
    "BBVA débito",
    "BBVA prepago",
    "Efectivo",
    "Trade Republic",
    "MyInvestor",
  ]) {
    await expect(page.getByText(account).first()).toBeVisible();
  }
});

test("arranca bloqueada: sin PIN no se ve ningún dato", async ({ page }) => {
  const phrase = await onboard(page);
  await page.reload();

  await expect(page.getByText("Introduce tu PIN")).toBeVisible();
  await expect(page.getByText("Patrimonio neto")).toHaveCount(0);
  await expect(page.getByText("BBVA débito")).toHaveCount(0);

  // Una ruta interna también lleva al bloqueo.
  await page.goto("/movimientos");
  await expect(page.getByText("Introduce tu PIN")).toBeVisible();

  // El secreto no está en claro en el almacenamiento del navegador.
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  for (const word of phrase.split(" ")) expect(stored).not.toContain(` ${word} `);

  await typePin(page, "111222");
  await expect(page.getByText("PIN incorrecto. Inténtalo de nuevo.")).toBeVisible();

  await typePin(page);
  await expect(page.getByRole("heading", { name: "Movimientos" })).toBeVisible({ timeout: 30_000 });
});

test("tras 5 PIN fallidos hay espera y los datos siguen ahí", async ({ page }) => {
  await onboard(page);
  await page.reload();
  await expect(page.getByText("Introduce tu PIN")).toBeVisible();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await typePin(page, "135790");
    // Tras comprobarlo, el teclado se vacía para el siguiente intento.
    await expect(page.getByRole("img", { name: "PIN: 0 de 6 dígitos" })).toBeVisible();
    await expect(page.getByText("Comprobando…")).toHaveCount(0);
  }
  await expect(page.getByText(/Demasiados intentos\. Vuelve a probar en \d+ s\./)).toBeVisible();

  // La espera es de 30 s: pasada, el PIN correcto abre y no se ha borrado nada.
  await page.waitForTimeout(31_000);
  await unlock(page);
  await go(page, "/cuentas");
  await expect(page.getByText("BBVA débito").first()).toBeVisible();
});
