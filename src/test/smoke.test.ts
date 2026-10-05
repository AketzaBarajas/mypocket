import { describe, expect, it } from "vitest";

describe("entorno de tests", () => {
  it("usa la zona horaria de negocio", () => {
    // 5 de octubre de 2026 a medianoche local es UTC+2 (horario de verano).
    expect(new Date(2026, 9, 5).getTimezoneOffset()).toBe(-120);
    // 5 de enero de 2026 es UTC+1 (horario de invierno).
    expect(new Date(2026, 0, 5).getTimezoneOffset()).toBe(-60);
  });
});
