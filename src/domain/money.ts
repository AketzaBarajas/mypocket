import type { Cents } from "./types";

/** Convierte un entero en `Cents`. Lanza si no es un entero seguro. */
export const cents = (value: number): Cents => {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError("Un importe en céntimos debe ser un número entero.");
  }
  // Normaliza -0 a 0 para que las comparaciones y el formato sean estables.
  return (value === 0 ? 0 : value) as Cents;
};

export const ZERO_CENTS = cents(0);

/** Suma importes sin salir nunca de los enteros. */
export const sumCents = (values: Iterable<Cents>): Cents => {
  let total = 0;
  for (const value of values) total += value;
  return cents(total);
};

export const addCents = (a: Cents, b: Cents): Cents => cents(a + b);
export const subCents = (a: Cents, b: Cents): Cents => cents(a - b);
export const negCents = (a: Cents): Cents => cents(0 - a);
export const absCents = (a: Cents): Cents => cents(Math.abs(a));
export const maxCents = (a: Cents, b: Cents): Cents => (a >= b ? a : b);

/** División entera de un importe, redondeando hacia abajo al céntimo. */
export const divFloorCents = (amount: Cents, divisor: number): Cents => {
  if (!Number.isFinite(divisor) || divisor <= 0) {
    throw new RangeError("El divisor debe ser mayor que cero.");
  }
  return cents(Math.floor(amount / divisor));
};

/** Porcentaje entero de un importe, redondeado al céntimo más cercano. */
export const percentOfCents = (amount: Cents, percent: number): Cents =>
  cents(Math.round((amount * percent) / 100));

/** Convierte euros con decimales en céntimos (solo para bordes de entrada). */
export const eurosToCents = (euros: number): Cents => cents(Math.round(euros * 100));

export interface ParseMoneyOptions {
  /** Fuerza el separador decimal cuando se conoce (perfiles de importación). */
  readonly decimalSeparator?: "," | ".";
}

const digitsOnly = (text: string): boolean => /^\d+$/.test(text);

/**
 * Parsea un importe escrito a mano o venido de un CSV.
 *
 * Acepta "12,50", "1.234,56", "1234.56", "-12,5 €" y "€1,234.56". Si aparecen
 * ambos separadores, el último es el decimal. Redondea al céntimo (mitad hacia
 * arriba en valor absoluto) sin pasar por coma flotante. Devuelve `null` si el
 * texto no es un importe.
 */
export const parseMoney = (input: string, options: ParseMoneyOptions = {}): Cents | null => {
  let text = input.normalize("NFKC").replace(/\s/g, "").replace(/€|EUR/gi, "");
  if (text === "") return null;

  let negative = false;
  // Paréntesis contables: (12,50) = -12,50.
  if (text.startsWith("(") && text.endsWith(")")) {
    negative = true;
    text = text.slice(1, -1);
  }
  const signMatch = /^[+\-−]|[+\-−]$/.exec(text);
  if (signMatch) {
    if (signMatch[0] !== "+") negative = !negative;
    text = text.replace(/^[+\-−]|[+\-−]$/, "");
  }
  if (!/^[\d.,]+$/.test(text) || !/\d/.test(text)) return null;

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  let decimalIndex = -1;

  if (options.decimalSeparator) {
    decimalIndex = options.decimalSeparator === "," ? lastComma : lastDot;
  } else if (lastComma !== -1 && lastDot !== -1) {
    decimalIndex = Math.max(lastComma, lastDot);
  } else if (lastComma !== -1) {
    // Una sola coma es decimal; varias son separadores de miles.
    decimalIndex = text.indexOf(",") === lastComma ? lastComma : -1;
  } else if (lastDot !== -1) {
    if (text.indexOf(".") !== lastDot) {
      decimalIndex = -1;
    } else {
      // Un solo punto: "1.234" es miles en español; "1234.56" o "0.5" son decimales.
      const integerPart = text.slice(0, lastDot);
      const fraction = text.slice(lastDot + 1);
      const looksLikeThousands =
        fraction.length === 3 &&
        integerPart.length >= 1 &&
        integerPart.length <= 3 &&
        !integerPart.startsWith("0");
      decimalIndex = looksLikeThousands ? -1 : lastDot;
    }
  }

  const integerText = (decimalIndex === -1 ? text : text.slice(0, decimalIndex)).replace(
    /[.,]/g,
    "",
  );
  const fractionText = decimalIndex === -1 ? "" : text.slice(decimalIndex + 1);
  if (integerText !== "" && !digitsOnly(integerText)) return null;
  if (fractionText !== "" && !digitsOnly(fractionText)) return null;
  if (integerText === "" && fractionText === "") return null;

  const whole = integerText === "" ? 0 : Number(integerText);
  const padded = fractionText.padEnd(3, "0");
  const centsPart = Number(padded.slice(0, 2));
  const roundUp = Number(padded.charAt(2)) >= 5 ? 1 : 0;
  const total = whole * 100 + centsPart + roundUp;
  if (!Number.isSafeInteger(total)) return null;
  return cents(negative ? -total : total);
};

