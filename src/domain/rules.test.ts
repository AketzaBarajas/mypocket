import { describe, expect, it } from "vitest";

import { SEED_ACCOUNTS, SEED_CATEGORIES, defaultIsLiquid, seedChildKey, slugify } from "./catalog";
import {
  budgetGroupOf,
  buildCategoryIndex,
  categoryPath,
  childrenOfCategory,
  isLeaf,
  leafCategories,
  topLevelCategories,
  topLevelOf,
  validateCategory,
} from "./categories";
import {
  compareMonths,
  compareYears,
  comparePeriods,
  delta,
  normalizeTagName,
  tagCosts,
} from "./compare";
import { goalContributions, goalProgress } from "./goals";
import {
  categorize,
  compileRegex,
  findRule,
  isRuleValid,
  nextPriority,
  normalizeText,
  ruleMatches,
  suggestRule,
} from "./rules";
import { monthRangeOf } from "./spending";
import {
  d,
  eur,
  makeAccount,
  makeCategory,
  makeCategoryTree,
  makeGoal,
  makeRule,
  makeTag,
  makeTransaction,
  ym,
} from "./testing/fixtures";

describe("normalización", () => {
  it("pasa a minúsculas, quita tildes y colapsa espacios", () => {
    expect(normalizeText("  MERCADONA   S.A.  ")).toBe("mercadona s.a.");
    expect(normalizeText("Café  con\tLECHE")).toBe("cafe con leche");
    expect(normalizeText("Ñandú Übung")).toBe("nandu ubung");
    expect(normalizeText("")).toBe("");
  });
});

describe("coincidencia de reglas", () => {
  const concept = normalizeText("Compra Mercadona Madrid");

  it("aplica cada tipo de coincidencia sobre el texto normalizado", () => {
    expect(ruleMatches({ pattern: "MERCADONA", matchType: "contains" }, concept)).toBe(true);
    expect(ruleMatches({ pattern: "compra", matchType: "startsWith" }, concept)).toBe(true);
    expect(ruleMatches({ pattern: "mercadona", matchType: "startsWith" }, concept)).toBe(false);
    expect(
      ruleMatches({ pattern: "Compra  Mercadona  Madrid", matchType: "equals" }, concept),
    ).toBe(true);
    expect(ruleMatches({ pattern: "compra mercadona", matchType: "equals" }, concept)).toBe(false);
    expect(ruleMatches({ pattern: "^compra .*madrid$", matchType: "regex" }, concept)).toBe(true);
    expect(ruleMatches({ pattern: "merca(dona|do)", matchType: "regex" }, concept)).toBe(true);
  });

  it("un patrón o un concepto vacíos nunca coinciden", () => {
    expect(ruleMatches({ pattern: "   ", matchType: "contains" }, concept)).toBe(false);
    expect(ruleMatches({ pattern: "mercadona", matchType: "contains" }, "")).toBe(false);
    expect(ruleMatches({ pattern: "", matchType: "regex" }, concept)).toBe(false);
  });

  it("una regex inválida se ignora y se marca como no válida", () => {
    const broken = { pattern: "merca(dona", matchType: "regex" } as const;
    expect(compileRegex(broken.pattern)).toBeNull();
    expect(ruleMatches(broken, concept)).toBe(false);
    expect(isRuleValid(broken)).toBe(false);
    expect(isRuleValid({ pattern: "merca(dona)?", matchType: "regex" })).toBe(true);
    expect(isRuleValid({ pattern: "  ", matchType: "contains" })).toBe(false);
    expect(isRuleValid({ pattern: "bar", matchType: "equals" })).toBe(true);
  });
});

