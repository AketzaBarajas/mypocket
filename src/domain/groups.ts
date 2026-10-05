import { isConfirmed } from "./balances";
import {
  budgetStatus,
  type BudgetStatus,
  categoryKey,
  effectiveBudget,
  SAVINGS_KEY,
} from "./budgets";
import { type CategoryIndex, topLevelCategories } from "./categories";
import { cents, percentOfCents, ZERO_CENTS } from "./money";
import { cashflowOf, monthRangeOf, spendingByCategory } from "./spending";
import type {
  Account,
  AccountId,
  AccountType,
  BudgetGroup,
  Category,
  Cents,
  Ledger,
  PlanGroup,
  Transaction,
  YearMonth,
} from "./types";

/** Reparto ideal 50/30/20 sobre los ingresos del mes. */
export const IDEAL_SHARE: Record<PlanGroup, number> = { needs: 50, wants: 30, savings: 20 };

export const GROUP_LABELS: Record<PlanGroup, { readonly name: string; readonly emoji: string }> = {
  needs: { name: "Necesidades", emoji: "🧱" },
  wants: { name: "Deseos", emoji: "✨" },
  savings: { name: "Ahorro", emoji: "🌱" },
};

const SPENDING_TYPES: ReadonlySet<AccountType> = new Set(["checking", "prepaid", "cash"]);
const SAVING_TYPES: ReadonlySet<AccountType> = new Set(["savings", "investment"]);

/**
 * Ahorro aportado en un mes: transferencias confirmadas desde cuentas del día a
 * día (checking, prepaid, cash) hacia ahorro o inversión, menos las inversas.
 */
export const savingsContributed = (
  transactions: ReadonlyArray<Transaction>,
  accounts: ReadonlyArray<Account>,
  month: YearMonth,
): Cents => {
  const typeOf = new Map<AccountId, AccountType>();
  for (const account of accounts) typeOf.set(account.id, account.type);
  const range = monthRangeOf(month);

  let total = 0;
  for (const transaction of transactions) {
    if (
      transaction.type !== "transfer" ||
      transaction.toAccountId === null ||
      !isConfirmed(transaction) ||
      transaction.date < range.from ||
      transaction.date > range.to
    ) {
      continue;
    }
    const from = typeOf.get(transaction.accountId);
    const to = typeOf.get(transaction.toAccountId);
    if (from === undefined || to === undefined) continue;
    if (SPENDING_TYPES.has(from) && SAVING_TYPES.has(to)) total += transaction.amount;
    else if (SAVING_TYPES.has(from) && SPENDING_TYPES.has(to)) total -= transaction.amount;
  }
  return cents(total);
};

export interface CategoryBudgetLine {
  readonly category: Category;
  readonly spent: Cents;
  readonly budget: Cents | null;
  readonly status: BudgetStatus;
}

export interface GroupSummary {
  readonly group: PlanGroup;
  /** Gastado (Necesidades y Deseos) o aportado (Ahorro). */
  readonly spent: Cents;
  /** Suma de presupuestos efectivos. `null` si el grupo no tiene ninguno. */
  readonly budget: Cents | null;
  readonly status: BudgetStatus;
  /** Referencia ideal (50, 30 o 20 % de los ingresos). `null` si no hay ingresos. */
  readonly ideal: Cents | null;
  /** Categorías de primer nivel del grupo (vacío en Ahorro). */
  readonly lines: ReadonlyArray<CategoryBudgetLine>;
  /** Peor estado entre el grupo y sus categorías: decide el color del borde. */
  readonly worstState: BudgetStatus["state"];
}

export interface PlanSummary {
  readonly month: YearMonth;
  readonly income: Cents;
  readonly needs: GroupSummary;
  readonly wants: GroupSummary;
  readonly savings: GroupSummary;
}

const STATE_RANK = { ok: 0, warning: 1, danger: 2 } as const;

const worst = (states: ReadonlyArray<BudgetStatus["state"]>): BudgetStatus["state"] =>
  states.reduce<BudgetStatus["state"]>(
    (acc, state) => (STATE_RANK[state] > STATE_RANK[acc] ? state : acc),
    "ok",
  );

type PlanLedger = Pick<Ledger, "accounts" | "transactions" | "budgets">;

/** Resumen de los grupos 50/30/20 de un mes. */
export const planSummary = (
  ledger: PlanLedger,
  index: CategoryIndex,
  month: YearMonth,
): PlanSummary => {
  const range = monthRangeOf(month);
  const spending = spendingByCategory(ledger.transactions, index, range);
  const { income } = cashflowOf(ledger.transactions, range);
  const ideal = (group: PlanGroup) =>
    income > 0 ? percentOfCents(income, IDEAL_SHARE[group]) : null;

  const spendingGroup = (group: BudgetGroup): GroupSummary => {
    const lines = topLevelCategories(index, "expense", { includeArchived: true })
      .filter((category) => category.budgetGroup === group)
      .map((category): CategoryBudgetLine => {
        const spent = spending.byTopLevel.get(category.id) ?? ZERO_CENTS;
        const budget = effectiveBudget(ledger.budgets, categoryKey(category.id), month);
        return { category, spent, budget, status: budgetStatus(spent, budget) };
      })
      // Las archivadas solo aparecen si ese mes tuvieron gasto o presupuesto.
      .filter((line) => !line.category.archived || line.spent > 0 || line.budget !== null);

    const spent = cents(lines.reduce((sum, line) => sum + line.spent, 0));
    const budgeted = lines.filter((line) => line.budget !== null);
    const budget =
      budgeted.length === 0
        ? null
        : cents(budgeted.reduce((sum, line) => sum + (line.budget ?? 0), 0));
    const status = budgetStatus(spent, budget);
    return {
      group,
      spent,
      budget,
      status,
      ideal: ideal(group),
      lines,
      worstState: worst([status.state, ...lines.map((line) => line.status.state)]),
    };
  };

  const contributed = savingsContributed(ledger.transactions, ledger.accounts, month);
  const savingsBudget = effectiveBudget(ledger.budgets, SAVINGS_KEY, month);

  return {
    month,
    income,
    needs: spendingGroup("needs"),
    wants: spendingGroup("wants"),
    savings: {
      group: "savings",
      spent: contributed,
      budget: savingsBudget,
      // En Ahorro, superar el objetivo es bueno: nunca está en warning ni danger.
      status: {
        ratio: savingsBudget === null || savingsBudget === 0 ? null : contributed / savingsBudget,
        state: "ok",
        excess: ZERO_CENTS,
      },
      ideal: ideal("savings"),
      lines: [],
      worstState: "ok",
    },
  };
};
