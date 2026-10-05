import { isConfirmed } from "./balances";
import { diffMonths, monthOf } from "./dates";
import { cents } from "./money";
import type {
  Account,
  AccountId,
  AccountType,
  Cents,
  Goal,
  GoalId,
  IsoDate,
  Transaction,
} from "./types";

const isSavingType = (type: AccountType | undefined): boolean =>
  type === "savings" || type === "investment";

export interface GoalContribution {
  readonly transaction: Transaction;
  /** Positivo si aporta a la meta, negativo si retira. */
  readonly amount: Cents;
}

export interface GoalProgress {
  readonly goal: Goal;
  readonly progress: Cents;
  /** progreso / objetivo (puede superar 1). */
  readonly ratio: number;
  readonly reached: boolean;
  /** Aportación mensual necesaria para llegar a tiempo. `null` sin fecha o si ya se alcanzó. */
  readonly monthlyNeeded: Cents | null;
  readonly contributions: ReadonlyArray<GoalContribution>;
}

/**
 * Aportaciones de una meta: transferencias confirmadas con su `goalId` cuyo
 * destino es ahorro o inversión (suman) y las que salen de ahorro o inversión
 * hacia una cuenta no inversora (restan).
 */
export const goalContributions = (
  goalId: GoalId,
  transactions: ReadonlyArray<Transaction>,
  accounts: ReadonlyArray<Account>,
): ReadonlyArray<GoalContribution> => {
  const typeOf = new Map<AccountId, AccountType>();
  for (const account of accounts) typeOf.set(account.id, account.type);

  const contributions: GoalContribution[] = [];
  for (const transaction of transactions) {
    if (
      transaction.goalId !== goalId ||
      transaction.type !== "transfer" ||
      transaction.toAccountId === null ||
      !isConfirmed(transaction)
    ) {
      continue;
    }
    const toSaving = isSavingType(typeOf.get(transaction.toAccountId));
    const fromSaving = isSavingType(typeOf.get(transaction.accountId));
    if (toSaving) contributions.push({ transaction, amount: transaction.amount });
    else if (fromSaving) contributions.push({ transaction, amount: cents(-transaction.amount) });
  }
  return contributions.sort(
    (a, b) =>
      b.transaction.date.localeCompare(a.transaction.date) ||
      b.transaction.createdAt.localeCompare(a.transaction.createdAt),
  );
};

/** Progreso de una meta y lo que hace falta aportar al mes para llegar a tiempo. */
export const goalProgress = (
  goal: Goal,
  transactions: ReadonlyArray<Transaction>,
  accounts: ReadonlyArray<Account>,
  today: IsoDate,
): GoalProgress => {
  const contributions = goalContributions(goal.id, transactions, accounts);
  const progress = cents(contributions.reduce((sum, item) => sum + item.amount, 0));
  const ratio = goal.targetAmount > 0 ? progress / goal.targetAmount : 0;
  const reached = goal.targetAmount > 0 && progress >= goal.targetAmount;

  let monthlyNeeded: Cents | null = null;
  if (goal.targetDate !== null && !reached) {
    const monthsLeft = Math.max(1, diffMonths(monthOf(goal.targetDate), monthOf(today)));
    monthlyNeeded = cents(Math.ceil((goal.targetAmount - progress) / monthsLeft));
  }

  return { goal, progress, ratio, reached, monthlyNeeded, contributions };
};
