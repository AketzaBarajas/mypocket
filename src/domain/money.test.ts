import { describe, expect, it } from "vitest";

import {
  absCents,
  addCents,
  cents,
  centsToInputValue,
  divFloorCents,
  eurosToCents,
  formatMoney,
  formatPercent,
  maxCents,
  negCents,
  parseMoney,
  percentOfCents,
  splitMoney,
  subCents,
  sumCents,
} from "./money";

/** Quita los espacios duros de Intl para comparar con texto normal. */
const plain = (text: string): string => text.replace(/\s/g, " ");

describe("cents", () => {
  it("solo acepta enteros", () => {
    expect(cents(1250)).toBe(1250);
    expect(() => cents(12.5)).toThrow(RangeError);
    expect(() => cents(Number.NaN)).toThrow(RangeError);
    expect(() => cents(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("normaliza el cero negativo", () => {
    expect(Object.is(cents(-0), 0)).toBe(true);
    expect(Object.is(negCents(cents(0)), 0)).toBe(true);
  });
});

describe("aritmética en enteros", () => {
  it("suma sin decimales flotantes", () => {
    // En coma flotante, 0.1 + 0.2 no es 0.3; en céntimos sí.
    expect(sumCents([cents(10), cents(20)])).toBe(30);
    const many = Array.from({ length: 1000 }, () => cents(1));
    expect(sumCents(many)).toBe(1000);
    expect(Number.isInteger(sumCents([cents(333), cents(333), cents(334)]))).toBe(true);
  });

  it("opera con signo", () => {
    expect(addCents(cents(100), cents(-30))).toBe(70);
    expect(subCents(cents(100), cents(130))).toBe(-30);
    expect(absCents(cents(-30))).toBe(30);
    expect(maxCents(cents(5), cents(9))).toBe(9);
    expect(maxCents(cents(9), cents(5))).toBe(9);
  });

  it("divide redondeando hacia abajo al céntimo", () => {
    expect(divFloorCents(cents(1000), 3)).toBe(333);
    expect(divFloorCents(cents(99), 100)).toBe(0);
    expect(() => divFloorCents(cents(100), 0)).toThrow(RangeError);
  });

  it("calcula porcentajes enteros", () => {
    expect(percentOfCents(cents(245_000), 50)).toBe(122_500);
    expect(percentOfCents(cents(333), 20)).toBe(67);
    expect(eurosToCents(12.345)).toBe(1235);
  });
});

describe("parseMoney", () => {
  it.each([
    ["12,50", 1250],
    ["1.234,56", 123_456],
    ["1234.56", 123_456],
    ["-12,5 €", -1250],
    ["€1,234.56", 123_456],
    ["12", 1200],
    ["0,5", 50],
    [",5", 50],
    ["1.234", 123_400],
    ["1.234.567", 123_456_700],
    ["1,234,567", 123_456_700],
    ["0.500", 50],
    ["12.5", 1250],
    ["1 234,56 €", 123_456],
    ["+15,00", 1500],
    ["(12,50)", -1250],
    ["12,50-", -1250],
    ["  7,00 EUR ", 700],
  ])("%s → %d céntimos", (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it("acepta el signo menos tipográfico", () => {
    expect(parseMoney(`${String.fromCharCode(0x2212)}12,50 €`)).toBe(-1250);
  });

  it("redondea a céntimos", () => {
    expect(parseMoney("12,345")).toBe(1235);
    expect(parseMoney("12,344")).toBe(1234);
    expect(parseMoney("0,999")).toBe(100);
  });

  it("respeta el separador decimal del perfil", () => {
    expect(parseMoney("1.234", { decimalSeparator: "." })).toBe(123);
    expect(parseMoney("1,234", { decimalSeparator: "," })).toBe(123);
    expect(parseMoney("1.234,5", { decimalSeparator: "," })).toBe(123_450);
    expect(parseMoney("1,234.5", { decimalSeparator: "." })).toBe(123_450);
    expect(parseMoney("1234", { decimalSeparator: "," })).toBe(123_400);
  });

  it.each(["", "   ", "abc", "12a", "€", ",", ".", "1,2,3,4x", "--5"])("rechaza «%s»", (input) => {
    expect(parseMoney(input)).toBeNull();
  });

  it("siempre devuelve enteros", () => {
    for (const input of ["0,1", "0,2", "19,99", "1.000.000,01", "33,333"]) {
      expect(Number.isInteger(parseMoney(input))).toBe(true);
    }
  });
});

describe("formatMoney", () => {
  it("formatea en español con separador de miles", () => {
    expect(plain(formatMoney(cents(123_456)))).toBe("1.234,56 €");
    expect(plain(formatMoney(cents(1250)))).toBe("12,50 €");
    expect(plain(formatMoney(cents(0)))).toBe("0,00 €");
    expect(plain(formatMoney(cents(98_765_430)))).toBe("987.654,30 €");
  });

  it("controla el signo", () => {
    const minus = String.fromCharCode(0x2212);
    expect(plain(formatMoney(cents(-1250)))).toBe(`${minus}12,50 €`);
    expect(plain(formatMoney(cents(1250), { sign: "always" }))).toBe("+12,50 €");
    expect(plain(formatMoney(cents(0), { sign: "always" }))).toBe("0,00 €");
    expect(plain(formatMoney(cents(-1250), { sign: "never" }))).toBe("12,50 €");
  });

  it("tiene variante compacta para ejes y variante sin céntimos", () => {
    expect(plain(formatMoney(cents(2_440_000), { compact: true }))).toBe("24,4 mil €");
    expect(plain(formatMoney(cents(123_456), { whole: true }))).toBe("1.235 €");
  });

  it("trocea el importe para pintar los céntimos aparte", () => {
    const parts = splitMoney(cents(2_443_218));
    expect(parts.integer).toBe("24.432");
    expect(parts.fraction).toBe(",18");
    expect(plain(parts.symbol)).toBe(" €");
    expect(parts.sign).toBe("");
    expect(splitMoney(cents(-500)).sign).toBe(String.fromCharCode(0x2212));
    expect(splitMoney(cents(500), "always").sign).toBe("+");
  });

  it("da el valor de un campo de edición", () => {
    expect(centsToInputValue(cents(123_456))).toBe("1234,56");
    expect(centsToInputValue(cents(5))).toBe("0,05");
    expect(centsToInputValue(cents(-1250))).toBe("-12,50");
  });

  it("formatea porcentajes", () => {
    expect(plain(formatPercent(0.625))).toBe("63 %");
    expect(plain(formatPercent(0.125, 1))).toBe("12,5 %");
  });
});
