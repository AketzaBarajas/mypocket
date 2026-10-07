import { expect, type Page } from "@playwright/test";

/** PIN de las pruebas. No es una escalera ni dígitos repetidos: la app lo acepta. */
export const PIN = "258036";

/** Teclea el PIN con el teclado físico: el teclado de PIN escucha en toda la ventana. */
export const typePin = async (page: Page, pin = PIN): Promise<void> => {
  await page.keyboard.type(pin, { delay: 20 });
};

/**
 * Recorre la bienvenida completa empezando de cero: frase, confirmación de
 * tres palabras, PIN, cuentas y categorías precargadas, sin Drive ni Notion.
 * Devuelve la frase de 12 palabras que mostró la app.
 */
export const onboard = async (page: Page): Promise<string> => {
  await page.goto("/");
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  await page.getByRole("button", { name: /Empezar de cero/ }).click();

  await expect(page.getByRole("heading", { name: "Tu frase de recuperación" })).toBeVisible();
  const words = (
    await page
      .getByRole("list", { name: "Frase de recuperación" })
      .getByRole("listitem")
      .allInnerTexts()
  ).map((item) => item.replace(/^\s*\d+\s*/, "").trim());
  expect(words).toHaveLength(12);

  await page.getByRole("button", { name: "Ya la he guardado" }).click();
  for (const field of await page.getByLabel(/^Palabra \d+$/).all()) {
    const label = await field.evaluate((input) => input.closest("label")?.textContent ?? "");
    const position = Number(/\d+/.exec(label)?.[0] ?? "0");
    await field.fill(words[position - 1] ?? "");
  }
  await page.getByRole("button", { name: "Confirmar" }).click();

  await expect(page.getByRole("heading", { name: "Crea tu PIN" })).toBeVisible();
  await typePin(page);
  await expect(page.getByRole("heading", { name: "Repite el PIN" })).toBeVisible();
  await typePin(page);
  // Sin passkey: el autenticador de las pruebas no da PRF. El PIN funciona siempre.
  await page.getByRole("button", { name: /^Continuar/ }).click();

  await expect(page.getByRole("heading", { name: "Tus cuentas" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Categorías listas" })).toBeVisible();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Ahora no" }).click();
  await page.getByRole("button", { name: "Ir a Inicio" }).click();

  await expect(page.getByRole("heading", { name: /^Hola, / }).first()).toBeVisible();
  return words.join(" ");
};

/**
 * Navega dentro de la app sin recargarla. `page.goto` recarga la página y la
 * app, como debe, vuelve a arrancar bloqueada: los flujos con la sesión
 * abierta se mueven por el historial, igual que al tocar un enlace.
 */
export const go = async (page: Page, path: string): Promise<void> => {
  await page.evaluate((target) => {
    window.history.pushState(null, "", target);
  }, path);
  await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === path);
};

/** Desbloquea con el PIN desde la pantalla de bloqueo. */
export const unlock = async (page: Page): Promise<void> => {
  await expect(page.getByText("Introduce tu PIN")).toBeVisible();
  await typePin(page);
  // Tras desbloquear, la app vuelve a la pantalla en la que estaba.
  await expect(page.getByRole("navigation", { name: "Principal" }).first()).toBeVisible({
    timeout: 30_000,
  });
};

export interface QuickAddInput {
  readonly amount: string;
  readonly type?: "Gasto" | "Ingreso" | "Transferir";
  /** Categoría hoja (gasto o ingreso). */
  readonly category?: string;
  /** Cuenta de destino (transferencia). */
  readonly to?: string;
  readonly concept?: string;
}

/**
 * Apunta un movimiento con el alta rápida. El camino mínimo de un gasto son
 * tres interacciones tras abrir la hoja: importe, categoría y Guardar.
 */
export const quickAdd = async (page: Page, input: QuickAddInput): Promise<void> => {
  const url = new URL(page.url());
  url.searchParams.set("nuevo", "gasto");
  await go(page, `${url.pathname}${url.search}`);
  const sheet = page.getByRole("dialog", { name: "Nuevo movimiento" });
  await expect(sheet).toBeVisible();

  if (input.type !== undefined && input.type !== "Gasto") {
    await sheet.getByRole("radio", { name: input.type }).click();
  }
  await sheet.getByLabel("Importe en euros").fill(input.amount);
  if (input.category !== undefined) {
    // La fila de chips solo trae las categorías más usadas; el resto, en «Todas».
    const chip = sheet.getByRole("radio", { name: input.category, exact: true });
    if ((await chip.count()) > 0) {
      await chip.click();
    } else {
      await sheet.getByRole("button", { name: "Todas" }).click();
      await page.getByRole("combobox", { name: "Buscar categoría" }).fill(input.category);
      await page.getByRole("option", { name: input.category }).first().click();
    }
  }
  if (input.to !== undefined) {
    await sheet.getByRole("button", { name: /^Cuenta de destino/ }).click();
    await page.getByRole("menuitem", { name: input.to }).click();
  }
  if (input.concept !== undefined) await sheet.getByLabel("Concepto").fill(input.concept);
  await sheet.getByRole("button", { name: "Guardar" }).click();
  await expect(sheet).toBeHidden();
};

/** Tarjeta de patrimonio de la pantalla de Cuentas. */
export const netWorthCard = (page: Page) => page.getByText("Patrimonio neto").locator("xpath=..");

/** La página no se desborda en horizontal. */
export const expectNoHorizontalOverflow = async (page: Page): Promise<void> => {
  const extra = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(extra, "desborde horizontal en px").toBeLessThanOrEqual(0);
};