describe("elección de regla", () => {
  it("gana la de mayor prioridad", () => {
    const rules = [
      makeRule({ id: "low", pattern: "mercadona", priority: 1, categoryId: "a" }),
      makeRule({ id: "high", pattern: "merca", priority: 5, categoryId: "b" }),
    ];
    expect(findRule(rules, "Mercadona")?.id).toBe("high");
    expect(categorize(rules, "Mercadona")).toBe("b");
  });

  it("a igual prioridad gana la más específica: equals > startsWith > contains > regex", () => {
    const rules = [
      makeRule({ id: "regex", pattern: "^bar", matchType: "regex" }),
      makeRule({ id: "contains", pattern: "bar", matchType: "contains" }),
      makeRule({ id: "starts", pattern: "bar", matchType: "startsWith" }),
      makeRule({ id: "equals", pattern: "bar pepe", matchType: "equals" }),
    ];
    expect(findRule(rules, "Bar Pepe")?.id).toBe("equals");
    expect(findRule(rules, "Bar Manolo")?.id).toBe("starts");
    expect(findRule(rules.slice(0, 2), "Bar Manolo")?.id).toBe("contains");
    expect(findRule(rules.slice(0, 1), "Bar Manolo")?.id).toBe("regex");
  });

  it("a igual prioridad y especificidad gana la más reciente", () => {
    const rules = [
      makeRule({ id: "old", pattern: "netflix", createdAt: "2026-01-01T00:00:00.000Z" }),
      makeRule({ id: "new", pattern: "netflix", createdAt: "2026-06-01T00:00:00.000Z" }),
    ];
    expect(findRule(rules, "NETFLIX.COM")?.id).toBe("new");
    expect(findRule([...rules].reverse(), "NETFLIX.COM")?.id).toBe("new");
  });

  it("una regex inválida no bloquea a las demás", () => {
    const rules = [
      makeRule({ id: "broken", pattern: "([", matchType: "regex", priority: 99 }),
      makeRule({ id: "ok", pattern: "uber" }),
    ];
    expect(findRule(rules, "UBER *TRIP")?.id).toBe("ok");
  });

  it("devuelve null si nada coincide o el concepto está vacío", () => {
    expect(findRule([makeRule()], "Carrefour")).toBeNull();
    expect(findRule([makeRule()], "   ")).toBeNull();
    expect(categorize([], "Mercadona")).toBeNull();
  });
});

describe("propuesta de regla", () => {
  it("propone «contiene» con el concepto normalizado si no hay regla", () => {
    expect(suggestRule([], "  Mercadona ", "super")).toEqual({
      pattern: "mercadona",
      matchType: "contains",
      categoryId: "super",
    });
  });

  it("no propone si ya hay regla, no hay concepto o no hay categoría", () => {
    expect(suggestRule([makeRule()], "Mercadona Madrid", "super")).toBeNull();
    expect(suggestRule([], "   ", "super")).toBeNull();
    expect(suggestRule([], "Mercadona", null)).toBeNull();
  });

  it("asigna la prioridad siguiente a la más alta", () => {
    expect(nextPriority([])).toBe(1);
    expect(nextPriority([makeRule({ priority: 3 }), makeRule({ priority: 7 })])).toBe(8);
  });
});

describe("categorías", () => {
  const tree = makeCategoryTree();

  it("resuelve la jerarquía de dos niveles", () => {
    expect(topLevelOf(tree.index, "supermarket")?.id).toBe("food");
    expect(topLevelOf(tree.index, "gifts")?.id).toBe("gifts");
    expect(topLevelOf(tree.index, "nope")).toBeNull();
    expect(childrenOfCategory(tree.index, "food").map((category) => category.id)).toEqual([
      "supermarket",
      "market",
    ]);
    expect(categoryPath(tree.index, "supermarket")).toBe("Alimentación › Supermercado");
    expect(categoryPath(tree.index, "gifts")).toBe("Regalos");
    expect(categoryPath(tree.index, "nope")).toBe("");
  });

  it("solo las hojas se pueden asignar", () => {
    expect(isLeaf(tree.index, "food")).toBe(false);
    expect(isLeaf(tree.index, "supermarket")).toBe(true);
    expect(isLeaf(tree.index, "gifts")).toBe(true);
    expect(isLeaf(tree.index, "nope")).toBe(false);
    expect(leafCategories(tree.index, "expense").map((category) => category.id)).toEqual([
      "rent",
      "supermarket",
      "market",
      "leisure",
      "gifts",
    ]);
    expect(leafCategories(tree.index, "income").map((category) => category.id)).toEqual(["salary"]);
  });

  it("las hijas heredan el grupo de su madre", () => {
    expect(budgetGroupOf(tree.index, "supermarket")).toBe("needs");
    expect(budgetGroupOf(tree.index, "leisure")).toBe("wants");
    expect(budgetGroupOf(tree.index, "salary")).toBeNull();
  });

  it("oculta las archivadas y las hijas de madres archivadas", () => {
    const archived = buildCategoryIndex(
      tree.categories.map((category) =>
        category.id === "food" || category.id === "gifts"
          ? { ...category, archived: true }
          : category,
      ),
    );
    expect(leafCategories(archived, "expense").map((category) => category.id)).toEqual([
      "rent",
      "leisure",
    ]);
    expect(topLevelCategories(archived, "expense").map((category) => category.id)).toEqual([
      "housing",
      "leisure",
    ]);
    expect(topLevelCategories(archived, "expense", { includeArchived: true })).toHaveLength(4);
  });

  it("trata como de primer nivel a una hija cuya madre aún no ha sincronizado", () => {
    const orphan = makeCategory({ id: "orphan", parentId: "missing", budgetGroup: null });
    const index = buildCategoryIndex([orphan]);
    expect(topLevelOf(index, "orphan")?.id).toBe("orphan");
    expect(isLeaf(index, "orphan")).toBe(true);
  });

  it("valida las reglas de jerarquía", () => {
    const base = { id: null, kind: "expense", parentId: null, budgetGroup: "needs" } as const;
    expect(validateCategory(tree.index, base)).toBeNull();
    expect(validateCategory(tree.index, { ...base, budgetGroup: null })).toMatch(/necesidad/);
    expect(validateCategory(tree.index, { ...base, kind: "income", budgetGroup: null })).toBeNull();
    expect(
      validateCategory(tree.index, { ...base, parentId: "food", budgetGroup: null }),
    ).toBeNull();
    expect(validateCategory(tree.index, { ...base, parentId: "supermarket" })).toMatch(
      /dos niveles/,
    );
    expect(validateCategory(tree.index, { ...base, parentId: "salary" })).toMatch(/mismo tipo/);
    expect(validateCategory(tree.index, { ...base, parentId: "missing" })).toMatch(/no existe/);
    expect(validateCategory(tree.index, { ...base, id: "food", parentId: "food" })).toMatch(
      /propia madre/,
    );
    expect(validateCategory(tree.index, { ...base, id: "food", parentId: "housing" })).toMatch(
      /subcategorías/,
    );
  });
});

