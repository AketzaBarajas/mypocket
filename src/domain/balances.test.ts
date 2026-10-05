import { describe, expect, it } from "vitest";

import {
  accountBalance,
  accountBalances,
  archivedWithBalance,
  isOverdue,
  isScheduled,
  liquidBalance,
  netWorth,
  netWorthBreakdown,
  sectionOf,
  valuationChange,
} from "./balances";
import {
  d,
  eur,
  makeAccount,
  makeLedger,
  makeTransaction,
  makeValuation,
} from "./testing/fixtures";

const today = d("2026-10-05");

describe("saldo de una cuenta", () => {
  const account = makeAccount({
    id: "bbva",
    openingBalance: eur(1000),
    openingDate: d("2026-01-01"),
  });
  const other = makeAccount({ id: "cash", type: "cash", openingDate: d("2026-01-01") });

  it("parte del saldo inicial y aplica ingresos, gastos y transferencias", () => {
    const transactions = [
      makeTransaction({
        type: "income",
        amount: eur(500),
        accountId: "bbva",
        date: d("2026-10-01"),
      }),
      makeTransaction({
        type: "expense",
        amount: eur(120.5),
        accountId: "bbva",
        date: d("2026-10-02"),
      }),
      makeTransaction({
        type: "transfer",
        amount: eur(200),
        accountId: "bbva",
        toAccountId: "cash",
        date: d("2026-10-03"),
      }),
      makeTransaction({
        type: "transfer",
        amount: eur(50),
        accountId: "cash",
        toAccountId: "bbva",
        date: d("2026-10-04"),
      }),
    ];
    const ledger = makeLedger({ accounts: [account, other], transactions });
    expect(accountBalance(account, ledger, today)).toBe(eur(1229.5));
    expect(accountBalance(other, ledger, today)).toBe(eur(150));
  });

  it("excluye los movimientos futuros, pendientes y borrados", () => {
    const transactions = [
      makeTransaction({ amount: eur(10), accountId: "bbva", date: d("2026-10-05") }),
      makeTransaction({ amount: eur(100), accountId: "bbva", date: d("2026-10-06") }), // futuro
      makeTransaction({ amount: eur(200), accountId: "bbva", status: "pending" }),
      makeTransaction({ amount: eur(400), accountId: "bbva", isDeleted: true }),
      makeTransaction({ type: "income", amount: eur(800), accountId: "bbva", status: "pending" }),
    ];
    const ledger = makeLedger({ accounts: [account], transactions });
    expect(accountBalance(account, ledger, today)).toBe(eur(990));
    // El futuro cuenta cuando llega su fecha.
    expect(accountBalance(account, ledger, d("2026-10-06"))).toBe(eur(890));
  });

  it("antes de la fecha de apertura el saldo es 0 y los movimientos previos no cuentan", () => {
    const transactions = [
      makeTransaction({ amount: eur(30), accountId: "bbva", date: d("2025-12-31") }),
      makeTransaction({ amount: eur(20), accountId: "bbva", date: d("2026-01-01") }),
    ];
    const ledger = makeLedger({ accounts: [account], transactions });
    expect(accountBalance(account, ledger, d("2025-12-31"))).toBe(0);
    expect(accountBalance(account, ledger, d("2026-01-01"))).toBe(eur(980));
  });

  it("ignora los movimientos de cuentas que no existen", () => {
    const ledger = makeLedger({
      accounts: [account],
      transactions: [
        makeTransaction({
          type: "transfer",
          amount: eur(50),
          accountId: "bbva",
          toAccountId: "ghost",
        }),
        makeTransaction({
          type: "transfer",
          amount: eur(70),
          accountId: "ghost",
          toAccountId: "bbva",
        }),
      ],
    });
    expect(accountBalances(ledger, today).get("bbva")).toBe(eur(1020));
    expect(accountBalances(ledger, today).has("ghost")).toBe(false);
  });

  it("una transferencia a la misma cuenta no altera el saldo", () => {
    const ledger = makeLedger({
      accounts: [account],
      transactions: [
        makeTransaction({
          type: "transfer",
          amount: eur(50),
          accountId: "bbva",
          toAccountId: "bbva",
        }),
      ],
    });
    expect(accountBalance(account, ledger, today)).toBe(eur(1000));
  });
});

