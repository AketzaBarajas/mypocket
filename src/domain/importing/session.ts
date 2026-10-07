import { cents } from "../money";
import { normalizeText } from "../rules";
import type {
  Account,
  AccountId,
  Cents,
  ColumnMap,
  DateFormat,
  ImportField,
  ImportProfile,
  IsoDate,
  SignMode,
  Transaction,
  TransactionType,
} from "../types";
import type { CsvTable } from "./csv";
import { detectDateFormat } from "./importDates";
import type { ImportDraft, ImportSettings, PreviewRow } from "./pipeline";
import { detectColumns, inferSignMode, PROFILE_PRESETS, type ProfilePreset } from "./profiles";

/**
 * Estado del asistente de importación que no depende de la interfaz: el mapeo
 * que se propone al abrir un archivo, su validación y los filtros de la vista
 * previa.
 */

/** Mapeo editable del paso 2. Es `ImportSettings` más lo que se guarda en el perfil. */
export interface Mapping extends ImportSettings {
  /** Hay fechas que se leen igual de bien como día/mes que como mes/día. */
  readonly dateAmbiguous: boolean;
}

/**
 * Mapeo inicial de un archivo. Parte de la detección heurística del perfil y,
 * si ya se importó antes con ese perfil, recupera lo que se guardó entonces
 * para las columnas que sigan existiendo en el archivo.
 */
export const initialMapping = (
  table: Pick<CsvTable, "headers" | "records">,
  preset: ProfilePreset,
  saved: ImportProfile | undefined,
  defaultAccountId: AccountId | null,
): Mapping => {
  let columnMap = detectColumns(table.headers, preset.synonyms);
  let reused = false;
  if (saved) {
    const headers = new Set(table.headers);
    for (const [field, column] of Object.entries(saved.columnMap) as Array<[ImportField, string]>) {
      if (!headers.has(column)) continue;
      // Una columna solo puede alimentar un campo: lo guardado desplaza a lo detectado.
      columnMap = assignColumn(columnMap, field, column);
      reused = true;
    }
  }

  const dateColumn = columnMap.date;
  const samples =
    dateColumn === undefined
      ? []
      : table.records.slice(0, 200).map((record) => record[dateColumn] ?? "");
  const guess = detectDateFormat(samples);
  const savedFormat = reused && saved && saved.dateFormat !== "auto" ? saved.dateFormat : null;

  return {
    columnMap,
    signMode: reused && saved ? saved.signMode : inferSignMode(columnMap, preset.signMode),
    // Un formato elegido a mano en una importación anterior resuelve la ambigüedad.
    dateFormat: savedFormat ?? (guess.ambiguous ? "auto" : guess.format),
    dateAmbiguous: guess.ambiguous && savedFormat === null,
    decimalSeparator: reused && saved ? saved.decimalSeparator : preset.decimalSeparator,
    defaultType: preset.defaultType,
    defaultAccountId,
  };
};

/** Asigna (o quita, con `null`) la columna de un campo, sin repetir columnas. */
export const assignColumn = (
  map: ColumnMap,
  field: ImportField,
  column: string | null,
): ColumnMap => {
  const next: ColumnMap = {};
  for (const [key, value] of Object.entries(map) as Array<[ImportField, string]>) {
    if (key !== field && value !== column) next[key] = value;
  }
  if (column !== null) next[field] = column;
  return next;
};

/**
 * Cambia la columna de un campo en el mapeo. Al cambiar la de la fecha vuelve
 * a deducir el orden día/mes, porque depende de los valores de esa columna.
 */
export const remapColumn = (
  mapping: Mapping,
  table: Pick<CsvTable, "records">,
  field: ImportField,
  column: string | null,
): Mapping => {
  const columnMap = assignColumn(mapping.columnMap, field, column);
  if (columnMap.date === mapping.columnMap.date) return { ...mapping, columnMap };
  const dateColumn = columnMap.date;
  const guess = detectDateFormat(
    dateColumn === undefined
      ? []
      : table.records.slice(0, 200).map((record) => record[dateColumn] ?? ""),
  );
  return {
    ...mapping,
    columnMap,
    dateFormat: guess.ambiguous ? "auto" : guess.format,
    dateAmbiguous: guess.ambiguous,
  };
};