describe("catálogo inicial", () => {
  it("precarga las seis cuentas reales con su emoji", () => {
    expect(SEED_ACCOUNTS.map((account) => `${account.emoji} ${account.name}`)).toEqual([
      "💳 BBVA débito",
      "🪪 BBVA prepago",
      "💶 Efectivo",
      "📈 Trade Republic",
      "📈 MyInvestor",
      "🤝 Deudas de amigos",
    ]);
    expect(SEED_ACCOUNTS.map((account) => account.type)).toEqual([
      "checking",
      "prepaid",
      "cash",
      "investment",
      "investment",
      "receivable",
    ]);
  });

  it("marca como líquidas las cuentas del día a día y de ahorro", () => {
    expect((["checking", "prepaid", "cash", "savings"] as const).every(defaultIsLiquid)).toBe(true);
    expect(defaultIsLiquid("investment")).toBe(false);
    expect(defaultIsLiquid("receivable")).toBe(false);
  });

  it("todas las categorías de gasto de primer nivel tienen grupo", () => {
    const expenses = SEED_CATEGORIES.filter((category) => category.kind === "expense");
    expect(expenses).toHaveLength(15);
    expect(expenses.filter((category) => category.budgetGroup === "needs")).toHaveLength(7);
    expect(expenses.filter((category) => category.budgetGroup === "wants")).toHaveLength(8);
    expect(SEED_CATEGORIES.filter((category) => category.kind === "income")).toHaveLength(5);
    expect(
      SEED_CATEGORIES.every(
        (category) => category.kind === "expense" || category.budgetGroup === null,
      ),
    ).toBe(true);
  });

  it("genera claves estables y únicas", () => {
    expect(slugify("Taxi y VTC")).toBe("taxi-y-vtc");
    expect(slugify("  Consultoría & freelance ")).toBe("consultoria-freelance");
    const keys = SEED_CATEGORIES.flatMap((category) => [
      category.key,
      ...category.children.map((child) => seedChildKey(category, child)),
    ]);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("restaurantes/restaurantes");
    expect(keys).toContain("viajes/transporte");
  });
});

