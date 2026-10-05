import { addMonthsYm } from "./dates";
import { cents, ZERO_CENTS } from "./money";
import type { Budget, BudgetId, CategoryId, Cents, YearMonth } from "./types";

/** Ámbito de un presupuesto: una categoría de primer nivel o el grupo Ahorro. */
export type BudgetKey =
  { readonly scope: "category"; readonly categoryId: CategoryId } | { readonly scope: "savings" };

export const categoryKey = (categoryId: CategoryId): BudgetKey => ({
  scope: "category",
  categoryId,
});
export const SAVINGS_KEY: BudgetKey = { scope: "savings" };

const matchesKey = (budget: Budget, key: BudgetKey): boolean =>
  key.scope === "savings"
    ? budget.scope === "savings"
    : budget.scope === "category" && budget.categoryId === key.categoryId;

/** Entre dos versiones del mismo ámbito, gana la más reciente y luego la última editada. */
const isNewer = (candidate: Budget, current: Budget): boolean =>
  candidate.validFrom > current.validFrom ||
  (candidate.validFrom === current.validFrom &&
    (candidate.updatedAt > current.updatedAt ||
      (candidate.updatedAt === current.updatedAt && candidate.id > current.id)));

/** Versión vigente de un ámbito en un mes: la de mayor `validFrom` ≤ mes. */
export const effectiveVersion = (
  budgets: ReadonlyArray<Budget>,
  key: BudgetKey,
  month: YearMonth,
): Budget | null => {
  let current: Budget | null = null;
  for (const budget of budgets) {
    if (!matchesKey(budget, key) || budget.validFrom > month) continue;
    if (current === null || isNewer(budget, current)) current = budget;
  }
  return current;
};

/**
 * Presupuesto efectivo de un ámbito en un mes. `null` si no hay versión o si
 * la versión vigente dice «sin presupuesto».
 */
export const effectiveBudget = (
  budgets: ReadonlyArray<Budget>,
  key: BudgetKey,
  month: YearMonth,
): Cents | null => effectiveVersion(budgets, key, month)?.amount ?? null;

/** Versión declarada exactamente en un mes (no heredada). */
const versionAt = (
  budgets: ReadonlyArray<Budget>,
  key: BudgetKey,
  month: YearMonth,
): Budget | null => {
  let found: Budget | null = null;
  for (const budget of budgets) {
    if (!matchesKey(budget, key) || budget.validFrom !== month) continue;
    if (found === null || isNewer(budget, found)) found = budget;
  }
  return found;
};

export type BudgetEditMode = "fromThisMonth" | "onlyThisMonth";

/** Escritura que la capa de datos debe aplicar para editar un presupuesto. */
export interface BudgetWrite {
  /** Versión existente que se actualiza, o `null` si hay que crear una. */
  readonly id: BudgetId | null;
  readonly key: BudgetKey;
  readonly amount: Cents | null;
  readonly validFrom: YearMonth;
}

/**
 * Planifica la edición del presupuesto de un ámbito en un mes.
 *
 * - "fromThisMonth": crea o actualiza la versión con `validFrom` = mes.
 * - "onlyThisMonth": además, si no existe versión en el mes siguiente, crea una
 *   con el importe que regía antes, para que el cambio no se arrastre.
 */
export const planBudgetEdit = (
  budgets: ReadonlyArray<Budget>,
  key: BudgetKey,
  month: YearMonth,
  amount: Cents | null,
  mode: BudgetEditMode,
): ReadonlyArray<BudgetWrite> => {
  const writes: BudgetWrite[] = [
    { id: versionAt(budgets, key, month)?.id ?? null, key, amount, validFrom: month },
  ];

  if (mode === "onlyThisMonth") {
    const next = addMonthsYm(month, 1);
    if (versionAt(budgets, key, next) === null) {
      writes.push({
        id: null,
        key,
        amount: effectiveBudget(budgets, key, month),
        validFrom: next,
      });
    }
  }
  return writes;
};

export type BudgetState = "ok" | "warning" | "danger";

export interface BudgetStatus {
  /** gastado / presupuestado. `null` si no hay presupuesto. */
  readonly ratio: number | null;
  readonly state: BudgetState;
  /** Exceso sobre el presupuesto (0 si no se ha superado). */
  readonly excess: Cents;
}

/**
 * Estado de un presupuesto: < 80 % "ok", de 80 % a 100 % "warning" y > 100 %
 * "danger". Los umbrales se comparan con enteros para no depender de decimales.
 */
export const budgetStatus = (spent: Cents, budget: Cents | null): BudgetStatus => {
  if (budget === null) return { ratio: null, state: "ok", excess: ZERO_CENTS };
  if (spent > budget) {
    return {
      ratio: budget === 0 ? Number.POSITIVE_INFINITY : spent / budget,
      state: "danger",
      excess: cents(spent - budget),
    };
  }
  const ratio = budget === 0 ? 0 : spent / budget;
  const state: BudgetState = budget > 0 && spent * 100 >= budget * 80 ? "warning" : "ok";
  return { ratio, state, excess: ZERO_CENTS };
};
