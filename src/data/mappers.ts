import { z } from "zod";

import { isIsoDate, isYearMonth } from "@/domain/dates";
import { cents } from "@/domain/money";
import {
  type Account,
  type AccountValuation,
  type Budget,
  type CategorizationRule,
  type Category,
  type ColumnMap,
  type Goal,
  IMPORT_FIELDS,
  type ImportBatch,
  type ImportProfile,
  type IsoDate,
  type Recurrence,
  type Tag,
  type Transaction,
  type TransactionTag,
  type YearMonth,
} from "@/domain/types";

import type {
  AccountRow,
  BudgetRow,
  CategoryRow,
  GoalRow,
  ImportBatchRow,
  ImportProfileRow,
  RecurrenceRow,
  RuleRow,
  TagRow,
  TransactionRow,
  TransactionTagRow,
  ValuationRow,
} from "./queries";

/**
 * Conversión de filas de Evolu a tipos de dominio.
 *
 * Al leer, Evolu trata todas las columnas salvo `id` como anulables: un cambio
 * puede sincronizarse antes que la inserción de su fila, o venir de una versión
 * más nueva de la app. Cada conversor devuelve `null` para las filas
 * incompletas, que simplemente no se muestran hasta que llegan sus datos.
 */

const date = (value: string | null): IsoDate | null =>
  value !== null && isIsoDate(value) ? value : null;

const month = (value: string | null): YearMonth | null =>
  value !== null && isYearMonth(value) ? value : null;

/**
 * Marca de tiempo de sistema. El tipo de Evolu la da por presente, pero una
 * fila recién escrita puede llegar sin ella; se trata como la más antigua.
 */
const stamp = (value: string | null): string => value ?? "";

const bool = (value: 0 | 1 | null, fallback: boolean): boolean =>
  value === null ? fallback : value === 1;

export const toAccount = (row: AccountRow): Account | null => {
  const openingDate = date(row.openingDate);
  if (row.name === null || row.type === null || openingDate === null) return null;
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji ?? "💳",
    color: row.color ?? "slate",
    type: row.type,
    openingBalance: cents(row.openingBalance ?? 0),
    openingDate,
    isLiquid: bool(row.isLiquid, row.type !== "investment" && row.type !== "receivable"),
    includeInNetWorth: bool(row.includeInNetWorth, true),
    archived: bool(row.archived, false),
    sortOrder: row.sortOrder ?? 0,
  };
};

export const toCategory = (row: CategoryRow): Category | null => {
  if (row.name === null || row.kind === null) return null;
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji ?? "🧾",
    kind: row.kind,
    parentId: row.parentId,
    budgetGroup: row.budgetGroup,
    archived: bool(row.archived, false),
    sortOrder: row.sortOrder ?? 0,
  };
};

export const toTransaction = (row: TransactionRow): Transaction | null => {
  const txDate = date(row.date);
  if (
    row.type === null ||
    row.status === null ||
    txDate === null ||
    row.amount === null ||
    row.accountId === null
  ) {
    return null;
  }
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    date: txDate,
    amount: cents(row.amount),
    accountId: row.accountId,
    toAccountId: row.toAccountId,
    categoryId: row.categoryId,
    concept: row.concept ?? "",
    notes: row.notes,
    originalAmount: row.originalAmount === null ? null : cents(row.originalAmount),
    originalCurrency: row.originalCurrency,
    goalId: row.goalId,
    recurrenceId: row.recurrenceId,
    importBatchId: row.importBatchId,
    importHash: row.importHash,
    isDeleted: row.isDeleted === 1,
    createdAt: stamp(row.createdAt),
  };
};

export const toTag = (row: TagRow): Tag | null =>
  row.name === null ? null : { id: row.id, name: row.name, color: row.color ?? "slate" };

export const toTransactionTag = (row: TransactionTagRow): TransactionTag | null =>
  row.transactionId === null || row.tagId === null
    ? null
    : { transactionId: row.transactionId, tagId: row.tagId };

