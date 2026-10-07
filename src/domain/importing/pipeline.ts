import { defaultIsLiquid } from "../catalog";
import { type CategoryIndex, isLeaf } from "../categories";
import { absCents, parseMoney } from "../money";
import { findRule, normalizeText } from "../rules";
import type {
  Account,
  AccountId,
  AccountType,
  CategorizationRule,
  CategoryId,
  Cents,
  ColumnMap,
  DateFormat,
  IsoDate,
  RuleId,
  SignMode,
  TransactionType,
} from "../types";
import { parseImportDate } from "./importDates";

export interface ImportSettings {
  readonly columnMap: ColumnMap;
  readonly signMode: SignMode;
  readonly dateFormat: DateFormat;
  readonly decimalSeparator: "," | ".";
  /** Tipo cuando el archivo no lo indica (perfiles de Notion). */
  readonly defaultType: TransactionType;
  /** Cuenta para las filas que no traen cuenta propia. */
  readonly defaultAccountId: AccountId | null;
}

export interface ImportContext {
  readonly accounts: ReadonlyArray<Account>;
  readonly index: CategoryIndex;
  readonly rules: ReadonlyArray<CategorizationRule>;
}

export type RowStatus = "new" | "duplicate" | "error";

/** Fila de la vista previa. El usuario puede editar tipo, categoría y cuentas. */
export interface PreviewRow {
  /** Posición de la fila en el archivo (0 = primera fila de datos). */
  readonly index: number;
  readonly include: boolean;
  readonly status: RowStatus;
  readonly error: string | null;
  readonly date: IsoDate | null;
  readonly concept: string;
  /** Siempre positivo; el signo lo da `type`. */
  readonly amount: Cents | null;
  readonly type: TransactionType;
  readonly accountId: AccountId | null;
  readonly toAccountId: AccountId | null;
  readonly categoryId: CategoryId | null;
  /** Regla que eligió la categoría, si la eligió una regla. */
  readonly ruleId: RuleId | null;
  readonly notes: string | null;
  /** Nombres del archivo sin emparejar (Notion): se resuelven en la vista previa. */
  readonly unknownAccount: string | null;
  readonly unknownToAccount: string | null;
  readonly unknownCategory: string | null;
  /**
   * Tipo y cuenta tal como salieron del archivo, antes de cualquier edición.
   * Identifican la fila de origen: el hash se calcula con ellos.
   */
  readonly sourceType: TransactionType;
  readonly sourceAccountId: AccountId | null;
  readonly importHash: string | null;
}

const TYPE_WORDS: ReadonlyArray<readonly [TransactionType, ReadonlyArray<string>]> = [
  ["transfer", ["transfer", "traspaso", "movimiento interno"]],
  ["income", ["ingreso", "income", "abono", "entrada", "cobro", "nomina"]],
  ["expense", ["gasto", "pago", "expense", "cargo", "salida", "compra"]],
];

const typeFromText = (text: string): TransactionType | null => {
  const normalized = normalizeText(text);
  if (normalized === "") return null;
  for (const [type, words] of TYPE_WORDS) {
    if (words.some((word) => normalized.includes(word))) return type;
  }
  return null;
};

const cell = (record: Readonly<Record<string, string>>, column: string | undefined): string =>
  column === undefined ? "" : (record[column] ?? "").trim();

const byName = <T extends { readonly name: string }>(items: ReadonlyArray<T>) => {
  const map = new Map<string, T>();
  for (const item of items) {
    const key = normalizeText(item.name);
    if (!map.has(key)) map.set(key, item);
  }
  return map;
};

/** Motivo por el que una fila no se puede importar, o `null` si está completa. */
export const rowError = (
  row: Pick<PreviewRow, "date" | "amount" | "type" | "accountId" | "toAccountId">,
): string | null => {
  if (row.date === null) return "Fecha no válida";
  if (row.amount === null || row.amount <= 0) return "Importe no válido";
  if (row.accountId === null) return "Falta la cuenta";
  if (row.type === "transfer") {
    if (row.toAccountId === null) return "Falta la cuenta de destino";
    if (row.toAccountId === row.accountId) return "Las cuentas deben ser distintas";
  }
  return null;
};

/**
 * Mapeo, normalización y categorización: convierte los registros del CSV en
 * filas de vista previa. Es puro y síncrono; la deduplicación va aparte porque
 * necesita calcular hashes.
 */
