import { isOverdue } from "./balances";
import { type CategoryIndex, isLeaf } from "./categories";
import { normalizeTagName } from "./compare";
import { cents, parseMoney } from "./money";
import { normalizeText } from "./rules";
import type {
  AccountId,
  CategoryId,
  Cents,
  GoalId,
  IsoDate,
  Tag,
  TagId,
  Transaction,
  TransactionId,
  TransactionStatus,
  TransactionTag,
  TransactionType,
} from "./types";

/* ───────────────────────── Validación ───────────────────────── */

/** Datos de un movimiento tal como salen de un formulario. */
export interface TransactionInput {
  readonly type: TransactionType;
  readonly status: TransactionStatus;
  readonly date: IsoDate;
  readonly amount: Cents | null;
  readonly accountId: AccountId | null;
  readonly toAccountId: AccountId | null;
  readonly categoryId: CategoryId | null;
  readonly concept: string;
  readonly notes: string | null;
  readonly originalAmount: Cents | null;
  readonly originalCurrency: string | null;
  readonly goalId: GoalId | null;
}

export type TransactionField =
  "amount" | "accountId" | "toAccountId" | "categoryId" | "originalCurrency";

export type TransactionErrors = Partial<Record<TransactionField, string>>;

/**
 * Valida un movimiento: importe > 0, categoría hoja del mismo tipo salvo en
 * transferencias, y cuentas distintas en transferencias.
 */
export const validateTransaction = (
  input: TransactionInput,
  index: CategoryIndex,
  accountIds: ReadonlySet<AccountId>,
): TransactionErrors => {
  const errors: TransactionErrors = {};

  if (input.amount === null || input.amount <= 0) {
    errors.amount = "Escribe un importe mayor que cero.";
  }
  if (input.accountId === null || !accountIds.has(input.accountId)) {
    errors.accountId = "Elige una cuenta.";
  }

  if (input.type === "transfer") {
    if (input.toAccountId === null || !accountIds.has(input.toAccountId)) {
      errors.toAccountId = "Elige la cuenta de destino.";
    } else if (input.toAccountId === input.accountId) {
      errors.toAccountId = "La cuenta de destino debe ser distinta de la de origen.";
    }
  } else if (input.categoryId === null) {
    errors.categoryId = "Elige una categoría.";
  } else {
    const category = index.byId.get(input.categoryId);
    if (!category) errors.categoryId = "Elige una categoría.";
    else if (!isLeaf(index, category.id)) {
      errors.categoryId = "Elige una subcategoría: esta categoría tiene hijas.";
    } else if (category.kind !== input.type) {
      errors.categoryId =
        input.type === "expense"
          ? "Elige una categoría de gasto."
          : "Elige una categoría de ingreso.";
    }
  }

  if (input.originalAmount !== null) {
    if (input.originalCurrency === null || !/^[A-Z]{3}$/.test(input.originalCurrency)) {
      errors.originalCurrency = "Indica la divisa con su código de tres letras, como USD.";
    }
  }
  return errors;
};

export const hasErrors = (errors: TransactionErrors): boolean => Object.keys(errors).length > 0;

/** Limpia los campos que no aplican al tipo antes de guardar. */
export const sanitizeTransaction = (input: TransactionInput): TransactionInput => {
  const isTransfer = input.type === "transfer";
  const hasOriginal = input.originalAmount !== null && input.originalCurrency !== null;
  return {
    ...input,
    toAccountId: isTransfer ? input.toAccountId : null,
    categoryId: isTransfer ? null : input.categoryId,
    goalId: isTransfer ? input.goalId : null,
    concept: input.concept.trim(),
    notes: input.notes === null || input.notes.trim() === "" ? null : input.notes.trim(),
    originalAmount: hasOriginal ? input.originalAmount : null,
    originalCurrency: hasOriginal ? input.originalCurrency : null,
  };
};

/** Convierte un importe en otra divisa a euros con un tipo de cambio (EUR por unidad). */
export const convertWithRate = (original: Cents, rate: number): Cents | null =>
  Number.isFinite(rate) && rate > 0 ? cents(Math.round(original * rate)) : null;