describe("cuentas de inversión", () => {
  const broker = makeAccount({
    id: "tr",
    type: "investment",
    isLiquid: false,
    openingBalance: eur(5000),
    openingDate: d("2026-01-01"),
  });
  const bank = makeAccount({ id: "bbva", openingBalance: eur(3000) });

  const transactions = [
    // Aportación anterior a la valoración: ya está dentro del valor.
    makeTransaction({
      type: "transfer",
      amount: eur(300),
      accountId: "bbva",
      toAccountId: "tr",
      date: d("2026-08-15"),
    }),
    // Aportación el mismo día de la valoración: también dentro.
    makeTransaction({
      type: "transfer",
      amount: eur(100),
      accountId: "bbva",
      toAccountId: "tr",
      date: d("2026-09-01"),
    }),
    // Flujos posteriores a la valoración: se suman.
    makeTransaction({
      type: "transfer",
      amount: eur(250),
      accountId: "bbva",
      toAccountId: "tr",
      date: d("2026-09-15"),
    }),
    makeTransaction({
      type: "transfer",
      amount: eur(40),
      accountId: "tr",
      toAccountId: "bbva",
      date: d("2026-09-20"),
    }),
    makeTransaction({ type: "income", amount: eur(12), accountId: "tr", date: d("2026-09-25") }),
  ];
  const valuations = [
    makeValuation({ accountId: "tr", date: d("2026-06-01"), value: eur(5200) }),
    makeValuation({ accountId: "tr", date: d("2026-09-01"), value: eur(6000) }),
  ];
  const ledger = makeLedger({ accounts: [broker, bank], transactions, valuations });

  it("vale la última valoración más los flujos posteriores", () => {
    expect(accountBalance(broker, ledger, today)).toBe(eur(6000 + 250 - 40 + 12));
  });

  it("usa la valoración vigente en cada fecha", () => {
    expect(accountBalance(broker, ledger, d("2026-09-01"))).toBe(eur(6000));
    expect(accountBalance(broker, ledger, d("2026-08-31"))).toBe(eur(5200 + 300));
    expect(accountBalance(broker, ledger, d("2026-06-01"))).toBe(eur(5200));
  });

  it("sin valoraciones hasta la fecha, se calcula como una cuenta normal", () => {
    expect(accountBalance(broker, ledger, d("2026-05-31"))).toBe(eur(5000));
    const noValuations = makeLedger({ accounts: [broker, bank], transactions });
    expect(accountBalance(broker, noValuations, today)).toBe(eur(5000 + 300 + 100 + 250 - 40 + 12));
  });

  it("con dos valoraciones el mismo día gana la última creada", () => {
    const same = makeLedger({
      accounts: [broker],
      valuations: [
        makeValuation({
          accountId: "tr",
          date: d("2026-09-01"),
          value: eur(1),
          createdAt: "2026-09-01T10:00:00.000Z",
        }),
        makeValuation({
          accountId: "tr",
          date: d("2026-09-01"),
          value: eur(2),
          createdAt: "2026-09-01T12:00:00.000Z",
        }),
      ],
    });
    expect(accountBalance(broker, same, today)).toBe(eur(2));
  });

  it("las valoraciones no afectan a cuentas que no son de inversión", () => {
    const withValuation = makeLedger({
      accounts: [bank],
      valuations: [makeValuation({ accountId: "bbva", value: eur(1) })],
    });
    expect(accountBalance(bank, withValuation, today)).toBe(eur(3000));
  });

  it("expone la variación entre las dos últimas valoraciones", () => {
    const change = valuationChange(valuations, "tr", today);
    expect(change?.last.value).toBe(eur(6000));
    expect(change?.previous?.value).toBe(eur(5200));
    expect(valuationChange(valuations, "tr", d("2026-06-15"))?.previous).toBeNull();
    expect(valuationChange(valuations, "tr", d("2026-01-01"))).toBeNull();
  });
});

