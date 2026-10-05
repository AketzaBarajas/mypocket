import { describe, expect, it } from "vitest";

import { d, eur, makeCategoryTree, makeTag, makeTransaction } from "./testing/fixtures";
import {
  convertWithRate,
  filterTransactions,
  groupByDay,
  hasErrors,
  mostUsedCategories,
  netEffect,
  parseSearchQuery,
  pendingTransactions,
  sanitizeTransaction,
  tagsByTransaction,
  validateTransaction,
  type TransactionInput,
} from "./transactions";

const tree = makeCategoryTree();
const accountIds = new Set(["bank", "cash"]);

const input = (overrides: Partial<TransactionInput> = {}): TransactionInput => ({
  type: "expense",
  status: "confirmed",
  date: d("2026-10-05"),
  amount: eur(12.5),
  accountId: "bank",
  toAccountId: null,
  categoryId: "supermarket",
  concept: "Mercadona",
  notes: null,
  originalAmount: null,
  originalCurrency: null,
  goalId: null,
  ...overrides,
});

describe("validación de un movimiento", () => {
  const validate = (overrides: Partial<TransactionInput>) =>
    validateTransaction(input(overrides), tree.index, accountIds);

  it("acepta un gasto completo", () => {
    expect(validate({})).toEqual({});
    expect(hasErrors(validate({}))).toBe(false);
  });

  it("exige un importe mayor que cero", () => {
    expect(validate({ amount: null }).amount).toBeDefined();
    expect(validate({ amount: eur(0) }).amount).toBeDefined();
    expect(validate({ amount: eur(-5) }).amount).toBeDefined();
  });

  it("exige una cuenta existente", () => {
    expect(validate({ accountId: null }).accountId).toBeDefined();
    expect(validate({ accountId: "ghost" }).accountId).toBeDefined();
  });

  it("exige una categoría hoja del mismo tipo en gastos e ingresos", () => {
    expect(validate({ categoryId: null }).categoryId).toBe("Elige una categoría.");
    expect(validate({ categoryId: "ghost" }).categoryId).toBe("Elige una categoría.");
    expect(validate({ categoryId: "food" }).categoryId).toMatch(/subcategoría/);
    expect(validate({ categoryId: "salary" }).categoryId).toBe("Elige una categoría de gasto.");
    expect(validate({ type: "income", categoryId: "gifts" }).categoryId).toBe(
      "Elige una categoría de ingreso.",
    );
    expect(validate({ type: "income", categoryId: "salary" })).toEqual({});
  });

  it("en transferencias no pide categoría pero sí cuentas distintas", () => {
    expect(validate({ type: "transfer", categoryId: null, toAccountId: "cash" })).toEqual({});
    expect(
      validate({ type: "transfer", categoryId: null, toAccountId: null }).toAccountId,
    ).toBeDefined();
    expect(
      validate({ type: "transfer", categoryId: null, toAccountId: "ghost" }).toAccountId,
    ).toBeDefined();
    expect(
      validate({ type: "transfer", categoryId: null, toAccountId: "bank" }).toAccountId,
    ).toMatch(/distinta/);
  });

  it("otra divisa necesita un código ISO de tres letras", () => {
    expect(validate({ originalAmount: eur(10), originalCurrency: "USD" })).toEqual({});
    expect(
      validate({ originalAmount: eur(10), originalCurrency: null }).originalCurrency,
    ).toBeDefined();
    expect(
      validate({ originalAmount: eur(10), originalCurrency: "usd" }).originalCurrency,
    ).toBeDefined();
  });
});

