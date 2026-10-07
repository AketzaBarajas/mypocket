import { describe, expect, it } from "vitest";

import { d, eur, makeAccount, makeCategoryTree, makeRule } from "../testing/fixtures";
import {
  CsvError,
  decodeCsvBytes,
  detectHeaderRow,
  parseCsv,
  readCsv,
  toCsv,
  toTable,
} from "./csv";
import { detectDateFormat, isAmbiguousDate, parseImportDate } from "./importDates";
import {
  buildAccountDrafts,
  buildRows,
  isReady,
  patchRow,
  resolveDuplicates,
  resolveName,
  rowError,
  sha256Hex,
  summarize,
  toDrafts,
  unknownNames,
  type ImportSettings,
} from "./pipeline";
import { detectColumns, inferSignMode, presetByKey, PROFILE_PRESETS } from "./profiles";

const encode = (text: string) => new TextEncoder().encode(text);

describe("lectura del CSV", () => {
  it("decodifica UTF-8 y quita el BOM", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...encode("Fecha;Concepto\n05/10/2026;Café")]);
    const decoded = decodeCsvBytes(bytes);
    expect(decoded.encoding).toBe("utf-8");
    expect(decoded.text.startsWith("Fecha")).toBe(true);
    expect(decoded.text).toContain("Café");
  });

  it("cae a windows-1252 cuando el UTF-8 no es válido", () => {
    // "Café;España" en windows-1252: é = 0xE9, ñ = 0xF1.
    const bytes = new Uint8Array([
      0x43, 0x61, 0x66, 0xe9, 0x3b, 0x45, 0x73, 0x70, 0x61, 0xf1, 0x61,
    ]);
    expect(decodeCsvBytes(bytes)).toEqual({ text: "Café;España", encoding: "windows-1252" });
  });

  it("detecta el separador y limpia celdas y filas vacías", () => {
    const semicolon = parseCsv("a;b;c\n1; 2 ;3\n\n;;\n");
    expect(semicolon.delimiter).toBe(";");
    expect(semicolon.rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
    expect(parseCsv("a,b\n1,2").delimiter).toBe(",");
    expect(parseCsv('a,b\n"x, y",2').rows[1]).toEqual(["x, y", "2"]);
  });

  it("rechaza un archivo vacío con un mensaje útil", () => {
    expect(() => parseCsv("")).toThrow(CsvError);
    expect(() => parseCsv("\n\n")).toThrow("No se pudo leer el archivo. Comprueba que es un CSV.");
  });

  it("localiza la fila de cabeceras tras las líneas de título del banco", () => {
    const rows = [
      ["Últimos movimientos"],
      ["Cuenta", "ES00 0000"],
      ["F.Valor", "Fecha", "Concepto", "Movimiento", "Importe", "Divisa", "Observaciones"],
      ["05/10/2026", "05/10/2026", "Mercadona", "Pago con tarjeta", "-43,85", "EUR", ""],
    ];
    expect(detectHeaderRow(rows)).toBe(2);
    expect(
      detectHeaderRow([
        ["x", "y"],
        ["1", "2"],
      ]),
    ).toBe(0);
  });

  it("convierte la matriz en registros y numera cabeceras repetidas o vacías", () => {
    const table = toTable({
      delimiter: ";",
      rows: [
        ["Fecha", "Importe", "Importe", ""],
        ["05/10/2026", "1", "2"],
      ],
    });
    expect(table.headers).toEqual(["Fecha", "Importe", "Importe (2)", "Columna 4"]);
    expect(table.records).toEqual([
      { Fecha: "05/10/2026", Importe: "1", "Importe (2)": "2", "Columna 4": "" },
    ]);
  });

  it("lee un CSV de principio a fin", () => {
    const table = readCsv(encode("Extracto\nFecha;Concepto;Importe\n05/10/2026;Bar;-3,20\n"));
    expect(table.headers).toEqual(["Fecha", "Concepto", "Importe"]);
    expect(table.records).toEqual([{ Fecha: "05/10/2026", Concepto: "Bar", Importe: "-3,20" }]);
    expect(table.encoding).toBe("utf-8");
  });

  it("serializa a CSV con punto y coma", () => {
    expect(toCsv(["Fecha", "Concepto"], [["2026-10-05", "Bar; restaurante"]])).toBe(
      'Fecha;Concepto\r\n2026-10-05;"Bar; restaurante"',
    );
  });
});

