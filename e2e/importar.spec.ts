import { fileURLToPath } from "node:url";

import { expect, type Page, test } from "@playwright/test";

import { go, onboard } from "./helpers";

const FIXTURE = fileURLToPath(new URL("./fixtures/movimientos-bbva-ficticio.csv", import.meta.url));

const toPreview = async (page: Page) => {
  await page.getByLabel("Archivo CSV").setInputFiles(FIXTURE);
  await expect(page.getByText(/4 filas · 8 columnas/)).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "Columnas" })).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("group", { name: "Filtrar filas" })).toBeVisible();
};

test("importar un CSV tipo BBVA, reimportarlo y deshacer el lote", async ({ page }) => {
  await onboard(page);
  await go(page, "/importar");

  // El perfil BBVA viene elegido y el mapeo reconoce las columnas pese a las líneas de título.
  await page.getByLabel("Archivo CSV").setInputFiles(FIXTURE);
  await expect(page.getByRole("radio", { name: /^BBVA/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Continuar" }).click();
  const detected = {
    Fecha: "Fecha",
    Concepto: "Concepto",
    Importe: "Importe",
    Notas: "Observaciones",
  };
  for (const [field, column] of Object.entries(detected)) {
    await expect(page.getByLabel(field, { exact: true })).toHaveText(column);
  }
  await expect(page.getByLabel("Cuenta por defecto")).toContainText("BBVA débito");

  // Vista previa: cuatro filas nuevas; los dos cafés idénticos son dos movimientos.
  await page.getByRole("button", { name: "Continuar" }).click();
  const filters = page.getByRole("group", { name: "Filtrar filas" });
  await expect(filters).toContainText(/Nuevas\s*4/);
  await expect(filters).toContainText(/Duplicadas\s*0/);

  // Edición masiva: se categorizan todas a la vez.
  await page.getByRole("button", { name: /Seleccionar las 4 visibles/ }).click();
  await page
    .getByRole("toolbar", { name: "Editar las filas seleccionadas" })
    .getByRole("button", { name: "Categoría" })
    .click();
  await page.getByRole("combobox", { name: "Buscar categoría" }).fill("Supermercado");
  await page.getByRole("option").first().click();
  await expect(page.getByRole("heading", { name: "Se importarán 4 movimientos" })).toBeVisible();

  await page.getByRole("button", { name: "Revisar e importar" }).click();
  // Las cuentas se abrieron hoy: el extracto es anterior y la app lo avisa.
  await expect(
    page.getByText(/4 movimientos son anteriores a la fecha de apertura de su cuenta/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Importar 4 movimientos" }).click();
  await expect(page.getByRole("heading", { name: "4 movimientos importados" })).toBeVisible();

  await go(page, "/movimientos");
  await expect(page.getByText("MERCADONA MADRID").first()).toBeVisible();
  await expect(page.getByText("Frutería del barrio").first()).toBeVisible();
  await expect(page.getByText("−43,85 €").first()).toBeVisible();

  // Reimportar el mismo archivo: todo son duplicados y no hay nada que importar.
  await go(page, "/importar");
  await expect(page.getByText("Importaciones anteriores")).toBeVisible();
  await toPreview(page);
  await expect(page.getByRole("group", { name: "Filtrar filas" })).toContainText(/Duplicadas\s*4/);
  await expect(
    page.getByRole("heading", { name: "Todavía no hay nada que importar" }),
  ).toBeVisible();

  // Deshacer el lote revierte los cuatro movimientos y libera el archivo.
  await page.getByRole("button", { name: "Atrás" }).click();
  await page.getByRole("button", { name: "Atrás" }).click();
  await page.getByRole("button", { name: "Deshacer" }).click();
  await page.getByRole("button", { name: "Deshacer lote" }).click();
  await expect(page.getByText(/Lote deshecho · 4 movimientos borrados/)).toBeVisible();
  await expect(page.getByText("Importaciones anteriores")).toHaveCount(0);

  await go(page, "/movimientos");
  await expect(page.getByText("Apunta tu primer gasto")).toBeVisible();

  await go(page, "/importar");
  await toPreview(page);
  await expect(page.getByRole("group", { name: "Filtrar filas" })).toContainText(/Nuevas\s*4/);
});
