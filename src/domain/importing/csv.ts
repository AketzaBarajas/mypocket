import Papa from "papaparse";

import { normalizeText } from "../rules";

export interface DecodedText {
  readonly text: string;
  readonly encoding: "utf-8" | "windows-1252";
}

/** U+FFFD: aparece cuando unos bytes no son UTF-8 válido. */
const REPLACEMENT_CHARACTER = String.fromCharCode(0xfffd);

/**
 * Decodifica los bytes de un CSV. Prueba UTF-8 y, si aparecen caracteres de
 * reemplazo, decodifica como windows-1252 (habitual en exportaciones bancarias).
 */
export const decodeCsvBytes = (bytes: Uint8Array): DecodedText => {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  if (!utf8.includes(REPLACEMENT_CHARACTER)) return { text: stripBom(utf8), encoding: "utf-8" };
  return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "windows-1252" };
};

const stripBom = (text: string): string => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

export interface CsvMatrix {
  readonly delimiter: string;
  /** Filas no vacías, con cada celda recortada. */
  readonly rows: ReadonlyArray<ReadonlyArray<string>>;
}

export class CsvError extends Error {
  constructor() {
    super("No se pudo leer el archivo. Comprueba que es un CSV.");
    this.name = "CsvError";
  }
}

const DELIMITERS = [";", ",", "\t", "|"] as const;

/**
 * Deduce el separador de columnas. La detección de Papa Parse falla con los
 * extractos que empiezan con líneas de título y usan coma decimal: la coma
 * aparece las mismas veces en cada fila de datos y parece un separador. Aquí
 * gana el candidato que da más columnas en más filas; sin ninguno claro
 * devuelve "" y decide Papa Parse.
 */
export const detectDelimiter = (text: string): string => {
  let best = "";
  let bestScore = 0;
  for (const delimiter of DELIMITERS) {
    const sample = Papa.parse<string[]>(text, {
      delimiter,
      header: false,
      preview: 50,
      skipEmptyLines: "greedy",
    });
    const linesByWidth = new Map<number, number>();
    for (const row of sample.data) {
      if (row.length > 1) linesByWidth.set(row.length, (linesByWidth.get(row.length) ?? 0) + 1);
    }
    let score = 0;
    for (const [width, lines] of linesByWidth) score = Math.max(score, lines * (width - 1));
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  }
  return best;
};

/** Parsea un CSV a una matriz de celdas. `delimiter` vacío lo detecta solo. */
export const parseCsv = (text: string, delimiter = ""): CsvMatrix => {
  const result = Papa.parse<string[]>(text, {
    delimiter: delimiter === "" ? detectDelimiter(text) : delimiter,
    header: false,
    skipEmptyLines: "greedy",
    delimitersToGuess: [...DELIMITERS],
  });
  const rows = result.data
    .map((row) => row.map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell !== ""));
  if (rows.length === 0) throw new CsvError();
  return { delimiter: result.meta.delimiter, rows };
};

/** Palabras que suelen aparecer en la fila de cabeceras de un extracto. */
const HEADER_HINTS = [
  "fecha",
  "date",
  "concepto",
  "movimiento",
  "importe",
  "amount",
  "observaciones",
  "descripcion",
  "nombre",
  "name",
  "cuenta",
  "categoria",
  "saldo",
  "divisa",
];

/**
 * Localiza la fila de cabeceras. Los extractos bancarios suelen empezar con
 * líneas de título, así que se elige la primera de las 15 primeras filas con
 * al menos dos nombres de columna reconocibles; si no hay ninguna, la primera.
 */
export const detectHeaderRow = (rows: ReadonlyArray<ReadonlyArray<string>>): number => {
  const limit = Math.min(rows.length, 15);
  for (let index = 0; index < limit; index += 1) {
    const cells = (rows[index] ?? []).map(normalizeText);
    const hits = cells.filter((cell) => HEADER_HINTS.some((hint) => cell.includes(hint))).length;
    if (hits >= 2) return index;
  }
  return 0;
};

export interface CsvTable {
  readonly headers: ReadonlyArray<string>;
  readonly records: ReadonlyArray<Readonly<Record<string, string>>>;
  readonly delimiter: string;
}

/** Convierte la matriz en registros usando una fila como cabecera. */
export const toTable = (matrix: CsvMatrix, headerRow = detectHeaderRow(matrix.rows)): CsvTable => {
  const seen = new Map<string, number>();
  const headers = (matrix.rows[headerRow] ?? []).map((cell, index) => {
    const base = cell === "" ? `Columna ${index + 1}` : cell;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    // Las cabeceras repetidas se numeran para no pisarse.
    return count === 0 ? base : `${base} (${count + 1})`;
  });

  const records = matrix.rows.slice(headerRow + 1).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? "";
    });
    return record;
  });
  return { headers, records, delimiter: matrix.delimiter };
};

/** Lee un CSV de principio a fin: decodifica, parsea y detecta cabeceras. */
export const readCsv = (bytes: Uint8Array, delimiter = ""): CsvTable & DecodedText => {
  const decoded = decodeCsvBytes(bytes);
  return { ...toTable(parseCsv(decoded.text, delimiter)), ...decoded };
};

/** Serializa filas a CSV con `;` y coma decimal, como espera Excel en español. */
export const toCsv = (
  headers: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string>>,
): string =>
  Papa.unparse({ fields: [...headers], data: rows.map((row) => [...row]) }, { delimiter: ";" });
