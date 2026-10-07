import { describe, expect, it } from "vitest";

import {
  d,
  eur,
  makeAccount,
  makeCategoryTree,
  makeRule,
  makeTransaction,
} from "../testing/fixtures";
import type { ImportProfile } from "../types";
import { detectDelimiter, readCsv } from "./csv";
import { buildRows, patchRow, resolveDuplicates, toDrafts } from "./pipeline";
import { presetByKey } from "./profiles";
import {
  assignColumn,
  commonType,
  countUnknown,
  earliestDateForAccount,
  existingImportHashes,
  filterPreview,
  initialMapping,
  isPresetKey,
  mappableFields,
  mappingIssues,
  needsHashing,
  previewFilterCounts,
  remapColumn,
  savedProfileFor,
  suggestPresetKey,
  summarizeDrafts,
} from "./session";

const encode = (text: string) => new TextEncoder().encode(text);

/** Extracto ficticio con el aspecto de una exportación de BBVA. */
const BBVA_CSV = [
  "Últimos movimientos;;;;",
  "Cuenta: ES00 0000 0000 0000;;;;",
  "",
  "F.Valor;Fecha;Concepto;Movimiento;Importe;Divisa;Disponible;Observaciones",
  "05/10/2026;05/10/2026;MERCADONA MADRID;Pago con tarjeta;-43,85;EUR;1.956,15;",
  "03/10/2026;03/10/2026;Café;Pago con tarjeta;-1,50;EUR;2.000,00;",
  "03/10/2026;03/10/2026;Café;Pago con tarjeta;-1,50;EUR;2.001,50;",
  "01/10/2026;01/10/2026;NOMINA OCTUBRE;Abono de nómina;2.450,00;EUR;2.003,00;Empresa SL",
].join("\n");

const savedProfile = (overrides: Partial<ImportProfile> = {}): ImportProfile => ({
  id: "profile",
  name: "BBVA",
  source: "bbva",
  delimiter: ";",
  encoding: "utf-8",
  dateFormat: "auto",
  decimalSeparator: ",",
  columnMap: {},
  signMode: "signed",
  ...overrides,
});

describe("mapeo inicial", () => {
  const bbva = presetByKey("bbva");
  const table = readCsv(encode(BBVA_CSV));

  it("lee el extracto aunque empiece con títulos y use coma decimal", () => {
    // La coma aparece dos veces en cada fila de datos, pero el separador es ";".
    expect(detectDelimiter(BBVA_CSV)).toBe(";");
    expect(table.delimiter).toBe(";");
    expect(table.headers).toContain("Importe");
    expect(table.records).toHaveLength(4);
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("a\tb\n1\t2")).toBe("\t");
    expect(detectDelimiter("una sola columna\nsin separador")).toBe("");
  });

  it("detecta las columnas de un extracto tipo BBVA y el orden de las fechas", () => {
    const mapping = initialMapping(table, bbva, undefined, "bank");
    expect(mapping.columnMap).toMatchObject({
      date: "Fecha",
      concept: "Concepto",
      amount: "Importe",
      notes: "Observaciones",
    });
    expect(mapping.signMode).toBe("signed");
    expect(mapping.defaultAccountId).toBe("bank");
    // Ninguna fecha tiene un día mayor que 12: no se puede saber el orden.
    expect(mapping.dateAmbiguous).toBe(true);
    expect(mapping.dateFormat).toBe("auto");
  });

  it("deduce día/mes cuando alguna fecha lo deja claro", () => {
    const clear = readCsv(encode("Fecha;Concepto;Importe\n25/10/2026;Cena;-30,00"));
    const mapping = initialMapping(clear, bbva, undefined, null);
    expect(mapping.dateFormat).toBe("dmy");
    expect(mapping.dateAmbiguous).toBe(false);
  });

  it("recupera el mapeo guardado para las columnas que siguen en el archivo", () => {
    const saved = savedProfile({
      columnMap: { concept: "Movimiento", notes: "Concepto", category: "Ya no existe" },
      dateFormat: "dmy",
    });
    const mapping = initialMapping(table, bbva, saved, null);
    expect(mapping.columnMap.concept).toBe("Movimiento");
    expect(mapping.columnMap.notes).toBe("Concepto");
    expect(mapping.columnMap.category).toBeUndefined();
    expect(mapping.columnMap.date).toBe("Fecha");
    // El formato elegido la otra vez resuelve la ambigüedad.
    expect(mapping.dateFormat).toBe("dmy");
    expect(mapping.dateAmbiguous).toBe(false);
    // Ninguna columna alimenta dos campos.
    const columns = Object.values(mapping.columnMap);
    expect(new Set(columns).size).toBe(columns.length);
  });

  it("ignora un perfil guardado que no comparte ninguna columna", () => {
    const saved = savedProfile({ columnMap: { amount: "Otra" }, signMode: "split" });
    expect(initialMapping(table, bbva, saved, null).signMode).toBe("signed");
  });

  it("los perfiles de Notion fijan el tipo del archivo", () => {
    const notion = readCsv(encode("Nombre,Fecha,Cantidad\nCena,October 5 2026,30"));
    const mapping = initialMapping(notion, presetByKey("notion-ingresos"), undefined, null);
    expect(mapping.signMode).toBe("byType");
    expect(mapping.defaultType).toBe("income");
  });

  it("busca el perfil guardado por el nombre del preconfigurado", () => {
    const profiles = [savedProfile({ id: "a", name: "Genérico" }), savedProfile({ id: "b" })];
    expect(savedProfileFor(profiles, bbva)?.id).toBe("b");
    expect(savedProfileFor([], bbva)).toBeUndefined();
  });
});