describe("patrimonio neto", () => {
  const bank = makeAccount({ id: "bbva", openingBalance: eur(1000) });
  const broker = makeAccount({
    id: "tr",
    type: "investment",
    isLiquid: false,
    openingBalance: eur(4000),
  });
  const debts = makeAccount({
    id: "debts",
    type: "receivable",
    isLiquid: false,
    openingBalance: eur(60),
  });
  const excluded = makeAccount({ id: "x", openingBalance: eur(999), includeInNetWorth: false });
  const archived = makeAccount({ id: "old", openingBalance: eur(75), archived: true });
  const archivedEmpty = makeAccount({ id: "old0", archived: true });
  const ledger = makeLedger({ accounts: [bank, broker, debts, excluded, archived, archivedEmpty] });

  it("suma las cuentas incluidas y no archivadas", () => {
    expect(netWorth(ledger, today)).toBe(eur(5060));
  });

  it("avisa de las archivadas con saldo distinto de cero", () => {
    const flagged = archivedWithBalance(ledger, today);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]?.account.id).toBe("old");
    expect(flagged[0]?.balance).toBe(eur(75));
  });

  it("calcula el saldo líquido con las cuentas isLiquid no archivadas", () => {
    // Incluye la cuenta excluida del patrimonio: sigue siendo dinero disponible.
    expect(liquidBalance(ledger, today)).toBe(eur(1999));
  });

  it("reparte entre líquido, inversión y por cobrar", () => {
    expect(netWorthBreakdown(ledger, today)).toEqual({
      total: eur(5060),
      daily: eur(1000),
      investment: eur(4000),
      receivable: eur(60),
    });
    expect(sectionOf(bank)).toBe("daily");
    expect(sectionOf(broker)).toBe("investment");
    expect(sectionOf(debts)).toBe("receivable");
  });

  it("una cena con adelanto deja el patrimonio intacto en la parte adelantada", () => {
    // Cena de 80 €: 30 € son míos y 50 € los adelanto a amigos.
    const dinner = makeLedger({
      accounts: [bank, debts],
      transactions: [
        makeTransaction({ type: "expense", amount: eur(30), accountId: "bbva" }),
        makeTransaction({
          type: "transfer",
          amount: eur(50),
          accountId: "bbva",
          toAccountId: "debts",
        }),
      ],
    });
    expect(accountBalance(bank, dinner, today)).toBe(eur(920));
    expect(accountBalance(debts, dinner, today)).toBe(eur(110));
    // El patrimonio solo baja por mi parte del gasto.
    expect(netWorth(dinner, today)).toBe(eur(1060 - 30));
  });
});

describe("estados de un movimiento", () => {
  it("un pendiente con fecha pasada está vencido", () => {
    expect(isOverdue(makeTransaction({ status: "pending", date: d("2026-10-04") }), today)).toBe(
      true,
    );
    expect(isOverdue(makeTransaction({ status: "pending", date: today }), today)).toBe(false);
    expect(isOverdue(makeTransaction({ status: "confirmed", date: d("2026-10-01") }), today)).toBe(
      false,
    );
    expect(
      isOverdue(
        makeTransaction({ status: "pending", date: d("2026-10-01"), isDeleted: true }),
        today,
      ),
    ).toBe(false);
  });

  it("un confirmado con fecha futura está programado", () => {
    expect(isScheduled(makeTransaction({ date: d("2026-10-06") }), today)).toBe(true);
    expect(isScheduled(makeTransaction({ date: today }), today)).toBe(false);
    expect(isScheduled(makeTransaction({ date: d("2026-10-06"), status: "pending" }), today)).toBe(
      false,
    );
  });
});
