import { describe, expect, it } from "vitest";

import {
  budgetStatus,
  categoryKey,
  effectiveBudget,
  effectiveVersion,
  planBudgetEdit,
  SAVINGS_KEY,
} from "./budgets";
import { buildCategoryIndex } from "./categories";
import { IDEAL_SHARE, planSummary, savingsContributed } from "./groups";
import { cushion, dailyAllowance, savingsRate } from "./metrics";
import { cents } from "./money";
import {
  cashflowOf,
  incomeByCategory,
  monthlyCashflow,
  monthRangeOf,
  spendingByCategory,
  yearRangeOf,
} from "./spending";
import {
  d,
  eur,
  makeAccount,
  makeBudget,
  makeCategoryTree,
  makeLedger,
  makeTransaction,
  ym,
} from "./testing/fixtures";
import type { Budget } from "./types";

const food = categoryKey("food");

/** Aplica las escrituras planificadas a una lista de presupuestos. */
const apply = (budgets: ReadonlyArray<Budget>, writes: ReturnType<typeof planBudgetEdit>) => {
  let next = [...budgets];
  for (const write of writes) {
    if (write.id !== null) {
      next = next.map((budget) =>
        budget.id === write.id
          ? { ...budget, amount: write.amount, updatedAt: "2099-01-01T00:00:00.000Z" }
          : budget,
      );
    } else {
      next.push(
        makeBudget({
          scope: write.key.scope,
          categoryId: write.key.scope === "category" ? write.key.categoryId : null,
          amount: write.amount,
          validFrom: write.validFrom,
        }),
      );
    }
  }
  return next;
};