/** Campos que se pueden mapear según el tipo de perfil y el modo de signo. */
export const mappableFields = (
  kind: ProfilePreset["kind"],
  signMode: SignMode,
): ReadonlyArray<ImportField> =>
  kind === "accounts"
    ? ["concept", "amount", "type", "date"]
    : [
        "date",
        "concept",
        ...(signMode === "split" ? (["amountIn", "amountOut"] as const) : (["amount"] as const)),
        "type",
        "account",
        "toAccount",
        "category",
        "notes",
      ];

/** Lo que falta en el mapeo para poder continuar. Vacío si está completo. */
export const mappingIssues = (
  mapping: Pick<Mapping, "columnMap" | "signMode" | "defaultAccountId" | "defaultType">,
  kind: ProfilePreset["kind"],
): ReadonlyArray<string> => {
  const map = mapping.columnMap;
  if (kind === "accounts") {
    return map.concept === undefined ? ["Elige la columna con el nombre de la cuenta."] : [];
  }
  const issues: string[] = [];
  if (map.date === undefined) issues.push("Elige la columna de la fecha.");
  if (mapping.signMode === "split") {
    if (map.amountIn === undefined && map.amountOut === undefined) {
      issues.push("Elige al menos una columna de entrada o de salida.");
    }
  } else if (map.amount === undefined) {
    issues.push("Elige la columna del importe.");
  }
  if (map.account === undefined && mapping.defaultAccountId === null) {
    issues.push("Elige la cuenta a la que van los movimientos.");
  }
  if (
    mapping.signMode === "byType" &&
    mapping.defaultType === "transfer" &&
    map.toAccount === undefined
  ) {
    issues.push("Elige la columna de la cuenta de destino.");
  }
  return issues;
};

/** Perfil de Notion que corresponde al nombre de un archivo exportado, si se reconoce. */
export const suggestPresetKey = (fileName: string): string | null => {
  const name = normalizeText(fileName);
  const hints: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
    ["notion-transferencias", ["transferencia", "traspaso"]],
    ["notion-ingresos", ["ingreso"]],
    ["notion-pagos", ["pago", "gasto"]],
    ["notion-cuentas", ["cuenta"]],
    ["bbva", ["bbva"]],
  ];
  for (const [key, words] of hints) {
    if (words.some((word) => name.includes(word))) return key;
  }
  return null;
};

/** Perfil guardado de una importación anterior con este perfil preconfigurado. */
export const savedProfileFor = (
  profiles: ReadonlyArray<ImportProfile>,
  preset: ProfilePreset,
): ImportProfile | undefined => profiles.find((profile) => profile.name === preset.name);

export const isPresetKey = (key: string): boolean =>
  PROFILE_PRESETS.some((preset) => preset.key === key);

/** Hashes de los movimientos importados que siguen vivos. Deshacer un lote los libera. */
export const existingImportHashes = (
  transactions: ReadonlyArray<Pick<Transaction, "importHash" | "isDeleted">>,
): ReadonlySet<string> => {
  const hashes = new Set<string>();
  for (const transaction of transactions) {
    if (!transaction.isDeleted && transaction.importHash !== null) {
      hashes.add(transaction.importHash);
    }
  }
  return hashes;
};

/** Filas con hash por calcular: recién construidas o editadas. */
export const needsHashing = (rows: ReadonlyArray<PreviewRow>): boolean =>
  rows.some((row) => row.status !== "error" && row.importHash === null);

export const PREVIEW_FILTERS = ["all", "new", "duplicate", "error", "uncategorized"] as const;
export type PreviewFilter = (typeof PREVIEW_FILTERS)[number];

const isUncategorized = (row: PreviewRow): boolean =>
  row.status !== "error" && row.type !== "transfer" && row.categoryId === null;

/** Filas de la vista previa que pasan el filtro de estado y la búsqueda por concepto. */
export const filterPreview = (
  rows: ReadonlyArray<PreviewRow>,
  filter: PreviewFilter,
  query: string,
): ReadonlyArray<PreviewRow> => {
  const needle = normalizeText(query);
  return rows.filter((row) => {
    if (
      filter === "uncategorized" ? !isUncategorized(row) : filter !== "all" && row.status !== filter
    )
      return false;
    return needle === "" || normalizeText(`${row.concept} ${row.notes ?? ""}`).includes(needle);
  });
};

export const previewFilterCounts = (
  rows: ReadonlyArray<PreviewRow>,
): Record<PreviewFilter, number> => ({
  all: rows.length,
  new: rows.filter((row) => row.status === "new").length,
  duplicate: rows.filter((row) => row.status === "duplicate").length,
  error: rows.filter((row) => row.status === "error").length,
  uncategorized: rows.filter(isUncategorized).length,
});

