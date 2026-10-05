import { describe, expect, it } from "vitest";

import { applyKeypadKey, KEYPAD_KEYS, keypadKeyFromEvent, type KeypadKey } from "./keypad";

const type = (keys: ReadonlyArray<KeypadKey>, start = ""): string =>
  keys.reduce((text, key) => applyKeypadKey(text, key), start);

describe("teclado numérico", () => {
  it("tiene doce teclas en orden 1-9, coma, 0 y borrar", () => {
    expect(KEYPAD_KEYS).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      ",",
      "0",
      "backspace",
    ]);
  });

  it("escribe importes con hasta dos decimales", () => {
    expect(type(["1", "2", ",", "5"])).toBe("12,5");
    expect(type(["1", "2", ",", "5", "0", "9"])).toBe("12,50");
    expect(type([",", "5"])).toBe("0,5");
    expect(type(["1", ",", ","])).toBe("1,");
  });

  it("no acumula ceros a la izquierda", () => {
    expect(type(["0", "0", "7"])).toBe("7");
    expect(type(["0", ",", "0", "7"])).toBe("0,07");
  });

  it("limita la parte entera a siete cifras", () => {
    expect(type(["1", "2", "3", "4", "5", "6", "7", "8"])).toBe("1234567");
    expect(type(["1", "2", "3", "4", "5", "6", "7", ",", "9"])).toBe("1234567,9");
  });

  it("borra de uno en uno", () => {
    expect(type(["backspace"], "12,5")).toBe("12,");
    expect(type(["backspace", "backspace"], "12,5")).toBe("12");
    expect(type(["backspace"], "")).toBe("");
  });

  it("traduce el teclado físico", () => {
    expect(keypadKeyFromEvent("7")).toBe("7");
    expect(keypadKeyFromEvent(",")).toBe(",");
    expect(keypadKeyFromEvent(".")).toBe(",");
    expect(keypadKeyFromEvent("Backspace")).toBe("backspace");
    expect(keypadKeyFromEvent("a")).toBeNull();
    expect(keypadKeyFromEvent("Enter")).toBeNull();
  });
});
