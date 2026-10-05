import { isConfirmed } from "./balances";
import { type CategoryIndex, topLevelOf } from "./categories";
import { endOfMonthIso, monthOf, startOfMonthIso } from "./dates";
import { cents } from "./money";
import type { CategoryId, Cents, IsoDate, Transaction, YearMonth } from "./types";

/** Intervalo de fechas, ambos extremos incluidos. */
export interface DateRange {
  readonly from: IsoDate;
  readonly to: IsoDate;
}

export const monthRangeOf = (month: YearMonth): DateRange => ({
  from: startOfMonthIso(month),
  to: endOfMonthIso(month),
});

export const yearRangeOf = (year: number): DateRange => ({
  from: `${String(year).padStart(4, "0")}-01-01` as IsoDate,
  to: `${String(year).padStart(4, "0")}-12-31` as IsoDate,
});

export const inRange = (date: IsoDate, range: DateRange): boolean =>
  date >= range.from && date <= range.to;

export interface CategoryTotals {
  /** Importe por categoría hoja (la que lleva el movimiento). */
  readonly byLeaf: ReadonlyMap<CategoryId, Cents>;
  /** Importe por categoría de primer nivel (la propia si no tiene madre). */
  readonly byTopLevel: ReadonlyMap<CategoryId, Cents>;
  readonly total: Cents;
}

const totalsByCategory = (
  transactions: ReadonlyArray<Transaction>,
  index: CategoryIndex,
  range: DateRange,
  type: "expense" | "income",
): CategoryTotals => {
  const byLeaf = new Map<CategoryId, number>();
  const byTopLevel = new Map<CategoryId, number>();
  let total = 0;

  for (const transaction of transactions) {
    if (
      transaction.type !== type ||
      !isConfirmed(transaction) ||
      !inRange(transaction.date, range)
    ) {
      continue;
    }
    total += transaction.amount;
    if (transaction.categoryId === null) continue;
    byLeaf.set(
      transaction.categoryId,
      (byLeaf.get(transaction.categoryId) ?? 0) + transaction.amount,
    );
    const top = topLevelOf(index, transaction.categoryId)?.id ?? transaction.categoryId;
    byTopLevel.set(top, (byTopLevel.get(top) ?? 0) + transaction.amount);
  }

  const brand = (map: Map<CategoryId, number>) =>
    new Map([...map].map(([id, value]) => [id, cents(value)]));
  return { byLeaf: brand(byLeaf), byTopLevel: brand(byTopLevel), total: cents(total) };
};

/**
 * Gasto confirmado por categoría en un intervalo. Cada gasto se atribuye a su
 * categoría hoja y a su categoría de primer nivel.
 */
export const spendingByCategory = (
  transactions: ReadonlyArray<Transaction>,
  index: CategoryIndex,
  range: DateRange,
): CategoryTotals => totalsByCategory(transactions, index, range, "expense");

export const incomeByCategory = (
  transactions: ReadonlyArray<Transaction>,
  index: CategoryIndex,
  range: DateRange,
): CategoryTotals => totalsByCategory(transactions, index, range, "income");

export interface Cashflow {
  readonly income: Cents;
  readonly expense: Cents;
  /** Ingresos menos gastos. Las transferencias no cuentan. */
  readonly net: Cents;
}

/** Ingresos y gastos confirmados de un intervalo. */
export const cashflowOf = (
  transactions: ReadonlyArray<Transaction>,
  range: DateRange,
): Cashflow => {
  let income = 0;
  let expense = 0;
  for (const transaction of transactions) {
    if (!isConfirmed(transaction) || !inRange(transaction.date, range)) continue;
    if (transaction.type === "income") income += transaction.amount;
    else if (transaction.type === "expense") expense += transaction.amount;
  }
  return { income: cents(income), expense: cents(expense), net: cents(income - expense) };
};

export interface MonthlyCashflow extends Cashflow {
  readonly month: YearMonth;
}

/** Ingresos y gastos por mes para una lista de meses, en una sola pasada. */
export const monthlyCashflow = (
  transactions: ReadonlyArray<Transaction>,
  months: ReadonlyArray<YearMonth>,
): ReadonlyArray<MonthlyCashflow> => {
  const buckets = new Map<YearMonth, { income: number; expense: number }>();
  for (const month of months) buckets.set(month, { income: 0, expense: 0 });

  for (const transaction of transactions) {
    if (!isConfirmed(transaction)) continue;
    const bucket = buckets.get(monthOf(transaction.date));
    if (!bucket) continue;
    if (transaction.type === "income") bucket.income += transaction.amount;
    else if (transaction.type === "expense") bucket.expense += transaction.amount;
  }

  return months.map((month) => {
    const bucket = buckets.get(month) ?? { income: 0, expense: 0 };
    return {
      month,
      income: cents(bucket.income),
      expense: cents(bucket.expense),
      net: cents(bucket.income - bucket.expense),
    };
  });
};