describe("fechas de importación", () => {
  it.each([
    ["05/10/2026", "2026-10-05"],
    ["5/10/2026", "2026-10-05"],
    ["5/1/2026", "2026-01-05"],
    ["05-10-2026", "2026-10-05"],
    ["05.10.2026", "2026-10-05"],
    ["05/10/26", "2026-10-05"],
    ["2026-10-05", "2026-10-05"],
    ["2026-10-05T08:30:00.000Z", "2026-10-05"],
    ["2026/10/05", "2026-10-05"],
    ["05/10/2026 10:30", "2026-10-05"],
    ["October 5, 2026", "2026-10-05"],
    ["October 5, 2026 10:30 AM", "2026-10-05"],
    ["Oct 5, 2026", "2026-10-05"],
    ["5 de octubre de 2026", "2026-10-05"],
    ["5 de Octubre de 2026 10:30", "2026-10-05"],
    ["5 oct 2026", "2026-10-05"],
    ["1 de marzo de 2026", "2026-03-01"],
    ["31/12/2025", "2025-12-31"],
  ])("«%s» → %s", (input, expected) => {
    expect(parseImportDate(input)).toBe(expected);
  });

  it.each([
    "",
    "ayer",
    "32/01/2026",
    "30/02/2026",
    "Foo 5, 2026",
    "5 de nada de 2026",
    "2026-13-01",
  ])("rechaza «%s»", (input) => {
    expect(parseImportDate(input)).toBeNull();
  });

  it("resuelve las fechas ambiguas con el formato elegido en el mapeo", () => {
    expect(isAmbiguousDate("05/10/2026")).toBe(true);
    expect(isAmbiguousDate("25/10/2026")).toBe(false);
    expect(isAmbiguousDate("05/05/2026")).toBe(false);
    expect(isAmbiguousDate("2026-10-05")).toBe(false);
    expect(parseImportDate("05/10/2026", "dmy")).toBe("2026-10-05");
    expect(parseImportDate("05/10/2026", "mdy")).toBe("2026-05-10");
    // Con "auto", un número mayor que 12 delata el orden.
    expect(parseImportDate("10/25/2026", "auto")).toBe("2026-10-25");
    expect(parseImportDate("25/10/2026", "auto")).toBe("2026-10-25");
  });

  it("deduce el formato a partir de una muestra", () => {
    expect(detectDateFormat(["05/10/2026", "25/10/2026"])).toEqual({
      format: "dmy",
      ambiguous: false,
    });
    expect(detectDateFormat(["10/05/2026", "10/25/2026"])).toEqual({
      format: "mdy",
      ambiguous: false,
    });
    expect(detectDateFormat(["05/10/2026", "06/10/2026"])).toEqual({
      format: "dmy",
      ambiguous: true,
    });
    expect(detectDateFormat(["2026-10-05"])).toEqual({ format: "ymd", ambiguous: false });
    expect(detectDateFormat(["October 5, 2026"])).toEqual({ format: "dmy", ambiguous: false });
  });
});

