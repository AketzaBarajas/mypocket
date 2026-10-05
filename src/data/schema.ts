import * as E from "@evolu/common";

/**
 * Schema de Evolu. Es de solo añadir: nunca se renombran ni eliminan tablas o
 * columnas, ni se cambia el tipo de una columna ya publicada.
 *
 * Evolu añade a cada tabla `createdAt`, `updatedAt`, `isDeleted` y `ownerId`.
 * El borrado siempre es lógico (`isDeleted`). Nada derivado se persiste.
 */

/* ───────────────────────── Tipos de columna ───────────────────────── */

export const Name = E.NonEmptyTrimmedString100;
export const Emoji = E.maxLength(32)(E.String);
export const ShortText = E.maxLength(300)(E.String);
export const LongText = E.maxLength(2000)(E.String);
/** JSON serializado. Se valida con zod al leerlo. */
export const JsonText = E.maxLength(20000)(E.String);

/** Fecha de negocio `YYYY-MM-DD` en hora local. */
export const IsoDate = E.regex("IsoDate", /^\d{4}-\d{2}-\d{2}$/)(E.String);
/** Mes de negocio `YYYY-MM`. */
export const YearMonth = E.regex("YearMonth", /^\d{4}-\d{2}$/)(E.String);
/** Divisa ISO 4217. */
export const CurrencyCode = E.regex("CurrencyCode", /^[A-Z]{3}$/)(E.String);

/** Importe en céntimos > 0. */
export const PositiveCents = E.PositiveInt;
/** Importe en céntimos ≥ 0. */
export const NonNegativeCents = E.NonNegativeInt;

export const Bool = E.SqliteBoolean;

export const PaletteColor = E.union(
  "slate",
  "blue",
  "teal",
  "olive",
  "amber",
  "coral",
  "rose",
  "violet",
);
export const AccountType = E.union(
  "checking",
  "prepaid",
  "cash",
  "savings",
  "investment",
  "receivable",
);
export const CategoryKind = E.union("expense", "income");
export const BudgetGroup = E.union("needs", "wants");
export const TransactionType = E.union("expense", "income", "transfer");
export const TransactionStatus = E.union("confirmed", "pending");
export const Frequency = E.union("weekly", "monthly", "yearly");
export const BudgetScope = E.union("category", "savings");
export const GoalStatus = E.union("active", "achieved", "archived");
export const MatchType = E.union("contains", "startsWith", "equals", "regex");
export const ImportSource = E.union("bbva", "notion", "generic");
export const SignMode = E.union("signed", "split", "byType");
export const DateFormat = E.union("auto", "dmy", "mdy", "ymd");
export const DecimalSeparator = E.union(",", ".");

/* ───────────────────────── Identificadores ───────────────────────── */

export const AccountId = E.id("Account");
export type AccountId = typeof AccountId.Output;
export const CategoryId = E.id("Category");
export type CategoryId = typeof CategoryId.Output;
export const TransactionId = E.id("Transaction");
export type TransactionId = typeof TransactionId.Output;
export const TagId = E.id("Tag");
export type TagId = typeof TagId.Output;
export const TransactionTagId = E.id("TransactionTag");
export type TransactionTagId = typeof TransactionTagId.Output;
export const RecurrenceId = E.id("Recurrence");
export type RecurrenceId = typeof RecurrenceId.Output;
export const BudgetId = E.id("Budget");
export type BudgetId = typeof BudgetId.Output;
export const GoalId = E.id("Goal");
export type GoalId = typeof GoalId.Output;
export const AccountValuationId = E.id("AccountValuation");
export type AccountValuationId = typeof AccountValuationId.Output;
export const CategorizationRuleId = E.id("CategorizationRule");
export type CategorizationRuleId = typeof CategorizationRuleId.Output;
export const ImportProfileId = E.id("ImportProfile");
export type ImportProfileId = typeof ImportProfileId.Output;
export const ImportBatchId = E.id("ImportBatch");
export type ImportBatchId = typeof ImportBatchId.Output;
export const SettingId = E.id("Setting");
export type SettingId = typeof SettingId.Output;

/* ───────────────────────── Tablas ───────────────────────── */

