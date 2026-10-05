import {
  booleanToSqliteBoolean,
  createIdFromString,
  DateIso,
  Int,
  NonNegativeInt,
  PositiveInt,
  sqliteFalse,
  sqliteTrue,
} from "@evolu/common";

import type { BudgetWrite } from "@/domain/budgets";
import { defaultIsLiquid, SEED_CATEGORIES, seedChildKey, type SeedAccount } from "@/domain/catalog";
import { normalizeTagName } from "@/domain/compare";
import type { AccountDraft, ImportDraft } from "@/domain/importing/pipeline";
import { processRecurrences } from "@/domain/recurrences";
import { nextPriority } from "@/domain/rules";
import { sanitizeTransaction, type TransactionInput } from "@/domain/transactions";
import type {
  Account,
  AccountType,
  BudgetGroup,
  CategorizationRule,
  CategoryKind,
  Cents,
  ColumnMap,
  DateFormat,
  Frequency,
  GoalStatus,
  ImportSource,
  IsoDate,
  Ledger,
  MatchType,
  PaletteColor,
  Recurrence,
  SignMode,
  Tag,
  Transaction,
  TransactionType,
} from "@/domain/types";

import type { Db } from "./evolu";
import * as S from "./schema";
import { encodeSetting, type SettingKey, type Settings } from "./settings";

/**
 * Repositorio de escritura. Es la única puerta de la interfaz hacia Evolu:
 * recibe datos de dominio ya validados y los convierte a los tipos del schema.
 *
 * Los `orThrow` nunca deberían lanzar (los formularios validan antes); si
 * lanzan es un error de programación y lo recoge el ErrorBoundary de la ruta.
 */

const bool = booleanToSqliteBoolean;
const nullable =
  <In, Out>(convert: (value: In) => Out) =>
  (value: In | null): Out | null =>
    value === null ? null : convert(value);

const accountId = (id: string) => S.AccountId.orThrow(id);
const categoryId = (id: string) => S.CategoryId.orThrow(id);
const transactionId = (id: string) => S.TransactionId.orThrow(id);
const tagId = (id: string) => S.TagId.orThrow(id);
const recurrenceId = (id: string) => S.RecurrenceId.orThrow(id);
const goalId = (id: string) => S.GoalId.orThrow(id);
const budgetId = (id: string) => S.BudgetId.orThrow(id);
const ruleId = (id: string) => S.CategorizationRuleId.orThrow(id);
const valuationId = (id: string) => S.AccountValuationId.orThrow(id);
const batchId = (id: string) => S.ImportBatchId.orThrow(id);
const profileId = (id: string) => S.ImportProfileId.orThrow(id);

const isoDate = (value: IsoDate) => S.IsoDate.orThrow(value);
const positive = (value: Cents | number) => PositiveInt.orThrow(value);
const nonNegative = (value: Cents | number) => NonNegativeInt.orThrow(value);
const name = (value: string) => S.Name.orThrow(value.trim().slice(0, 100));
const emoji = (value: string) => S.Emoji.orThrow(value.trim().slice(0, 32));
const shortText = (value: string) => S.ShortText.orThrow(value.slice(0, 300));
const longText = (value: string) => S.LongText.orThrow(value.slice(0, 2000));

/** Id determinista de una cuenta del catálogo inicial. */
export const seedAccountId = (key: string): string =>
  createIdFromString<"Account">(`seed:account:${key}`);

/** Id determinista de una categoría del catálogo inicial ("alimentacion/supermercado"). */
export const seedCategoryId = (key: string): string =>
  createIdFromString<"Category">(`seed:category:${key}`);

/* ───────────────────────── Entradas ───────────────────────── */

export interface AccountInput {
  readonly name: string;
  readonly emoji: string;
  readonly color: PaletteColor;
  readonly type: AccountType;
  readonly openingBalance: Cents;
  readonly openingDate: IsoDate;
  readonly isLiquid: boolean;
  readonly includeInNetWorth: boolean;
}

