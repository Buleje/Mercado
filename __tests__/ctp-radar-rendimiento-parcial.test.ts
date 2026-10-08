import { describe, expect, it } from "vitest";
import type { TrazaGrafo } from "@/lib/db/forest-ctp.db";
import { alertasRendimiento, analizarRendimiento, marcarParciales } from "@/lib/forestal/ctp-radar-rendimiento";

/** 5 corridas de tornillo: 4 rinden 0,5 y la 5.ª (c4) 0,15 — con su lote todavía en proceso. */
function grafo(): TrazaGrafo {
  const g: TrazaGrafo = { ingresos: [], corridas: [], despachos: [], consumos: [], origenes: [] };
  [0.5, 0.5, 0.5, 0.5, 0.15].forEach((r, i) => {
    g.ingresos.push({ id: `w${i}`, gtf: `G${i}`, species: "Tornillo", volumeM3: 10, cites: false, fecha: "2026-09-01T00:00:00.000Z" });
    g.corridas.push({
      id: `c${i}`, lineNo: i + 1, label: "Madera aserrada · Tornillo", quantity: 10 * r, unit: "m3",
      cites: false, productType: "Madera aserrada", species: "Tornillo", fecha: "2026-09-10T00:00:00.000Z",
    });
    g.consumos.push({ from: `w${i}`, to: `c${i}`, volumeM3: 10 });
  });
  return g;
}

describe("radar de rendimiento · corrida parcial (K4 a)", () => {
  const enProceso = new Map([["c4", "2026-11-01"]]);

  it("sin el dato del lote, la corrida en proceso sale «bajo»", () => {
    expect(analizarRendimiento(grafo()).find((r) => r.id === "c4")?.flag).toBe("bajo");
  });

  it("con el lote en proceso sale «parcial», no alerta y lo dice con la fecha", () => {
    const rs = analizarRendimiento(grafo(), { enProceso, hoy: "2026-10-08" });
    const c4 = rs.find((r) => r.id === "c4")!;
    expect(c4.flag).toBe("parcial");
    expect(c4.motivo).toContain("Rendimiento parcial");
    expect(c4.motivo).toContain("01/11");
    expect(alertasRendimiento(rs)).toEqual([]);
  });

  it("la parcial no entra a la mediana de sus pares", () => {
    const rs = analizarRendimiento(grafo(), { enProceso });
    expect(rs.find((r) => r.id === "c0")?.medianaGrupo).toBe(0.5);
  });

  it("marcarParciales sobre un análisis ya hecho da lo mismo", () => {
    const directo = analizarRendimiento(grafo(), { enProceso, hoy: "2026-10-08" });
    const despues = marcarParciales(analizarRendimiento(grafo()), enProceso, "2026-10-08");
    expect(despues).toEqual(directo);
  });

  it("imposible gana aunque esté en proceso (salió más de lo que entró)", () => {
    const g = grafo();
    g.corridas[4].quantity = 12;
    expect(analizarRendimiento(g, { enProceso }).find((r) => r.id === "c4")?.flag).toBe("imposible");
  });
});
