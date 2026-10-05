import { describe, expect, it } from "vitest";

import {
  describeFrequency,
  firstOccurrenceOnOrAfter,
  monthlyEquivalent,
  nextOccurrenceAfter,
  occurrenceAt,
  processRecurrences,
  subscriptionsMonthlyTotal,
} from "./recurrences";
import { d, eur, makeRecurrence, makeTransaction } from "./testing/fixtures";
import type { Recurrence, Transaction } from "./types";

/** Aplica el resultado de una pasada como lo haría la capa de datos. */
const applyRun = (
  recurrences: ReadonlyArray<Recurrence>,
  transactions: ReadonlyArray<Transaction>,
  run: ReturnType<typeof processRecurrences>,
) => ({
  recurrences: recurrences.map((recurrence) => {
    const advance = run.advances.find((item) => item.id === recurrence.id);
    return advance ? { ...recurrence, nextDueDate: advance.nextDueDate } : recurrence;
  }),
  transactions: [
    ...transactions,
    ...run.drafts.map((draft) => makeTransaction({ ...draft, status: "pending" })),
  ],
});

describe("calendario de ocurrencias", () => {
  const monthly = (anchor: string) =>
    ({ frequency: "monthly", interval: 1, anchorDate: d(anchor) }) as const;

  it("un día 31 se ajusta a fin de mes y vuelve al 31", () => {
    const schedule = monthly("2026-01-31");
    expect([0, 1, 2, 3, 4, 5].map((index) => occurrenceAt(schedule, index))).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
      "2026-06-30",
    ]);
  });

  it("un día 30 solo se ajusta en febrero", () => {
    const schedule = monthly("2026-01-30");
    expect([1, 2, 3].map((index) => occurrenceAt(schedule, index))).toEqual([
      "2026-02-28",
      "2026-03-30",
      "2026-04-30",
    ]);
  });

  it("un día 29 cae en 28 o 29 de febrero según el año", () => {
    expect(occurrenceAt(monthly("2026-01-29"), 1)).toBe("2026-02-28");
    expect(occurrenceAt(monthly("2026-01-29"), 2)).toBe("2026-03-29");
    expect(occurrenceAt(monthly("2024-01-29"), 1)).toBe("2024-02-29");
    expect(occurrenceAt(monthly("2027-12-29"), 2)).toBe("2028-02-29");
  });

  it("anual: el 29 de febrero se ajusta en años no bisiestos", () => {
    const schedule = { frequency: "yearly", interval: 1, anchorDate: d("2024-02-29") } as const;
    expect([1, 2, 3, 4].map((index) => occurrenceAt(schedule, index))).toEqual([
      "2025-02-28",
      "2026-02-28",
      "2027-02-28",
      "2028-02-29",
    ]);
  });

  it("respeta el intervalo", () => {
    expect(
      occurrenceAt({ frequency: "monthly", interval: 3, anchorDate: d("2026-01-15") }, 2),
    ).toBe("2026-07-15");
    expect(occurrenceAt({ frequency: "weekly", interval: 2, anchorDate: d("2026-10-05") }, 3)).toBe(
      "2026-11-16",
    );
    expect(occurrenceAt({ frequency: "yearly", interval: 2, anchorDate: d("2026-03-10") }, 1)).toBe(
      "2028-03-10",
    );
    // Un intervalo no válido se trata como 1.
    expect(
      occurrenceAt({ frequency: "monthly", interval: 0, anchorDate: d("2026-01-15") }, 1),
    ).toBe("2026-02-15");
  });

  it("encuentra la siguiente ocurrencia posterior a una fecha", () => {
    const schedule = monthly("2026-01-31");
    expect(nextOccurrenceAfter(schedule, d("2026-01-31"))).toBe("2026-02-28");
    expect(nextOccurrenceAfter(schedule, d("2026-02-28"))).toBe("2026-03-31");
    expect(nextOccurrenceAfter(schedule, d("2026-02-10"))).toBe("2026-02-28");
    expect(nextOccurrenceAfter(schedule, d("2025-06-01"))).toBe("2026-01-31");
    expect(nextOccurrenceAfter(schedule, d("2031-07-31"))).toBe("2031-08-31");

    const weekly = { frequency: "weekly", interval: 1, anchorDate: d("2026-10-05") } as const;
    expect(nextOccurrenceAfter(weekly, d("2026-10-05"))).toBe("2026-10-12");
    expect(nextOccurrenceAfter(weekly, d("2026-10-11"))).toBe("2026-10-12");
    expect(firstOccurrenceOnOrAfter(weekly, d("2026-10-12"))).toBe("2026-10-12");
    expect(firstOccurrenceOnOrAfter(weekly, d("2026-10-13"))).toBe("2026-10-19");
  });
});

