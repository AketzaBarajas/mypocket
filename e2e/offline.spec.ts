import { expect, test } from "@playwright/test";

import { go, onboard, quickAdd, unlock } from "./helpers";

test("sin conexión, la app carga y permite registrar", async ({ page, context }) => {
  await onboard(page);

  // El service worker precachea el shell, el WASM y las fuentes en la primera carga.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(async () => (await caches.keys()).length), { timeout: 60_000 })
    .toBeGreaterThan(0);

  await context.setOffline(true);
  await page.reload();
  await unlock(page);

  await quickAdd(page, { amount: "4,20", category: "Cafeterías" });
  await go(page, "/movimientos");
  await expect(page.getByText("−4,20 €").first()).toBeVisible();

  // Al volver la conexión la app sigue funcionando con el dato guardado.
  await context.setOffline(false);
  await page.reload();
  await unlock(page);
  await go(page, "/movimientos");
  await expect(page.getByText("−4,20 €").first()).toBeVisible();
});

test("la app es instalable: manifiesto e iconos propios", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).not.toBeNull();

  const manifest = (await (await request.get(href ?? "")).json()) as {
    name: string;
    display: string;
    icons: Array<{ src: string; sizes: string; purpose?: string }>;
  };
  expect(manifest.name).toBe("MyPocket");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.map((icon) => icon.sizes)).toEqual(
    expect.arrayContaining(["192x192", "512x512"]),
  );
  expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  for (const icon of [...manifest.icons.map((item) => item.src), "apple-touch-icon.png"]) {
    const response = await request.get(`/${icon}`);
    expect(response.status(), icon).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
});
