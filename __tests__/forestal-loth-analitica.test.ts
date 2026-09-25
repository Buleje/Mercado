/**
 * Lectura del aprovechamiento del LO-TH (pestaña Analítica).
 *
 * Lo que se blinda: el panel presentaba las etapas como una cascada secuencial,
 * y las dos ramas de la bifurcación (vender en rollo vs entrar a planta) se
 * leían como una pérdida del 45% que no existe. Estos tests fijan el modelo
 * correcto —tronco que se bifurca— y que las mermas reportadas sean SOLO las
 * reales.
 */
import { describe, expect, it } from "vitest";
import {
  construirFlujo,
  rankingRentabilidad,
  tramosCosto,
  veredictoLibro,
  type CosteoRowRaw,
  type FunnelRaw,
} from "@/lib/forestal/loth-analitica";

/** Los números reales del libro del tenant al momento del rediseño. */
const REAL: FunnelRaw = {
  taladoM3: 5.003,
  trozadoM3: 4.887,
  despachoTrozaM3: 2.761,
  consumidoM3: 2.126,
  productoCantidad: 0,
  despachoProductoM3: 1.9,
};

const nodo = (f: ReturnType<typeof construirFlujo>, k: string) => f.nodos.find((n) => n.key === k)!;

describe("flujo del aprovechamiento", () => {
  it("LA CORRECCIÓN: rollo y planta son ramas de lo trozado, no pasos siguientes", () => {
    const f = construirFlujo(REAL);
    // Ambas ramas se miden contra el TROZADO, no contra el talado.
    expect(nodo(f, "rollo").pctDelPadre).toBeCloseTo(56.5, 0);
    expect(nodo(f, "planta").pctDelPadre).toBeCloseTo(43.5, 0);
    // Y juntas dan el 100% de lo trozado: no hay pérdida entre medio.
    expect((nodo(f, "rollo").pctDelPadre ?? 0) + (nodo(f, "planta").pctDelPadre ?? 0)).toBeCloseTo(100, 0);
    expect(f.hayStockEnPatio).toBe(false);
  });

  it("no inventa una merma entre trozado y despacho", () => {
    const f = construirFlujo(REAL);
    // Sólo dos mermas reales: trozado y aserrío.
    expect(f.mermas.map((m) => m.key)).toEqual(["trozado", "aserrio"]);
    expect(f.mermas.find((m) => m.key === "trozado")!.m3).toBeCloseTo(0.116, 3);
    expect(f.mermas.find((m) => m.key === "aserrio")!.m3).toBeCloseTo(0.226, 3);
    expect(f.mermaTotalM3).toBeCloseTo(0.342, 3);
  });

  it("el rendimiento del aserrío se mide contra lo que ENTRÓ a planta", () => {
    const f = construirFlujo(REAL);
    // 1.9 de 2.126 = 89,4%. Contra el talado daría 38%, que sería otra cosa.
    expect(f.rendimientoAserrioPct).toBeCloseTo(89.4, 0);
    expect(f.rendimientoTrozadoPct).toBeCloseTo(97.7, 0);
    expect(f.ventaEnRolloPct).toBeCloseTo(56.5, 0);
  });

  it("detecta trozas en patio cuando lo trozado no se repartió entero", () => {
    const f = construirFlujo({ ...REAL, despachoTrozaM3: 1, consumidoM3: 1 });
    expect(f.hayStockEnPatio).toBe(true);
    expect(f.stockEnPatioM3).toBeCloseTo(2.887, 3);
  });

  it("libro vacío: sin porcentajes inventados ni divisiones por cero", () => {
    const f = construirFlujo({ taladoM3: 0, trozadoM3: 0, despachoTrozaM3: 0, consumidoM3: 0, productoCantidad: 0, despachoProductoM3: 0 });
    expect(f.rendimientoTrozadoPct).toBeNull();
    expect(f.rendimientoAserrioPct).toBeNull();
    expect(f.ventaEnRolloPct).toBeNull();
    expect(f.mermas).toHaveLength(0);
    expect(f.nodos.every((n) => Number.isFinite(n.m3))).toBe(true);
  });

  it("sin aserrío no reporta merma de aserrío (todo se vendió en rollo)", () => {
    const f = construirFlujo({ ...REAL, despachoTrozaM3: 4.887, consumidoM3: 0, despachoProductoM3: 0 });
    expect(f.mermas.map((m) => m.key)).toEqual(["trozado"]);
    expect(f.rendimientoAserrioPct).toBeNull();
    expect(f.ventaEnRolloPct).toBe(100);
  });

  it("valores negativos o corruptos no rompen el flujo", () => {
    const f = construirFlujo({ ...REAL, trozadoM3: -5, consumidoM3: Number.NaN });
    expect(f.nodos.every((n) => Number.isFinite(n.m3) && n.m3 >= 0)).toBe(true);
    expect(f.mermaTotalM3).toBeGreaterThanOrEqual(0);
  });
});