describe("presupuestos versionados", () => {
  const budgets = [
    makeBudget({ categoryId: "food", amount: eur(300), validFrom: ym("2026-01") }),
    makeBudget({ categoryId: "food", amount: eur(350), validFrom: ym("2026-06") }),
    makeBudget({ categoryId: "leisure", amount: eur(80), validFrom: ym("2026-03") }),
    makeBudget({ scope: "savings", categoryId: null, amount: eur(400), validFrom: ym("2026-02") }),
  ];

  it("rige la versión con mayor validFrom que no supere el mes", () => {
    expect(effectiveBudget(budgets, food, ym("2025-12"))).toBeNull();
    expect(effectiveBudget(budgets, food, ym("2026-01"))).toBe(eur(300));
    expect(effectiveBudget(budgets, food, ym("2026-05"))).toBe(eur(300));
    expect(effectiveBudget(budgets, food, ym("2026-06"))).toBe(eur(350));
    expect(effectiveBudget(budgets, food, ym("2027-12"))).toBe(eur(350));
  });

  it("separa los ámbitos", () => {
    expect(effectiveBudget(budgets, categoryKey("leisure"), ym("2026-10"))).toBe(eur(80));
    expect(effectiveBudget(budgets, SAVINGS_KEY, ym("2026-10"))).toBe(eur(400));
    expect(effectiveBudget(budgets, SAVINGS_KEY, ym("2026-01"))).toBeNull();
    expect(effectiveBudget(budgets, categoryKey("unknown"), ym("2026-10"))).toBeNull();
  });

  it("un importe null significa sin presupuesto desde ese mes", () => {
    const closed = [
      ...budgets,
      makeBudget({ categoryId: "food", amount: null, validFrom: ym("2026-09") }),
    ];
    expect(effectiveBudget(closed, food, ym("2026-08"))).toBe(eur(350));
    expect(effectiveBudget(closed, food, ym("2026-09"))).toBeNull();
    expect(effectiveVersion(closed, food, ym("2026-10"))?.validFrom).toBe("2026-09");
  });

  it("entre duplicados del mismo mes gana el último editado", () => {
    const duplicated = [
      makeBudget({
        categoryId: "food",
        amount: eur(1),
        validFrom: ym("2026-07"),
        updatedAt: "2026-07-01T10:00:00.000Z",
      }),
      makeBudget({
        categoryId: "food",
        amount: eur(2),
        validFrom: ym("2026-07"),
        updatedAt: "2026-07-01T12:00:00.000Z",
      }),
    ];
    expect(effectiveBudget(duplicated, food, ym("2026-07"))).toBe(eur(2));
    expect(effectiveBudget([...duplicated].reverse(), food, ym("2026-07"))).toBe(eur(2));
  });

  describe("editar «desde este mes»", () => {
    it("crea la versión del mes y se arrastra hacia delante", () => {
      const writes = planBudgetEdit(budgets, food, ym("2026-10"), eur(420), "fromThisMonth");
      expect(writes).toEqual([{ id: null, key: food, amount: eur(420), validFrom: "2026-10" }]);
      const next = apply(budgets, writes);
      expect(effectiveBudget(next, food, ym("2026-09"))).toBe(eur(350));
      expect(effectiveBudget(next, food, ym("2026-10"))).toBe(eur(420));
      expect(effectiveBudget(next, food, ym("2027-03"))).toBe(eur(420));
    });

    it("actualiza la versión si ya existe en ese mes", () => {
      const existing = budgets[1];
      const writes = planBudgetEdit(budgets, food, ym("2026-06"), eur(360), "fromThisMonth");
      expect(writes).toEqual([
        { id: existing?.id, key: food, amount: eur(360), validFrom: "2026-06" },
      ]);
      expect(apply(budgets, writes)).toHaveLength(budgets.length);
    });

    it("permite quitar el presupuesto", () => {
      const next = apply(
        budgets,
        planBudgetEdit(budgets, food, ym("2026-10"), null, "fromThisMonth"),
      );
      expect(effectiveBudget(next, food, ym("2026-10"))).toBeNull();
      expect(effectiveBudget(next, food, ym("2026-09"))).toBe(eur(350));
    });
  });

  describe("editar «solo este mes»", () => {
    it("crea la versión del mes y restaura el importe anterior en el siguiente", () => {
      const writes = planBudgetEdit(budgets, food, ym("2026-10"), eur(500), "onlyThisMonth");
      expect(writes).toEqual([
        { id: null, key: food, amount: eur(500), validFrom: "2026-10" },
        { id: null, key: food, amount: eur(350), validFrom: "2026-11" },
      ]);
      const next = apply(budgets, writes);
      expect(effectiveBudget(next, food, ym("2026-09"))).toBe(eur(350));
      expect(effectiveBudget(next, food, ym("2026-10"))).toBe(eur(500));
      expect(effectiveBudget(next, food, ym("2026-11"))).toBe(eur(350));
      expect(effectiveBudget(next, food, ym("2027-06"))).toBe(eur(350));
    });

    it("no toca el mes siguiente si ya tiene versión propia", () => {
      const withNext = [
        ...budgets,
        makeBudget({ categoryId: "food", amount: eur(390), validFrom: ym("2026-11") }),
      ];
      const writes = planBudgetEdit(withNext, food, ym("2026-10"), eur(500), "onlyThisMonth");
      expect(writes).toHaveLength(1);
      const next = apply(withNext, writes);
      expect(effectiveBudget(next, food, ym("2026-10"))).toBe(eur(500));
      expect(effectiveBudget(next, food, ym("2026-11"))).toBe(eur(390));
    });

    it("si antes no había presupuesto, el mes siguiente vuelve a no tenerlo", () => {
      const writes = planBudgetEdit(
        budgets,
        categoryKey("gifts"),
        ym("2026-10"),
        eur(60),
        "onlyThisMonth",
      );
      const next = apply(budgets, writes);
      expect(effectiveBudget(next, categoryKey("gifts"), ym("2026-10"))).toBe(eur(60));
      expect(effectiveBudget(next, categoryKey("gifts"), ym("2026-11"))).toBeNull();
    });

    it("funciona también para el grupo Ahorro", () => {
      const next = apply(
        budgets,
        planBudgetEdit(budgets, SAVINGS_KEY, ym("2026-10"), eur(100), "onlyThisMonth"),
      );
      expect(effectiveBudget(next, SAVINGS_KEY, ym("2026-10"))).toBe(eur(100));
      expect(effectiveBudget(next, SAVINGS_KEY, ym("2026-11"))).toBe(eur(400));
    });
  });
});