export interface CategoryInput {
  readonly name: string;
  readonly emoji: string;
  readonly kind: CategoryKind;
  readonly parentId: string | null;
  readonly budgetGroup: BudgetGroup | null;
}

export interface RecurrenceInput {
  readonly name: string;
  readonly type: TransactionType;
  readonly amount: Cents;
  readonly accountId: string;
  readonly toAccountId: string | null;
  readonly categoryId: string | null;
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

export interface GoalInput {
  readonly name: string;
  readonly emoji: string;
  readonly color: PaletteColor;
  readonly targetAmount: Cents;
  readonly targetDate: IsoDate | null;
}

export interface RuleInput {
  readonly pattern: string;
  readonly matchType: MatchType;
  readonly categoryId: string;
  readonly priority: number;
}

export interface ImportProfileInput {
  readonly name: string;
  readonly source: ImportSource;
  readonly delimiter: string;
  readonly encoding: string;
  readonly dateFormat: DateFormat;
  readonly decimalSeparator: "," | ".";
  readonly columnMap: ColumnMap;
  readonly signMode: SignMode;
}

export interface SeedAccountInput extends SeedAccount {
  readonly openingBalance: Cents;
  readonly openingDate: IsoDate;
}

/** Datos extra de un movimiento que no salen del formulario. */
interface TransactionOrigin {
  readonly recurrenceId?: string | null;
  readonly importBatchId?: string | null;
  readonly importHash?: string | null;
}

const transactionColumns = (input: TransactionInput) => {
  const clean = sanitizeTransaction(input);
  if (clean.amount === null || clean.accountId === null) {
    throw new Error("El movimiento no está validado: faltan importe o cuenta.");
  }
  return {
    type: clean.type,
    status: clean.status,
    date: isoDate(clean.date),
    amount: positive(clean.amount),
    accountId: accountId(clean.accountId),
    toAccountId: nullable(accountId)(clean.toAccountId),
    categoryId: nullable(categoryId)(clean.categoryId),
    concept: shortText(clean.concept),
    notes: nullable(longText)(clean.notes),
    originalAmount: nullable(positive)(clean.originalAmount),
    originalCurrency: nullable((code: string) => S.CurrencyCode.orThrow(code))(
      clean.originalCurrency,
    ),
    goalId: nullable(goalId)(clean.goalId),
  };
};

/* ───────────────────────── Repositorio ───────────────────────── */

export const createRepo = (db: Db) => {
  /* ── Etiquetas de un movimiento ── */

  const linkId = (transaction: string, tag: string) =>
    createIdFromString<"TransactionTag">(`${transaction}|${tag}`);

  /** Deja el movimiento con exactamente estas etiquetas. */
  const setTransactionTags = (
    transaction: string,
    nextTagIds: ReadonlyArray<string>,
    currentTagIds: ReadonlyArray<string>,
  ) => {
    const next = new Set(nextTagIds);
    const current = new Set(currentTagIds);
    for (const tag of next) {
      if (current.has(tag)) continue;
      // Id determinista: volver a poner una etiqueta reactiva el mismo enlace.
      db.upsert("transactionTag", {
        id: linkId(transaction, tag),
        transactionId: transactionId(transaction),
        tagId: tagId(tag),
        isDeleted: sqliteFalse,
      });
    }
    for (const tag of current) {
      if (!next.has(tag)) {
        db.update("transactionTag", { id: linkId(transaction, tag), isDeleted: sqliteTrue });
      }
    }
  };

  return {
    /* ── Cuentas ── */

    createAccount: (input: AccountInput, sortOrder: number): string =>
      db.insert("account", {
        name: name(input.name),
        emoji: emoji(input.emoji),
        color: input.color,
        type: input.type,
        openingBalance: nonNegative(input.openingBalance),
        openingDate: isoDate(input.openingDate),
        isLiquid: bool(input.isLiquid),
        includeInNetWorth: bool(input.includeInNetWorth),
        archived: sqliteFalse,
        sortOrder: Int.orThrow(sortOrder),
      }).id,

    updateAccount: (id: string, input: AccountInput): void => {
      db.update("account", {
        id: accountId(id),
        name: name(input.name),
        emoji: emoji(input.emoji),
        color: input.color,
        type: input.type,
        openingBalance: nonNegative(input.openingBalance),
        openingDate: isoDate(input.openingDate),
        isLiquid: bool(input.isLiquid),
        includeInNetWorth: bool(input.includeInNetWorth),
      });
    },

    setAccountArchived: (id: string, archived: boolean): void => {
      db.update("account", { id: accountId(id), archived: bool(archived) });
    },

    /**
     * Crea o actualiza las cuentas precargadas de la bienvenida. Los ids son
     * deterministas: repetirlo en otro dispositivo no duplica cuentas.
     */
    seedAccounts: (accounts: ReadonlyArray<SeedAccountInput>): ReadonlyArray<string> =>
      accounts.map(
        (account, index) =>
          db.upsert("account", {
            id: accountId(seedAccountId(account.key)),
            name: name(account.name),
            emoji: emoji(account.emoji),
            color: account.color,
            type: account.type,
            openingBalance: nonNegative(account.openingBalance),
            openingDate: isoDate(account.openingDate),
            isLiquid: bool(defaultIsLiquid(account.type)),
            includeInNetWorth: sqliteTrue,
            archived: sqliteFalse,
            sortOrder: Int.orThrow(index),
          }).id,
      ),

    /** Cuentas del CSV de Notion: crea las nuevas y actualiza las existentes. */
    importAccounts: (
      drafts: ReadonlyArray<AccountDraft>,
      today: IsoDate,
      firstSortOrder: number,
    ) => {
      drafts.forEach((draft, index) => {
        if (draft.existingId !== null) {
          db.update("account", {
            id: accountId(draft.existingId),
            ...(draft.openingBalance === null
              ? {}
              : { openingBalance: nonNegative(draft.openingBalance) }),
            ...(draft.openingDate === null ? {} : { openingDate: isoDate(draft.openingDate) }),
          });
          return;
        }
        db.insert("account", {
          name: name(draft.name),
          emoji: emoji(draft.type === "investment" ? "📈" : draft.type === "cash" ? "💶" : "💳"),
          color: "slate",
          type: draft.type,
          openingBalance: nonNegative(draft.openingBalance ?? 0),
          openingDate: isoDate(draft.openingDate ?? today),
          isLiquid: bool(draft.isLiquid),
          includeInNetWorth: sqliteTrue,
          archived: sqliteFalse,
          sortOrder: Int.orThrow(firstSortOrder + index),
        });
      });
    },

    /* ── Categorías ── */

    createCategory: (input: CategoryInput, sortOrder: number): string =>
      db.insert("category", {
        name: name(input.name),
        emoji: emoji(input.emoji),
        kind: input.kind,
        parentId: nullable(categoryId)(input.parentId),
        budgetGroup: input.parentId === null ? input.budgetGroup : null,
        archived: sqliteFalse,
        sortOrder: Int.orThrow(sortOrder),
      }).id,

    updateCategory: (id: string, input: CategoryInput): void => {
      db.update("category", {
        id: categoryId(id),
        name: name(input.name),
        emoji: emoji(input.emoji),
        parentId: nullable(categoryId)(input.parentId),
        budgetGroup: input.parentId === null ? input.budgetGroup : null,
      });
    },

    setCategoryArchived: (id: string, archived: boolean): void => {
      db.update("category", { id: categoryId(id), archived: bool(archived) });
    },

    reorderCategories: (orderedIds: ReadonlyArray<string>): void => {
      orderedIds.forEach((id, index) => {
        db.update("category", { id: categoryId(id), sortOrder: Int.orThrow(index) });
      });
    },

    /**
     * Fusiona una categoría en otra: mueve sus movimientos, reglas y
     * recurrencias, y archiva y borra la de origen.
     */
    mergeCategory: (
      sourceId: string,
      targetId: string,
      ledger: Pick<Ledger, "transactions" | "rules" | "recurrences">,
    ): void => {
      const target = categoryId(targetId);
      for (const transaction of ledger.transactions) {
        if (transaction.categoryId === sourceId) {
          db.update("transaction", { id: transactionId(transaction.id), categoryId: target });
        }
      }
      for (const rule of ledger.rules) {
        if (rule.categoryId === sourceId) {
          db.update("categorizationRule", { id: ruleId(rule.id), categoryId: target });
        }
      }
      for (const recurrence of ledger.recurrences) {
        if (recurrence.categoryId === sourceId) {
          db.update("recurrence", { id: recurrenceId(recurrence.id), categoryId: target });
        }
      }
      db.update("category", {
        id: categoryId(sourceId),
        archived: sqliteTrue,
        isDeleted: sqliteTrue,
      });
    },

    /** Precarga el catálogo de categorías con ids deterministas. */
    seedCategories: (): void => {
      SEED_CATEGORIES.forEach((category, index) => {
        const parent = db.upsert("category", {
          id: categoryId(seedCategoryId(category.key)),
          name: name(category.name),
          emoji: emoji(category.emoji),
          kind: category.kind,
          parentId: null,
          budgetGroup: category.budgetGroup,
          archived: sqliteFalse,
          sortOrder: Int.orThrow(index),
        }).id;
        category.children.forEach((child, childIndex) => {
          db.upsert("category", {
            id: categoryId(seedCategoryId(seedChildKey(category, child))),
            name: name(child),
            emoji: emoji(category.emoji),
            kind: category.kind,
            parentId: parent,
            budgetGroup: null,
            archived: sqliteFalse,
            sortOrder: Int.orThrow(childIndex),
          });
        });
      });
    },

    /* ── Movimientos ── */

    createTransaction: (
      input: TransactionInput,
      tagIds: ReadonlyArray<string> = [],
      origin: TransactionOrigin = {},
    ): string => {
      const { id } = db.insert("transaction", {
        ...transactionColumns(input),
        recurrenceId: nullable(recurrenceId)(origin.recurrenceId ?? null),
        importBatchId: nullable(batchId)(origin.importBatchId ?? null),
        importHash: nullable(shortText)(origin.importHash ?? null),
      });
      setTransactionTags(id, tagIds, []);
      return id;
    },

    updateTransaction: (
      id: string,
      input: TransactionInput,
      tagIds: ReadonlyArray<string>,
      currentTagIds: ReadonlyArray<string>,
    ): void => {
      db.update("transaction", { id: transactionId(id), ...transactionColumns(input) });
      setTransactionTags(id, tagIds, currentTagIds);
    },

    /** Borrado lógico. También es «Omitir» en un pendiente. */
    deleteTransaction: (id: string): void => {
      db.update("transaction", { id: transactionId(id), isDeleted: sqliteTrue });
    },

    /** Deshace un borrado. */
    restoreTransaction: (id: string): void => {
      db.update("transaction", { id: transactionId(id), isDeleted: sqliteFalse });
    },

    /** Aprueba un pendiente, opcionalmente corrigiendo importe y fecha. */
    approveTransaction: (
      id: string,
      changes: { readonly amount?: Cents; readonly date?: IsoDate } = {},
    ): void => {
      db.update("transaction", {
        id: transactionId(id),
        status: "confirmed",
        ...(changes.amount === undefined ? {} : { amount: positive(changes.amount) }),
        ...(changes.date === undefined ? {} : { date: isoDate(changes.date) }),
      });
    },

    /** Deshace una aprobación. */
    unapproveTransaction: (id: string): void => {
      db.update("transaction", { id: transactionId(id), status: "pending" });
    },

    setTransactionTags,

    /* ── Etiquetas ── */

    /** Devuelve el id de la etiqueta con ese nombre, creándola si no existe. */
    ensureTag: (
      rawName: string,
      tags: ReadonlyArray<Tag>,
      color: PaletteColor = "slate",
    ): string | null => {
      const tagName = normalizeTagName(rawName);
      if (tagName === "") return null;
      const existing = tags.find((tag) => tag.name === tagName);
      if (existing) return existing.id;
      const deterministic = createIdFromString<"Tag">(`tag:${tagName}`);
      // Si ese id ya lo usa una etiqueta renombrada, se crea con id aleatorio.
      if (tags.some((tag) => tag.id === deterministic)) {
        return db.insert("tag", { name: name(tagName), color }).id;
      }
      return db.upsert("tag", {
        id: deterministic,
        name: name(tagName),
        color,
        isDeleted: sqliteFalse,
      }).id;
    },

    updateTag: (
      id: string,
      changes: { readonly name?: string; readonly color?: PaletteColor },
    ): void => {
      const tagName = changes.name === undefined ? undefined : normalizeTagName(changes.name);
      db.update("tag", {
        id: tagId(id),
        ...(tagName === undefined || tagName === "" ? {} : { name: name(tagName) }),
        ...(changes.color === undefined ? {} : { color: changes.color }),
      });
    },

    /** Fusiona una etiqueta en otra y borra la de origen. */
    mergeTag: (
      sourceId: string,
      targetId: string,
      ledger: Pick<Ledger, "transactionTags">,
    ): void => {
      const targetLinks = new Set(
        ledger.transactionTags
          .filter((link) => link.tagId === targetId)
          .map((link) => link.transactionId),
      );
      for (const link of ledger.transactionTags) {
        if (link.tagId !== sourceId) continue;
        if (!targetLinks.has(link.transactionId)) {
          setTransactionTags(link.transactionId, [targetId], []);
        }
        db.update("transactionTag", {
          id: linkId(link.transactionId, sourceId),
          isDeleted: sqliteTrue,
        });
      }
      db.update("tag", { id: tagId(sourceId), isDeleted: sqliteTrue });
    },

    deleteTag: (id: string, ledger: Pick<Ledger, "transactionTags">): void => {
      for (const link of ledger.transactionTags) {
        if (link.tagId === id) {
          db.update("transactionTag", {
            id: linkId(link.transactionId, id),
            isDeleted: sqliteTrue,
          });
        }
      }
      db.update("tag", { id: tagId(id), isDeleted: sqliteTrue });
    },

    /* ── Recurrencias ── */

    createRecurrence: (input: RecurrenceInput): string =>
      db.insert("recurrence", {
        name: name(input.name),
        type: input.type,
        amount: positive(input.amount),
        accountId: accountId(input.accountId),
        toAccountId: nullable(accountId)(input.type === "transfer" ? input.toAccountId : null),
        categoryId: nullable(categoryId)(input.type === "transfer" ? null : input.categoryId),
        concept: shortText(input.concept),
        frequency: input.frequency,
        interval: positive(input.interval),
        anchorDate: isoDate(input.anchorDate),
        nextDueDate: isoDate(input.nextDueDate),
        endDate: nullable(isoDate)(input.endDate),
        leadDays: nonNegative(input.leadDays),
        isSubscription: bool(input.isSubscription),
        active: bool(input.active),
      }).id,

    updateRecurrence: (id: string, input: RecurrenceInput): void => {
      db.update("recurrence", {
        id: recurrenceId(id),
        name: name(input.name),
        type: input.type,
        amount: positive(input.amount),
        accountId: accountId(input.accountId),
        toAccountId: nullable(accountId)(input.type === "transfer" ? input.toAccountId : null),
        categoryId: nullable(categoryId)(input.type === "transfer" ? null : input.categoryId),
        concept: shortText(input.concept),
        frequency: input.frequency,
        interval: positive(input.interval),
        anchorDate: isoDate(input.anchorDate),
        nextDueDate: isoDate(input.nextDueDate),
        endDate: nullable(isoDate)(input.endDate),
        leadDays: nonNegative(input.leadDays),
        isSubscription: bool(input.isSubscription),
        active: bool(input.active),
      });
    },

    setRecurrenceActive: (id: string, active: boolean): void => {
      db.update("recurrence", { id: recurrenceId(id), active: bool(active) });
    },

    deleteRecurrence: (id: string): void => {
      db.update("recurrence", { id: recurrenceId(id), isDeleted: sqliteTrue });
    },

    /**
     * Genera los pendientes de las recurrencias. Se llama al desbloquear y al
     * volver a primer plano. Cada pendiente lleva un id determinista
     * (recurrencia + fecha): dos dispositivos que lo generen a la vez escriben
     * la misma fila en lugar de duplicarla.
     */
    runRecurrences: (
      recurrences: ReadonlyArray<Recurrence>,
      transactions: ReadonlyArray<Transaction>,
      today: IsoDate,
    ): number => {
      const run = processRecurrences(recurrences, transactions, today);
      for (const draft of run.drafts) {
        db.upsert("transaction", {
          id: createIdFromString<"Transaction">(`recurrence:${draft.recurrenceId}:${draft.date}`),
          type: draft.type,
          status: "pending",
          date: isoDate(draft.date),
          amount: positive(draft.amount),
          accountId: accountId(draft.accountId),
          toAccountId: nullable(accountId)(draft.toAccountId),
          categoryId: nullable(categoryId)(draft.categoryId),
          concept: shortText(draft.concept),
          recurrenceId: recurrenceId(draft.recurrenceId),
        });
      }
      for (const advance of run.advances) {
        db.update("recurrence", {
          id: recurrenceId(advance.id),
          nextDueDate: isoDate(advance.nextDueDate),
        });
      }
      return run.drafts.length;
    },

    /* ── Presupuestos ── */

    /** Aplica las escrituras planificadas por `planBudgetEdit`. */
    applyBudgetWrites: (writes: ReadonlyArray<BudgetWrite>): void => {
      for (const write of writes) {
        const category = write.key.scope === "category" ? write.key.categoryId : null;
        const amount = nullable(nonNegative)(write.amount);
        if (write.id !== null) {
          db.update("budget", { id: budgetId(write.id), amount });
          continue;
        }
        // Id determinista por ámbito y mes: dos dispositivos no duplican la versión.
        db.upsert("budget", {
          id: createIdFromString<"Budget">(
            `budget:${write.key.scope}:${category ?? ""}:${write.validFrom}`,
          ),
          scope: write.key.scope,
          categoryId: nullable(categoryId)(category),
          amount,
          validFrom: S.YearMonth.orThrow(write.validFrom),
          isDeleted: sqliteFalse,
        });
      }
    },

    /* ── Metas ── */

    createGoal: (input: GoalInput): string =>
      db.insert("goal", {
        name: name(input.name),
        emoji: emoji(input.emoji),
        color: input.color,
        targetAmount: positive(input.targetAmount),
        targetDate: nullable(isoDate)(input.targetDate),
        status: "active",
      }).id,

    updateGoal: (id: string, input: GoalInput): void => {
      db.update("goal", {
        id: goalId(id),
        name: name(input.name),
        emoji: emoji(input.emoji),
        color: input.color,
        targetAmount: positive(input.targetAmount),
        targetDate: nullable(isoDate)(input.targetDate),
      });
    },

    setGoalStatus: (id: string, status: GoalStatus): void => {
      db.update("goal", { id: goalId(id), status });
    },

    deleteGoal: (id: string): void => {
      db.update("goal", { id: goalId(id), isDeleted: sqliteTrue });
    },

    /* ── Valoraciones ── */

    addValuation: (account: string, date: IsoDate, value: Cents, note: string | null): string =>
      db.insert("accountValuation", {
        accountId: accountId(account),
        date: isoDate(date),
        value: nonNegative(value),
        note: nullable(shortText)(note === null || note.trim() === "" ? null : note.trim()),
      }).id,

    deleteValuation: (id: string): void => {
      db.update("accountValuation", { id: valuationId(id), isDeleted: sqliteTrue });
    },

    /* ── Reglas ── */

    createRule: (
      input: Omit<RuleInput, "priority">,
      rules: ReadonlyArray<CategorizationRule>,
    ): string =>
      db.insert("categorizationRule", {
        pattern: shortText(input.pattern.trim()),
        matchType: input.matchType,
        categoryId: categoryId(input.categoryId),
        priority: Int.orThrow(nextPriority(rules)),
        hitCount: nonNegative(0),
      }).id,

    updateRule: (id: string, input: RuleInput): void => {
      db.update("categorizationRule", {
        id: ruleId(id),
        pattern: shortText(input.pattern.trim()),
        matchType: input.matchType,
        categoryId: categoryId(input.categoryId),
        priority: Int.orThrow(input.priority),
      });
    },

    deleteRule: (id: string): void => {
      db.update("categorizationRule", { id: ruleId(id), isDeleted: sqliteTrue });
    },

    /* ── Importación ── */

    saveImportProfile: (input: ImportProfileInput, existingId: string | null): string => {
      const values = {
        name: name(input.name),
        source: input.source,
        delimiter: emoji(input.delimiter),
        encoding: emoji(input.encoding),
        dateFormat: input.dateFormat,
        decimalSeparator: input.decimalSeparator,
        columnMap: S.JsonText.orThrow(JSON.stringify(input.columnMap)),
        signMode: input.signMode,
      };
      if (existingId !== null) {
        db.update("importProfile", { id: profileId(existingId), ...values });
        return existingId;
      }
      return db.insert("importProfile", values).id;
    },

    deleteImportProfile: (id: string): void => {
      db.update("importProfile", { id: profileId(id), isDeleted: sqliteTrue });
    },

    /**
     * Escribe un lote de importación: el `importBatch`, sus movimientos y el
     * contador de aciertos de las reglas que categorizaron filas.
     */
    commitImport: (
      drafts: ReadonlyArray<ImportDraft>,
      meta: { readonly source: ImportSource; readonly fileName: string; readonly importedAt: Date },
      rules: ReadonlyArray<CategorizationRule>,
    ): string => {
      const { id: batch } = db.insert("importBatch", {
        source: meta.source,
        fileName: shortText(meta.fileName),
        importedAt: DateIso.orThrow(meta.importedAt.toISOString()),
        rowCount: nonNegative(drafts.length),
      });

      const hits = new Map<string, number>();
      for (const draft of drafts) {
        db.insert("transaction", {
          type: draft.type,
          status: "confirmed",
          date: isoDate(draft.date),
          amount: positive(draft.amount),
          accountId: accountId(draft.accountId),
          toAccountId: nullable(accountId)(draft.toAccountId),
          categoryId: nullable(categoryId)(draft.categoryId),
          concept: shortText(draft.concept),
          notes: nullable(longText)(draft.notes),
          importBatchId: batch,
          importHash: shortText(draft.importHash),
        });
        if (draft.ruleId !== null) hits.set(draft.ruleId, (hits.get(draft.ruleId) ?? 0) + 1);
      }

      for (const rule of rules) {
        const count = hits.get(rule.id);
        if (count !== undefined) {
          db.update("categorizationRule", {
            id: ruleId(rule.id),
            hitCount: nonNegative(rule.hitCount + count),
          });
        }
      }
      return batch;
    },

    /** Deshace un lote: borrado lógico de todos sus movimientos y del propio lote. */
    undoImportBatch: (batch: string, transactions: ReadonlyArray<Transaction>): number => {
      let count = 0;
      for (const transaction of transactions) {
        if (transaction.importBatchId === batch && !transaction.isDeleted) {
          db.update("transaction", { id: transactionId(transaction.id), isDeleted: sqliteTrue });
          count += 1;
        }
      }
      db.update("importBatch", { id: batchId(batch), isDeleted: sqliteTrue });
      return count;
    },

    /* ── Ajustes ── */

    setSetting: <K extends SettingKey>(key: K, value: Settings[K]): void => {
      db.upsert("setting", {
        id: createIdFromString<"Setting">(`setting:${key}`),
        key: name(key),
        value: S.JsonText.orThrow(encodeSetting(key, value)),
        isDeleted: sqliteFalse,
      });
    },
  };
};

export type Repo = ReturnType<typeof createRepo>;

/** Siguiente posición de orden para una lista. */
export const nextSortOrder = (items: ReadonlyArray<Pick<Account, "sortOrder">>): number =>
  items.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1;