/* ───────────────────────── Búsqueda y filtros ───────────────────────── */

export interface SearchQuery {
  /** Palabras a buscar en concepto y notas, ya normalizadas. */
  readonly terms: ReadonlyArray<string>;
  /** Etiquetas ("#viaje"), ya normalizadas. */
  readonly tags: ReadonlyArray<string>;
  /** ">50": importe estrictamente mayor. */
  readonly minAmount: Cents | null;
  /** "<20": importe estrictamente menor. */
  readonly maxAmount: Cents | null;
}

/** Interpreta el buscador: texto libre, "#etiqueta", ">50" y "<20". */
export const parseSearchQuery = (input: string): SearchQuery => {
  const terms: string[] = [];
  const tags: string[] = [];
  let minAmount: Cents | null = null;
  let maxAmount: Cents | null = null;

  for (const token of input.trim().split(/\s+/)) {
    if (token === "") continue;
    if (token.startsWith("#")) {
      const tag = normalizeTagName(token);
      if (tag !== "") tags.push(tag);
      continue;
    }
    if (token.startsWith(">") || token.startsWith("<")) {
      const amount = parseMoney(token.slice(1));
      if (amount !== null && amount >= 0) {
        if (token.startsWith(">")) minAmount = amount;
        else maxAmount = amount;
        continue;
      }
    }
    const term = normalizeText(token);
    if (term !== "") terms.push(term);
  }
  return { terms, tags, minAmount, maxAmount };
};

export interface TransactionFilter {
  readonly query?: SearchQuery | undefined;
  readonly status?: "all" | "pending" | undefined;
  readonly from?: IsoDate | null | undefined;
  readonly to?: IsoDate | null | undefined;
  readonly types?: ReadonlyArray<TransactionType> | undefined;
  /** Categorías hoja o de primer nivel; una de primer nivel incluye a sus hijas. */
  readonly categoryIds?: ReadonlyArray<CategoryId> | undefined;
  readonly accountIds?: ReadonlyArray<AccountId> | undefined;
  readonly tagIds?: ReadonlyArray<TagId> | undefined;
}

export interface FilterContext {
  readonly index: CategoryIndex;
  readonly tags: ReadonlyArray<Tag>;
  readonly transactionTags: ReadonlyArray<TransactionTag>;
}

/** Etiquetas de cada movimiento. */
export const tagsByTransaction = (
  tags: ReadonlyArray<Tag>,
  transactionTags: ReadonlyArray<TransactionTag>,
): ReadonlyMap<TransactionId, ReadonlyArray<Tag>> => {
  const tagById = new Map<TagId, Tag>();
  for (const tag of tags) tagById.set(tag.id, tag);
  const result = new Map<TransactionId, Tag[]>();
  for (const link of transactionTags) {
    const tag = tagById.get(link.tagId);
    if (!tag) continue;
    const list = result.get(link.transactionId) ?? [];
    if (!list.some((existing) => existing.id === tag.id)) list.push(tag);
    result.set(link.transactionId, list);
  }
  return result;
};