describe("edición del mapeo", () => {
  it("asigna una columna a un campo y la quita de donde estuviera", () => {
    const map = { date: "Fecha", concept: "Concepto", notes: "Movimiento" };
    expect(assignColumn(map, "concept", "Movimiento")).toEqual({
      date: "Fecha",
      concept: "Movimiento",
    });
    expect(assignColumn(map, "notes", null)).toEqual({ date: "Fecha", concept: "Concepto" });
  });

  it("al cambiar la columna de la fecha vuelve a deducir el orden día/mes", () => {
    const table = readCsv(
      encode(
        [
          "Operación;Valor;Importe",
          "03/04/2026;25/04/2026;-1,00",
          "05/06/2026;26/06/2026;-2,00",
        ].join("\n"),
      ),
    );
    const start = initialMapping(table, presetByKey("generic"), undefined, "bank");
    const ambiguous = remapColumn(start, table, "date", "Operación");
    expect(ambiguous).toMatchObject({ dateAmbiguous: true, dateFormat: "auto" });
    const clear = remapColumn(ambiguous, table, "date", "Valor");
    expect(clear).toMatchObject({ dateAmbiguous: false, dateFormat: "dmy" });
    expect(clear.columnMap.date).toBe("Valor");
    // Tocar otro campo no altera lo que se eligió para las fechas.
    const chosen = { ...ambiguous, dateFormat: "mdy" as const };
    expect(remapColumn(chosen, table, "notes", "Valor").dateFormat).toBe("mdy");
  });

  it("ofrece entrada y salida solo con el signo partido", () => {
    expect(mappableFields("transactions", "signed")).toContain("amount");
    expect(mappableFields("transactions", "split")).toEqual(
      expect.arrayContaining(["amountIn", "amountOut"]),
    );
    expect(mappableFields("transactions", "split")).not.toContain("amount");
    expect(mappableFields("accounts", "signed")).toEqual(["concept", "amount", "type", "date"]);
  });

  it("exige fecha, importe y una cuenta", () => {
    const base = { signMode: "signed", defaultAccountId: null, defaultType: "expense" } as const;
    expect(mappingIssues({ ...base, columnMap: {} }, "transactions")).toHaveLength(3);
    expect(
      mappingIssues(
        { ...base, columnMap: { date: "Fecha", amount: "Importe", account: "Cuenta" } },
        "transactions",
      ),
    ).toEqual([]);
    expect(
      mappingIssues(
        { ...base, defaultAccountId: "bank", columnMap: { date: "Fecha", amount: "Importe" } },
        "transactions",
      ),
    ).toEqual([]);
  });

  it("con el signo partido vale una sola de las dos columnas", () => {
    const base = { signMode: "split", defaultAccountId: "bank", defaultType: "expense" } as const;
    expect(mappingIssues({ ...base, columnMap: { date: "Fecha" } }, "transactions")).toHaveLength(
      1,
    );
    expect(
      mappingIssues({ ...base, columnMap: { date: "Fecha", amountOut: "Cargo" } }, "transactions"),
    ).toEqual([]);
  });

  it("un archivo de transferencias necesita la cuenta de destino", () => {
    const mapping = {
      signMode: "byType",
      defaultAccountId: "bank",
      defaultType: "transfer",
      columnMap: { date: "Fecha", amount: "Cantidad" },
    } as const;
    expect(mappingIssues(mapping, "transactions")).toEqual([
      "Elige la columna de la cuenta de destino.",
    ]);
  });

  it("las cuentas de Notion solo necesitan el nombre", () => {
    const base = { signMode: "signed", defaultAccountId: null, defaultType: "expense" } as const;
    expect(mappingIssues({ ...base, columnMap: {} }, "accounts")).toHaveLength(1);
    expect(mappingIssues({ ...base, columnMap: { concept: "Nombre" } }, "accounts")).toEqual([]);
  });

  it("propone el perfil de Notion por el nombre del archivo exportado", () => {
    expect(suggestPresetKey("Pagos 1f2e3d4c5b6a.csv")).toBe("notion-pagos");
    expect(suggestPresetKey("Ingresos abc123.csv")).toBe("notion-ingresos");
    expect(suggestPresetKey("Transferencias 99.csv")).toBe("notion-transferencias");
    expect(suggestPresetKey("Cuentas.csv")).toBe("notion-cuentas");
    expect(suggestPresetKey("movimientos-BBVA-octubre.csv")).toBe("bbva");
    expect(suggestPresetKey("export.csv")).toBeNull();
    expect(isPresetKey("notion-pagos")).toBe(true);
    expect(isPresetKey("otro")).toBe(false);
  });
});

