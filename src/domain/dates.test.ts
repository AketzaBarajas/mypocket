import { describe, expect, it } from "vitest";

import {
  addDaysIso,
  addMonthsIso,
  addMonthsYm,
  daysInMonth,
  daysLeftInMonth,
  diffDays,
  diffMonths,
  endOfMonthIso,
  formatDayHeader,
  formatDayMonth,
  formatLongDate,
  formatMonthName,
  formatMonthShort,
  formatMonthYear,
  formatNumericDate,
  formatRelativeDay,
  formatShortDate,
  fromDate,
  isInMonth,
  isIsoDate,
  isoDate,
  isYearMonth,
  makeIsoDate,
  mondayOf,
  monthOf,
  monthRange,
  startOfMonthIso,
  startOfMonthOf,
  toDate,
  todayFrom,
  yearMonth,
  yearOf,
} from "./dates";
import { d, ym } from "./testing/fixtures";

describe("validación", () => {
  it("acepta solo fechas reales", () => {
    expect(isIsoDate("2026-10-05")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-1-5")).toBe(false);
    expect(isIsoDate("05/10/2026")).toBe(false);
    expect(() => isoDate("2026-02-30")).toThrow(RangeError);
  });

  it("valida meses", () => {
    expect(isYearMonth("2026-10")).toBe(true);
    expect(isYearMonth("2026-00")).toBe(false);
    expect(isYearMonth("2026-13")).toBe(false);
    expect(() => yearMonth("2026")).toThrow(RangeError);
  });

  it("construye fechas a partir de sus partes", () => {
    expect(makeIsoDate(2026, 10, 5)).toBe("2026-10-05");
    expect(makeIsoDate(2026, 2, 30)).toBeNull();
  });
});

describe("conversión", () => {
  it("va y vuelve por Date en hora local", () => {
    const date = toDate(d("2026-10-05"));
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(9);
    expect(date.getDate()).toBe(5);
    expect(date.getHours()).toBe(0);
    expect(fromDate(date)).toBe("2026-10-05");
  });

  it("toma el día local de un instante, no el día UTC", () => {
    // 23:30 del día 5 en Madrid ya es día 5, aunque en UTC sean las 21:30.
    expect(todayFrom(new Date(2026, 9, 5, 23, 30))).toBe("2026-10-05");
    // 00:30 del día 6 en Madrid es día 6, aunque en UTC aún sea día 5.
    expect(todayFrom(new Date(2026, 9, 6, 0, 30))).toBe("2026-10-06");
  });
});

describe("aritmética", () => {
  it("suma días cruzando meses, años y cambios de hora", () => {
    expect(addDaysIso(d("2026-10-31"), 1)).toBe("2026-11-01");
    expect(addDaysIso(d("2026-12-31"), 1)).toBe("2027-01-01");
    expect(addDaysIso(d("2026-03-01"), -1)).toBe("2026-02-28");
    // El 25 de octubre de 2026 se atrasa la hora en Madrid.
    expect(addDaysIso(d("2026-10-24"), 2)).toBe("2026-10-26");
    expect(diffDays(d("2026-10-26"), d("2026-10-24"))).toBe(2);
  });

  it("suma meses ajustando al último día", () => {
    expect(addMonthsIso(d("2026-01-31"), 1)).toBe("2026-02-28");
    expect(addMonthsIso(d("2024-01-31"), 1)).toBe("2024-02-29");
    expect(addMonthsIso(d("2026-01-31"), 2)).toBe("2026-03-31");
    expect(addMonthsYm(ym("2026-12"), 1)).toBe("2027-01");
    expect(addMonthsYm(ym("2026-01"), -1)).toBe("2025-12");
  });

  it("calcula diferencias", () => {
    expect(diffMonths(ym("2027-01"), ym("2026-10"))).toBe(3);
    expect(diffMonths(ym("2026-10"), ym("2026-10"))).toBe(0);
  });

  it("conoce los límites del mes", () => {
    expect(startOfMonthIso(ym("2026-10"))).toBe("2026-10-01");
    expect(endOfMonthIso(ym("2026-02"))).toBe("2026-02-28");
    expect(endOfMonthIso(ym("2024-02"))).toBe("2024-02-29");
    expect(daysInMonth(ym("2026-10"))).toBe(31);
    expect(startOfMonthOf(d("2026-10-17"))).toBe("2026-10-01");
    expect(monthOf(d("2026-10-05"))).toBe("2026-10");
    expect(yearOf(d("2026-10-05"))).toBe(2026);
    expect(isInMonth(d("2026-10-05"), ym("2026-10"))).toBe(true);
    expect(isInMonth(d("2026-11-01"), ym("2026-10"))).toBe(false);
  });

  it("cuenta los días que quedan de mes, hoy incluido", () => {
    expect(daysLeftInMonth(d("2026-10-05"))).toBe(27);
    expect(daysLeftInMonth(d("2026-10-31"))).toBe(1);
    expect(daysLeftInMonth(d("2026-10-01"))).toBe(31);
  });

  it("empieza la semana en lunes", () => {
    expect(mondayOf(d("2026-10-05"))).toBe("2026-10-05"); // lunes
    expect(mondayOf(d("2026-10-07"))).toBe("2026-10-05"); // miércoles
    expect(mondayOf(d("2026-10-11"))).toBe("2026-10-05"); // domingo
    expect(mondayOf(d("2026-10-12"))).toBe("2026-10-12");
  });

  it("lista meses entre dos extremos", () => {
    expect(monthRange(ym("2026-11"), ym("2027-01"))).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(monthRange(ym("2026-11"), ym("2026-10"))).toEqual([]);
  });
});

describe("formato en español", () => {
  it("formatea fechas", () => {
    expect(formatLongDate(d("2026-10-05"))).toBe("Lunes, 5 de octubre");
    expect(formatShortDate(d("2026-10-05"))).toBe("5 oct 2026");
    expect(formatDayMonth(d("2026-10-05"))).toBe("5 oct");
    expect(formatNumericDate(d("2026-10-05"))).toBe("05/10/2026");
    expect(formatMonthYear(ym("2026-10"))).toBe("Octubre 2026");
    expect(formatMonthName(ym("2026-10"))).toBe("octubre");
    expect(formatMonthShort(ym("2026-10"))).toBe("oct");
  });

  it("da cabeceras de día relativas", () => {
    const today = d("2026-10-05");
    expect(formatDayHeader(today, today)).toBe("Hoy");
    expect(formatDayHeader(d("2026-10-04"), today)).toBe("Ayer");
    expect(formatDayHeader(d("2026-10-06"), today)).toBe("Mañana");
    expect(formatDayHeader(d("2026-10-01"), today)).toBe("Jue · 1 oct");
    expect(formatDayHeader(d("2025-12-31"), today)).toBe("Mié · 31 dic 2025");
  });

  it("da distancias relativas para pendientes", () => {
    const today = d("2026-10-05");
    expect(formatRelativeDay(today, today)).toBe("hoy");
    expect(formatRelativeDay(d("2026-10-06"), today)).toBe("mañana");
    expect(formatRelativeDay(d("2026-10-04"), today)).toBe("ayer");
    expect(formatRelativeDay(d("2026-10-08"), today)).toBe("en 3 días");
    expect(formatRelativeDay(d("2026-10-03"), today)).toBe("hace 2 días");
  });
});