describe("limpieza antes de guardar", () => {
  it("quita los campos que no aplican al tipo", () => {
    const expense = sanitizeTransaction(
      input({ toAccountId: "cash", goalId: "g", concept: "  Bar  ", notes: "   " }),
    );
    expect(expense).toMatchObject({ toAccountId: null, goalId: null, concept: "Bar", notes: null });

    const transfer = sanitizeTransaction(
      input({
        type: "transfer",
        toAccountId: "cash",
        goalId: "g",
        categoryId: "supermarket",
        notes: " nota ",
      }),
    );
    expect(transfer).toMatchObject({
      toAccountId: "cash",
      goalId: "g",
      categoryId: null,
      notes: "nota",
    });
  });

  it("solo conserva la divisa original si está completa", () => {
    expect(
      sanitizeTransaction(input({ originalAmount: eur(10), originalCurrency: null })),
    ).toMatchObject({
      originalAmount: null,
      originalCurrency: null,
    });
    expect(
      sanitizeTransaction(input({ originalAmount: eur(10), originalCurrency: "USD" })),
    ).toMatchObject({
      originalAmount: eur(10),
      originalCurrency: "USD",
    });
  });

  it("convierte con un tipo de cambio sin salir de los enteros", () => {
    expect(convertWithRate(eur(100), 0.92)).toBe(eur(92));
    expect(convertWithRate(eur(19.99), 0.9137)).toBe(1826);
    expect(convertWithRate(eur(100), 0)).toBeNull();
    expect(convertWithRate(eur(100), Number.NaN)).toBeNull();
  });
});

describe("buscador", () => {
  it("separa texto, etiquetas e importes", () => {
    expect(parseSearchQuery("  Café  #Viaje >50 <120,5 ")).toEqual({
      terms: ["cafe"],
      tags: ["viaje"],
      minAmount: eur(50),
      maxAmount: eur(120.5),
    });
    expect(parseSearchQuery("")).toEqual({ terms: [], tags: [], minAmount: null, maxAmount: null });
  });

  it("trata como texto lo que no es un importe válido", () => {
    expect(parseSearchQuery(">abc #").terms).toEqual([">abc"]);
  });
});

describe("filtros", () => {
  const trip = makeTag({ id: "trip", name: "viaje" });
  const work = makeTag({ id: "work", name: "trabajo" });
  const transactions = [
    makeTransaction({
      id: "a",
      concept: "Café Central",
      amount: eur(3.2),
      categoryId: "leisure",
      accountId: "cash",
      date: d("2026-10-05"),
    }),
    makeTransaction({
      id: "b",
      concept: "Mercadona",
      notes: "Compra semanal",
      amount: eur(64),
      categoryId: "supermarket",
      accountId: "bank",
      date: d("2026-10-04"),
    }),
    makeTransaction({
      id: "c",
      type: "income",
      concept: "Nómina",
      amount: eur(2000),
      categoryId: "salary",
      accountId: "bank",
      date: d("2026-10-01"),
    }),
    makeTransaction({
      id: "e",
      type: "transfer",
      concept: "Ahorro",
      amount: eur(300),
      accountId: "bank",
      toAccountId: "cash",
      date: d("2026-09-28"),
    }),
    makeTransaction({
      id: "f",
      concept: "Alquiler",
      amount: eur(620),
      categoryId: "rent",
      accountId: "bank",
      date: d("2026-10-08"),
      status: "pending",
    }),
    makeTransaction({
      id: "g",
      concept: "Borrado",
      amount: eur(1),
      accountId: "bank",
      isDeleted: true,
    }),
  ];
  const links = [
    { transactionId: "a", tagId: "trip" },
    { transactionId: "b", tagId: "work" },
    { transactionId: "b", tagId: "work" },
  ];
  const context = { index: tree.index, tags: [trip, work], transactionTags: links };
  const ids = (filter: Parameters<typeof filterTransactions>[1]) =>
    filterTransactions(transactions, filter, context).map((transaction) => transaction.id);

  it("oculta los borrados y ordena del más reciente al más antiguo", () => {
    expect(ids({})).toEqual(["f", "a", "b", "c", "e"]);
  });

  it("busca en concepto y notas sin distinguir tildes ni mayúsculas", () => {
    expect(ids({ query: parseSearchQuery("cafe") })).toEqual(["a"]);
    expect(ids({ query: parseSearchQuery("SEMANAL") })).toEqual(["b"]);
    expect(ids({ query: parseSearchQuery("compra mercadona") })).toEqual(["b"]);
    expect(ids({ query: parseSearchQuery("nada") })).toEqual([]);
  });

  it("filtra por #etiqueta y por importe", () => {
    expect(ids({ query: parseSearchQuery("#viaje") })).toEqual(["a"]);
    expect(ids({ query: parseSearchQuery("#via") })).toEqual(["a"]);
    expect(ids({ query: parseSearchQuery("#trabajo #viaje") })).toEqual([]);
    expect(ids({ query: parseSearchQuery(">50") })).toEqual(["f", "b", "c", "e"]);
    expect(ids({ query: parseSearchQuery("<20") })).toEqual(["a"]);
    expect(ids({ query: parseSearchQuery(">50 <400") })).toEqual(["b", "e"]);
    expect(ids({ query: parseSearchQuery(">64") })).not.toContain("b");
  });

  it("filtra por estado, fechas y tipo", () => {
    expect(ids({ status: "pending" })).toEqual(["f"]);
    expect(ids({ from: d("2026-10-01"), to: d("2026-10-04") })).toEqual(["b", "c"]);
    expect(ids({ types: ["income", "transfer"] })).toEqual(["c", "e"]);
    expect(ids({ types: [] })).toHaveLength(5);
  });

  it("una cuenta incluye las transferencias que entran o salen de ella", () => {
    expect(ids({ accountIds: ["cash"] })).toEqual(["a", "e"]);
  });

  it("una categoría de primer nivel incluye a sus hijas", () => {
    expect(ids({ categoryIds: ["food"] })).toEqual(["b"]);
    expect(ids({ categoryIds: ["housing", "leisure"] })).toEqual(["f", "a"]);
  });

  it("filtra por etiquetas elegidas", () => {
    expect(ids({ tagIds: ["work", "trip"] })).toEqual(["a", "b"]);
    expect(tagsByTransaction([trip, work], links).get("b")).toEqual([work]);
  });
});