describe("generación de pendientes", () => {
  const today = d("2026-10-05");

  it("crea el pendiente cuando entra en el plazo de aviso", () => {
    const rent = makeRecurrence({ id: "rent", nextDueDate: d("2026-10-08"), leadDays: 3 });
    expect(processRecurrences([rent], [], d("2026-10-04")).drafts).toEqual([]);

    const run = processRecurrences([rent], [], today);
    expect(run.drafts).toEqual([
      {
        recurrenceId: "rent",
        type: "expense",
        date: "2026-10-08",
        amount: eur(620),
        accountId: "acc",
        toAccountId: null,
        categoryId: "cat",
        concept: "Alquiler",
      },
    ]);
    expect(run.advances).toEqual([{ id: "rent", nextDueDate: "2026-11-01" }]);
  });

  it("es idempotente: ejecutarlo dos veces no duplica nada", () => {
    const recurrences = [
      makeRecurrence({ id: "rent", anchorDate: d("2026-01-01"), nextDueDate: d("2026-10-01") }),
      makeRecurrence({
        id: "gym",
        frequency: "weekly",
        anchorDate: d("2026-09-07"),
        nextDueDate: d("2026-09-21"),
        leadDays: 0,
      }),
    ];
    const first = processRecurrences(recurrences, [], today);
    expect(first.drafts.map((draft) => `${draft.recurrenceId}@${draft.date}`)).toEqual([
      "rent@2026-10-01",
      "gym@2026-09-21",
      "gym@2026-09-28",
      "gym@2026-10-05",
    ]);

    const state = applyRun(recurrences, [], first);
    const second = processRecurrences(state.recurrences, state.transactions, today);
    expect(second).toEqual({ drafts: [], advances: [] });
  });

  it("tampoco duplica si la segunda pasada recibe las recurrencias sin avanzar", () => {
    const recurrences = [makeRecurrence({ id: "rent", nextDueDate: d("2026-10-01") })];
    const first = processRecurrences(recurrences, [], today);
    const { transactions } = applyRun(recurrences, [], first);
    // Se guardaron los movimientos pero no llegó a guardarse el avance.
    const second = processRecurrences(recurrences, transactions, today);
    expect(second.drafts).toEqual([]);
    expect(second.advances).toEqual(first.advances);
  });

  it("no resucita un pendiente omitido (borrado lógico)", () => {
    const rent = makeRecurrence({ id: "rent", nextDueDate: d("2026-10-01") });
    const skipped = makeTransaction({
      recurrenceId: "rent",
      date: d("2026-10-01"),
      status: "pending",
      isDeleted: true,
    });
    const run = processRecurrences([rent], [skipped], today);
    expect(run.drafts).toEqual([]);
    expect(run.advances).toEqual([{ id: "rent", nextDueDate: "2026-11-01" }]);
  });

  it("se pone al día tras meses sin abrir la app", () => {
    const rent = makeRecurrence({
      id: "rent",
      anchorDate: d("2026-01-31"),
      nextDueDate: d("2026-06-30"),
      leadDays: 0,
    });
    const run = processRecurrences([rent], [], today);
    expect(run.drafts.map((draft) => draft.date)).toEqual([
      "2026-06-30",
      "2026-07-31",
      "2026-08-31",
      "2026-09-30",
    ]);
    expect(run.advances).toEqual([{ id: "rent", nextDueDate: "2026-10-31" }]);
  });

  it("deja de generar después de endDate", () => {
    const ending = makeRecurrence({
      id: "course",
      anchorDate: d("2026-08-10"),
      nextDueDate: d("2026-08-10"),
      endDate: d("2026-09-10"),
      leadDays: 0,
    });
    const run = processRecurrences([ending], [], today);
    expect(run.drafts.map((draft) => draft.date)).toEqual(["2026-08-10", "2026-09-10"]);
    expect(run.advances).toEqual([{ id: "course", nextDueDate: "2026-10-10" }]);
    const state = applyRun([ending], [], run);
    expect(processRecurrences(state.recurrences, state.transactions, d("2027-01-01"))).toEqual({
      drafts: [],
      advances: [],
    });
  });

  it("ignora las recurrencias pausadas", () => {
    const paused = makeRecurrence({ nextDueDate: d("2026-09-01"), active: false });
    expect(processRecurrences([paused], [], today)).toEqual({ drafts: [], advances: [] });
  });

  it("copia la plantilla según el tipo", () => {
    const transfer = makeRecurrence({
      id: "invest",
      name: "Aportación mensual",
      type: "transfer",
      toAccountId: "broker",
      categoryId: "cat",
      concept: "",
      nextDueDate: today,
      leadDays: 0,
    });
    const [draft] = processRecurrences([transfer], [], today).drafts;
    expect(draft?.toAccountId).toBe("broker");
    expect(draft?.categoryId).toBeNull();
    // Sin concepto en la plantilla se usa el nombre.
    expect(draft?.concept).toBe("Aportación mensual");
  });

  it("tiene un tope de ocurrencias por pasada", () => {
    const daily = makeRecurrence({
      frequency: "weekly",
      anchorDate: d("2000-01-03"),
      nextDueDate: d("2000-01-03"),
      leadDays: 0,
    });
    const run = processRecurrences([daily], [], today);
    expect(run.drafts).toHaveLength(500);
  });
});

