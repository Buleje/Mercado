/**
 * Comparar contra el período de al lado (ADR-386).
 *
 * Lo que se prueba es que los dos lapsos sean COMPARABLES: comparar un
 * trimestre contra un mes fabrica una caída del 66 % que nunca existió, y ésa
 * es la clase de número que termina en una decisión de compra equivocada.
 */
import { describe, expect, it } from "vitest";
import { periodoAnterior, resolveCtpPeriod } from "@/lib/forestal/ctp-period";

/** 15 de marzo de 2026, hora local. */
const AHORA = new Date(2026, 2, 15, 10, 0, 0);
const dia = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-PE") : null);
const largoDias = (p: { from: string | null; to: string | null }) =>
  Math.round((Date.parse(p.to!) - Date.parse(p.from!)) / 86_400_000);

describe("periodoAnterior", () => {
  it("de un mes da el mes ENTERO anterior, no 30 días para atrás", () => {
    const marzo = resolveCtpPeriod("mes-actual", undefined, AHORA);
    const prev = periodoAnterior(marzo)!;
    expect(dia(prev.from)).toBe(new Date(2026, 1, 1).toLocaleDateString("es-PE"));
    expect(dia(prev.to)).toBe(new Date(2026, 1, 28).toLocaleDateString("es-PE"));
    expect(prev.label).toContain("febrero");
  });

  it("cruza el año hacia atrás sin romperse", () => {
    const enero = resolveCtpPeriod("mes-actual", undefined, new Date(2026, 0, 20));
    const prev = periodoAnterior(enero)!;
    expect(dia(prev.from)).toBe(new Date(2025, 11, 1).toLocaleDateString("es-PE"));
    expect(prev.label).toContain("2025");
  });

  it("respeta el febrero bisiesto", () => {
    const marzo24 = resolveCtpPeriod("mes-actual", undefined, new Date(2024, 2, 10));
    expect(dia(periodoAnterior(marzo24)!.to)).toBe(new Date(2024, 1, 29).toLocaleDateString("es-PE"));
  });

  it("del año da el año anterior completo", () => {
    const prev = periodoAnterior(resolveCtpPeriod("anio", undefined, AHORA))!;
    expect(prev.label).toBe("Año 2025");
    expect(dia(prev.from)).toBe(new Date(2025, 0, 1).toLocaleDateString("es-PE"));
  });

  it("del trimestre da el trimestre CALENDARIO anterior, no 92 días atrás", () => {
    // ene–mar 2026 ⇒ oct–dic 2025, no «31 dic — 31 mar» corrido por ms.
    const tri = resolveCtpPeriod("trimestre", undefined, AHORA);
    const prev = periodoAnterior(tri)!;
    expect(dia(prev.from)).toBe(new Date(2025, 9, 1).toLocaleDateString("es-PE"));
    expect(dia(prev.to)).toBe(new Date(2025, 11, 31).toLocaleDateString("es-PE"));
    expect(Date.parse(prev.to!)).toBeLessThan(Date.parse(tri.from!));
  });

  it("de un rango custom da el mismo largo hacia atrás", () => {
    const custom = resolveCtpPeriod("custom", { from: "2026-03-01", to: "2026-03-10" }, AHORA);
    const prev = periodoAnterior(custom)!;
    expect(largoDias(prev)).toBe(largoDias(custom));
    expect(Date.parse(prev.to!)).toBeLessThan(Date.parse(custom.from!));
  });

  it("«todo el histórico» NO tiene un antes: null, no un período inventado", () => {
    expect(periodoAnterior(resolveCtpPeriod("todo", undefined, AHORA))).toBeNull();
  });

  it("un rango custom sin definir tampoco", () => {
    expect(periodoAnterior(resolveCtpPeriod("custom", { from: "2026-03-10" }, AHORA))).toBeNull();
    // invertido → resolveCtpPeriod ya lo neutraliza
    expect(periodoAnterior(resolveCtpPeriod("custom", { from: "2026-03-10", to: "2026-03-01" }, AHORA))).toBeNull();
  });
});