describe("perfiles", () => {
  it("incluye BBVA, los de Notion y el genérico", () => {
    expect(PROFILE_PRESETS.map((preset) => preset.key)).toEqual([
      "bbva",
      "notion-pagos",
      "notion-ingresos",
      "notion-transferencias",
      "notion-cuentas",
      "generic",
    ]);
    expect(presetByKey("notion-ingresos").defaultType).toBe("income");
    expect(presetByKey("notion-cuentas").kind).toBe("accounts");
    expect(presetByKey("no-existe").key).toBe("generic");
  });

  it("detecta las columnas de un extracto tipo BBVA sin distinguir mayúsculas ni tildes", () => {
    const headers = [
      "F.Valor",
      "FECHA",
      "Concepto",
      "Movimiento",
      "Importe",
      "Divisa",
      "Disponible",
      "Observaciones",
    ];
    expect(detectColumns(headers, presetByKey("bbva").synonyms)).toEqual({
      date: "FECHA",
      concept: "Concepto",
      amount: "Importe",
      notes: "Observaciones",
    });
  });

  it("usa «Movimiento» como concepto si no hay columna de concepto", () => {
    const map = detectColumns(["Fecha", "Movimiento", "Importe"], presetByKey("bbva").synonyms);
    expect(map.concept).toBe("Movimiento");
    expect(map.notes).toBeUndefined();
  });

  it("detecta columnas de Notion y no confunde sinónimos cortos", () => {
    const headers = ["Nombre", "Fecha", "Cantidad", "Categoría", "Cuenta", "Notas", "Etiquetas"];
    expect(detectColumns(headers, presetByKey("notion-pagos").synonyms)).toEqual({
      date: "Fecha",
      concept: "Nombre",
      amount: "Cantidad",
      account: "Cuenta",
      category: "Categoría",
      notes: "Notas",
    });
    const transfers = detectColumns(
      ["Nombre", "Fecha", "Importe", "Origen", "Destino"],
      presetByKey("notion-transferencias").synonyms,
    );
    expect(transfers.account).toBe("Origen");
    expect(transfers.toAccount).toBe("Destino");
  });

  it("deduce el modo de signo partido cuando hay entrada y salida", () => {
    expect(inferSignMode({ amountIn: "Abono", amountOut: "Cargo" }, "signed")).toBe("split");
    expect(inferSignMode({ amount: "Importe", amountIn: "Abono" }, "signed")).toBe("signed");
    expect(inferSignMode({}, "byType")).toBe("byType");
  });
});

