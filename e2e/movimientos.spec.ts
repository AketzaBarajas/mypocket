import { expect, test } from "@playwright/test";

import { go, netWorthCard, onboard, quickAdd } from "./helpers";

test("alta rápida de un gasto: aparece en Movimientos y cambia el saldo", async ({ page }) => {
  await onboard(page);

  // Tres interacciones tras abrir la hoja: importe, categoría y Guardar.
  await go(page, "/?nuevo=gasto");
  const sheet = page.getByRole("dialog", { name: "Nuevo movimiento" });
  await sheet.getByLabel("Importe en euros").fill("12,50");
  await sheet.getByRole("radio", { name: "Supermercado", exact: true }).click();
  await sheet.getByRole("button", { name: "Guardar" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText(/^Guardado/)).toBeVisible();

  // Patrimonio: todas las cuentas empezaban en 0.
  await expect(page.getByText("−12,50 €").first()).toBeVisible();

  await go(page, "/movimientos");
  await expect(page.getByText("Supermercado").first()).toBeVisible();
  await expect(page.getByText("−12,50 €").first()).toBeVisible();

  await go(page, "/cuentas");
  await expect(page.getByText("−12,50 €").first()).toBeVisible();
});

test("el gasto cuenta en el presupuesto y en «Hoy puedes gastar»", async ({ page }) => {
  await onboard(page);

  // Presupuesto de 300 € para Alimentación desde este mes.
  await go(page, "/plan");
  await page
    .getByRole("button", { name: /Alimentación/ })
    .first()
    .click();
  const budget = page.getByRole("dialog");
  await budget
    .getByLabel(/Presupuesto|Importe/)
    .first()
    .fill("300");
  await budget.getByRole("button", { name: /^Guardar/ }).click();
  await expect(budget).toBeHidden();

  await go(page, "/");
  const allowance = page
    .locator("section, div")
    .filter({ hasText: /^Hoy puedes gastar/ })
    .first();
  await expect(allowance).toContainText("quedan 300");

  await quickAdd(page, { amount: "60", category: "Supermercado" });
  await expect(allowance).toContainText("quedan 240");

  await go(page, "/plan");
  await expect(page.getByText(/60.*300/).first()).toBeVisible();
});

test("Deshacer desde el aviso elimina el movimiento", async ({ page }) => {
  await onboard(page);
  await quickAdd(page, { amount: "7,30", category: "Cafeterías" });
  await page.getByRole("button", { name: "Deshacer" }).click();

  await go(page, "/movimientos");
  await expect(page.getByText("Apunta tu primer gasto")).toBeVisible();
  await expect(page.getByText("7,30")).toHaveCount(0);
});

test("una cena con adelanto solo resta al patrimonio la parte propia", async ({ page }) => {
  await onboard(page);

  // Pago 60 € de una cena: 20 € son míos y 40 € los adelanto a mis amigos.
  await quickAdd(page, { amount: "20", category: "Restaurantes", concept: "Cena" });
  await quickAdd(page, { amount: "40", type: "Transferir", to: "Deudas de amigos" });

  await go(page, "/cuentas");
  // La cuenta de la que sale el dinero baja 60 €; lo adelantado queda por cobrar.
  await expect(page.getByText("−60,00 €").first()).toBeVisible();
  await expect(page.getByText("40,00 €").first()).toBeVisible();
  // El patrimonio solo baja los 20 € del gasto.
  await expect(netWorthCard(page)).toContainText("−20,00 €");
});
