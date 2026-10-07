import { expect, test } from "@playwright/test";

import { go, netWorthCard, onboard } from "./helpers";

test("«Actualizar valor» en una inversión cambia el patrimonio", async ({ page }) => {
  await onboard(page);

  await go(page, "/cuentas");
  const netWorth = netWorthCard(page);
  await expect(netWorth).toContainText("0,00 €");

  await page.getByRole("button", { name: "Actualizar valor" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Actualizar valor" });
  await sheet.getByLabel("Valor actual").fill("1500");
  await sheet.getByRole("button", { name: "Guardar valor" }).click();
  await expect(page.getByText("Valor actualizado")).toBeVisible();

  await expect(netWorth).toContainText("1.500,00 €");

  // La gráfica de patrimonio de Inicio describe el nuevo valor.
  await go(page, "/");
  await expect(page.getByRole("img", { name: /patrimonio/i }).first()).toHaveAccessibleName(
    /1\.500,00/,
  );
});
