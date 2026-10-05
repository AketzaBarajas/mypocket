export const KEYPAD_KEYS = [
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
] as const;
export type KeypadKey = (typeof KEYPAD_KEYS)[number];

/** Máximo de cifras enteras: 9.999.999,99 €. */
const MAX_INTEGER_DIGITS = 7;

/**
 * Aplica una tecla al texto de un importe ("12,5"). Es una función pura para
 * poder probar el teclado sin montar la interfaz.
 */
export const applyKeypadKey = (current: string, key: KeypadKey): string => {
  if (key === "backspace") return current.slice(0, -1);

  if (key === ",") {
    if (current.includes(",")) return current;
    return current === "" ? "0," : `${current},`;
  }

  const [integer = "", fraction] = current.split(",");
  if (fraction !== undefined) {
    return fraction.length >= 2 ? current : current + key;
  }
  if (integer === "0") return key;
  if (integer.length >= MAX_INTEGER_DIGITS) return current;
  return current + key;
};

/** Traduce una tecla física al teclado numérico, o `null` si no aplica. */
export const keypadKeyFromEvent = (eventKey: string): KeypadKey | null => {
  if (/^\d$/.test(eventKey)) return eventKey as KeypadKey;
  if (eventKey === "," || eventKey === ".") return ",";
  if (eventKey === "Backspace") return "backspace";
  return null;
};

/**
 * Limpia un importe escrito con el teclado físico: solo dígitos y una coma,
 * con dos decimales como máximo y sin ceros a la izquierda.
 */
export const sanitizeAmountText = (text: string): string => {
  let result = "";
  for (const char of text) {
    const key = keypadKeyFromEvent(char);
    if (key !== null && key !== "backspace") result = applyKeypadKey(result, key);
  }
  return result;
};