describe("pipeline de importación", () => {
  const tree = makeCategoryTree();
  const bank = makeAccount({ id: "bank", name: "BBVA débito" });
  const cash = makeAccount({ id: "cash", name: "Efectivo", type: "cash" });
  const rules = [
    makeRule({ id: "r-merca", pattern: "mercadona", categoryId: "supermarket" }),
    makeRule({ id: "r-nomina", pattern: "nomina", categoryId: "salary" }),
    makeRule({ id: "r-parent", pattern: "fruteria", categoryId: "food" }), // apunta a una no-hoja
  ];
  const context = { accounts: [bank, cash], index: tree.index, rules };

  const signed: ImportSettings = {
    columnMap: { date: "Fecha", concept: "Concepto", amount: "Importe", notes: "Observaciones" },
    signMode: "signed",
    dateFormat: "auto",
    decimalSeparator: ",",
    defaultType: "expense",
    defaultAccountId: "bank",
  };

  const records = [
    {
      Fecha: "05/10/2026",
      Concepto: "MERCADONA  MADRID",
      Importe: "-43,85",
      Observaciones: "Tarjeta",
    },
    { Fecha: "01/10/2026", Concepto: "Nómina octubre", Importe: "2.450,00", Observaciones: "" },
    { Fecha: "03/10/2026", Concepto: "Café", Importe: "-1,50", Observaciones: "" },
    { Fecha: "03/10/2026", Concepto: "Café", Importe: "-1,50", Observaciones: "" },
    { Fecha: "no es fecha", Concepto: "Roto", Importe: "-5,00", Observaciones: "" },
    { Fecha: "04/10/2026", Concepto: "Sin importe", Importe: "", Observaciones: "" },
    { Fecha: "04/10/2026", Concepto: "Frutería Paco", Importe: "-8,00", Observaciones: "" },
  ];

  it("mapea, normaliza y categoriza con el signo", () => {
    const rows = buildRows(records, signed, context);
    expect(rows[0]).toMatchObject({
      index: 0,
      status: "new",
      include: true,
      date: "2026-10-05",
      concept: "MERCADONA MADRID",
      amount: eur(43.85),
      type: "expense",
      accountId: "bank",
      categoryId: "supermarket",
      ruleId: "r-merca",
      notes: "Tarjeta",
    });
    expect(rows[1]).toMatchObject({
      type: "income",
      amount: eur(2450),
      categoryId: "salary",
      ruleId: "r-nomina",
      notes: null,
    });
    expect(rows[2]).toMatchObject({
      type: "expense",
      categoryId: null,
      ruleId: null,
      status: "new",
    });
  });

  it("marca como error las filas sin fecha o sin importe y las desmarca", () => {
    const rows = buildRows(records, signed, context);
    expect(rows[4]).toMatchObject({ status: "error", error: "Fecha no válida", include: false });
    expect(rows[5]).toMatchObject({ status: "error", error: "Importe no válido", include: false });
  });

  it("no aplica una regla que apunta a una categoría con hijas", () => {
    expect(buildRows(records, signed, context)[6]).toMatchObject({
      categoryId: null,
      ruleId: null,
    });
  });

  it("no aplica una regla de gasto a un ingreso", () => {
    const [row] = buildRows(
      [
        {
          Fecha: "05/10/2026",
          Concepto: "Devolución Mercadona",
          Importe: "12,00",
          Observaciones: "",
        },
      ],
      signed,
      context,
    );
    expect(row).toMatchObject({ type: "income", categoryId: null });
  });

  it("sin cuenta por defecto, falta la cuenta", () => {
    const [row] = buildRows(records.slice(0, 1), { ...signed, defaultAccountId: null }, context);
    expect(row).toMatchObject({ status: "error", error: "Falta la cuenta" });
  });

  it("interpreta columnas de entrada y salida", () => {
    const split: ImportSettings = {
      ...signed,
      signMode: "split",
      columnMap: { date: "Fecha", concept: "Concepto", amountIn: "Abono", amountOut: "Cargo" },
    };
    const rows = buildRows(
      [
        { Fecha: "05/10/2026", Concepto: "Bar", Abono: "", Cargo: "12,00" },
        { Fecha: "05/10/2026", Concepto: "Bizum", Abono: "20,00", Cargo: "0,00" },
        { Fecha: "05/10/2026", Concepto: "Nada", Abono: "", Cargo: "" },
      ],
      split,
      context,
    );
    expect(rows.map((row) => [row.type, row.amount, row.status])).toEqual([
      ["expense", eur(12), "new"],
      ["income", eur(20), "new"],
      ["expense", null, "error"],
    ]);
  });

  it("en modo por tipo usa el tipo del archivo y empareja cuentas y categorías por nombre", () => {
    const notion: ImportSettings = {
      columnMap: {
        date: "Fecha",
        concept: "Nombre",
        amount: "Cantidad",
        account: "Cuenta",
        category: "Categoría",
        toAccount: "Destino",
        type: "Tipo",
      },
      signMode: "byType",
      dateFormat: "auto",
      decimalSeparator: ",",
      defaultType: "expense",
      defaultAccountId: null,
    };
    const rows = buildRows(
      [
        {
          Fecha: "October 5, 2026",
          Nombre: "Compra",
          Cantidad: "30,00",
          Cuenta: "bbva DEBITO",
          Categoría: "supermercado",
          Destino: "",
          Tipo: "",
        },
        {
          Fecha: "October 6, 2026",
          Nombre: "Cine",
          Cantidad: "9",
          Cuenta: "Revolut",
          Categoría: "Cultura",
          Destino: "",
          Tipo: "",
        },
        {
          Fecha: "October 7, 2026",
          Nombre: "A la hucha",
          Cantidad: "100",
          Cuenta: "BBVA débito",
          Categoría: "",
          Destino: "Efectivo",
          Tipo: "Transferencia",
        },
        {
          Fecha: "October 8, 2026",
          Nombre: "Traspaso",
          Cantidad: "50",
          Cuenta: "BBVA débito",
          Categoría: "",
          Destino: "Hucha",
          Tipo: "Transferencia",
        },
        {
          Fecha: "October 9, 2026",
          Nombre: "Paga",
          Cantidad: "10",
          Cuenta: "Efectivo",
          Categoría: "Alimentación",
          Destino: "",
          Tipo: "Ingreso",
        },
      ],
      notion,
      context,
    );
    expect(rows[0]).toMatchObject({
      type: "expense",
      accountId: "bank",
      categoryId: "supermarket",
      status: "new",
    });
    expect(rows[1]).toMatchObject({
      accountId: null,
      unknownAccount: "Revolut",
      unknownCategory: "Cultura",
      status: "error",
    });
    expect(rows[2]).toMatchObject({
      type: "transfer",
      accountId: "bank",
      toAccountId: "cash",
      categoryId: null,
      status: "new",
    });
    expect(rows[3]).toMatchObject({
      type: "transfer",
      toAccountId: null,
      unknownToAccount: "Hucha",
      error: "Falta la cuenta de destino",
    });
    // "Alimentación" tiene hijas: no es asignable y queda como desconocida para el tipo ingreso.
    expect(rows[4]).toMatchObject({
      type: "income",
      accountId: "cash",
      categoryId: null,
      unknownCategory: "Alimentación",
    });

    expect(unknownNames(rows)).toEqual({
      accounts: ["Revolut", "Hucha"],
      categories: [
        { name: "Cultura", kind: "expense" },
        { name: "Alimentación", kind: "income" },
      ],
    });

    const withAccount = resolveName(rows, { kind: "account", name: "revolut", id: "cash" });
    expect(withAccount[1]).toMatchObject({
      accountId: "cash",
      unknownAccount: null,
      status: "new",
      include: true,
    });
    const withDestination = resolveName(withAccount, {
      kind: "account",
      name: "Hucha",
      id: "cash",
    });
    expect(withDestination[3]).toMatchObject({
      toAccountId: "cash",
      unknownToAccount: null,
      status: "new",
    });
    const withCategory = resolveName(withDestination, {
      kind: "category",
      name: "CULTURA",
      type: "expense",
      id: "leisure",
    });
    expect(withCategory[1]).toMatchObject({ categoryId: "leisure", unknownCategory: null });
    expect(unknownNames(withCategory).accounts).toEqual([]);
  });

  describe("deduplicación", () => {
    it("dos filas idénticas el mismo día son dos movimientos distintos", async () => {
      const rows = await resolveDuplicates(buildRows(records, signed, context), new Set());
      const [first, second] = [rows[2], rows[3]];
      expect(first?.importHash).toMatch(/^[0-9a-f]{64}$/);
      expect(second?.importHash).toMatch(/^[0-9a-f]{64}$/);
      expect(first?.importHash).not.toBe(second?.importHash);
      expect(rows.filter((row) => row.status === "new")).toHaveLength(5);
      expect(rows[4]?.importHash).toBeNull();
    });

    it("el hash sale de fecha, importe, tipo, concepto normalizado, cuenta y ocurrencia", async () => {
      const rows = await resolveDuplicates(buildRows(records, signed, context), new Set());
      expect(rows[0]?.importHash).toBe(
        await sha256Hex("2026-10-05|4385|expense|mercadona madrid|bank|0"),
      );
      expect(rows[2]?.importHash).toBe(await sha256Hex("2026-10-03|150|expense|cafe|bank|0"));
      expect(rows[3]?.importHash).toBe(await sha256Hex("2026-10-03|150|expense|cafe|bank|1"));
    });

    it("reimportar el mismo archivo marca todo como duplicado y lo desmarca", async () => {
      const first = await resolveDuplicates(buildRows(records, signed, context), new Set());
      const existing = new Set(
        first.flatMap((row) => (row.importHash === null ? [] : [row.importHash])),
      );
      const again = await resolveDuplicates(buildRows(records, signed, context), existing);
      const valid = again.filter((row) => row.status !== "error");
      expect(valid).toHaveLength(5);
      expect(valid.every((row) => row.status === "duplicate" && !row.include)).toBe(true);
      expect(toDrafts(again)).toEqual([]);
      expect(summarize(again)).toMatchObject({ fresh: 0, duplicates: 5, errors: 2, ready: 0 });
    });

    it("un tercer café idéntico en un archivo posterior sí es nuevo", async () => {
      const first = await resolveDuplicates(buildRows(records, signed, context), new Set());
      const existing = new Set(
        first.flatMap((row) => (row.importHash === null ? [] : [row.importHash])),
      );
      const coffee = { Fecha: "03/10/2026", Concepto: "Café", Importe: "-1,50", Observaciones: "" };
      const later = await resolveDuplicates(
        buildRows([coffee, coffee, coffee], signed, context),
        existing,
      );
      expect(later.map((row) => row.status)).toEqual(["duplicate", "duplicate", "new"]);
    });

    it("editar el tipo o la cuenta en la vista previa no cambia el hash", async () => {
      const first = await resolveDuplicates(buildRows(records, signed, context), new Set());
      const edited = await resolveDuplicates(
        first.map((row, index) =>
          index === 0
            ? patchRow(row, { type: "transfer", toAccountId: "cash" })
            : index === 2
              ? patchRow(row, { accountId: "cash" })
              : row,
        ),
        new Set(),
      );
      expect(edited[0]).toMatchObject({ type: "transfer", sourceType: "expense" });
      expect(edited[0]?.importHash).toBe(first[0]?.importHash);
      expect(edited[2]).toMatchObject({ accountId: "cash", sourceAccountId: "bank" });
      expect(edited[2]?.importHash).toBe(first[2]?.importHash);

      // Al reimportar el mismo archivo, las filas editadas siguen siendo duplicadas.
      const existing = new Set(
        edited.flatMap((row) => (row.importHash === null ? [] : [row.importHash])),
      );
      const again = await resolveDuplicates(buildRows(records, signed, context), existing);
      expect(again.filter((row) => row.status === "new")).toEqual([]);
    });

    it("sin cuenta en el archivo, el hash usa la elegida a mano", async () => {
      const noAccount = { ...signed, defaultAccountId: null };
      const [row] = buildRows(records.slice(0, 1), noAccount, context);
      expect(row).toMatchObject({ status: "error", sourceAccountId: null });
      const [fixed] = await resolveDuplicates([patchRow(row!, { accountId: "cash" })], new Set());
      expect(fixed?.importHash).toBe(
        await sha256Hex("2026-10-05|4385|expense|mercadona madrid|cash|0"),
      );
    });

    it("respeta la casilla que marcó el usuario al recalcular", async () => {
      const rows = await resolveDuplicates(buildRows(records, signed, context), new Set());
      const unchecked = rows.map((row, index) => (index === 0 ? { ...row, include: false } : row));
      const again = await resolveDuplicates(unchecked, new Set());
      expect(again[0]?.include).toBe(false);
      const forced = await resolveDuplicates(
        rows.map((row) => ({ ...row, include: true })),
        new Set([rows[0]?.importHash ?? ""]),
      );
      expect(forced[0]).toMatchObject({ status: "duplicate", include: false });
    });
  });

  describe("edición en la vista previa", () => {
    it("cambiar la categoría o la cuenta revalida la fila y obliga a recalcular el hash", async () => {
      const rows = await resolveDuplicates(buildRows(records, signed, context), new Set());
      const edited = patchRow(rows[2] ?? rows[0]!, { categoryId: "leisure", accountId: "cash" });
      expect(edited).toMatchObject({
        categoryId: "leisure",
        accountId: "cash",
        ruleId: null,
        importHash: null,
        status: "new",
      });
      expect(isReady(edited)).toBe(false);
      const [rehashed] = await resolveDuplicates([edited], new Set());
      expect(isReady(rehashed!)).toBe(true);
    });

    it("marcar una fila como transferencia a otra cuenta quita la categoría", () => {
      const [row] = buildRows(records.slice(0, 1), signed, context);
      const transfer = patchRow(row!, { type: "transfer", toAccountId: "cash" });
      expect(transfer).toMatchObject({
        type: "transfer",
        toAccountId: "cash",
        categoryId: null,
        ruleId: null,
        status: "new",
      });
      const same = patchRow(row!, { type: "transfer", toAccountId: "bank" });
      expect(same).toMatchObject({
        status: "error",
        error: "Las cuentas deben ser distintas",
        include: false,
      });
      const back = patchRow(transfer, { type: "expense" });
      expect(back).toMatchObject({ type: "expense", toAccountId: null, categoryId: null });
    });

    it("corregir una fila con error la vuelve a marcar", () => {
      const [row] = buildRows(records.slice(0, 1), { ...signed, defaultAccountId: null }, context);
      expect(patchRow(row!, { accountId: "bank" })).toMatchObject({
        status: "new",
        error: null,
        include: true,
      });
      expect(patchRow(row!, { include: true })).toMatchObject({ status: "error", include: false });
    });

    it("valida filas sueltas", () => {
      const ok = {
        date: d("2026-10-05"),
        amount: eur(1),
        type: "expense",
        accountId: "bank",
        toAccountId: null,
      } as const;
      expect(rowError(ok)).toBeNull();
      expect(rowError({ ...ok, amount: eur(0) })).toBe("Importe no válido");
    });
  });

  it("resume la vista previa y solo importa lo que está completo", async () => {
    const rows = await resolveDuplicates(buildRows(records, signed, context), new Set());
    expect(summarize(rows)).toEqual({
      total: 7,
      fresh: 5,
      duplicates: 0,
      errors: 2,
      uncategorized: 3,
      ready: 2,
    });
    const drafts = toDrafts(rows);
    expect(drafts.map((draft) => draft.concept)).toEqual(["MERCADONA MADRID", "Nómina octubre"]);
    expect(drafts[0]).toMatchObject({
      type: "expense",
      amount: eur(43.85),
      accountId: "bank",
      categoryId: "supermarket",
      ruleId: "r-merca",
    });
  });

  describe("cuentas de Notion", () => {
    const settings = {
      columnMap: { concept: "Nombre", amount: "Saldo", type: "Tipo", date: "Apertura" },
      dateFormat: "auto",
      decimalSeparator: ",",
    } as const;

    it("crea cuentas nuevas y reconoce las existentes por nombre", () => {
      const drafts = buildAccountDrafts(
        [
          {
            Nombre: "bbva débito",
            Saldo: "1.250,40",
            Tipo: "Banco",
            Apertura: "1 de enero de 2024",
          },
          { Nombre: "Trade Republic", Saldo: "5000", Tipo: "Inversión", Apertura: "" },
          { Nombre: "Hucha", Saldo: "", Tipo: "", Apertura: "" },
          { Nombre: "Deudas de amigos", Saldo: "-20", Tipo: "", Apertura: "" },
          { Nombre: "", Saldo: "10", Tipo: "", Apertura: "" },
          { Nombre: "Hucha", Saldo: "75", Tipo: "Ahorro", Apertura: "" },
        ],
        settings,
        [bank, cash],
      );
      expect(drafts).toEqual([
        {
          name: "bbva débito",
          type: "checking",
          isLiquid: true,
          openingBalance: eur(1250.4),
          openingDate: "2024-01-01",
          existingId: "bank",
        },
        {
          name: "Trade Republic",
          type: "investment",
          isLiquid: false,
          openingBalance: eur(5000),
          openingDate: null,
          existingId: null,
        },
        {
          name: "Hucha",
          type: "savings",
          isLiquid: true,
          openingBalance: eur(75),
          openingDate: null,
          existingId: null,
        },
        {
          name: "Deudas de amigos",
          type: "receivable",
          isLiquid: false,
          openingBalance: null,
          openingDate: null,
          existingId: null,
        },
      ]);
    });
  });
});
