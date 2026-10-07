import { describe, expect, it } from "vitest";

import { EXPORT_HEADERS, transactionsToCsv } from "./exporting";
import { parseCsv } from "./importing/csv";
import {
  d,
  eur,
  makeAccount,
  makeCategoryTree,
  makeTag,
  makeTransaction,
} from "./testing/fixtures";

describe("exportación de movimientos a CSV", () => {
  const tree = makeCategoryTree();
  const bank = makeAccount({ id: "bank", name: "BBVA débito" });
  const broker = makeAccount({ id: "broker", name: "Trade Republic", type: "investment" });
  const trip = makeTag({ id: "trip", name: "lisboa" });
  const context = {
    accountById: new Map([
      [bank.id, bank],
      [broker.id, broker],
    ]),
    index: tree.index,
    tagsOf: new Map([["tx-dinner", [trip]]]),
  };

  const transactions = [
    makeTransaction({
      id: "tx-old",
      date: d("2026-09-30"),
      type: "income",
      amount: eur(2450),
      accountId: "bank",
      categoryId: "salary",
      concept: "Nómina",
    }),
    makeTransaction({
      id: "tx-dinner",
      date: d("2026-10-04"),
      amount: eur(1234.5),
      accountId: "bank",
      categoryId: "supermarket",
      concept: 'Cena; con "comillas"',
      notes: "Dos líneas\nde notas",
    }),
    makeTransaction({
      id: "tx-transfer",
      date: d("2026-10-01"),
      type: "transfer",
      amount: eur(300),
      accountId: "bank",
      toAccountId: "broker",
      status: "pending",
    }),
    makeTransaction({ id: "tx-deleted", date: d("2026-10-05"), isDeleted: true }),
  ];

  const table = parseCsv(transactionsToCsv(transactions, context), ";").rows;

  it("lleva cabeceras y una fila por movimiento no borrado, del más reciente al más antiguo", () => {
    expect(table[0]).toEqual([...EXPORT_HEADERS]);
    expect(table).toHaveLength(4);
    expect(table.slice(1).map((row) => row[0])).toEqual(["04/10/2026", "01/10/2026", "30/09/2026"]);
  });

  it("escribe los gastos en negativo con coma decimal y sin separador de miles", () => {
    expect(table[1]?.[4]).toBe("-1234,50");
    expect(table[2]?.[4]).toBe("300,00");
    expect(table[3]?.[4]).toBe("2450,00");
  });

  it("resuelve cuentas, categoría con su madre y etiquetas", () => {
    expect(table[1]).toEqual([
      "04/10/2026",
      "Gasto",
      "Confirmado",
      'Cena; con "comillas"',
      "-1234,50",
      "BBVA débito",
      "",
      "Alimentación › Supermercado",
      "#lisboa",
      "Dos líneas\nde notas",
    ]);
    expect(table[2]?.slice(1, 3)).toEqual(["Transferencia", "Pendiente"]);
    expect(table[2]?.[6]).toBe("Trade Republic");
    expect(table[3]?.[7]).toBe("Nómina");
  });

  it("sin movimientos deja solo las cabeceras", () => {
    expect(parseCsv(transactionsToCsv([], context), ";").rows).toEqual([[...EXPORT_HEADERS]]);
  });
});