describe("agrupación por día", () => {
  it("agrupa y calcula el neto con los confirmados", () => {
    const list = [
      makeTransaction({ date: d("2026-10-05"), type: "income", amount: eur(100) }),
      makeTransaction({ date: d("2026-10-05"), amount: eur(30) }),
      makeTransaction({ date: d("2026-10-05"), type: "transfer", amount: eur(500) }),
      makeTransaction({ date: d("2026-10-05"), amount: eur(999), status: "pending" }),
      makeTransaction({ date: d("2026-10-04"), amount: eur(12) }),
    ];
    const groups = groupByDay(list);
    expect(groups.map((group) => [group.date, group.transactions.length, group.net])).toEqual([
      ["2026-10-05", 4, eur(70)],
      ["2026-10-04", 1, eur(-12)],
    ]);
    expect(groupByDay([])).toEqual([]);
    expect(netEffect(makeTransaction({ type: "transfer" }))).toBe(0);
  });

  it("ordena los pendientes: vencidos primero y luego por fecha", () => {
    const today = d("2026-10-05");
    const list = [
      makeTransaction({ id: "future", status: "pending", date: d("2026-10-07") }),
      makeTransaction({ id: "late", status: "pending", date: d("2026-10-01") }),
      makeTransaction({ id: "today", status: "pending", date: today }),
      makeTransaction({ id: "confirmed", date: today }),
      makeTransaction({ id: "skipped", status: "pending", date: today, isDeleted: true }),
    ];
    expect(pendingTransactions(list, today).map((transaction) => transaction.id)).toEqual([
      "late",
      "today",
      "future",
    ]);
  });

  it("da las categorías más usadas de un tipo", () => {
    const list = [
      makeTransaction({ categoryId: "supermarket" }),
      makeTransaction({ categoryId: "supermarket" }),
      makeTransaction({ categoryId: "leisure" }),
      makeTransaction({ categoryId: "gifts", isDeleted: true }),
      makeTransaction({ type: "income", categoryId: "salary" }),
      makeTransaction({ type: "transfer" }),
    ];
    expect(mostUsedCategories(list, "expense", 5)).toEqual(["supermarket", "leisure"]);
    expect(mostUsedCategories(list, "expense", 1)).toEqual(["supermarket"]);
    expect(mostUsedCategories(list, "income", 5)).toEqual(["salary"]);
  });
});