describe("estado del presupuesto", () => {
  const budget = eur(100);

  it.each([
    [79, "ok"],
    [79.99, "ok"],
    [80, "warning"],
    [100, "warning"],
    [100.01, "danger"],
    [101, "danger"],
    [0, "ok"],
  ] as const)("con el %d %% gastado está en %s", (spent, state) => {
    expect(budgetStatus(eur(spent), budget).state).toBe(state);
  });

  it("muestra el exceso en euros solo cuando se supera", () => {
    expect(budgetStatus(eur(101), budget).excess).toBe(eur(1));
    expect(budgetStatus(eur(127), budget).excess).toBe(eur(27));
    expect(budgetStatus(eur(100), budget).excess).toBe(0);
    expect(budgetStatus(eur(80), budget).ratio).toBeCloseTo(0.8);
  });

  it("sin presupuesto no hay porcentaje ni alarma", () => {
    expect(budgetStatus(eur(500), null)).toEqual({ ratio: null, state: "ok", excess: 0 });
  });

  it("con presupuesto 0 cualquier gasto es exceso", () => {
    expect(budgetStatus(eur(0), cents(0)).state).toBe("ok");
    const over = budgetStatus(eur(5), cents(0));
    expect(over.state).toBe("danger");
    expect(over.excess).toBe(eur(5));
  });
});

describe("gasto por categoría", () => {
  const tree = makeCategoryTree();
  const transactions = [
    makeTransaction({ amount: eur(40), categoryId: "supermarket", date: d("2026-10-02") }),
    makeTransaction({ amount: eur(15), categoryId: "market", date: d("2026-10-03") }),
    makeTransaction({ amount: eur(620), categoryId: "rent", date: d("2026-10-01") }),
    makeTransaction({ amount: eur(25), categoryId: "gifts", date: d("2026-10-31") }),
    makeTransaction({ amount: eur(99), categoryId: "gifts", date: d("2026-11-01") }), // otro mes
    makeTransaction({
      amount: eur(99),
      categoryId: "gifts",
      date: d("2026-10-10"),
      status: "pending",
    }),
    makeTransaction({
      amount: eur(99),
      categoryId: "gifts",
      date: d("2026-10-10"),
      isDeleted: true,
    }),
    makeTransaction({
      type: "income",
      amount: eur(2000),
      categoryId: "salary",
      date: d("2026-10-01"),
    }),
    makeTransaction({
      type: "transfer",
      amount: eur(300),
      toAccountId: "x",
      date: d("2026-10-05"),
    }),
  ];
  const october = monthRangeOf(ym("2026-10"));

  it("atribuye cada gasto a su hoja y a su categoría de primer nivel", () => {
    const totals = spendingByCategory(transactions, tree.index, october);
    expect(totals.byLeaf.get("supermarket")).toBe(eur(40));
    expect(totals.byLeaf.get("market")).toBe(eur(15));
    expect(totals.byTopLevel.get("food")).toBe(eur(55));
    expect(totals.byTopLevel.get("housing")).toBe(eur(620));
    // Una categoría sin madre es a la vez hoja y primer nivel.
    expect(totals.byLeaf.get("gifts")).toBe(eur(25));
    expect(totals.byTopLevel.get("gifts")).toBe(eur(25));
    expect(totals.total).toBe(eur(700));
    expect(totals.byTopLevel.has("salary")).toBe(false);
  });

  it("calcula ingresos por categoría y el flujo del mes sin transferencias", () => {
    expect(incomeByCategory(transactions, tree.index, october).total).toBe(eur(2000));
    expect(cashflowOf(transactions, october)).toEqual({
      income: eur(2000),
      expense: eur(700),
      net: eur(1300),
    });
    expect(cashflowOf(transactions, yearRangeOf(2026)).expense).toBe(eur(799));
  });

  it("agrupa el flujo por meses en una pasada", () => {
    const flow = monthlyCashflow(transactions, [ym("2026-09"), ym("2026-10"), ym("2026-11")]);
    expect(flow.map((month) => month.expense)).toEqual([0, eur(700), eur(99)]);
    expect(flow.map((month) => month.income)).toEqual([0, eur(2000), 0]);
    expect(flow[1]?.net).toBe(eur(1300));
  });
});

