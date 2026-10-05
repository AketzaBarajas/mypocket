import { isConfirmed, liquidBalance } from "./balances";
import type { CategoryIndex } from "./categories";
import { daysLeftInMonth, monthOf } from "./dates";
import { planSummary } from "./groups";
import { cents, divFloorCents, ZERO_CENTS } from "./money";
import { cashflowOf, monthRangeOf } from "./spending";
import type { Cents, IsoDate, Ledger, Transaction, YearMonth } from "./types";

/**
 * Tasa de ahorro de un mes: (ingresos − gastos) / ingresos, con confirmados y
 * sin transferencias. `null` si no hay ingresos. Puede ser negativa.
 */
export const savingsRate = (
  transactions: ReadonlyArray<Transaction>,
  month: YearMonth,
): number | null => {
  const { income, net } = cashflowOf(transactions, monthRangeOf(month));
  return income === 0 ? null : net / income;
};

/** Objetivo de tasa de ahorro (el 20 % del reparto 50/30/20). */
export const SAVINGS_RATE_TARGET = 0.2;

export interface Cushion {
  /** Meses de colchón con un decimal. `null` si no hay base para calcularlo. */
  readonly months: number | null;
  readonly liquid: Cents;
  /** Gasto medio mensual usado en el cálculo. */
  readonly averageExpense: Cents | null;
  /** Meses completos con movimientos que entran en la media (0 a 6). */
  readonly monthsUsed: number;
}

/**
 * Meses de colchón: saldo líquido de hoy entre el gasto medio mensual de los
 * últimos 6 meses completos con movimientos. Con menos de 6, se usan los
 * disponibles; con ninguno (o sin gasto), no se puede calcular.
 */
export const cushion = (
  ledger: Pick<Ledger, "accounts" | "transactions" | "valuations">,
  today: IsoDate,
): Cushion => {
  const liquid = liquidBalance(ledger, today);
  const currentMonth = monthOf(today);

  const expenseByMonth = new Map<YearMonth, number>();
  for (const transaction of ledger.transactions) {
    if (!isConfirmed(transaction)) continue;
    const month = monthOf(transaction.date);
    if (month >= currentMonth) continue;
    const previous = expenseByMonth.get(month) ?? 0;
    expenseByMonth.set(month, previous + (transaction.type === "expense" ? transaction.amount : 0));
  }

  const recent = [...expenseByMonth.keys()].sort().slice(-6);
  if (recent.length === 0) {
    return { months: null, liquid, averageExpense: null, monthsUsed: 0 };
  }
  const total = recent.reduce((sum, month) => sum + (expenseByMonth.get(month) ?? 0), 0);
  const average = cents(Math.round(total / recent.length));
  if (average <= 0) {
    return { months: null, liquid, averageExpense: average, monthsUsed: recent.length };
  }
  return {
    months: Math.round((liquid / average) * 10) / 10,
    liquid,
    averageExpense: average,
    monthsUsed: recent.length,
  };
};

export type DailyAllowance =
  /** No hay presupuestos de Necesidades ni Deseos: se invita a crearlos. */
  | { readonly kind: "no-budget" }
  /** Te has pasado: el restante es negativo. */
  | { readonly kind: "over"; readonly excess: Cents; readonly daysLeft: number }
  | {
      readonly kind: "ok";
      /** Lo que puedes gastar hoy, redondeado hacia abajo al céntimo. */
      readonly perDay: Cents;
      readonly remaining: Cents;
      readonly daysLeft: number;
    };

/**
 * «Hoy puedes gastar» del mes en curso: lo que queda del presupuesto de
 * Necesidades y Deseos repartido entre los días que faltan, hoy incluido.
 */
export const dailyAllowance = (
  ledger: Pick<Ledger, "accounts" | "transactions" | "budgets">,
  index: CategoryIndex,
  today: IsoDate,
): DailyAllowance => {
  const summary = planSummary(ledger, index, monthOf(today));
  if (summary.needs.budget === null && summary.wants.budget === null) return { kind: "no-budget" };

  const budget = (summary.needs.budget ?? 0) + (summary.wants.budget ?? 0);
  const spent = summary.needs.spent + summary.wants.spent;
  const remaining = cents(budget - spent);
  const daysLeft = daysLeftInMonth(today);

  if (remaining < 0) return { kind: "over", excess: cents(-remaining), daysLeft };
  return {
    kind: "ok",
    perDay: divFloorCents(remaining > 0 ? remaining : ZERO_CENTS, daysLeft),
    remaining,
    daysLeft,
  };
};