export const toRecurrence = (row: RecurrenceRow): Recurrence | null => {
  const anchorDate = date(row.anchorDate);
  const nextDueDate = date(row.nextDueDate);
  if (
    row.name === null ||
    row.type === null ||
    row.amount === null ||
    row.accountId === null ||
    row.frequency === null ||
    anchorDate === null ||
    nextDueDate === null
  ) {
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    amount: cents(row.amount),
    accountId: row.accountId,
    toAccountId: row.toAccountId,
    categoryId: row.categoryId,
    concept: row.concept ?? "",
    frequency: row.frequency,
    interval: row.interval ?? 1,
    anchorDate,
    nextDueDate,
    endDate: date(row.endDate),
    leadDays: row.leadDays ?? 3,
    isSubscription: bool(row.isSubscription, false),
    active: bool(row.active, true),
  };
};

export const toBudget = (row: BudgetRow): Budget | null => {
  const validFrom = month(row.validFrom);
  if (row.scope === null || validFrom === null) return null;
  if (row.scope === "category" && row.categoryId === null) return null;
  return {
    id: row.id,
    scope: row.scope,
    categoryId: row.scope === "category" ? row.categoryId : null,
    amount: row.amount === null ? null : cents(row.amount),
    validFrom,
    updatedAt: stamp(row.updatedAt),
  };
};

export const toGoal = (row: GoalRow): Goal | null => {
  if (row.name === null || row.targetAmount === null) return null;
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji ?? "🎯",
    color: row.color ?? "teal",
    targetAmount: cents(row.targetAmount),
    targetDate: date(row.targetDate),
    status: row.status ?? "active",
  };
};

export const toValuation = (row: ValuationRow): AccountValuation | null => {
  const valuationDate = date(row.date);
  if (row.accountId === null || valuationDate === null || row.value === null) return null;
  return {
    id: row.id,
    accountId: row.accountId,
    date: valuationDate,
    value: cents(row.value),
    note: row.note,
    createdAt: stamp(row.createdAt),
  };
};

export const toRule = (row: RuleRow): CategorizationRule | null => {
  if (row.pattern === null || row.matchType === null || row.categoryId === null) return null;
  return {
    id: row.id,
    pattern: row.pattern,
    matchType: row.matchType,
    categoryId: row.categoryId,
    priority: row.priority ?? 0,
    hitCount: row.hitCount ?? 0,
    createdAt: stamp(row.createdAt),
  };
};

const columnMapSchema = z.partialRecord(z.enum(IMPORT_FIELDS), z.string());

/** Lee el JSON de `columnMap` de un perfil. Si está corrupto, devuelve un mapa vacío. */
export const parseColumnMap = (json: string | null): ColumnMap => {
  if (json === null) return {};
  try {
    const parsed = columnMapSchema.safeParse(JSON.parse(json));
    if (!parsed.success) return {};
    const map: ColumnMap = {};
    for (const field of IMPORT_FIELDS) {
      const column = parsed.data[field];
      if (column !== undefined) map[field] = column;
    }
    return map;
  } catch {
    return {};
  }
};

export const toImportProfile = (row: ImportProfileRow): ImportProfile | null => {
  if (row.name === null || row.source === null) return null;
  return {
    id: row.id,
    name: row.name,
    source: row.source,
    delimiter: row.delimiter ?? "",
    encoding: row.encoding ?? "utf-8",
    dateFormat: row.dateFormat ?? "auto",
    decimalSeparator: row.decimalSeparator ?? ",",
    columnMap: parseColumnMap(row.columnMap),
    signMode: row.signMode ?? "signed",
  };
};

export const toImportBatch = (row: ImportBatchRow): ImportBatch | null => {
  if (row.source === null || row.importedAt === null) return null;
  return {
    id: row.id,
    source: row.source,
    fileName: row.fileName ?? "",
    importedAt: row.importedAt,
    rowCount: row.rowCount ?? 0,
  };
};

/**
 * Convierte una lista de filas reutilizando el resultado de las que no han
 * cambiado. Evolu mantiene la identidad de las filas intactas entre
 * actualizaciones, así que con 10 000 movimientos solo se reconvierte el que
 * cambió.
 */
export const createRowMapper = <Row extends object, Value>(convert: (row: Row) => Value | null) => {
  const cache = new WeakMap<Row, { readonly value: Value | null }>();
  return (rows: ReadonlyArray<Row>): ReadonlyArray<Value> => {
    const values: Value[] = [];
    for (const row of rows) {
      let entry = cache.get(row);
      if (!entry) {
        entry = { value: convert(row) };
        cache.set(row, entry);
      }
      if (entry.value !== null) values.push(entry.value);
    }
    return values;
  };
};
