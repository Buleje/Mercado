import { describe, expect, it } from "vitest";
import { inicioDeLaTendencia, mesDeLima, tendenciaMensualFiados } from "@/lib/fiados/tendencia-mensual";

/* Sábado 17/10/2026 al mediodía de Lima. */
const AHORA = new Date("2026-10-17T17:00:00.000Z");

describe("tendencia de Me deben con el mes de Lima", () => {
  it("un fiado del 30/09 a las 21:00 de Lima es de setiembre, no de octubre", () => {
    // 21:00 Lima = 02:00 UTC del 01/10: el `toISOString` viejo lo mandaba a octubre.
    expect(mesDeLima("2026-10-01T02:00:00.000Z")).toBe("2026-09");
    const t = tendenciaMensualFiados(AHORA, [{ total: 150, createdAt: "2026-10-01T02:00:00.000Z" }], []);
    expect(t.find((m) => m.mes === "2026-09")?.nuevos).toBe(150);
    expect(t.find((m) => m.mes === "2026-10")?.nuevos).toBe(0);
  });

  it("un cobro del 01/10 a las 00:30 de Lima es de octubre", () => {
    const t = tendenciaMensualFiados(AHORA, [], [{ monto: "40.50", pagadoEn: new Date("2026-10-01T05:30:00.000Z") }]);
    expect(t.find((m) => m.mes === "2026-10")?.cobrados).toBe(40.5);
  });

  it("trae 12 meses de Lima terminando en el actual y lee desde el 1.º del primero", () => {
    const t = tendenciaMensualFiados(AHORA, [], []);
    expect(t).toHaveLength(12);
    expect(t[0].mes).toBe("2025-11");
    expect(t[11].mes).toBe("2026-10");
    expect(mesDeLima(inicioDeLaTendencia(AHORA))).toBe("2025-11");
    // 1.º de noviembre 00:00 de Lima = 05:00 UTC.
    expect(inicioDeLaTendencia(AHORA).toISOString()).toBe("2025-11-01T05:00:00.000Z");
  });

  it("ignora cobros sin fecha y lo que cae fuera de los 12 meses; redondea a céntimos", () => {
    const t = tendenciaMensualFiados(
      AHORA,
      [{ total: 0.1, createdAt: "2026-10-05T15:00:00.000Z" }, { total: 0.2, createdAt: "2026-10-05T16:00:00.000Z" }, { total: 99, createdAt: "2024-01-05T15:00:00.000Z" }],
      [{ monto: 10, pagadoEn: null }],
    );
    expect(t.find((m) => m.mes === "2026-10")?.nuevos).toBe(0.3);
    expect(t.reduce((s, m) => s + m.nuevos + m.cobrados, 0)).toBe(0.3);
  });
});