describe("grupos 50/30/20", () => {
  const tree = makeCategoryTree();
  const bank = makeAccount({ id: "bank" });
  const cash = makeAccount({ id: "cash", type: "cash" });
  const savings = makeAccount({ id: "savings", type: "savings" });
  const broker = makeAccount({ id: "broker", type: "investment", isLiquid: false });
  const debts = makeAccount({ id: "debts", type: "receivable", isLiquid: false });
  const accounts = [bank, cash, savings, broker, debts];
  const month = ym("2026-10");

  const budgets = [
    makeBudget({ categoryId: "food", amount: eur(300) }),
    makeBudget({ categoryId: "housing", amount: eur(650) }),
    makeBudget({ categoryId: "leisure", amount: eur(100) }),
    makeBudget({ scope: "savings", categoryId: null, amount: eur(400) }),
  ];
  const transactions = [
    makeTransaction({
      type: "income",
      amount: eur(2000),
      categoryId: "salary",
      accountId: "bank",
      date: d("2026-10-01"),
    }),
    makeTransaction({
      amount: eur(250),
      categoryId: "supermarket",
      accountId: "bank",
      date: d("2026-10-02"),
    }),
    makeTransaction({
      amount: eur(620),
      categoryId: "rent",
      accountId: "bank",
      date: d("2026-10-01"),
    }),
    makeTransaction({
      amount: eur(130),
      categoryId: "leisure",
      accountId: "bank",
      date: d("2026-10-03"),
    }),
    makeTransaction({
      amount: eur(20),
      categoryId: "gifts",
      accountId: "bank",
      date: d("2026-10-04"),
    }),
    // Ahorro: ida y vuelta.
    makeTransaction({
      type: "transfer",
      amount: eur(300),
      accountId: "bank",
      toAccountId: "broker",
      date: d("2026-10-05"),
    }),
    makeTransaction({
      type: "transfer",
      amount: eur(150),
      accountId: "cash",
      toAccountId: "savings",
      date: d("2026-10-06"),
    }),
    makeTransaction({
      type: "transfer",
      amount: eur(80),
      accountId: "savings",
      toAccountId: "bank",
      date: d("2026-10-07"),
    }),
    // No cuentan: entre cuentas de ahorro, hacia «por cobrar», pendiente y otro mes.
    makeTransaction({
      type: "transfer",
      amount: eur(999),
      accountId: "savings",
      toAccountId: "broker",
      date: d("2026-10-08"),
    }),
    makeTransaction({
      type: "transfer",
      amount: eur(999),
      accountId: "bank",
      toAccountId: "debts",
      date: d("2026-10-08"),
    }),
    makeTransaction({
      type: "transfer",
      amount: eur(999),
      accountId: "bank",
      toAccountId: "broker",
      date: d("2026-10-09"),
      status: "pending",
    }),
    makeTransaction({
      type: "transfer",
      amount: eur(999),
      accountId: "bank",
      toAccountId: "broker",
      date: d("2026-09-30"),
    }),
  ];
  const ledger = makeLedger({ accounts, categories: [...tree.categories], transactions, budgets });

  it("suma gasto y presupuesto de las categorías de cada grupo", () => {
    const summary = planSummary(ledger, tree.index, month);
    expect(summary.income).toBe(eur(2000));
    expect(summary.needs.spent).toBe(eur(870));
    expect(summary.needs.budget).toBe(eur(950));
    expect(summary.needs.status.state).toBe("warning");
    expect(summary.wants.spent).toBe(eur(150));
    // Regalos no tiene presupuesto: no suma al presupuestado, pero sí al gastado.
    expect(summary.wants.budget).toBe(eur(100));
    expect(summary.wants.status.state).toBe("danger");
    expect(summary.wants.status.excess).toBe(eur(50));
  });

  it("las subcategorías heredan el grupo de su madre", () => {
    const summary = planSummary(ledger, tree.index, month);
    const foodLine = summary.needs.lines.find((line) => line.category.id === "food");
    expect(foodLine?.spent).toBe(eur(250));
    expect(foodLine?.status.state).toBe("warning");
    expect(summary.needs.lines.map((line) => line.category.id)).toEqual(["food", "housing"]);
  });

  it("marca el grupo con el peor estado de sus categorías", () => {
    const summary = planSummary(ledger, tree.index, month);
    expect(summary.needs.worstState).toBe("warning");
    expect(summary.wants.worstState).toBe("danger");
    expect(summary.savings.worstState).toBe("ok");
  });

  it("calcula el ahorro con transferencias de ida y vuelta", () => {
    expect(savingsContributed(transactions, accounts, month)).toBe(eur(300 + 150 - 80));
    const summary = planSummary(ledger, tree.index, month);
    expect(summary.savings.spent).toBe(eur(370));
    expect(summary.savings.budget).toBe(eur(400));
    expect(summary.savings.status.ratio).toBeCloseTo(0.925);
  });

  it("el ahorro puede ser negativo si se retira más de lo que se aporta", () => {
    const withdrawals = [
      makeTransaction({
        type: "transfer",
        amount: eur(500),
        accountId: "broker",
        toAccountId: "bank",
        date: d("2026-10-02"),
      }),
      makeTransaction({
        type: "transfer",
        amount: eur(100),
        accountId: "bank",
        toAccountId: "savings",
        date: d("2026-10-03"),
      }),
    ];
    expect(savingsContributed(withdrawals, accounts, month)).toBe(eur(-400));
  });

  it("da la referencia ideal sobre los ingresos del mes", () => {
    const summary = planSummary(ledger, tree.index, month);
    expect(summary.needs.ideal).toBe(eur(1000));
    expect(summary.wants.ideal).toBe(eur(600));
    expect(summary.savings.ideal).toBe(eur(400));
    expect(IDEAL_SHARE.needs + IDEAL_SHARE.wants + IDEAL_SHARE.savings).toBe(100);
  });

  it("sin ingresos en el mes, oculta la referencia ideal", () => {
    const summary = planSummary(ledger, tree.index, ym("2026-11"));
    expect(summary.income).toBe(0);
    expect(summary.needs.ideal).toBeNull();
    expect(summary.wants.ideal).toBeNull();
    expect(summary.savings.ideal).toBeNull();
  });

  it("un grupo sin ningún presupuesto no tiene presupuestado", () => {
    const bare = makeLedger({ accounts, categories: [...tree.categories], transactions });
    const summary = planSummary(bare, tree.index, month);
    expect(summary.needs.budget).toBeNull();
    expect(summary.needs.status.state).toBe("ok");
    expect(summary.savings.budget).toBeNull();
    expect(summary.savings.status.ratio).toBeNull();
  });

  it("una categoría archivada solo aparece si tuvo gasto o presupuesto ese mes", () => {
    const archived = tree.categories.map((category) =>
      category.id === "gifts" || category.id === "leisure"
        ? { ...category, archived: true }
        : category,
    );
    const index = buildCategoryIndex(archived);
    const summary = planSummary({ ...ledger, budgets: budgets.slice(0, 2) }, index, month);
    expect(summary.wants.lines.map((line) => line.category.id)).toEqual(["leisure", "gifts"]);
    const empty = planSummary({ ...ledger, budgets: [] }, index, ym("2027-01"));
    expect(empty.wants.lines).toEqual([]);
  });
});