export const buildRows = (
  records: ReadonlyArray<Readonly<Record<string, string>>>,
  settings: ImportSettings,
  context: ImportContext,
): ReadonlyArray<PreviewRow> => {
  const map = settings.columnMap;
  const accountsByName = byName(context.accounts);
  const leaves = context.index.all.filter((category) => isLeaf(context.index, category.id));
  const money = (text: string) =>
    parseMoney(text, { decimalSeparator: settings.decimalSeparator }) ?? parseMoney(text);

  return records.map((record, index): PreviewRow => {
    const date = parseImportDate(cell(record, map.date), settings.dateFormat);
    const concept = cell(record, map.concept).replace(/\s+/g, " ");
    const notes = cell(record, map.notes);

    let type: TransactionType = settings.defaultType;
    let amount: Cents | null = null;

    if (settings.signMode === "split") {
      const out = money(cell(record, map.amountOut));
      const incoming = money(cell(record, map.amountIn));
      if (out !== null && out !== 0) {
        type = "expense";
        amount = absCents(out);
      } else if (incoming !== null && incoming !== 0) {
        type = "income";
        amount = absCents(incoming);
      }
    } else {
      const signed = money(cell(record, map.amount));
      if (signed !== null) {
        amount = absCents(signed);
        if (settings.signMode === "signed") type = signed < 0 ? "expense" : "income";
      }
    }
    // Una columna de tipo explícita manda sobre el signo y el tipo por defecto.
    const explicit = typeFromText(cell(record, map.type));
    if (explicit !== null && (settings.signMode === "byType" || explicit === "transfer")) {
      type = explicit;
    }

    const accountName = cell(record, map.account);
    const toAccountName = cell(record, map.toAccount);
    const account = accountName === "" ? null : accountsByName.get(normalizeText(accountName));
    const toAccount =
      toAccountName === "" ? null : accountsByName.get(normalizeText(toAccountName));
    const accountId = account?.id ?? (accountName === "" ? settings.defaultAccountId : null);
    const toAccountId = type === "transfer" ? (toAccount?.id ?? null) : null;

    let categoryId: CategoryId | null = null;
    let ruleId: RuleId | null = null;
    let unknownCategory: string | null = null;
    if (type !== "transfer") {
      const categoryName = cell(record, map.category);
      if (categoryName !== "") {
        const key = normalizeText(categoryName);
        const match = leaves.find(
          (category) => category.kind === type && normalizeText(category.name) === key,
        );
        if (match) categoryId = match.id;
        else unknownCategory = categoryName;
      }
      if (categoryId === null) {
        const rule = findRule(context.rules, concept);
        const target = rule ? context.index.byId.get(rule.categoryId) : undefined;
        if (rule && target?.kind === type && isLeaf(context.index, target.id)) {
          categoryId = target.id;
          ruleId = rule.id;
        }
      }
    }

    const draft = { date, amount, type, accountId, toAccountId };
    const error = rowError(draft);
    return {
      index,
      include: error === null,
      status: error === null ? "new" : "error",
      error,
      ...draft,
      concept,
      categoryId,
      ruleId,
      notes: notes === "" ? null : notes,
      unknownAccount: account === undefined ? accountName : null,
      unknownToAccount: type === "transfer" && toAccount === undefined ? toAccountName : null,
      unknownCategory,
      sourceType: type,
      sourceAccountId: accountId,
      importHash: null,
    };
  });
};

/** Campos que el usuario puede cambiar en la vista previa, fila a fila o en bloque. */
export type RowPatch = Partial<
  Pick<PreviewRow, "type" | "categoryId" | "accountId" | "toAccountId" | "include">
>;

/** Aplica una edición a una fila y vuelve a validar su estado. */
export const patchRow = (row: PreviewRow, patch: RowPatch): PreviewRow => {
  const type = patch.type ?? row.type;
  const typeChanged = type !== row.type;
  const next: PreviewRow = {
    ...row,
    ...patch,
    type,
    // Al cambiar de tipo, la categoría anterior deja de valer.
    categoryId:
      type === "transfer"
        ? null
        : patch.categoryId !== undefined
          ? patch.categoryId
          : typeChanged
            ? null
            : row.categoryId,
    toAccountId:
      type === "transfer"
        ? patch.toAccountId !== undefined
          ? patch.toAccountId
          : row.toAccountId
        : null,
    ruleId: patch.categoryId !== undefined || typeChanged ? null : row.ruleId,
    unknownAccount: patch.accountId !== undefined ? null : row.unknownAccount,
    unknownToAccount:
      patch.toAccountId !== undefined || type !== "transfer" ? null : row.unknownToAccount,
    unknownCategory:
      patch.categoryId !== undefined || type === "transfer" || typeChanged
        ? null
        : row.unknownCategory,
  };
  const error = rowError(next);
  return {
    ...next,
    error,
    status: error !== null ? "error" : row.status === "error" ? "new" : row.status,
    include:
      error !== null ? false : (patch.include ?? (row.status === "error" ? true : row.include)),
    // Una edición puede cambiar el estado de la fila: el hash se vuelve a resolver.
    importHash: null,
  };
};

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");