/** Filtra movimientos no borrados y los ordena del más reciente al más antiguo. */
export const filterTransactions = (
  transactions: ReadonlyArray<Transaction>,
  filter: TransactionFilter,
  context: FilterContext,
): ReadonlyArray<Transaction> => {
  const tagMap = tagsByTransaction(context.tags, context.transactionTags);
  const types = filter.types && filter.types.length > 0 ? new Set(filter.types) : null;
  const accounts =
    filter.accountIds && filter.accountIds.length > 0 ? new Set(filter.accountIds) : null;
  const tagIds = filter.tagIds && filter.tagIds.length > 0 ? new Set(filter.tagIds) : null;

  let categories: Set<CategoryId> | null = null;
  if (filter.categoryIds && filter.categoryIds.length > 0) {
    categories = new Set(filter.categoryIds);
    for (const id of filter.categoryIds) {
      for (const child of context.index.childrenOf.get(id) ?? []) categories.add(child.id);
    }
  }
  const query = filter.query;

  const result = transactions.filter((transaction) => {
    if (transaction.isDeleted) return false;
    if (filter.status === "pending" && transaction.status !== "pending") return false;
    if (filter.from != null && transaction.date < filter.from) return false;
    if (filter.to != null && transaction.date > filter.to) return false;
    if (types && !types.has(transaction.type)) return false;
    if (
      accounts &&
      !accounts.has(transaction.accountId) &&
      !(transaction.toAccountId !== null && accounts.has(transaction.toAccountId))
    ) {
      return false;
    }
    if (
      categories &&
      (transaction.categoryId === null || !categories.has(transaction.categoryId))
    ) {
      return false;
    }
    const ownTags = tagMap.get(transaction.id) ?? [];
    if (tagIds && !ownTags.some((tag) => tagIds.has(tag.id))) return false;

    if (query) {
      if (query.minAmount !== null && transaction.amount <= query.minAmount) return false;
      if (query.maxAmount !== null && transaction.amount >= query.maxAmount) return false;
      if (query.tags.length > 0) {
        const names = ownTags.map((tag) => tag.name);
        if (!query.tags.every((wanted) => names.some((name) => name.startsWith(wanted))))
          return false;
      }
      if (query.terms.length > 0) {
        const haystack = normalizeText(`${transaction.concept} ${transaction.notes ?? ""}`);
        if (!query.terms.every((term) => haystack.includes(term))) return false;
      }
    }
    return true;
  });

  return result.sort(compareNewestFirst);
};

export const compareNewestFirst = (a: Transaction, b: Transaction): number =>
  b.date.localeCompare(a.date) ||
  b.createdAt.localeCompare(a.createdAt) ||
  b.id.localeCompare(a.id);

/* ───────────────────────── Agrupación ───────────────────────── */

/** Efecto neto de un movimiento en los totales: +ingreso, −gasto, 0 transferencia. */
export const netEffect = (transaction: Transaction): number =>
  transaction.type === "income"
    ? transaction.amount
    : transaction.type === "expense"
      ? -transaction.amount
      : 0;

export interface DayGroup {
  readonly date: IsoDate;
  readonly transactions: ReadonlyArray<Transaction>;
  /** Total neto del día con los movimientos confirmados. */
  readonly net: Cents;
}

/** Agrupa por día una lista ya ordenada del más reciente al más antiguo. */
export const groupByDay = (transactions: ReadonlyArray<Transaction>): ReadonlyArray<DayGroup> => {
  const groups: Array<{ date: IsoDate; transactions: Transaction[]; net: number }> = [];
  for (const transaction of transactions) {
    let group = groups[groups.length - 1];
    if (group?.date !== transaction.date) {
      group = { date: transaction.date, transactions: [], net: 0 };
      groups.push(group);
    }
    group.transactions.push(transaction);
    if (transaction.status === "confirmed") group.net += netEffect(transaction);
  }
  return groups.map((group) => ({ ...group, net: cents(group.net) }));
};

/** Pendientes por aprobar, primero los vencidos y luego por fecha. */
export const pendingTransactions = (
  transactions: ReadonlyArray<Transaction>,
  today: IsoDate,
): ReadonlyArray<Transaction> =>
  transactions
    .filter((transaction) => !transaction.isDeleted && transaction.status === "pending")
    .sort(
      (a, b) =>
        Number(isOverdue(b, today)) - Number(isOverdue(a, today)) ||
        a.date.localeCompare(b.date) ||
        a.createdAt.localeCompare(b.createdAt),
    );

/** Categorías hoja más usadas de un tipo, de más a menos frecuentes. */
export const mostUsedCategories = (
  transactions: ReadonlyArray<Transaction>,
  type: "expense" | "income",
  limit: number,
): ReadonlyArray<CategoryId> => {
  const counts = new Map<CategoryId, number>();
  for (const transaction of transactions) {
    if (transaction.isDeleted || transaction.type !== type || transaction.categoryId === null)
      continue;
    counts.set(transaction.categoryId, (counts.get(transaction.categoryId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([id]) => id);
};