describe("metas", () => {
  const accounts = [
    makeAccount({ id: "bank" }),
    makeAccount({ id: "savings", type: "savings" }),
    makeAccount({ id: "broker", type: "investment" }),
    makeAccount({ id: "cash", type: "cash" }),
  ];
  const goal = makeGoal({ id: "japan", targetAmount: eur(3000) });
  const transfer = (amount: number, from: string, to: string, extra = {}) =>
    makeTransaction({
      type: "transfer",
      amount: eur(amount),
      accountId: from,
      toAccountId: to,
      goalId: "japan",
      ...extra,
    });

  const transactions = [
    transfer(500, "bank", "savings", { date: d("2026-08-01") }),
    transfer(300, "bank", "broker", { date: d("2026-09-01") }),
    transfer(200, "savings", "bank", { date: d("2026-09-15") }), // retirada
    transfer(100, "savings", "broker", { date: d("2026-09-20") }), // destino inversor: suma
    transfer(999, "bank", "cash"), // ni origen ni destino de ahorro: no cuenta
    transfer(999, "bank", "savings", { status: "pending" }),
    transfer(999, "bank", "savings", { isDeleted: true }),
    transfer(999, "bank", "savings", { goalId: "other" }),
    makeTransaction({ type: "expense", amount: eur(999), accountId: "savings", goalId: "japan" }),
  ];

  it("suma las aportaciones a ahorro o inversión y resta las retiradas", () => {
    const progress = goalProgress(goal, transactions, accounts, d("2026-10-05"));
    expect(progress.progress).toBe(eur(500 + 300 - 200 + 100));
    expect(progress.ratio).toBeCloseTo(700 / 3000);
    expect(progress.reached).toBe(false);
    expect(progress.monthlyNeeded).toBeNull();
  });

  it("lista las aportaciones de la más reciente a la más antigua", () => {
    const contributions = goalContributions("japan", transactions, accounts);
    expect(contributions.map((item) => item.amount)).toEqual([
      eur(100),
      eur(-200),
      eur(300),
      eur(500),
    ]);
  });

  it("con fecha objetivo calcula lo que hace falta al mes", () => {
    const dated = { ...goal, targetDate: d("2027-08-15") };
    // Faltan 2300 € y quedan 10 meses.
    expect(goalProgress(dated, transactions, accounts, d("2026-10-05")).monthlyNeeded).toBe(
      eur(230),
    );
  });

  it("usa un mínimo de un mes cuando la fecha ya llegó o pasó", () => {
    const due = { ...goal, targetDate: d("2026-10-20") };
    expect(goalProgress(due, transactions, accounts, d("2026-10-05")).monthlyNeeded).toBe(
      eur(2300),
    );
    const late = { ...goal, targetDate: d("2026-01-01") };
    expect(goalProgress(late, transactions, accounts, d("2026-10-05")).monthlyNeeded).toBe(
      eur(2300),
    );
  });

  it("redondea hacia arriba para no quedarse corto", () => {
    const dated = { ...goal, targetAmount: eur(800), targetDate: d("2027-01-01") };
    // Faltan 100 € en 3 meses: 33,34 €.
    expect(goalProgress(dated, transactions, accounts, d("2026-10-05")).monthlyNeeded).toBe(
      eur(33.34),
    );
  });

  it("al llegar al 100 % queda alcanzada y ya no pide aportaciones", () => {
    const small = { ...goal, targetAmount: eur(700), targetDate: d("2027-01-01") };
    const progress = goalProgress(small, transactions, accounts, d("2026-10-05"));
    expect(progress.reached).toBe(true);
    expect(progress.ratio).toBe(1);
    expect(progress.monthlyNeeded).toBeNull();
  });

  it("una meta sin objetivo no divide entre cero", () => {
    const empty = goalProgress({ ...goal, targetAmount: eur(0) }, [], accounts, d("2026-10-05"));
    expect(empty.ratio).toBe(0);
    expect(empty.reached).toBe(false);
  });
});