describe("importe mensual equivalente", () => {
  it("convierte anuales y semanales", () => {
    expect(monthlyEquivalent({ amount: eur(120), frequency: "yearly", interval: 1 })).toBe(eur(10));
    expect(monthlyEquivalent({ amount: eur(12), frequency: "weekly", interval: 1 })).toBe(eur(52));
    expect(monthlyEquivalent({ amount: eur(13.99), frequency: "monthly", interval: 1 })).toBe(
      eur(13.99),
    );
    expect(monthlyEquivalent({ amount: eur(30), frequency: "monthly", interval: 3 })).toBe(eur(10));
    expect(monthlyEquivalent({ amount: eur(100), frequency: "yearly", interval: 1 })).toBe(
      eur(8.33),
    );
  });

  it("suma solo las suscripciones activas", () => {
    const recurrences = [
      makeRecurrence({ amount: eur(13.99), isSubscription: true }),
      makeRecurrence({ amount: eur(120), frequency: "yearly", isSubscription: true }),
      makeRecurrence({ amount: eur(50), isSubscription: true, active: false }),
      makeRecurrence({ amount: eur(620), isSubscription: false }),
    ];
    expect(subscriptionsMonthlyTotal(recurrences)).toBe(eur(23.99));
  });

  it("describe la frecuencia", () => {
    expect(describeFrequency("monthly", 1)).toBe("Cada mes");
    expect(describeFrequency("monthly", 3)).toBe("Cada 3 meses");
    expect(describeFrequency("weekly", 1)).toBe("Cada semana");
    expect(describeFrequency("weekly", 2)).toBe("Cada 2 semanas");
    expect(describeFrequency("yearly", 1)).toBe("Cada año");
    expect(describeFrequency("yearly", 2)).toBe("Cada 2 años");
  });
});
