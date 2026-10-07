import { expect, test } from "@playwright/test";

import { go, netWorthCard, onboard } from "./helpers";

test("una recurrencia genera su pendiente y, al aprobarlo, cuenta en los totales", async ({
  page,
}) => {
  await onboard(page);

  await go(page, "/plan?pestana=recurrentes");
  await page
    .getByRole("button", { name: /^Nueva/ })
    .first()
    .click();
  const form = page.getByRole("dialog", { name: "Nuevo recurrente" });
  await form.getByLabel("Nombre").fill("Cuota mensual");
  await form.getByLabel("Importe").fill("35");
  await form.getByLabel("Categoría").click();
  await page.getByRole("option", { name: "Gimnasio" }).click();
  await form.getByRole("button", { name: "Crear recurrente" }).click();
  await expect(form).toBeHidden();

  // El primer cargo es hoy: se genera el pendiente al momento.
  await go(page, "/");
  const pending = page.getByRole("region", { name: "Por aprobar" });
  await expect(pending).toContainText("Cuota mensual");
  // Un pendiente no cuenta: el patrimonio sigue en 0.
  await go(page, "/cuentas");
  await expect(netWorthCard(page)).toContainText("0,00 €");
  await expect(netWorthCard(page)).not.toContainText("35,00");

  await go(page, "/");
  await page
    .getByRole("region", { name: "Por aprobar" })
    .getByRole("button", { name: "Aprobar" })
    .click();
  await expect(page.getByRole("region", { name: "Por aprobar" })).toHaveCount(0);

  await go(page, "/movimientos");
  await expect(page.getByText("Cuota mensual").first()).toBeVisible();
  await expect(page.getByText("Pendiente", { exact: true })).toHaveCount(0);
  await go(page, "/cuentas");
  await expect(netWorthCard(page)).toContainText("−35,00 €");

  // Volver a abrir la app no duplica el cargo.
  await go(page, "/movimientos");
  await expect(page.getByText("Cuota mensual")).toHaveCount(1);
});
