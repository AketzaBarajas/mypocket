import { makeIsoDate } from "../dates";
import { normalizeText } from "../rules";
import type { DateFormat, IsoDate } from "../types";

const MONTHS: ReadonlyArray<ReadonlyArray<string>> = [
  ["enero", "ene", "january", "jan"],
  ["febrero", "feb", "february"],
  ["marzo", "mar", "march"],
  ["abril", "abr", "april", "apr"],
  ["mayo", "may"],
  ["junio", "jun", "june"],
  ["julio", "jul", "july"],
  ["agosto", "ago", "august", "aug"],
  ["septiembre", "setiembre", "sep", "sept", "september"],
  ["octubre", "oct", "october"],
  ["noviembre", "nov", "november"],
  ["diciembre", "dic", "december", "dec"],
];

const monthFromName = (name: string): number | null => {
  const key = normalizeText(name).replace(/\.$/, "");
  const index = MONTHS.findIndex((names) => names.includes(key));
  return index === -1 ? null : index + 1;
};

const fullYear = (year: number): number => (year < 100 ? 2000 + year : year);

const NUMERIC = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?!\d)/;
const ISO = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?!\d)/;
const ENGLISH = /^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/;
const SPANISH = /^(\d{1,2})\s+(?:de\s+)?([a-z]+)\.?,?\s+(?:de\s+)?(\d{4})/;

/** Una fecha numérica es ambigua si día y mes son ambos ≤ 12 y distintos. */
export const isAmbiguousDate = (text: string): boolean => {
  const match = NUMERIC.exec(text.trim());
  if (!match) return false;
  const a = Number(match[1]);
  const b = Number(match[2]);
  return a <= 12 && b <= 12 && a !== b;
};

/**
 * Parsea una fecha de un CSV. Reconoce dd/MM/yyyy, d/M/yyyy, yyyy-MM-dd y los
 * formatos de Notion ("October 5, 2026", "5 de octubre de 2026",
 * "05/10/2026 10:30"). La hora, si existe, se ignora.
 *
 * En fechas numéricas, `format` decide el orden; con "auto" se deduce cuando
 * un número supera 12 y, si es ambigua, se asume día/mes (formato español).
 */
export const parseImportDate = (input: string, format: DateFormat = "auto"): IsoDate | null => {
  const text = normalizeText(input);
  if (text === "") return null;

  const iso = ISO.exec(text);
  if (iso) return makeIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const numeric = NUMERIC.exec(text);
  if (numeric) {
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    const year = fullYear(Number(numeric[3]));
    const monthFirst = format === "mdy" || (format === "auto" && b > 12 && a <= 12);
    return monthFirst ? makeIsoDate(year, a, b) : makeIsoDate(year, b, a);
  }

  const spanish = SPANISH.exec(text);
  if (spanish) {
    const month = monthFromName(spanish[2] ?? "");
    if (month !== null) return makeIsoDate(Number(spanish[3]), month, Number(spanish[1]));
  }

  const english = ENGLISH.exec(text);
  if (english) {
    const month = monthFromName(english[1] ?? "");
    if (month !== null) return makeIsoDate(Number(english[3]), month, Number(english[2]));
  }

  return null;
};

export interface DateFormatGuess {
  readonly format: Exclude<DateFormat, "auto">;
  /** Ninguna muestra permite distinguir día/mes de mes/día: lo decide el usuario. */
  readonly ambiguous: boolean;
}

/** Deduce el orden de las fechas numéricas a partir de una muestra de valores. */
export const detectDateFormat = (samples: ReadonlyArray<string>): DateFormatGuess => {
  let numericSeen = false;
  let dayFirst = false;
  let monthFirst = false;

  for (const sample of samples) {
    const text = sample.trim();
    if (ISO.test(text)) return { format: "ymd", ambiguous: false };
    const match = NUMERIC.exec(text);
    if (!match) continue;
    numericSeen = true;
    if (Number(match[1]) > 12) dayFirst = true;
    if (Number(match[2]) > 12) monthFirst = true;
  }

  if (monthFirst && !dayFirst) return { format: "mdy", ambiguous: false };
  return { format: "dmy", ambiguous: numericSeen && !dayFirst };
};
