import { describe, expect, it } from "vitest";

import { netWorth } from "./balances";
import { addDaysIso, diffDays, mondayOf, monthOf, endOfMonthIso } from "./dates";
import { cents } from "./money";
import {
  accountSeries,
  firstActivityDate,
  netWorthAt,
  netWorthChange,
  netWorthSeries,
  seriesChange,
  seriesDates,
} from "./networthSeries";
import {
  d,
  eur,
  makeAccount,
  makeLedger,
  makeTransaction,
  makeValuation,
} from "./testing/fixtures";
import type { Account, AccountValuation, Transaction } from "./types";

const today = d("2026-10-05");

describe("fechas de muestreo", () => {
  it("1M es diario y termina hoy", () => {
    const dates = seriesDates("1M", today, d("2020-01-01"));
    expect(dates[0]).toBe("2026-09-05");
    expect(dates.at(-1)).toBe(today);
    expect(dates).toHaveLength(31);
    dates.slice(1).forEach((date, index) => {
      expect(diffDays(date, dates[index] ?? date)).toBe(1);
    });
  });

  it.each([
    ["3M", "2026-07-05"],
    ["6M", "2026-04-05"],
  ] as const)("%s es semanal, cada lunes, y termina hoy", (range, start) => {
    const dates = seriesDates(range, today, d("2020-01-01"));
    expect(dates.at(-1)).toBe(today);
    const mondays = dates.slice(0, -1);
    expect(mondays.length).toBeGreaterThan(10);
    for (const date of mondays) {
      expect(mondayOf(date)).toBe(date);
      expect(date >= d(start)).toBe(true);
      expect(date < today).toBe(true);
    }
  });

  it("si hoy es lunes no se repite el último punto", () => {
    const dates = seriesDates("3M", today, d("2020-01-01")); // 5 oct 2026 es lunes
    expect(new Set(dates).size).toBe(dates.length);
  });

  it("1A usa fines de mes y termina hoy", () => {
    const dates = seriesDates("1A", today, d("2020-01-01"));
    expect(dates.at(-1)).toBe(today);
    expect(dates).toHaveLength(13);
    for (const date of dates.slice(0, -1)) expect(endOfMonthIso(monthOf(date))).toBe(date);
    expect(dates[0]).toBe("2025-10-31");
    expect(dates.at(-2)).toBe("2026-09-30");
  });

  it("Todo arranca en la primera actividad", () => {
    const dates = seriesDates("Todo", today, d("2026-07-15"));
    expect(dates).toEqual(["2026-07-15", "2026-07-31", "2026-08-31", "2026-09-30", today]);
    // Sin histórico, solo queda el punto de hoy.
    expect(seriesDates("Todo", today, today)).toEqual([today]);
  });

  it("encuentra la primera fecha con datos", () => {
    const ledger = makeLedger({
      accounts: [makeAccount({ id: "a", openingDate: d("2026-03-01") })],
      transactions: [
        makeTransaction({ accountId: "a", date: d("2026-02-10") }),
        makeTransaction({ accountId: "a", date: d("2025-01-01"), isDeleted: true }),
      ],
      valuations: [makeValuation({ accountId: "a", date: d("2026-01-20") })],
    });
    expect(firstActivityDate(ledger, today)).toBe("2026-01-20");
    expect(firstActivityDate(makeLedger(), today)).toBe(today);
  });
});