export const sha256Hex = async (text: string): Promise<string> =>
  toHex(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));

/**
 * Calcula el `importHash` de cada fila válida y marca las duplicadas.
 *
 * El hash es SHA-256 de `fecha|importe|tipo|conceptoNormalizado|cuenta|ocurrencia`,
 * donde la ocurrencia es el índice de repetición de la misma combinación dentro
 * del archivo: dos cafés idénticos el mismo día son dos movimientos distintos.
 * Una fila cuyo hash ya existe queda como «duplicada» y desmarcada por defecto.
 *
 * Tipo y cuenta son los que traía el archivo, no los editados en la vista
 * previa: si un gasto se importó como transferencia, o se movió a otra cuenta,
 * al reimportar el archivo se sigue reconociendo. Solo cuando el archivo no
 * daba cuenta (ni había una por defecto) se usa la elegida a mano.
 */
export const resolveDuplicates = async (
  rows: ReadonlyArray<PreviewRow>,
  existingHashes: ReadonlySet<string>,
): Promise<ReadonlyArray<PreviewRow>> => {
  const occurrences = new Map<string, number>();
  return Promise.all(
    rows.map(async (row): Promise<PreviewRow> => {
      if (
        row.status === "error" ||
        row.date === null ||
        row.amount === null ||
        row.accountId === null
      ) {
        return { ...row, importHash: null };
      }
      const base = [
        row.date,
        row.amount,
        row.sourceType,
        normalizeText(row.concept),
        row.sourceAccountId ?? row.accountId,
      ].join("|");
      const occurrence = occurrences.get(base) ?? 0;
      occurrences.set(base, occurrence + 1);
      const importHash = await sha256Hex(`${base}|${occurrence}`);
      const duplicate = existingHashes.has(importHash);
      const status: RowStatus = duplicate ? "duplicate" : "new";
      return {
        ...row,
        importHash,
        status,
        // La casilla solo se toca cuando cambia el estado; si no, manda el usuario.
        include: status === row.status ? row.include : !duplicate,
      };
    }),
  );
};

export interface ImportSummary {
  readonly total: number;
  readonly fresh: number;
  readonly duplicates: number;
  readonly errors: number;
  /** Filas nuevas de gasto o ingreso sin categoría: no se pueden importar aún. */
  readonly uncategorized: number;
  /** Filas que se importarán al confirmar. */
  readonly ready: number;
}

const needsCategory = (row: PreviewRow): boolean =>
  row.type !== "transfer" && row.categoryId === null;

/** Una fila se importa si está marcada, sin errores y completa. */
export const isReady = (row: PreviewRow): boolean =>
  row.include && row.status !== "error" && row.importHash !== null && !needsCategory(row);

export const summarize = (rows: ReadonlyArray<PreviewRow>): ImportSummary => ({
  total: rows.length,
  fresh: rows.filter((row) => row.status === "new").length,
  duplicates: rows.filter((row) => row.status === "duplicate").length,
  errors: rows.filter((row) => row.status === "error").length,
  uncategorized: rows.filter((row) => row.status !== "error" && row.include && needsCategory(row))
    .length,
  ready: rows.filter(isReady).length,
});

/** Movimiento listo para escribir en la base de datos. */
export interface ImportDraft {
  readonly type: TransactionType;
  readonly date: IsoDate;
  readonly amount: Cents;
  readonly accountId: AccountId;
  readonly toAccountId: AccountId | null;
  readonly categoryId: CategoryId | null;
  readonly concept: string;
  readonly notes: string | null;
  readonly importHash: string;
  readonly ruleId: RuleId | null;
}

export const toDrafts = (rows: ReadonlyArray<PreviewRow>): ReadonlyArray<ImportDraft> =>
  rows.flatMap((row): ImportDraft[] =>
    isReady(row) &&
    row.date !== null &&
    row.amount !== null &&
    row.accountId !== null &&
    row.importHash !== null
      ? [
          {
            type: row.type,
            date: row.date,
            amount: row.amount,
            accountId: row.accountId,
            toAccountId: row.toAccountId,
            categoryId: row.categoryId,
            concept: row.concept,
            notes: row.notes,
            importHash: row.importHash,
            ruleId: row.ruleId,
          },
        ]
      : [],
  );