describe("vista previa", () => {
  const tree = makeCategoryTree();
  const bank = makeAccount({ id: "bank", name: "BBVA débito", openingDate: d("2026-10-02") });
  const cash = makeAccount({ id: "cash", name: "Efectivo", type: "cash" });
  const rules = [makeRule({ id: "r-merca", pattern: "mercadona", categoryId: "supermarket" })];
  const context = { accounts: [bank, cash], index: tree.index, rules };
  const table = readCsv(encode(BBVA_CSV));
  const mapping = { ...initialMapping(table, presetByKey("bbva"), undefined, "bank") };

  const build = async (existing: ReadonlySet<string> = new Set()) =>
    resolveDuplicates(buildRows(table.records, mapping, context), existing);

  it("importa un extracto tipo BBVA de principio a fin", async () => {
    const rows = await build();
    expect(rows.map((row) => row.status)).toEqual(["new", "new", "new", "new"]);
    expect(rows[0]).toMatchObject({
      date: d("2026-10-05"),
      type: "expense",
      amount: eur(43.85),
      categoryId: "supermarket",
      ruleId: "r-merca",
      accountId: "bank",
    });
    expect(rows[3]).toMatchObject({ type: "income", amount: eur(2450), notes: "Empresa SL" });
    // Los dos cafés idénticos tienen hashes distintos.
    expect(rows[1]?.importHash).not.toBe(rows[2]?.importHash);
  });

  it("reimportar marca todo como duplicado y deshacer el lote lo libera", async () => {
    const first = await build();
    const imported = first.map((row) =>
      makeTransaction({ importHash: row.importHash, importBatchId: "batch" }),
    );
    const again = await build(existingImportHashes(imported));
    expect(again.every((row) => row.status === "duplicate" && !row.include)).toBe(true);

    const undone = imported.map((transaction) => ({ ...transaction, isDeleted: true }));
    expect(existingImportHashes(undone).size).toBe(0);
    const afterUndo = await build(existingImportHashes(undone));
    expect(afterUndo.every((row) => row.status === "new" && row.include)).toBe(true);
  });

  it("no cuenta los movimientos manuales como importados", () => {
    expect(existingImportHashes([makeTransaction(), makeTransaction()]).size).toBe(0);
  });

  it("detecta las filas editadas que necesitan un hash nuevo", async () => {
    const rows = await build();
    expect(needsHashing(rows)).toBe(false);
    const edited = rows.map((row, index) =>
      index === 1 ? patchRow(row, { accountId: "cash" }) : row,
    );
    expect(needsHashing(edited)).toBe(true);
    // Una fila con error no tiene hash y no lo necesita.
    const broken = buildRows([{ Fecha: "", Concepto: "x", Importe: "1" }], mapping, context);
    expect(needsHashing(broken)).toBe(false);
  });

  it("filtra por estado, por falta de categoría y por texto", async () => {
    const rows = await build();
    expect(previewFilterCounts(rows)).toEqual({
      all: 4,
      new: 4,
      duplicate: 0,
      error: 0,
      uncategorized: 3,
    });
    expect(filterPreview(rows, "uncategorized", "").map((row) => row.index)).toEqual([1, 2, 3]);
    expect(filterPreview(rows, "all", "nómina").map((row) => row.index)).toEqual([3]);
    expect(filterPreview(rows, "all", "empresa").map((row) => row.index)).toEqual([3]);
    expect(filterPreview(rows, "uncategorized", "merca")).toEqual([]);
    expect(filterPreview(rows, "duplicate", "")).toEqual([]);
  });

  it("una transferencia no cuenta como fila sin categoría", async () => {
    const rows = await build();
    const transfer = patchRow(rows[1]!, { type: "transfer", toAccountId: "cash" });
    expect(previewFilterCounts([transfer]).uncategorized).toBe(0);
  });

  it("reconoce el tipo común de un grupo de filas", async () => {
    const rows = await build();
    expect(commonType(rows.slice(0, 3))).toBe("expense");
    expect(commonType(rows)).toBeNull();
    expect(commonType([])).toBeNull();
  });

  it("resume lo que se va a escribir y avisa de lo anterior a la apertura", async () => {
    const rows = (await build()).map((row) =>
      row.categoryId === null
        ? patchRow(row, { categoryId: row.type === "income" ? "salary" : "leisure" })
        : row,
    );
    const drafts = toDrafts(await resolveDuplicates(rows, new Set()));
    const summary = summarizeDrafts(drafts, [bank, cash]);
    expect(summary).toMatchObject({
      count: 4,
      expenses: 3,
      income: 1,
      transfers: 0,
      expenseTotal: eur(46.85),
      incomeTotal: eur(2450),
      firstDate: d("2026-10-01"),
      lastDate: d("2026-10-05"),
      byAccount: [{ accountId: "bank", count: 4 }],
      // La nómina del día 1 es anterior a la apertura de la cuenta (día 2).
      beforeOpening: 1,
    });
    expect(Number.isInteger(summary.expenseTotal)).toBe(true);
  });

  it("una transferencia anterior a la apertura del destino también avisa", () => {
    const summary = summarizeDrafts(
      [
        {
          type: "transfer",
          date: d("2026-10-01"),
          amount: eur(100),
          accountId: "cash",
          toAccountId: "bank",
          categoryId: null,
          concept: "",
          notes: null,
          importHash: "hash",
          ruleId: null,
        },
      ],
      [bank, cash],
    );
    expect(summary).toMatchObject({ transfers: 1, beforeOpening: 1, expenseTotal: 0 });
  });

  it("cuenta y fecha los nombres de Notion sin emparejar", () => {
    const notion = buildRows(
      [
        {
          Nombre: "Cena",
          Fecha: "2026-03-10",
          Cantidad: "30",
          Cuenta: "Revolut",
          Categoria: "Bares",
        },
        {
          Nombre: "Copas",
          Fecha: "2026-02-01",
          Cantidad: "12",
          Cuenta: "revolut",
          Categoria: "bares",
        },
        {
          Nombre: "Pan",
          Fecha: "2026-01-01",
          Cantidad: "2",
          Cuenta: "Efectivo",
          Categoria: "Mercado",
        },
      ],
      {
        columnMap: {
          concept: "Nombre",
          date: "Fecha",
          amount: "Cantidad",
          account: "Cuenta",
          category: "Categoria",
        },
        signMode: "byType",
        dateFormat: "auto",
        decimalSeparator: ",",
        defaultType: "expense",
        defaultAccountId: null,
      },
      context,
    );
    expect(countUnknown(notion, { kind: "account", name: "Revolut" })).toBe(2);
    expect(countUnknown(notion, { kind: "category", name: "Bares", type: "expense" })).toBe(2);
    expect(countUnknown(notion, { kind: "category", name: "Bares", type: "income" })).toBe(0);
    expect(earliestDateForAccount(notion, "REVOLUT")).toBe(d("2026-02-01"));
    expect(earliestDateForAccount(notion, "N26")).toBeNull();
  });
});