describe("métricas", () => {
  const tree = makeCategoryTree();
  const bank = makeAccount({ id: "bank", openingBalance: eur(3000), openingDate: d("2025-01-01") });
  const broker = makeAccount({
    id: "broker",
    type: "investment",
    isLiquid: false,
    openingBalance: eur(9000),
    openingDate: d("2025-01-01"),
  });

  describe("tasa de ahorro", () => {
    const transactions = [
      makeTransaction({
        type: "income",
        amount: eur(2000),
        accountId: "bank",
        date: d("2026-10-01"),
      }),
      makeTransaction({ amount: eur(1500), accountId: "bank", date: d("2026-10-02") }),
      makeTransaction({
        type: "transfer",
        amount: eur(400),
        accountId: "bank",
        toAccountId: "broker",
        date: d("2026-10-03"),
      }),
      makeTransaction({
        type: "income",
        amount: eur(1000),
        accountId: "bank",
        date: d("2026-09-01"),
      }),
      makeTransaction({ amount: eur(1250), accountId: "bank", date: d("2026-09-02") }),
      makeTransaction({ amount: eur(80), accountId: "bank", date: d("2026-08-02") }),
    ];

    it("es (ingresos − gastos) / ingresos, sin contar transferencias", () => {
      expect(savingsRate(transactions, ym("2026-10"))).toBeCloseTo(0.25);
    });

    it("puede ser negativa", () => {
      expect(savingsRate(transactions, ym("2026-09"))).toBeCloseTo(-0.25);
    });

    it("sin ingresos no se puede calcular", () => {
      expect(savingsRate(transactions, ym("2026-08"))).toBeNull();
      expect(savingsRate(transactions, ym("2026-07"))).toBeNull();
    });
  });

  describe("meses de colchón", () => {
    const today = d("2026-10-05");
    const spend = (month: string, amount: number) =>
      makeTransaction({ amount: eur(amount), accountId: "bank", date: d(`${month}-10`) });

    it("divide el saldo líquido entre el gasto medio de los últimos 6 meses completos", () => {
      const transactions = [
        spend("2026-03", 9999), // el séptimo hacia atrás: no entra
        spend("2026-04", 1000),
        spend("2026-05", 1000),
        spend("2026-06", 1000),
        spend("2026-07", 1000),
        spend("2026-08", 1000),
        spend("2026-09", 1000),
        spend("2026-10", 5000), // el mes en curso no está completo: no entra en la media
      ];
      const ledger = makeLedger({ accounts: [bank, broker], transactions });
      const result = cushion(ledger, today);
      // Líquido: 3000 − 9999 − 6000 − 5000 no interesa aquí; se comprueba la media.
      expect(result.monthsUsed).toBe(6);
      expect(result.averageExpense).toBe(eur(1000));
      expect(result.months).toBe(Math.round((result.liquid / eur(1000)) * 10) / 10);
    });

    it("con menos de 6 meses usa los disponibles", () => {
      const transactions = [spend("2026-08", 600), spend("2026-09", 900)];
      const ledger = makeLedger({ accounts: [bank, broker], transactions });
      const result = cushion(ledger, today);
      expect(result.monthsUsed).toBe(2);
      expect(result.averageExpense).toBe(eur(750));
      expect(result.liquid).toBe(eur(1500));
      expect(result.months).toBe(2);
    });

    it("se queda en un decimal", () => {
      const ledger = makeLedger({ accounts: [bank], transactions: [spend("2026-09", 900)] });
      // (3000 − 900) / 900 = 2,333…
      expect(cushion(ledger, today).months).toBe(2.3);
    });

    it("sin meses completos con movimientos no se puede calcular", () => {
      const onlyCurrent = makeLedger({ accounts: [bank], transactions: [spend("2026-10", 100)] });
      expect(cushion(onlyCurrent, today).months).toBeNull();
      expect(cushion(makeLedger({ accounts: [bank] }), today)).toEqual({
        months: null,
        liquid: eur(3000),
        averageExpense: null,
        monthsUsed: 0,
      });
    });

    it("con meses con movimientos pero sin gasto tampoco", () => {
      const ledger = makeLedger({
        accounts: [bank],
        transactions: [
          makeTransaction({
            type: "income",
            amount: eur(10),
            accountId: "bank",
            date: d("2026-09-10"),
          }),
        ],
      });
      const result = cushion(ledger, today);
      expect(result.months).toBeNull();
      expect(result.monthsUsed).toBe(1);
    });

    it("solo cuenta el dinero líquido", () => {
      const ledger = makeLedger({
        accounts: [bank, broker],
        transactions: [spend("2026-09", 1000)],
      });
      expect(cushion(ledger, today).liquid).toBe(eur(2000));
    });
  });

  describe("hoy puedes gastar", () => {
    const budgets = [
      makeBudget({ categoryId: "food", amount: eur(300) }),
      makeBudget({ categoryId: "leisure", amount: eur(100) }),
    ];
    const base = { accounts: [bank], budgets };

    it("reparte lo que queda entre los días que faltan, hoy incluido", () => {
      const ledger = makeLedger({
        ...base,
        transactions: [
          makeTransaction({ amount: eur(130), categoryId: "supermarket", date: d("2026-10-02") }),
        ],
      });
      // Quedan 270 € y del 5 al 31 hay 27 días: 10 € al día.
      expect(dailyAllowance(ledger, tree.index, d("2026-10-05"))).toEqual({
        kind: "ok",
        perDay: eur(10),
        remaining: eur(270),
        daysLeft: 27,
      });
    });

    it("redondea hacia abajo al céntimo", () => {
      const ledger = makeLedger({ ...base, transactions: [] });
      // 400 € entre 27 días = 14,8148…
      const result = dailyAllowance(ledger, tree.index, d("2026-10-05"));
      expect(result.kind === "ok" && result.perDay).toBe(eur(14.81));
    });

    it("el último día del mes te deja gastar todo lo que queda", () => {
      const ledger = makeLedger({
        ...base,
        transactions: [
          makeTransaction({ amount: eur(355.5), categoryId: "market", date: d("2026-10-20") }),
        ],
      });
      expect(dailyAllowance(ledger, tree.index, d("2026-10-31"))).toEqual({
        kind: "ok",
        perDay: eur(44.5),
        remaining: eur(44.5),
        daysLeft: 1,
      });
    });

    it("avisa del exceso cuando te has pasado", () => {
      const ledger = makeLedger({
        ...base,
        transactions: [
          makeTransaction({ amount: eur(380), categoryId: "supermarket", date: d("2026-10-02") }),
          // Gasto en una categoría sin presupuesto: también resta.
          makeTransaction({ amount: eur(47), categoryId: "gifts", date: d("2026-10-03") }),
        ],
      });
      expect(dailyAllowance(ledger, tree.index, d("2026-10-05"))).toEqual({
        kind: "over",
        excess: eur(27),
        daysLeft: 27,
      });
    });

    it("con el presupuesto justo agotado puedes gastar 0", () => {
      const ledger = makeLedger({
        ...base,
        transactions: [
          makeTransaction({ amount: eur(400), categoryId: "supermarket", date: d("2026-10-02") }),
        ],
      });
      const result = dailyAllowance(ledger, tree.index, d("2026-10-05"));
      expect(result).toEqual({ kind: "ok", perDay: 0, remaining: 0, daysLeft: 27 });
    });

    it("sin presupuestos invita a crearlos", () => {
      const ledger = makeLedger({ accounts: [bank] });
      expect(dailyAllowance(ledger, tree.index, d("2026-10-05"))).toEqual({ kind: "no-budget" });
    });
  });
});
