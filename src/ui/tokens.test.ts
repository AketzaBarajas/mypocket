import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Verifica el contraste WCAG 2.1 AA de los tokens leyendo `tokens.css`, que es
 * la única fuente de verdad de los colores.
 */

type Rgb = readonly [number, number, number];

const css = readFileSync(fileURLToPath(new URL("./tokens.css", import.meta.url)), "utf8");

const parseBlock = (block: string): Map<string, string> => {
  const tokens = new Map<string, string>();
  for (const match of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) tokens.set(name, value.trim());
  }
  return tokens;
};

const blockAfter = (marker: string): string => {
  const start = css.indexOf(marker);
  expect(start, `No se encontró el bloque «${marker}»`).toBeGreaterThan(-1);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
};

const dark = parseBlock(blockAfter(':root,\n[data-theme="dark"]'));
const light = parseBlock(blockAfter('\n[data-theme="light"]'));
const lightMedia = parseBlock(blockAfter(':root:not([data-theme="dark"])'));

const hex = (value: string): Rgb => {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match?.[1]) throw new Error(`Color no hexadecimal: ${value}`);
  const n = Number.parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const luminance = ([r, g, b]: Rgb): number => {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrast = (a: Rgb, b: Rgb): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

const get = (theme: Map<string, string>, name: string): Rgb => {
  const value = theme.get(name);
  if (value === undefined) throw new Error(`Falta el token ${name}`);
  return hex(value);
};

const AA_TEXT = 4.5;
const AA_UI = 3;

const PALETTE = ["slate", "blue", "teal", "olive", "amber", "coral", "rose", "violet"] as const;
const SURFACES = ["--bg", "--surface", "--surface-raised", "--chip", "--key"] as const;

describe.each([
  ["oscuro", dark],
  ["claro", light],
])("tokens en modo %s", (_, theme) => {
  it.each(SURFACES)("--text y --text-2 son legibles sobre %s", (surface) => {
    expect(contrast(get(theme, "--text"), get(theme, surface))).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(get(theme, "--text-2"), get(theme, surface))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(["--accent", "--warning", "--danger"])("%s es legible como texto", (token) => {
    for (const surface of ["--bg", "--surface", "--surface-raised"] as const) {
      expect(contrast(get(theme, token), get(theme, surface))).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("--on-accent es legible sobre --accent", () => {
    expect(contrast(get(theme, "--on-accent"), get(theme, "--accent"))).toBeGreaterThanOrEqual(
      AA_TEXT,
    );
  });

  it.each(PALETTE)("el color de paleta %s es legible como texto", (color) => {
    for (const surface of ["--surface", "--chip"] as const) {
      expect(contrast(get(theme, `--pal-${color}`), get(theme, surface))).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
    }
  });

  it("las barras de estado se distinguen de su pista", () => {
    for (const token of ["--accent", "--warning", "--danger"] as const) {
      expect(contrast(get(theme, token), get(theme, "--track"))).toBeGreaterThanOrEqual(AA_UI);
    }
  });
});

describe("tokens", () => {
  it("el modo claro es idéntico por media query y por atributo", () => {
    expect([...lightMedia.entries()]).toEqual([...light.entries()]);
  });

  it("ambos modos definen los mismos tokens", () => {
    expect([...dark.keys()].sort()).toEqual([...light.keys()].sort());
  });

  it("usa los valores exactos del sistema Obsidian", () => {
    expect(dark.get("--bg")).toBe("#09090b");
    expect(dark.get("--surface")).toBe("#131316");
    expect(dark.get("--accent")).toBe("#3df5a7");
    expect(dark.get("--danger")).toBe("#ff5c5c");
    expect(light.get("--bg")).toBe("#f6f6f7");
    expect(light.get("--accent")).toBe("#0a7f51");
    expect(light.get("--warning")).toBe("#9a5b00");
  });
});
