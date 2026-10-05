import { isConfirmed } from "./balances";
import type { CategoryIndex } from "./categories";
import { addMonthsYm, yearOf } from "./dates";
import { cents, ZERO_CENTS } from "./money";
import { type DateRange, inRange, monthRangeOf, spendingByCategory, yearRangeOf } from "./spending";
import type {
  Category,
  Cents,
  IsoDate,
  Tag,
  TagId,
  Transaction,
  TransactionId,
  TransactionTag,
  YearMonth,
} from "./types";

export interface Delta {
  readonly current: Cents;
  readonly previous: Cents;
  /** Variación en euros (actual − anterior). */
  readonly amount: Cents;
  /** Variación relativa. `null` si el periodo anterior es 0. */
  readonly ratio: number | null;
}

export const delta = (current: Cents, previous: Cents): Delta => {
  const amount = cents(current - previous);
  return { current, previous, amount, ratio: previous === 0 ? null : amount / previous };
};

export interface CategoryDelta extends Delta {
  readonly category: Category;
}

export interface PeriodComparison {
  readonly total: Delta;
  /** Categorías de primer nivel con gasto en alguno de los dos periodos, de mayor a menor. */
  readonly categories: ReadonlyArray<CategoryDelta>;
}

/** Compara el gasto de dos periodos por categoría de primer nivel y en total. */
export const comparePeriods = (
  transactions: ReadonlyArray<Transaction>,
  index: CategoryIndex,
  current: DateRange,
  previous: DateRange,
): PeriodComparison => {
  const now = spendingByCategory(transactions, index, current);
  const before = spendingByCategory(transactions, index, previous);

  const ids = new Set([...now.byTopLevel.keys(), ...before.byTopLevel.keys()]);
  const categories: CategoryDelta[] = [];
  for (const id of ids) {
    const category = index.byId.get(id);
    if (!category) continue;
    categories.push({
      category,
      ...delta(now.byTopLevel.get(id) ?? ZERO_CENTS, before.byTopLevel.get(id) ?? ZERO_CENTS),
    });
  }
  categories.sort(
    (a, b) =>
      Math.max(b.current, b.previous) - Math.max(a.current, a.previous) ||
      a.category.name.localeCompare(b.category.name, "es"),
  );

  return { total: delta(now.total, before.total), categories };
};

/** Mes contra el mes anterior. */
export const compareMonths = (
  transactions: ReadonlyArray<Transaction>,
  index: CategoryIndex,
  month: YearMonth,
): PeriodComparison =>
  comparePeriods(transactions, index, monthRangeOf(month), monthRangeOf(addMonthsYm(month, -1)));

/** Año contra el año anterior. */
export const compareYears = (
  transactions: ReadonlyArray<Transaction>,
  index: CategoryIndex,
  year: number,
): PeriodComparison =>
  comparePeriods(transactions, index, yearRangeOf(year), yearRangeOf(year - 1));

export const yearOfMonth = (month: YearMonth): number => yearOf(month);

/* ───────────────────────── Etiquetas ───────────────────────── */

export interface TagCost {
  readonly tag: Tag;
  /** Suma de gastos confirmados con la etiqueta. */
  readonly total: Cents;
  readonly count: number;
  readonly firstDate: IsoDate | null;
  readonly lastDate: IsoDate | null;
}

/** Coste por etiqueta, en cualquier fecha o dentro de un intervalo. */
export const tagCosts = (
  tags: ReadonlyArray<Tag>,
  transactionTags: ReadonlyArray<TransactionTag>,
  transactions: ReadonlyArray<Transaction>,
  range?: DateRange,
): ReadonlyArray<TagCost> => {
  const byId = new Map<TransactionId, Transaction>();
  for (const transaction of transactions) byId.set(transaction.id, transaction);

  const stats = new Map<
    TagId,
    { total: number; seen: Set<TransactionId>; first: IsoDate | null; last: IsoDate | null }
  >();
  for (const tag of tags) stats.set(tag.id, { total: 0, seen: new Set(), first: null, last: null });

  for (const link of transactionTags) {
    const stat = stats.get(link.tagId);
    const transaction = byId.get(link.transactionId);
    if (!stat || !transaction) continue;
    if (transaction.type !== "expense" || !isConfirmed(transaction)) continue;
    if (range !== undefined && !inRange(transaction.date, range)) continue;
    // Un enlace duplicado (creado a la vez en dos dispositivos) cuenta una vez.
    if (stat.seen.has(transaction.id)) continue;
    stat.seen.add(transaction.id);
    stat.total += transaction.amount;
    if (stat.first === null || transaction.date < stat.first) stat.first = transaction.date;
    if (stat.last === null || transaction.date > stat.last) stat.last = transaction.date;
  }

  return tags
    .map((tag): TagCost => {
      const stat = stats.get(tag.id);
      return {
        tag,
        total: cents(stat?.total ?? 0),
        count: stat?.seen.size ?? 0,
        firstDate: stat?.first ?? null,
        lastDate: stat?.last ?? null,
      };
    })
    .sort((a, b) => b.total - a.total || a.tag.name.localeCompare(b.tag.name, "es"));
};

/** Normaliza el nombre de una etiqueta: sin "#", minúsculas y sin espacios. */
export const normalizeTagName = (input: string): string =>
  input
    .trim()
    .replace(/^#+/, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "");