describe("veredicto del libro", () => {
  const base = { errores: 0, alertas: 0, especiesFueraDePlan: 0, saldoNegativo: false, diasParaAgotar: null, margenPctTotal: 30 };

  it("libro limpio: en regla", () => {
    const v = veredictoLibro(base);
    expect(v.nivel).toBe("ok");
    expect(v.motivos).toHaveLength(0);
    expect(v.titulo).toContain("consistente");
  });

  it("especie fuera del plan es riesgo, no una alerta más", () => {
    const v = veredictoLibro({ ...base, especiesFueraDePlan: 1 });
    expect(v.nivel).toBe("riesgo");
    expect(v.motivos[0]).toContain("infracción");
  });

  it("saldo negativo = se movilizó más de lo autorizado", () => {
    expect(veredictoLibro({ ...base, saldoNegativo: true }).nivel).toBe("riesgo");
  });

  it("sólo alertas: atención, no riesgo", () => {
    const v = veredictoLibro({ ...base, alertas: 2 });
    expect(v.nivel).toBe("atencion");
    expect(v.motivos[0]).toContain("2 alertas");
  });

  it("saldo por agotarse y margen negativo suben a atención", () => {
    expect(veredictoLibro({ ...base, diasParaAgotar: 30 }).nivel).toBe("atencion");
    expect(veredictoLibro({ ...base, margenPctTotal: -5 }).nivel).toBe("atencion");
    // Un horizonte largo no alarma.
    expect(veredictoLibro({ ...base, diasParaAgotar: 2163 }).nivel).toBe("ok");
  });

  it("lo grave no queda tapado por lo leve", () => {
    const v = veredictoLibro({ ...base, errores: 1, alertas: 3, especiesFueraDePlan: 2 });
    expect(v.nivel).toBe("riesgo");
    expect(v.motivos[0]).toContain("especies aprovechadas no figuran");
  });
});

describe("ranking de rentabilidad", () => {
  const fila = (species: string, movilizadoM3: number, margenM3: number, margen: number): CosteoRowRaw => ({
    species, cites: false, movilizadoM3, precioVentaM3: 450, costoTotalM3: 282.5, margenM3,
    margenPct: 37, ingreso: 0, costo: 0, margen,
    desglose: { venM3: 22.5, extraccionM3: 120, transformacionM3: 80, fleteM3: 60 },
  });

  it("EL ORDEN QUE FALTABA: manda el margen generado, no el teórico", () => {
    const r = rankingRentabilidad([
      fila("Shihuahuaco", 0, 649, 0), // rinde mucho por m³ pero no se movilizó
      fila("Tornillo", 4.661, 167.5, 780.72), // el que realmente dejó plata
    ]);
    expect(r[0].species).toBe("Tornillo");
    expect(r[0].participacionPct).toBe(100);
    expect(r[1].potencial).toBe(true);
  });

  it("reparte la participación entre las que sí aportaron", () => {
    const r = rankingRentabilidad([fila("A", 1, 10, 300), fila("B", 1, 10, 100)]);
    expect(r[0].participacionPct).toBe(75);
    expect(r[1].participacionPct).toBe(25);
  });

  it("sin margen generado no inventa participaciones", () => {
    const r = rankingRentabilidad([fila("A", 0, 10, 0)]);
    expect(r[0].participacionPct).toBeNull();
    expect(r[0].potencial).toBe(true);
  });

  it("ordena el potencial por margen por m³", () => {
    const r = rankingRentabilidad([fila("Bajo", 0, 5, 0), fila("Alto", 0, 90, 0)]);
    expect(r.map((x) => x.species)).toEqual(["Alto", "Bajo"]);
  });
});

describe("desglose del costo", () => {
  const d = { venM3: 22.5, extraccionM3: 120, transformacionM3: 80, fleteM3: 60 };

  it("los tramos suman el 100% del costo", () => {
    const t = tramosCosto(d, 282.5);
    expect(t).toHaveLength(4);
    expect(t.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(100, 0);
    expect(t[0].label).toContain("Derecho");
  });

  it("omite los tramos en cero (no dibuja franjas invisibles)", () => {
    const t = tramosCosto({ ...d, transformacionM3: 0, fleteM3: 0 }, 142.5);
    expect(t.map((x) => x.key)).toEqual(["ven", "extraccion"]);
  });

  it("sin costo total declarado usa la suma de las partes", () => {
    const t = tramosCosto(d, 0);
    expect(t.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(100, 0);
  });
});
