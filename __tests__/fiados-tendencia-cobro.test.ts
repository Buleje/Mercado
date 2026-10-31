import { describe, expect, it } from "vitest";
import { claveMes, comparativoDeCobro, type MesCobro } from "@/components/admin/fiados/tendencia-cobro";

const serie: MesCobro[] = [
  { mes: "2026-08", cobrados: 0, nuevos: 300, neto: -300 },
  { mes: "2026-09", cobrados: 200, nuevos: 100, neto: 100 },
  { mes: "2026-10", cobrados: 250, nuevos: 0, neto: 250 },
];

describe("tendencia de cobro (M38)", () => {
  it("con el mes pasado en cero no inventa un porcentaje", () => {
    expect(comparativoDeCobro(serie, "2026-09")).toEqual({ tipo: "sin-base", mesAnterior: "2026-08" });
  });

  it("compara lo cobrado contra el mes anterior de la serie", () => {
    const c = comparativoDeCobro(serie, "2026-10");
    expect(c.tipo).toBe("pct");
    if (c.tipo !== "pct") return;
    expect(c.pct).toBeCloseTo(25);
    expect(c.diferencia).toBe(50);
    expect(c.mesAnterior).toBe("2026-09");
  });

  it("el primer mes de la serie no tiene con qué compararse", () => {
    expect(comparativoDeCobro(serie, "2026-08")).toEqual({ tipo: "sin-anterior" });
    expect(comparativoDeCobro(serie, "2027-01")).toEqual({ tipo: "sin-anterior" });
  });

  it("el mes de un cobro usa el mismo calendario que la serie (UTC)", () => {
    // 31/10 a las 21:00 de Lima ya es 01/11 en UTC: el servidor lo cuenta en noviembre.
    expect(claveMes("2026-11-01T02:00:00.000Z")).toBe("2026-11");
  });
});
