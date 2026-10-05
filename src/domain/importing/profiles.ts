import { normalizeText } from "../rules";
import type {
  ColumnMap,
  DateFormat,
  ImportField,
  ImportSource,
  SignMode,
  TransactionType,
} from "../types";

/** Perfil preconfigurado del asistente de importación. */
export interface ProfilePreset {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly source: ImportSource;
  /** "accounts" crea o actualiza cuentas en lugar de movimientos. */
  readonly kind: "transactions" | "accounts";
  readonly signMode: SignMode;
  /** Tipo por defecto cuando el archivo entero es de un tipo (Notion). */
  readonly defaultType: TransactionType;
  readonly dateFormat: DateFormat;
  readonly decimalSeparator: "," | ".";
  /** Nombres de cabecera reconocidos para cada campo, por orden de preferencia. */
  readonly synonyms: Readonly<Partial<Record<ImportField, ReadonlyArray<string>>>>;
}

const COMMON: ProfilePreset["synonyms"] = {
  date: ["fecha", "date", "dia", "fecha operacion", "f. operacion"],
  concept: ["concepto", "nombre", "name", "titulo", "descripcion", "description", "detalle"],
  amount: ["importe", "cantidad", "amount", "precio", "total", "coste", "valor"],
  amountIn: ["ingreso", "ingresos", "abono", "haber", "entrada", "credit"],
  amountOut: ["gasto", "gastos", "cargo", "debe", "salida", "debit"],
  type: ["tipo", "type"],
  account: ["cuenta", "account", "cuenta origen", "origen", "desde", "de"],
  toAccount: ["cuenta destino", "destino", "hacia", "a"],
  category: ["categoria", "category", "subcategoria"],
  notes: ["notas", "notes", "observaciones", "comentarios", "comentario"],
};

const notion = (
  key: string,
  name: string,
  description: string,
  defaultType: TransactionType,
): ProfilePreset => ({
  key,
  name,
  description,
  source: "notion",
  kind: "transactions",
  signMode: "byType",
  defaultType,
  dateFormat: "auto",
  decimalSeparator: ",",
  synonyms: COMMON,
});

const GENERIC_PRESET: ProfilePreset = {
  key: "generic",
  name: "Genérico",
  description: "Cualquier CSV: tú eliges las columnas.",
  source: "generic",
  kind: "transactions",
  signMode: "signed",
  defaultType: "expense",
  dateFormat: "auto",
  decimalSeparator: ",",
  synonyms: COMMON,
};

/**
 * Perfiles incluidos. El de BBVA no asume un formato exacto: reconoce por
 * heurística las cabeceras habituales en español y el paso de mapeo permite
 * corregir cualquier columna.
 */
export const PROFILE_PRESETS: ReadonlyArray<ProfilePreset> = [
  {
    key: "bbva",
    name: "BBVA",
    description: "Extracto de movimientos de cuenta o tarjeta.",
    source: "bbva",
    kind: "transactions",
    signMode: "signed",
    defaultType: "expense",
    dateFormat: "auto",
    decimalSeparator: ",",
    synonyms: {
      date: ["fecha", "f. valor", "fecha valor", "fecha operacion"],
      concept: ["concepto", "movimiento", "descripcion"],
      amount: ["importe"],
      notes: ["observaciones", "movimiento"],
    },
  },
  notion("notion-pagos", "Notion · Pagos", "Base de datos de pagos: todo son gastos.", "expense"),
  notion(
    "notion-ingresos",
    "Notion · Ingresos",
    "Base de datos de ingresos: todo son ingresos.",
    "income",
  ),
  notion(
    "notion-transferencias",
    "Notion · Transferencias",
    "Movimientos entre tus cuentas.",
    "transfer",
  ),
  {
    key: "notion-cuentas",
    name: "Notion · Cuentas",
    description: "Crea o actualiza cuentas; no importa movimientos.",
    source: "notion",
    kind: "accounts",
    signMode: "signed",
    defaultType: "expense",
    dateFormat: "auto",
    decimalSeparator: ",",
    synonyms: {
      concept: ["nombre", "name", "cuenta", "titulo"],
      amount: ["saldo inicial", "saldo", "balance", "importe", "cantidad"],
      type: ["tipo", "type"],
      date: ["fecha de apertura", "apertura", "fecha"],
    },
  },
  GENERIC_PRESET,
];

export const presetByKey = (key: string): ProfilePreset =>
  PROFILE_PRESETS.find((preset) => preset.key === key) ?? GENERIC_PRESET;

/**
 * Asigna columnas del CSV a campos por heurística: primero coincidencia exacta
 * del nombre normalizado y después por inclusión. Cada columna se usa una vez.
 */
export const detectColumns = (
  headers: ReadonlyArray<string>,
  synonyms: ProfilePreset["synonyms"],
): ColumnMap => {
  const normalized = headers.map((header) => ({ header, key: normalizeText(header) }));
  const used = new Set<string>();
  const map: ColumnMap = {};

  const assign = (strict: boolean) => {
    for (const [field, names] of Object.entries(synonyms) as Array<
      [ImportField, ReadonlyArray<string>]
    >) {
      if (map[field] !== undefined) continue;
      for (const name of names) {
        const match = normalized.find(
          (candidate) =>
            !used.has(candidate.header) &&
            (strict
              ? candidate.key === name
              : // Los sinónimos muy cortos ("a", "de") solo valen como coincidencia exacta.
                name.length >= 4 && candidate.key.includes(name)),
        );
        if (match) {
          map[field] = match.header;
          used.add(match.header);
          break;
        }
      }
    }
  };

  assign(true);
  assign(false);
  return map;
};

/** Con columnas de entrada y salida y sin importe único, el signo va «partido». */
export const inferSignMode = (map: ColumnMap, fallback: SignMode): SignMode =>
  map.amount === undefined && (map.amountIn !== undefined || map.amountOut !== undefined)
    ? "split"
    : fallback;

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  date: "Fecha",
  concept: "Concepto",
  amount: "Importe",
  amountIn: "Entrada",
  amountOut: "Salida",
  type: "Tipo",
  account: "Cuenta",
  toAccount: "Cuenta destino",
  category: "Categoría",
  notes: "Notas",
};