export const Schema = {
  account: {
    id: AccountId,
    name: Name,
    emoji: Emoji,
    color: PaletteColor,
    type: AccountType,
    openingBalance: NonNegativeCents,
    openingDate: IsoDate,
    isLiquid: Bool,
    includeInNetWorth: Bool,
    archived: Bool,
    sortOrder: E.Int,
  },

  category: {
    id: CategoryId,
    name: Name,
    emoji: Emoji,
    kind: CategoryKind,
    parentId: E.nullOr(CategoryId),
    budgetGroup: E.nullOr(BudgetGroup),
    archived: Bool,
    sortOrder: E.Int,
  },

  transaction: {
    id: TransactionId,
    type: TransactionType,
    status: TransactionStatus,
    date: IsoDate,
    amount: PositiveCents,
    accountId: AccountId,
    toAccountId: E.nullOr(AccountId),
    categoryId: E.nullOr(CategoryId),
    concept: ShortText,
    notes: E.nullOr(LongText),
    originalAmount: E.nullOr(PositiveCents),
    originalCurrency: E.nullOr(CurrencyCode),
    goalId: E.nullOr(GoalId),
    recurrenceId: E.nullOr(RecurrenceId),
    importBatchId: E.nullOr(ImportBatchId),
    importHash: E.nullOr(ShortText),
  },

  tag: {
    id: TagId,
    name: Name,
    color: PaletteColor,
  },

  transactionTag: {
    id: TransactionTagId,
    transactionId: TransactionId,
    tagId: TagId,
  },

  recurrence: {
    id: RecurrenceId,
    name: Name,
    type: TransactionType,
    amount: PositiveCents,
    accountId: AccountId,
    toAccountId: E.nullOr(AccountId),
    categoryId: E.nullOr(CategoryId),
    concept: ShortText,
    frequency: Frequency,
    interval: E.PositiveInt,
    anchorDate: IsoDate,
    nextDueDate: IsoDate,
    endDate: E.nullOr(IsoDate),
    leadDays: E.NonNegativeInt,
    isSubscription: Bool,
    active: Bool,
  },

  budget: {
    id: BudgetId,
    scope: BudgetScope,
    categoryId: E.nullOr(CategoryId),
    amount: E.nullOr(NonNegativeCents),
    validFrom: YearMonth,
  },

  goal: {
    id: GoalId,
    name: Name,
    emoji: Emoji,
    color: PaletteColor,
    targetAmount: PositiveCents,
    targetDate: E.nullOr(IsoDate),
    status: GoalStatus,
  },

  accountValuation: {
    id: AccountValuationId,
    accountId: AccountId,
    date: IsoDate,
    value: NonNegativeCents,
    note: E.nullOr(ShortText),
  },

  categorizationRule: {
    id: CategorizationRuleId,
    pattern: ShortText,
    matchType: MatchType,
    categoryId: CategoryId,
    priority: E.Int,
    hitCount: E.NonNegativeInt,
  },

  importProfile: {
    id: ImportProfileId,
    name: Name,
    source: ImportSource,
    delimiter: Emoji,
    encoding: Emoji,
    dateFormat: DateFormat,
    decimalSeparator: DecimalSeparator,
    columnMap: JsonText,
    signMode: SignMode,
  },

  importBatch: {
    id: ImportBatchId,
    source: ImportSource,
    fileName: ShortText,
    importedAt: E.DateIso,
    rowCount: E.NonNegativeInt,
  },

  setting: {
    id: SettingId,
    key: Name,
    value: JsonText,
  },
};

export type Schema = typeof Schema;
export type TableName = keyof Schema;

/** Tablas de negocio, en el orden en que se exportan y restauran las copias. */
export const TABLE_NAMES = [
  "account",
  "category",
  "tag",
  "goal",
  "recurrence",
  "importBatch",
  "transaction",
  "transactionTag",
  "budget",
  "accountValuation",
  "categorizationRule",
  "importProfile",
  "setting",
] as const satisfies ReadonlyArray<TableName>;

/** Versión del formato de datos, para copias de seguridad. */
export const SCHEMA_VERSION = 1;