export interface UnknownNames {
  readonly accounts: ReadonlyArray<string>;
  readonly categories: ReadonlyArray<{
    readonly name: string;
    readonly kind: "expense" | "income";
  }>;
}

/** Nombres de cuentas y categorías del archivo que no existen en MyPocket. */
export const unknownNames = (rows: ReadonlyArray<PreviewRow>): UnknownNames => {
  const accounts = new Map<string, string>();
  const categories = new Map<string, { name: string; kind: "expense" | "income" }>();
  for (const row of rows) {
    for (const name of [row.unknownAccount, row.unknownToAccount]) {
      if (name !== null && name !== "") accounts.set(normalizeText(name), name);
    }
    if (row.unknownCategory !== null && row.type !== "transfer") {
      categories.set(`${row.type}|${normalizeText(row.unknownCategory)}`, {
        name: row.unknownCategory,
        kind: row.type,
      });
    }
  }
  return { accounts: [...accounts.values()], categories: [...categories.values()] };
};

/**
 * Asigna una cuenta o categoría existente (o recién creada) a todas las filas
 * que traían un nombre sin emparejar.
 */
export const resolveName = (
  rows: ReadonlyArray<PreviewRow>,
  target:
    | { readonly kind: "account"; readonly name: string; readonly id: AccountId }
    | {
        readonly kind: "category";
        readonly name: string;
        readonly type: "expense" | "income";
        readonly id: CategoryId;
      },
): ReadonlyArray<PreviewRow> => {
  const key = normalizeText(target.name);
  return rows.map((row) => {
    if (target.kind === "account") {
      let next = row;
      if (row.unknownAccount !== null && normalizeText(row.unknownAccount) === key) {
        next = patchRow(next, { accountId: target.id });
      }
      if (row.unknownToAccount !== null && normalizeText(row.unknownToAccount) === key) {
        next = patchRow(next, { toAccountId: target.id });
      }
      return next;
    }
    return row.unknownCategory !== null &&
      row.type === target.type &&
      normalizeText(row.unknownCategory) === key
      ? patchRow(row, { categoryId: target.id })
      : row;
  });
};

/* ───────────────────────── Cuentas de Notion ───────────────────────── */

export interface AccountDraft {
  readonly name: string;
  readonly type: AccountType;
  readonly isLiquid: boolean;
  readonly openingBalance: Cents | null;
  readonly openingDate: IsoDate | null;
  /** Cuenta existente con el mismo nombre: se actualiza en lugar de crearse. */
  readonly existingId: AccountId | null;
}

const ACCOUNT_TYPE_WORDS: ReadonlyArray<readonly [AccountType, ReadonlyArray<string>]> = [
  ["investment", ["inversion", "investment", "broker", "fondo", "bolsa"]],
  ["receivable", ["deuda", "por cobrar", "receivable", "prestamo"]],
  ["savings", ["ahorro", "savings", "deposito"]],
  ["prepaid", ["prepago", "prepaid", "monedero"]],
  ["cash", ["efectivo", "cash", "metalico"]],
  ["checking", ["corriente", "debito", "checking", "nomina", "banco"]],
];

const accountTypeFromText = (text: string): AccountType | null => {
  const normalized = normalizeText(text);
  for (const [type, words] of ACCOUNT_TYPE_WORDS) {
    if (words.some((word) => normalized.includes(word))) return type;
  }
  return null;
};

/** Interpreta el CSV de cuentas de Notion: crea o actualiza cuentas, no movimientos. */
export const buildAccountDrafts = (
  records: ReadonlyArray<Readonly<Record<string, string>>>,
  settings: Pick<ImportSettings, "columnMap" | "dateFormat" | "decimalSeparator">,
  accounts: ReadonlyArray<Account>,
): ReadonlyArray<AccountDraft> => {
  const map = settings.columnMap;
  const existing = byName(accounts);
  const drafts = new Map<string, AccountDraft>();

  for (const record of records) {
    const name = cell(record, map.concept).replace(/\s+/g, " ");
    if (name === "") continue;
    const type =
      accountTypeFromText(cell(record, map.type)) ?? accountTypeFromText(name) ?? "checking";
    const balance = parseMoney(cell(record, map.amount), {
      decimalSeparator: settings.decimalSeparator,
    });
    drafts.set(normalizeText(name), {
      name,
      type,
      isLiquid: defaultIsLiquid(type),
      // El saldo inicial de una cuenta no puede ser negativo.
      openingBalance: balance !== null && balance >= 0 ? balance : null,
      openingDate: parseImportDate(cell(record, map.date), settings.dateFormat),
      existingId: existing.get(normalizeText(name))?.id ?? null,
    });
  }
  return [...drafts.values()];
};
