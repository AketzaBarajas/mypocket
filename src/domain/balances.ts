import { cents, ZERO_CENTS } from "./money";
import type {
  Account,
  AccountId,
  AccountValuation,
  Cents,
  IsoDate,
  Ledger,
  Transaction,
} from "./types";

/** Un movimiento cuenta en saldos y totales si está confirmado y no borrado. */
export const isConfirmed = (transaction: Transaction): boolean =>
  transaction.status === "confirmed" && !transaction.isDeleted;

/** Efecto con signo de un movimiento sobre una cuenta (0 si no le afecta). */
export const flowFor = (transaction: Transaction, accountId: AccountId): number => {
  let flow = 0;
  if (transaction.accountId === accountId) {
    flow += transaction.type === "income" ? transaction.amount : -transaction.amount;
  }
  if (transaction.type === "transfer" && transaction.toAccountId === accountId) {
    flow += transaction.amount;
  }
  return flow;
};

/** Última valoración de cada cuenta con fecha ≤ `date`. */
export const latestValuations = (
  valuations: ReadonlyArray<AccountValuation>,
  date: IsoDate,
): ReadonlyMap<AccountId, AccountValuation> => {
  const latest = new Map<AccountId, AccountValuation>();
  for (const valuation of valuations) {
    if (valuation.date > date) continue;
    const current = latest.get(valuation.accountId);
    if (
      !current ||
      valuation.date > current.date ||
      (valuation.date === current.date && valuation.createdAt > current.createdAt)
    ) {
      latest.set(valuation.accountId, valuation);
    }
  }
  return latest;
};

interface Window {
  balance: number;
  /** Los movimientos cuentan desde esta fecha… */
  readonly from: IsoDate;
  /** …incluida o no (tras una valoración, solo los posteriores). */
  readonly inclusive: boolean;
}

/**
 * Saldo de todas las cuentas en una fecha, en una sola pasada.
 *
 * - Base: saldo inicial, solo si la fecha es ≥ la de apertura.
 * - Suman y restan los movimientos confirmados, no borrados, con fecha entre la
 *   de apertura y `date`.
 * - Una cuenta de inversión con alguna valoración ≤ `date` vale esa valoración
 *   más los flujos netos posteriores a ella.
 * - Pendientes, borrados y futuros nunca afectan.
 */
export const accountBalances = (
  ledger: Pick<Ledger, "accounts" | "transactions" | "valuations">,
  date: IsoDate,
): ReadonlyMap<AccountId, Cents> => {
  const valuations = latestValuations(ledger.valuations, date);
  const windows = new Map<AccountId, Window>();

  for (const account of ledger.accounts) {
    const valuation = account.type === "investment" ? valuations.get(account.id) : undefined;
    if (valuation) {
      windows.set(account.id, { balance: valuation.value, from: valuation.date, inclusive: false });
    } else {
      windows.set(account.id, {
        balance: date >= account.openingDate ? account.openingBalance : 0,
        from: account.openingDate,
        inclusive: true,
      });
    }
  }

  const apply = (transaction: Transaction, accountId: AccountId | null) => {
    if (accountId === null) return;
    const window = windows.get(accountId);
    if (!window) return;
    const counts = window.inclusive
      ? transaction.date >= window.from
      : transaction.date > window.from;
    if (counts) window.balance += flowFor(transaction, accountId);
  };

  for (const transaction of ledger.transactions) {
    if (!isConfirmed(transaction) || transaction.date > date) continue;
    apply(transaction, transaction.accountId);
    if (transaction.type === "transfer" && transaction.toAccountId !== transaction.accountId) {
      apply(transaction, transaction.toAccountId);
    }
  }

  const balances = new Map<AccountId, Cents>();
  for (const [id, window] of windows) balances.set(id, cents(window.balance));
  return balances;
};

/** Saldo de una cuenta en una fecha. */
export const accountBalance = (
  account: Account,
  ledger: Pick<Ledger, "transactions" | "valuations">,
  date: IsoDate,
): Cents =>
  accountBalances(
    { accounts: [account], transactions: ledger.transactions, valuations: ledger.valuations },
    date,
  ).get(account.id) ?? ZERO_CENTS;