/** Tipo común de un grupo de filas, o `null` si mezclan varios. */
export const commonType = (rows: ReadonlyArray<PreviewRow>): TransactionType | null => {
  const first = rows[0]?.type;
  return first !== undefined && rows.every((row) => row.type === first) ? first : null;
};

/** Primera fecha de las filas que traían este nombre de cuenta sin emparejar. */
export const earliestDateForAccount = (
  rows: ReadonlyArray<PreviewRow>,
  name: string,
): IsoDate | null => {
  const key = normalizeText(name);
  let earliest: IsoDate | null = null;
  for (const row of rows) {
    if (row.date === null) continue;
    const matches = [row.unknownAccount, row.unknownToAccount].some(
      (unknown) => unknown !== null && normalizeText(unknown) === key,
    );
    if (matches && (earliest === null || row.date < earliest)) earliest = row.date;
  }
  return earliest;
};

/** Cuántas filas traían un nombre de cuenta o de categoría sin emparejar. */
export const countUnknown = (
  rows: ReadonlyArray<PreviewRow>,
  target:
    | { readonly kind: "account"; readonly name: string }
    | { readonly kind: "category"; readonly name: string; readonly type: "expense" | "income" },
): number => {
  const key = normalizeText(target.name);
  const same = (name: string | null) => name !== null && normalizeText(name) === key;
  return rows.filter((row) =>
    target.kind === "account"
      ? same(row.unknownAccount) || same(row.unknownToAccount)
      : row.type === target.type && same(row.unknownCategory),
  ).length;
};

export interface DraftsSummary {
  readonly count: number;
  readonly expenses: number;
  readonly income: number;
  readonly transfers: number;
  readonly expenseTotal: Cents;
  readonly incomeTotal: Cents;
  readonly firstDate: IsoDate | null;
  readonly lastDate: IsoDate | null;
  /** Movimientos por cuenta de origen, de más a menos. */
  readonly byAccount: ReadonlyArray<{ readonly accountId: AccountId; readonly count: number }>;
  /**
   * Movimientos anteriores a la fecha de apertura de alguna de sus cuentas: se
   * guardan, pero el saldo de esa cuenta ya los da por incluidos.
   */
  readonly beforeOpening: number;
}

/** Resumen de lo que se va a escribir, para el paso de confirmación. */
export const summarizeDrafts = (
  drafts: ReadonlyArray<ImportDraft>,
  accounts: ReadonlyArray<Pick<Account, "id" | "openingDate">>,
): DraftsSummary => {
  const opening = new Map(accounts.map((account) => [account.id, account.openingDate]));
  const perAccount = new Map<AccountId, number>();
  let expenses = 0;
  let income = 0;
  let transfers = 0;
  let expenseTotal = 0;
  let incomeTotal = 0;
  let firstDate: IsoDate | null = null;
  let lastDate: IsoDate | null = null;
  let beforeOpening = 0;

  for (const draft of drafts) {
    if (draft.type === "expense") {
      expenses += 1;
      expenseTotal += draft.amount;
    } else if (draft.type === "income") {
      income += 1;
      incomeTotal += draft.amount;
    } else {
      transfers += 1;
    }
    if (firstDate === null || draft.date < firstDate) firstDate = draft.date;
    if (lastDate === null || draft.date > lastDate) lastDate = draft.date;
    perAccount.set(draft.accountId, (perAccount.get(draft.accountId) ?? 0) + 1);

    const involved =
      draft.toAccountId === null ? [draft.accountId] : [draft.accountId, draft.toAccountId];
    if (
      involved.some((id) => {
        const date = opening.get(id);
        return date !== undefined && draft.date < date;
      })
    ) {
      beforeOpening += 1;
    }
  }

  return {
    count: drafts.length,
    expenses,
    income,
    transfers,
    expenseTotal: cents(expenseTotal),
    incomeTotal: cents(incomeTotal),
    firstDate,
    lastDate,
    byAccount: [...perAccount]
      .map(([accountId, count]) => ({ accountId, count }))
      .sort((a, b) => b.count - a.count),
    beforeOpening,
  };
};

export const SIGN_MODE_LABELS: Record<SignMode, string> = {
  signed: "Una columna con signo",
  split: "Columnas de entrada y salida",
  byType: "Según el tipo",
};

export const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  auto: "Automático",
  dmy: "Día/mes/año",
  mdy: "Mes/día/año",
  ymd: "Año-mes-día",
};