/** Generador pseudoaleatorio determinista (mulberry32). */
const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const randomLedger = (seed: number) => {
  const next = random(seed);
  const pick = <T>(items: ReadonlyArray<T>): T => items[Math.floor(next() * items.length)] as T;
  const day = () => addDaysIso(d("2025-06-01"), Math.floor(next() * 520));

  const accounts: Account[] = [
    makeAccount({ id: "bank", openingBalance: eur(2000), openingDate: d("2025-06-01") }),
    makeAccount({
      id: "cash",
      type: "cash",
      openingBalance: eur(100),
      openingDate: d("2025-09-10"),
    }),
    makeAccount({
      id: "broker",
      type: "investment",
      isLiquid: false,
      openingBalance: eur(5000),
      openingDate: d("2025-08-01"),
    }),
    makeAccount({
      id: "late",
      type: "investment",
      isLiquid: false,
      openingBalance: eur(700),
      openingDate: d("2026-05-01"),
    }),
    makeAccount({ id: "debts", type: "receivable", isLiquid: false, openingDate: d("2025-06-01") }),
    makeAccount({ id: "hidden", openingBalance: eur(900), includeInNetWorth: false }),
    makeAccount({ id: "old", openingBalance: eur(50), archived: true }),
  ];
  const ids = accounts.map((account) => account.id);

  const transactions: Transaction[] = Array.from({ length: 400 }, () => {
    const type = pick(["expense", "expense", "income", "transfer"] as const);
    const accountId = pick(ids);
    return makeTransaction({
      type,
      amount: cents(1 + Math.floor(next() * 50_000)),
      accountId,
      toAccountId: type === "transfer" ? pick(ids) : null,
      date: day(),
      status: next() < 0.1 ? "pending" : "confirmed",
      isDeleted: next() < 0.05,
    });
  });

  const valuations: AccountValuation[] = Array.from({ length: 25 }, () =>
    makeValuation({
      accountId: pick(["broker", "late", "bank"]),
      date: day(),
      value: cents(Math.floor(next() * 1_000_000)),
    }),
  );
  return makeLedger({ accounts, transactions, valuations });
};

describe("serie incremental", () => {
  it.each([1, 7, 42, 2026])("coincide con el cálculo punto a punto (semilla %d)", (seed) => {
    const ledger = randomLedger(seed);
    for (const range of ["1M", "3M", "6M", "1A", "Todo"] as const) {
      const series = netWorthSeries(ledger, range, today);
      expect(series.length).toBeGreaterThan(0);
      for (const point of series) {
        expect(point.value, `${range} · ${point.date}`).toBe(netWorth(ledger, point.date));
      }
    }
  });

  it("coincide también día a día, incluidos los días con valoración", () => {
    const ledger = randomLedger(99);
    const dates = Array.from({ length: 560 }, (_, index) => addDaysIso(d("2025-05-25"), index));
    for (const point of netWorthAt(ledger, dates)) {
      expect(point.value, point.date).toBe(netWorth(ledger, point.date));
    }
  });

  it("solo produce enteros", () => {
    for (const point of netWorthSeries(randomLedger(3), "Todo", today)) {
      expect(Number.isInteger(point.value)).toBe(true);
    }
  });

  it("refleja una valoración nueva en el último punto", () => {
    const broker = makeAccount({ id: "tr", type: "investment", openingBalance: eur(1000) });
    const before = makeLedger({ accounts: [broker] });
    const after = makeLedger({
      accounts: [broker],
      valuations: [makeValuation({ accountId: "tr", date: today, value: eur(1500) })],
    });
    expect(netWorthSeries(before, "1M", today).at(-1)?.value).toBe(eur(1000));
    expect(netWorthSeries(after, "1M", today).at(-1)?.value).toBe(eur(1500));
    expect(netWorthSeries(after, "1M", today).at(-2)?.value).toBe(eur(1000));
  });
});

describe("variación", () => {
  it("calcula la variación en euros y en porcentaje", () => {
    const change = seriesChange([
      { date: d("2026-09-05"), value: eur(1000) },
      { date: today, value: eur(1100) },
    ]);
    expect(change.amount).toBe(eur(100));
    expect(change.ratio).toBeCloseTo(0.1);
  });

  it("sin base no hay porcentaje", () => {
    expect(seriesChange([]).ratio).toBeNull();
    expect(
      seriesChange([
        { date: d("2026-09-05"), value: eur(0) },
        { date: today, value: eur(50) },
      ]).ratio,
    ).toBeNull();
  });

  it("compara el patrimonio con el de hace 30 días", () => {
    const ledger = makeLedger({
      accounts: [makeAccount({ id: "a", openingBalance: eur(1000), openingDate: d("2026-01-01") })],
      transactions: [
        makeTransaction({
          type: "income",
          amount: eur(250),
          accountId: "a",
          date: d("2026-09-20"),
        }),
      ],
    });
    const change = netWorthChange(ledger, today);
    expect(change.amount).toBe(eur(250));
    expect(change.ratio).toBeCloseTo(0.25);
  });

  it("la serie de una cuenta ignora si está archivada o excluida", () => {
    const account = makeAccount({
      id: "old",
      openingBalance: eur(300),
      archived: true,
      includeInNetWorth: false,
    });
    const series = accountSeries(account, makeLedger(), "1M", today);
    expect(series.at(-1)?.value).toBe(eur(300));
  });
});