/** Cuenta para el patrimonio: incluida y no archivada. */
export const countsInNetWorth = (account: Account): boolean =>
  account.includeInNetWorth && !account.archived;

/** Patrimonio neto: suma de saldos de las cuentas incluidas y no archivadas. */
export const netWorth = (
  ledger: Pick<Ledger, "accounts" | "transactions" | "valuations">,
  date: IsoDate,
): Cents => {
  const balances = accountBalances(ledger, date);
  let total = 0;
  for (const account of ledger.accounts) {
    if (countsInNetWorth(account)) total += balances.get(account.id) ?? 0;
  }
  return cents(total);
};

/** Cuentas archivadas con saldo distinto de 0: no cuentan y se avisa en Cuentas. */
export const archivedWithBalance = (
  ledger: Pick<Ledger, "accounts" | "transactions" | "valuations">,
  date: IsoDate,
): ReadonlyArray<{ readonly account: Account; readonly balance: Cents }> => {
  const balances = accountBalances(ledger, date);
  return ledger.accounts.flatMap((account) => {
    const balance = balances.get(account.id) ?? ZERO_CENTS;
    return account.archived && balance !== 0 ? [{ account, balance }] : [];
  });
};

/** Saldo líquido: cuentas `isLiquid` no archivadas. */
export const liquidBalance = (
  ledger: Pick<Ledger, "accounts" | "transactions" | "valuations">,
  date: IsoDate,
): Cents => {
  const balances = accountBalances(ledger, date);
  let total = 0;
  for (const account of ledger.accounts) {
    if (account.isLiquid && !account.archived) total += balances.get(account.id) ?? 0;
  }
  return cents(total);
};

export type AccountSection = "daily" | "investment" | "receivable";

/** Sección de la pantalla de Cuentas a la que pertenece cada tipo. */
export const sectionOf = (account: Account): AccountSection =>
  account.type === "investment"
    ? "investment"
    : account.type === "receivable"
      ? "receivable"
      : "daily";

export interface NetWorthBreakdown {
  readonly total: Cents;
  readonly daily: Cents;
  readonly investment: Cents;
  readonly receivable: Cents;
}

/** Reparto del patrimonio entre líquido, inversión y por cobrar. */
export const netWorthBreakdown = (
  ledger: Pick<Ledger, "accounts" | "transactions" | "valuations">,
  date: IsoDate,
): NetWorthBreakdown => {
  const balances = accountBalances(ledger, date);
  const totals: Record<AccountSection, number> = { daily: 0, investment: 0, receivable: 0 };
  for (const account of ledger.accounts) {
    if (countsInNetWorth(account)) totals[sectionOf(account)] += balances.get(account.id) ?? 0;
  }
  return {
    total: cents(totals.daily + totals.investment + totals.receivable),
    daily: cents(totals.daily),
    investment: cents(totals.investment),
    receivable: cents(totals.receivable),
  };
};

/** Un pendiente con fecha pasada está vencido. */
export const isOverdue = (transaction: Transaction, today: IsoDate): boolean =>
  !transaction.isDeleted && transaction.status === "pending" && transaction.date < today;

/** Movimientos «programados»: confirmados con fecha futura. No afectan al saldo. */
export const isScheduled = (transaction: Transaction, today: IsoDate): boolean =>
  isConfirmed(transaction) && transaction.date > today;

/** Variación de una inversión entre su penúltima y su última valoración. */
export const valuationChange = (
  valuations: ReadonlyArray<AccountValuation>,
  accountId: AccountId,
  date: IsoDate,
): { readonly last: AccountValuation; readonly previous: AccountValuation | null } | null => {
  const ordered = valuations
    .filter((valuation) => valuation.accountId === accountId && valuation.date <= date)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const last = ordered[ordered.length - 1];
  if (!last) return null;
  return { last, previous: ordered[ordered.length - 2] ?? null };
};
