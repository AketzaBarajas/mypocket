// Genera los iconos PNG de la PWA a partir del logo (el mismo trazo de
// public/favicon.svg). Uso: `pnpm icons`. Los PNG se versionan en public/, así
// que solo hay que ejecutarlo si cambia el logo.
//
// Rasteriza con el navegador de Playwright para no añadir dependencias.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const BG = "#09090B";
const ACCENT = "#3DF5A7";

const mark = `
  <path d="M18 24a6 6 0 0 1 6-6h16a6 6 0 0 1 6 6v8a14 14 0 0 1-28 0z"
        fill="none" stroke="${ACCENT}" stroke-width="5" stroke-linejoin="round" />
  <path d="M26 28l6 6 6-6"
        fill="none" stroke="${ACCENT}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />`;

/** Icono normal: cuadrado redondeado con las esquinas transparentes. */
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${BG}" />${mark}
</svg>`;

/** Icono a sangre: el sistema recorta la forma, así que el logo se encoge a la zona segura. */
const fullBleed = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${BG}" />
  <g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${mark}</g>
</svg>`;

const ICONS = [
  { file: "pwa-192x192.png", size: 192, svg: rounded, transparent: true },
  { file: "pwa-512x512.png", size: 512, svg: rounded, transparent: true },
  { file: "maskable-icon-512x512.png", size: 512, svg: fullBleed(0.7), transparent: false },
  { file: "apple-touch-icon.png", size: 180, svg: fullBleed(0.82), transparent: false },
];

const launch = async () => {
  // Sin los navegadores de Playwright descargados, sirve el Edge o el Chrome del sistema.
  for (const options of [{}, { channel: "msedge" }, { channel: "chrome" }]) {
    try {
      return await chromium.launch(options);
    } catch {
      // Se prueba el siguiente.
    }
  }
  throw new Error(
    "No hay navegador para generar los iconos. Ejecuta `pnpm exec playwright install chromium`.",
  );
};

const outDir = fileURLToPath(new URL("../public/", import.meta.url));
await mkdir(outDir, { recursive: true });

const browser = await launch();
try {
  for (const icon of ICONS) {
    const page = await browser.newPage({
      viewport: { width: icon.size, height: icon.size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${icon.size}px;height:${icon.size}px}</style>${icon.svg}`,
    );
    const png = await page.screenshot({ omitBackground: icon.transparent, type: "png" });
    await writeFile(path.join(outDir, icon.file), png);
    await page.close();
    process.stdout.write(`${icon.file} · ${icon.size}×${icon.size}\n`);
  }
} finally {
  await browser.close();
}