describe("comparativa entre periodos", () => {
  const tree = makeCategoryTree();
  const transactions = [
    makeTransaction({ amount: eur(240), categoryId: "supermarket", date: d("2026-10-03") }),
    makeTransaction({ amount: eur(200), categoryId: "market", date: d("2026-09-03") }),
    makeTransaction({ amount: eur(60), categoryId: "leisure", date: d("2026-10-04") }),
    makeTransaction({ amount: eur(110), categoryId: "leisure", date: d("2026-09-04") }),
    makeTransaction({ amount: eur(30), categoryId: "gifts", date: d("2026-10-05") }),
    makeTransaction({ amount: eur(620), categoryId: "rent", date: d("2025-10-01") }),
    makeTransaction({
      type: "income",
      amount: eur(5000),
      categoryId: "salary",
      date: d("2026-10-01"),
    }),
  ];

  it("compara un mes con el anterior por categoría de primer nivel", () => {
    const comparison = compareMonths(transactions, tree.index, ym("2026-10"));
    expect(comparison.total).toEqual({
      current: eur(330),
      previous: eur(310),
      amount: eur(20),
      ratio: 20 / 310,
    });
    const byId = new Map(comparison.categories.map((item) => [item.category.id, item]));
    expect(byId.get("food")?.amount).toBe(eur(40));
    expect(byId.get("food")?.ratio).toBeCloseTo(0.2);
    expect(byId.get("leisure")?.amount).toBe(eur(-50));
    expect(byId.get("leisure")?.ratio).toBeCloseTo(-50 / 110);
    // Sin gasto anterior no hay porcentaje.
    expect(byId.get("gifts")).toMatchObject({ current: eur(30), previous: 0, ratio: null });
    expect(comparison.categories.map((item) => item.category.id)).toEqual([
      "food",
      "leisure",
      "gifts",
    ]);
  });

  it("compara un año con el anterior", () => {
    const comparison = compareYears(transactions, tree.index, 2026);
    expect(comparison.total.current).toBe(eur(640));
    expect(comparison.total.previous).toBe(eur(620));
    expect(comparison.categories.find((item) => item.category.id === "housing")).toMatchObject({
      current: 0,
      previous: eur(620),
      amount: eur(-620),
      ratio: -1,
    });
  });

  it("admite periodos arbitrarios e ignora categorías desconocidas", () => {
    const stray = [
      ...transactions,
      makeTransaction({ amount: eur(5), categoryId: "ghost", date: d("2026-10-02") }),
    ];
    const comparison = comparePeriods(
      stray,
      tree.index,
      monthRangeOf(ym("2026-10")),
      monthRangeOf(ym("2026-08")),
    );
    expect(comparison.total.current).toBe(eur(335));
    expect(comparison.categories.some((item) => item.category.id === "ghost")).toBe(false);
    expect(delta(eur(10), eur(0)).ratio).toBeNull();
  });
});

describe("coste por etiqueta", () => {
  const trip = makeTag({ id: "trip", name: "japon" });
  const work = makeTag({ id: "work", name: "trabajo" });
  const unused = makeTag({ id: "unused", name: "vacia" });
  const transactions = [
    makeTransaction({ id: "t1", amount: eur(900), date: d("2026-05-02") }),
    makeTransaction({ id: "t2", amount: eur(120), date: d("2026-05-10") }),
    makeTransaction({ id: "t3", amount: eur(45), date: d("2026-04-28") }),
    makeTransaction({ id: "t4", type: "income", amount: eur(500), date: d("2026-05-05") }),
    makeTransaction({ id: "t5", amount: eur(70), date: d("2026-05-06"), status: "pending" }),
    makeTransaction({ id: "t6", amount: eur(80), date: d("2026-05-07"), isDeleted: true }),
  ];
  const links = [
    { transactionId: "t1", tagId: "trip" },
    { transactionId: "t2", tagId: "trip" },
    { transactionId: "t2", tagId: "trip" }, // enlace duplicado por sincronización
    { transactionId: "t3", tagId: "trip" },
    { transactionId: "t4", tagId: "trip" },
    { transactionId: "t5", tagId: "trip" },
    { transactionId: "t6", tagId: "trip" },
    { transactionId: "t2", tagId: "work" },
    { transactionId: "gone", tagId: "work" },
    { transactionId: "t1", tagId: "ghost-tag" },
  ];

  it("suma los gastos confirmados y da número de movimientos y fechas", () => {
    const costs = tagCosts([trip, work, unused], links, transactions);
    expect(costs.map((cost) => cost.tag.id)).toEqual(["trip", "work", "unused"]);
    expect(costs[0]).toMatchObject({
      total: eur(1065),
      count: 3,
      firstDate: "2026-04-28",
      lastDate: "2026-05-10",
    });
    expect(costs[1]).toMatchObject({
      total: eur(120),
      count: 1,
      firstDate: "2026-05-10",
      lastDate: "2026-05-10",
    });
    expect(costs[2]).toMatchObject({ total: 0, count: 0, firstDate: null, lastDate: null });
  });

  it("se puede limitar a un intervalo", () => {
    const costs = tagCosts([trip], links, transactions, monthRangeOf(ym("2026-05")));
    expect(costs[0]).toMatchObject({ total: eur(1020), count: 2, firstDate: "2026-05-02" });
  });

  it("normaliza los nombres de etiqueta", () => {
    expect(normalizeTagName("#Viaje Japón")).toBe("viaje-japón");
    expect(normalizeTagName("  ##Trabajo  ")).toBe("trabajo");
    expect(normalizeTagName("fin_de-semana!")).toBe("fin_de-semana");
    expect(normalizeTagName("#")).toBe("");
  });
});