const currencyFormat = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  // «es» no agrupa los números de cuatro cifras por defecto; aquí siempre.
  useGrouping: "always",
});

const wholeFormat = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  useGrouping: "always",
  maximumFractionDigits: 0,
});

const compactFormat = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 1,
});

export interface FormatMoneyOptions {
  /** "auto": solo el signo negativo. "always": "+" o "−". "never": sin signo. */
  readonly sign?: "auto" | "always" | "never";
  /** Variante compacta para ejes ("24,4 mil €"). */
  readonly compact?: boolean;
  /** Sin céntimos ("1.235 €"). */
  readonly whole?: boolean;
}

const MINUS = "−";

const signPrefix = (value: number, sign: FormatMoneyOptions["sign"]): string => {
  if (sign === "never") return "";
  if (value < 0) return MINUS;
  if (sign === "always" && value > 0) return "+";
  return "";
};

/** Formatea céntimos como euros en español: "1.234,56 €". */
export const formatMoney = (amount: Cents, options: FormatMoneyOptions = {}): string => {
  const format = options.compact ? compactFormat : options.whole ? wholeFormat : currencyFormat;
  const body = format.format(Math.abs(amount) / 100);
  return `${signPrefix(amount, options.sign ?? "auto")}${body}`;
};

export interface MoneyParts {
  readonly sign: string;
  /** Parte entera con separadores de miles: "1.234". */
  readonly integer: string;
  /** Coma y céntimos: ",56". */
  readonly fraction: string;
  /** Símbolo con su espacio duro: " €". */
  readonly symbol: string;
}

/** Trocea un importe para pintar los céntimos y el símbolo con otro estilo. */
export const splitMoney = (
  amount: Cents,
  sign: FormatMoneyOptions["sign"] = "auto",
): MoneyParts => {
  let integer = "";
  let fraction = "";
  let symbol = "";
  for (const part of currencyFormat.formatToParts(Math.abs(amount) / 100)) {
    if (part.type === "integer" || part.type === "group") integer += part.value;
    else if (part.type === "decimal" || part.type === "fraction") fraction += part.value;
    else if (part.type === "currency" || part.type === "literal") symbol += part.value;
  }
  return { sign: signPrefix(amount, sign), integer, fraction, symbol };
};

/** Importe sin símbolo para campos de edición: "1234,56". */
export const centsToInputValue = (amount: Cents): string => {
  const absolute = Math.abs(amount);
  const whole = Math.trunc(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${amount < 0 ? "-" : ""}${whole},${fraction}`;
};

/** Porcentaje en español: "12,5 %". */
export const formatPercent = (ratio: number, fractionDigits = 0): string =>
  new Intl.NumberFormat("es-ES", {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(ratio);
