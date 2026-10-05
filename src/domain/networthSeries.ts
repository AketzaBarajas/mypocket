import { countsInNetWorth, flowFor, isConfirmed } from "./balances";
import { addDaysIso, addMonthsIso, addMonthsYm, endOfMonthIso, mondayOf, monthOf } from "./dates";
import { cents } from "./money";
import type { Account, AccountId, Cents, IsoDate, Ledger } from "./types";

export const SERIES_RANGES = ["1M", "3M", "6M", "1A", "Todo"] as const;
export type SeriesRange = (typeof SERIES_RANGES)[number];

export interface SeriesPoint {
  readonly date: IsoDate;
  readonly value: Cents;
}

type SeriesLedger = Pick<Ledger, "accounts" | "transactions" | "valuations">;

/** Primera fecha con datos: la apertura, el movimiento o la valoración más antiguos. */
export const firstActivityDate = (ledger: SeriesLedger, today: IsoDate): IsoDate => {
  let first = today;
  for (const account of ledger.accounts)
    if (account.openingDate < first) first = account.openingDate;
  for (const transaction of ledger.transactions) {
    if (isConfirmed(transaction) && transaction.date < first) first = transaction.date;
  }
  for (const valuation of ledger.valuations) if (valuation.date < first) first = valuation.date;
  return first;
};

/**
 * Fechas de muestreo de la serie:
 * - 1M: diario.
 * - 3M y 6M: semanal, cada lunes.
 * - 1A y Todo: fin de mes.
 * El último punto siempre es hoy.
 */
export const seriesDates = (
  range: SeriesRange,
  today: IsoDate,
  firstActivity: IsoDate,
): ReadonlyArray<IsoDate> => {
  const dates: IsoDate[] = [];

  if (range === "1M") {
    for (let date = addMonthsIso(today, -1); date < today; date = addDaysIso(date, 1)) {
      dates.push(date);
    }
  } else if (range === "3M" || range === "6M") {
    const start = addMonthsIso(today, range === "3M" ? -3 : -6);
    let monday = mondayOf(start);
    if (monday < start) monday = addDaysIso(monday, 7);
    for (let date = monday; date < today; date = addDaysIso(date, 7)) dates.push(date);
  } else {
    const start = range === "1A" ? addMonthsIso(today, -12) : firstActivity;
    const currentMonth = monthOf(today);
    for (let month = monthOf(start); month < currentMonth; month = addMonthsYm(month, 1)) {
      const end = endOfMonthIso(month);
      if (end >= start) dates.push(end);
    }
    // Con poco histórico, el primer punto es el arranque para que haya línea.
    if (range === "Todo" && (dates.length === 0 || (dates[0] ?? today) > start) && start < today) {
      dates.unshift(start);
    }
  }

  dates.push(today);
  return dates;
};

interface OpeningEvent {
  readonly kind: 0;
  readonly date: IsoDate;
  readonly account: Account;
}
interface FlowEvent {
  readonly kind: 1;
  readonly date: IsoDate;
  readonly accountId: AccountId;
  readonly amount: number;
}
interface ValuationEvent {
  readonly kind: 2;
  readonly date: IsoDate;
  readonly accountId: AccountId;
  readonly value: number;
  readonly createdAt: string;
}
type SeriesEvent = OpeningEvent | FlowEvent | ValuationEvent;

interface AccountState {
  balance: number;
  /** Ya abierta: por fecha de apertura o por una valoración. */
  opened: boolean;
  valued: boolean;
}

/**
 * Patrimonio neto en una lista ascendente de fechas, calculado de forma
 * incremental: los eventos se ordenan una sola vez y se recorren una sola vez.
 * Produce exactamente los mismos valores que `netWorth` punto a punto.
 */
