/**
 * Tipos de dominio de MyPocket. Son datos planos: no dependen de React ni de
 * Evolu, y toda la lógica de `src/domain` trabaja solo con ellos.
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

/** Importe en céntimos de euro. Siempre entero; puede ser negativo en resultados derivados. */
export type Cents = Brand<number, "Cents">;
/** Fecha de negocio `YYYY-MM-DD` en hora local. */
export type IsoDate = Brand<string, "IsoDate">;
/** Mes de negocio `YYYY-MM`. */
export type YearMonth = Brand<string, "YearMonth">;

export type AccountId = string;
export type CategoryId = string;
export type TransactionId = string;
export type TagId = string;
export type RecurrenceId = string;
export type BudgetId = string;
export type GoalId = string;
export type ValuationId = string;
export type RuleId = string;
export type ImportProfileId = string;
export type ImportBatchId = string;

export const ACCOUNT_TYPES = [
  "checking",
  "prepaid",
  "cash",
  "savings",
  "investment",
  "receivable",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Paleta fija de 8 colores sobrios para cuentas, etiquetas y metas. */
export const PALETTE_COLORS = [
  "slate",
  "blue",
  "teal",
  "olive",
  "amber",
  "coral",
  "rose",
  "violet",
] as const;
export type PaletteColor = (typeof PALETTE_COLORS)[number];

export interface Account {
  readonly id: AccountId;
  readonly name: string;
  readonly emoji: string;
  readonly color: PaletteColor;
  readonly type: AccountType;
  readonly openingBalance: Cents;
  readonly openingDate: IsoDate;
  readonly isLiquid: boolean;
  readonly includeInNetWorth: boolean;
  readonly archived: boolean;
  readonly sortOrder: number;
}

export const CATEGORY_KINDS = ["expense", "income"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const BUDGET_GROUPS = ["needs", "wants"] as const;
export type BudgetGroup = (typeof BUDGET_GROUPS)[number];
/** Los tres grupos del reparto 50/30/20. */
export type PlanGroup = BudgetGroup | "savings";

export interface Category {
  readonly id: CategoryId;
  readonly name: string;
  readonly emoji: string;
  readonly kind: CategoryKind;
  readonly parentId: CategoryId | null;
  /** Solo en categorías de gasto de primer nivel; las hijas lo heredan. */
  readonly budgetGroup: BudgetGroup | null;
  readonly archived: boolean;
  readonly sortOrder: number;
}

export const TRANSACTION_TYPES = ["expense", "income", "transfer"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_STATUSES = ["confirmed", "pending"] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export interface Transaction {
  readonly id: TransactionId;
  readonly type: TransactionType;
  readonly status: TransactionStatus;
  readonly date: IsoDate;
  /** Siempre > 0. El signo lo determina `type`. */
  readonly amount: Cents;
  /** Cuenta del movimiento; cuenta origen en transferencias. */
  readonly accountId: AccountId;
  readonly toAccountId: AccountId | null;
  readonly categoryId: CategoryId | null;
  readonly concept: string;
  readonly notes: string | null;
  readonly originalAmount: Cents | null;
  readonly originalCurrency: string | null;
  readonly goalId: GoalId | null;
  readonly recurrenceId: RecurrenceId | null;
  readonly importBatchId: ImportBatchId | null;
  readonly importHash: string | null;
  /** Borrado lógico. La mayoría de cálculos lo excluyen; las recurrencias no. */
  readonly isDeleted: boolean;
  /** Marca de creación ISO 8601, para desempates estables. */
  readonly createdAt: string;
}

export interface Tag {
  readonly id: TagId;
  readonly name: string;
  readonly color: PaletteColor;
}

export interface TransactionTag {
  readonly transactionId: TransactionId;
  readonly tagId: TagId;
}

export const FREQUENCIES = ["weekly", "monthly", "yearly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export interface Recurrence {
  readonly id: RecurrenceId;
  readonly name: string;
  readonly type: TransactionType;
  readonly amount: Cents;
  readonly accountId: AccountId;
  readonly toAccountId: AccountId | null;
  readonly categoryId: CategoryId | null;
  readonly concept: string;
  readonly frequency: Frequency;
  readonly interval: number;
  readonly anchorDate: IsoDate;
  readonly nextDueDate: IsoDate;
  readonly endDate: IsoDate | null;
  readonly leadDays: number;
  readonly isSubscription: boolean;
  readonly active: boolean;
}

export type BudgetScope = "category" | "savings";

export interface Budget {
  readonly id: BudgetId;
  readonly scope: BudgetScope;
  readonly categoryId: CategoryId | null;
  /** `null` significa «sin presupuesto a partir de ese mes». */
  readonly amount: Cents | null;
  readonly validFrom: YearMonth;
}

export const GOAL_STATUSES = ["active", "achieved", "archived"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export interface Goal {
  readonly id: GoalId;
  readonly name: string;
  readonly emoji: string;
  readonly color: PaletteColor;
  readonly targetAmount: Cents;
  readonly targetDate: IsoDate | null;
  readonly status: GoalStatus;
}

export interface AccountValuation {
  readonly id: ValuationId;
  readonly accountId: AccountId;
  readonly date: IsoDate;
  readonly value: Cents;
  readonly note: string | null;
  readonly createdAt: string;
}

export const MATCH_TYPES = ["contains", "startsWith", "equals", "regex"] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

export interface CategorizationRule {
  readonly id: RuleId;
  readonly pattern: string;
  readonly matchType: MatchType;
  readonly categoryId: CategoryId;
  readonly priority: number;
  readonly hitCount: number;
  readonly createdAt: string;
}

export const IMPORT_SOURCES = ["bbva", "notion", "generic"] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];

export const SIGN_MODES = ["signed", "split", "byType"] as const;
export type SignMode = (typeof SIGN_MODES)[number];

/** Campos de MyPocket a los que se puede asignar una columna del CSV. */
export const IMPORT_FIELDS = [
  "date",
  "concept",
  "amount",
  "amountIn",
  "amountOut",
  "type",
  "account",
  "toAccount",
  "category",
  "notes",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Nombre de la columna del CSV asignada a cada campo. */
export type ColumnMap = Partial<Record<ImportField, string>>;

export const DATE_FORMATS = ["auto", "dmy", "mdy", "ymd"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export interface ImportProfile {
  readonly id: ImportProfileId;
  readonly name: string;
  readonly source: ImportSource;
  readonly delimiter: string;
  readonly encoding: string;
  readonly dateFormat: DateFormat;
  readonly decimalSeparator: "," | ".";
  readonly columnMap: ColumnMap;
  readonly signMode: SignMode;
}

export interface ImportBatch {
  readonly id: ImportBatchId;
  readonly source: ImportSource;
  readonly fileName: string;
  readonly importedAt: string;
  readonly rowCount: number;
}

/** Fotografía completa de los datos de negocio que consume la capa de dominio. */
export interface Ledger {
  readonly accounts: ReadonlyArray<Account>;
  readonly categories: ReadonlyArray<Category>;
  /** Incluye los borrados lógicos (`isDeleted`). */
  readonly transactions: ReadonlyArray<Transaction>;
  readonly tags: ReadonlyArray<Tag>;
  readonly transactionTags: ReadonlyArray<TransactionTag>;
  readonly recurrences: ReadonlyArray<Recurrence>;
  readonly budgets: ReadonlyArray<Budget>;
  readonly goals: ReadonlyArray<Goal>;
  readonly valuations: ReadonlyArray<AccountValuation>;
  readonly rules: ReadonlyArray<CategorizationRule>;
}