export const netWorthAt = (
  ledger: SeriesLedger,
  dates: ReadonlyArray<IsoDate>,
): ReadonlyArray<SeriesPoint> => {
  const included = new Map<AccountId, Account>();
  for (const account of ledger.accounts)
    if (countsInNetWorth(account)) included.set(account.id, account);

  const events: SeriesEvent[] = [];
  for (const account of included.values()) {
    events.push({ kind: 0, date: account.openingDate, account });
  }
  for (const transaction of ledger.transactions) {
    if (!isConfirmed(transaction)) continue;
    if (included.has(transaction.accountId)) {
      events.push({
        kind: 1,
        date: transaction.date,
        accountId: transaction.accountId,
        amount: flowFor(transaction, transaction.accountId),
      });
    }
    if (
      transaction.type === "transfer" &&
      transaction.toAccountId !== null &&
      transaction.toAccountId !== transaction.accountId &&
      included.has(transaction.toAccountId)
    ) {
      events.push({
        kind: 1,
        date: transaction.date,
        accountId: transaction.toAccountId,
        amount: transaction.amount,
      });
    }
  }
  for (const valuation of ledger.valuations) {
    if (included.get(valuation.accountId)?.type !== "investment") continue;
    events.push({
      kind: 2,
      date: valuation.date,
      accountId: valuation.accountId,
      value: valuation.value,
      createdAt: valuation.createdAt,
    });
  }

  // En un mismo día: apertura, luego flujos y por último la valoración, que
  // sustituye al saldo (solo cuentan los flujos posteriores a su fecha).
  events.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.kind - b.kind ||
      (a.kind === 2 && b.kind === 2 ? a.createdAt.localeCompare(b.createdAt) : 0),
  );

  const states = new Map<AccountId, AccountState>();
  for (const id of included.keys()) states.set(id, { balance: 0, opened: false, valued: false });

  let total = 0;
  let cursor = 0;
  const points: SeriesPoint[] = [];

  for (const date of dates) {
    for (let event = events[cursor]; event && event.date <= date; event = events[++cursor]) {
      const state = states.get(event.kind === 0 ? event.account.id : event.accountId);
      if (!state) continue;
      const before = state.balance;
      if (event.kind === 0) {
        if (!state.valued) state.balance += event.account.openingBalance;
        state.opened = true;
      } else if (event.kind === 1) {
        if (state.opened) state.balance += event.amount;
      } else {
        state.balance = event.value;
        state.opened = true;
        state.valued = true;
      }
      total += state.balance - before;
    }
    points.push({ date, value: cents(total) });
  }

  return points;
};

/** Serie histórica de patrimonio para un rango. */
export const netWorthSeries = (
  ledger: SeriesLedger,
  range: SeriesRange,
  today: IsoDate,
): ReadonlyArray<SeriesPoint> =>
  netWorthAt(ledger, seriesDates(range, today, firstActivityDate(ledger, today)));

export interface SeriesChange {
  readonly amount: Cents;
  /** Variación relativa, o `null` si el valor inicial es 0. */
  readonly ratio: number | null;
}

/** Variación entre el primer y el último punto de una serie. */
export const seriesChange = (points: ReadonlyArray<SeriesPoint>): SeriesChange => {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return { amount: cents(0), ratio: null };
  const amount = cents(last.value - first.value);
  return { amount, ratio: first.value === 0 ? null : amount / Math.abs(first.value) };
};

/** Variación del patrimonio en los últimos `days` días. */
export const netWorthChange = (ledger: SeriesLedger, today: IsoDate, days = 30): SeriesChange =>
  seriesChange(netWorthAt(ledger, [addDaysIso(today, -days), today]));

/** Saldo de una cuenta a lo largo del tiempo (detalle de cuenta). */
export const accountSeries = (
  account: Account,
  ledger: Pick<Ledger, "transactions" | "valuations">,
  range: SeriesRange,
  today: IsoDate,
): ReadonlyArray<SeriesPoint> => {
  const scoped: SeriesLedger = {
    // La serie de una cuenta la muestra aunque esté excluida del patrimonio o archivada.
    accounts: [{ ...account, includeInNetWorth: true, archived: false }],
    transactions: ledger.transactions,
    valuations: ledger.valuations,
  };
  return netWorthSeries(scoped, range, today);
};
