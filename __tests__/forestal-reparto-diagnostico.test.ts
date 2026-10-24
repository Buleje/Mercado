/**
 * El reparto tiene que explicar POR QUÉ un bloque quedó con volumen libre, y
 * con qué medidas se cierra. Nace del caso real: «5.232 m³ libres · 5.232 m³
 * sin amparar» —los dos números iguales— porque el bloque estaba cargado con
 * otra especie y nadie lo decía.
 */
import { describe, it, expect } from "vitest";
import { distribuirPorCapacidad, medidasQueEntran, type BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import { diagnosticarReparto } from "@/lib/forestal/cubicacion-reparto-diagnostico";
import { cubicarPieza, type PiezaCubicada, type Unidad } from "@/lib/forestal/cubicacion";

const U = { uEspesor: "pulg" as Unidad, uAncho: "pulg" as Unidad, uLargo: "pies" as Unidad };
function pieza(id: string, cantidad: number, e: number, a: number, l: number, especie = "TORNILLO"): PiezaCubicada {
  const base = { cantidad, espesor: e, ancho: a, largo: l, ...U };
  const { pieTablar, m3 } = cubicarPieza(base);
  return { id, ...base, especie, pieTablar, m3 };
}
const LOTE = [pieza("a", 40, 2, 8, 10), pieza("b", 25, 1, 6, 12), pieza("c", 60, 2, 4, 8)];
const TOTAL_M3 = Math.round(LOTE.reduce((s, p) => s + p.m3, 0) * 10000) / 10000;

describe("diagnosticarReparto — por qué quedó libre", () => {
  it("el bloque de OTRA especie: libre y faltante son el mismo número, y lo dice", () => {
    const bloque: BloqueRolliza = {
      id: "b1", etiqueta: "GTF-0231", especie: "CUMALA",
      m3: TOTAL_M3, tipo: "aserrada", origen: "manual",
    };
    const d = distribuirPorCapacidad([bloque], LOTE, "tipo");
    // El síntoma que veía el usuario: los dos totales, idénticos.
    expect(d.totales.libreM3).toBeCloseTo(d.totales.faltanteM3, 4);

    const diag = diagnosticarReparto(d, "tipo");
    expect(diag.huecos).toHaveLength(1);
    const h = diag.huecos[0];
    expect(h.causa).toBe("otra-especie");
    expect(h.detalle).toContain("CUMALA");
    expect(h.detalle).toContain("TORNILLO");
    expect(h.accion).toContain("TORNILLO");
    // Y dice con QUÉ medidas se cierra, no sólo que hay un hueco.
    expect(h.sugerencia.length).toBeGreaterThan(0);
    expect(h.sugeridoM3).toBeGreaterThan(0);
    expect(diag.recuperableM3).toBeCloseTo(h.sugeridoM3, 4);
  });

  it("un bloque SIN especie tampoco cruza con madera que sí la declara", () => {
    const bloque: BloqueRolliza = { id: "b1", etiqueta: "Aserrada 1", especie: "", m3: 1, tipo: "aserrada", origen: "manual" };
    const diag = diagnosticarReparto(distribuirPorCapacidad([bloque], LOTE, "tipo"), "tipo");
    expect(diag.huecos[0].causa).toBe("otra-especie");
    expect(diag.huecos[0].especie).toBe("Sin especie");
  });

  it("el tope de piezas a mano se distingue de la falta de madera", () => {
    const bloque: BloqueRolliza = {
      id: "b1", etiqueta: "Troza 9", especie: "TORNILLO",
      m3: 20, aprovechablePct: 55, origen: "trozas", piezasManual: 10,
    };
    const h = diagnosticarReparto(distribuirPorCapacidad([bloque], LOTE, "tipo"), "tipo").huecos[0];
    expect(h.causa).toBe("tope-piezas");
    expect(h.accion).toContain("tope");
  });

  it("capacidad de sobra con todo amparado NO se reporta como problema", () => {
    const bloque: BloqueRolliza = { id: "b1", etiqueta: "Troza 14", especie: "TORNILLO", m3: 20, aprovechablePct: 55, origen: "trozas" };
    const diag = diagnosticarReparto(distribuirPorCapacidad([bloque], LOTE, "tipo"), "tipo");
    expect(diag.huecos[0].causa).toBe("sin-faltante");
    expect(diag.huecos[0].accion).toBe("");
    expect(diag.recuperableM3).toBe(0);
  });

  it("el bloque que coincide exacto no deja hueco ni diagnóstico", () => {
    const bloque: BloqueRolliza = { id: "b1", etiqueta: "Exacto", especie: "TORNILLO", m3: TOTAL_M3, tipo: "aserrada", origen: "manual" };
    const d = distribuirPorCapacidad([bloque], LOTE, "tipo");
    expect(d.totales.libreM3).toBeCloseTo(0, 3);
    expect(d.totales.faltanteM3).toBeCloseTo(0, 3);
    expect(diagnosticarReparto(d, "tipo").huecos).toHaveLength(0);
  });
});

describe("medidasQueEntran — el motor de la sugerencia", () => {
  it("exprime la capacidad con piezas enteras, sin pasarse nunca", () => {
    const cand = [
      { clave: "a", medida: "3×6×12", m3Unit: 0.0425, piezas: 7 },
      { clave: "b", medida: "2×10×10", m3Unit: 0.0393, piezas: 11 },
    ];
    const elegidas = medidasQueEntran(cand, 0.558);
    const usado = elegidas.reduce((a, e) => a + e.m3, 0);
    expect(usado).toBeLessThanOrEqual(0.558 + 1e-6);
    expect(usado).toBeGreaterThan(0.52); // el greedy por orden se quedaba en 0.5268
    for (const e of elegidas) {
      expect(Number.isInteger(e.piezas)).toBe(true);
      expect(e.piezas).toBeLessThanOrEqual(cand.find((c) => c.medida === e.medida)!.piezas);
    }
  });

  it("con capacidad 0 no propone nada", () => {
    expect(medidasQueEntran([{ clave: "a", medida: "2×8×10", m3Unit: 0.03, piezas: 5 }], 0)).toEqual([]);
  });

  it("respeta un tope de piezas", () => {
    const elegidas = medidasQueEntran([{ clave: "a", medida: "2×8×10", m3Unit: 0.03, piezas: 50 }], 10, 4);
    expect(elegidas.reduce((a, e) => a + e.piezas, 0)).toBeLessThanOrEqual(4);
  });
});

/**
 * Cuando el bloque declara m³ Y piezas, los dos son objetivo: el reparto tiene
 * que encontrar la combinación que cierre ambos (Brandon, 2026-09-02: «no
 * encuentra las medidas para que ocupen bien los m³ y piezas; yo las encontré,
 * el sistema no»). Antes repartía las piezas en la proporción del lote y dejaba
 * volumen tirado: 30 piezas puestas, 1,2476 m³ de 1,4544 amparados.
 */
describe("bloque que declara m³ y piezas: cierran los dos", () => {
  const lote = [
    pieza("a", 50, 2, 8, 10),
    pieza("b", 40, 1, 6, 12),
    pieza("c", 80, 2, 4, 8),
    pieza("d", 30, 3, 10, 14),
  ];
  const unit = (p: PiezaCubicada) => p.m3 / p.cantidad;

  it("encuentra una combinación exacta de 30 piezas por 1,4544 m³", () => {
    // El paquete que el operario armó a mano: 20 tablas de 2×8×10 + 10 de 3×10×14.
    const objM3 = Math.round((20 * unit(lote[0]) + 10 * unit(lote[3])) * 10000) / 10000;
    const d = distribuirPorCapacidad(
      [{ id: "b1", etiqueta: "Paquete 1", especie: "TORNILLO", m3: objM3, tipo: "aserrada", origen: "manual", piezasManual: 30 }],
      lote,
      "tipo",
    );
    const b = d.especies[0].bloques[0];
    const piezas = b.asignado.reduce((a, g) => a + g.piezas, 0);
    expect(piezas).toBe(30);
    expect(b.usadoM3).toBeCloseTo(objM3, 4);
    expect(b.libreM3).toBeCloseTo(0, 4);
    expect(b.piezasLibres).toBe(0);
    // Y sin amparar de más, que es lo único innegociable.
    expect(b.usadoM3).toBeLessThanOrEqual(objM3 + 0.0001);
  });

  it("el conteo declarado de más se reporta como resto, no se esconde", () => {
    const objM3 = Math.round(unit(lote[2]) * 5 * 10000) / 10000; // 5 piezas chicas
    const d = distribuirPorCapacidad(
      [{ id: "b1", etiqueta: "Paquete 2", especie: "TORNILLO", m3: objM3, tipo: "aserrada", origen: "manual", piezasManual: 40 }],
      lote,
      "tipo",
    );
    const b = d.especies[0].bloques[0];
    expect(b.piezasLibres).toBeGreaterThan(0); // declaró 40, no entran
    const h = diagnosticarReparto(d, "tipo").huecos.find((x) => x.bloqueId === "b1");
    expect(h?.piezasLibres).toBe(b.piezasLibres);
  });

  it("con capacidad de sobra el tope de piezas NO rompe la mezcla", () => {
    // 30 piezas dentro de una troza de 100 m³: no hay volumen que ajustar, así
    // que el bloque sigue siendo una mezcla y no las 30 tablas más grandes.
    const d = distribuirPorCapacidad(
      [{ id: "b1", etiqueta: "Troza 3", especie: "TORNILLO", m3: 100, aprovechablePct: 55, origen: "trozas", piezasManual: 30 }],
      lote,
      "tipo",
    );
    const b = d.especies[0].bloques[0];
    expect(b.asignado.reduce((a, g) => a + g.piezas, 0)).toBe(30);
    expect(b.asignado.length).toBeGreaterThan(1);
  });
});

/**
 * Varios paquetes que particionan el lote: el caso que seguía fallando después
 * del primer arreglo (Brandon, 2026-09-02: «ya lo probé y sigue sin distribuir
 * bien… manualmente todo sale completo»). Cada bloque se llenaba con lo que más
 * le convenía A ÉL y dejaba al siguiente sin las medidas que necesitaba: 25
 * piezas quedaban sin distribuir aunque la partición exacta existía.
 *
 * Lo que lo resuelve es repartir por CUOTA (mayor residuo, una pieza por medida)
 * en vez de por volumen: cada paquete se lleva su proporción de cada medida, que
 * es lo que hace el operario a mano.
 */
describe("varios paquetes que particionan el lote", () => {
  const lote = [
    pieza("a", 60, 2, 8, 10),
    pieza("b", 45, 1, 6, 12),
    pieza("c", 90, 2, 4, 8),
    pieza("d", 30, 3, 10, 14),
  ];
  const unit = (p: PiezaCubicada) => p.m3 / p.cantidad;

  it("tres paquetes de un tercio cada uno reparten el lote ENTERO", () => {
    const m3Tercio = 20 * unit(lote[0]) + 15 * unit(lote[1]) + 30 * unit(lote[2]) + 10 * unit(lote[3]);
    const bloques: BloqueRolliza[] = [1, 2, 3].map((n) => ({
      id: `b${n}`, etiqueta: `Paquete ${n}`, especie: "TORNILLO",
      m3: Math.round(m3Tercio * 10000) / 10000, tipo: "aserrada" as const, origen: "manual" as const,
      piezasManual: 75,
    }));
    const d = distribuirPorCapacidad(bloques, lote, "tipo");

    expect(d.totales.faltanteM3).toBe(0);
    expect(d.totales.libreM3).toBe(0);
    for (const b of d.especies[0].bloques) {
      expect(b.asignado.reduce((a, g) => a + g.piezas, 0)).toBe(75);
      expect(b.piezasLibres).toBe(0);
    }
    // Nada se repartió dos veces ni se perdió.
    const repartidas = d.especies[0].bloques.reduce((a, b) => a + b.asignado.reduce((x, g) => x + g.piezas, 0), 0);
    expect(repartidas).toBe(225);
  });

  it("un solo paquete de un tercio se lleva la cuota de CADA medida", () => {
    const m3Tercio = 20 * unit(lote[0]) + 15 * unit(lote[1]) + 30 * unit(lote[2]) + 10 * unit(lote[3]);
    const d = distribuirPorCapacidad(
      [{ id: "b1", etiqueta: "P1", especie: "TORNILLO", m3: Math.round(m3Tercio * 10000) / 10000, tipo: "aserrada", origen: "manual", piezasManual: 75 }],
      lote,
      "tipo",
    );
    const b = d.especies[0].bloques[0];
    const porMedida = new Map<string, number>();
    for (const g of b.asignado) for (const m of g.medidas) porMedida.set(m.medida, (porMedida.get(m.medida) ?? 0) + m.piezas);
    // La partición que hace el operario a mano, medida por medida.
    expect(porMedida.get("2×8×10")).toBe(20);
    expect(porMedida.get("1×6×12")).toBe(15);
    expect(porMedida.get("2×4×8")).toBe(30);
    expect(porMedida.get("3×10×14")).toBe(10);
  });
});

/**
 * El invariante que resume todo lo anterior, verificado por búsqueda numérica:
 * **no puede quedar un bloque con capacidad libre si hay madera sin amparar que
 * entra en ella**. Cuando eso pasaba, el usuario veía «X m³ libres · X m³ sin
 * amparar» y tenía razón en no entenderlo: el reparto llenaba bloque por bloque
 * en orden y el primero se llevaba lo que el último necesitaba.
 *
 * Lo que lo garantiza es la REPESCA: terminada la vuelta, cada bloque con hueco
 * vuelve a mirar lo que quedó pendiente después de que pasaron todos.
 */
describe("invariante: hueco y faltante no pueden convivir", () => {
  it("150 escenarios al azar, con y sin tope de piezas", () => {
    let semilla = 7;
    const rnd = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
    const fallas: string[] = [];
    for (let n = 0; n < 150; n++) {
      const lote: PiezaCubicada[] = [];
      for (let i = 0; i < 2 + Math.floor(rnd() * 6); i++) {
        const base = {
          cantidad: 5 + Math.floor(rnd() * 60),
          espesor: [1, 2, 3][Math.floor(rnd() * 3)],
          ancho: [4, 6, 8, 10, 12][Math.floor(rnd() * 5)],
          largo: [8, 10, 12, 14][Math.floor(rnd() * 4)],
          uEspesor: "pulg" as const, uAncho: "pulg" as const, uLargo: "pies" as const,
        };
        const { pieTablar, m3 } = cubicarPieza(base);
        lote.push({ id: `p${i}`, ...base, especie: "TORNILLO", pieTablar, m3 });
      }
      const totalM3 = lote.reduce((a, p) => a + p.m3, 0);
      const totalPz = lote.reduce((a, p) => a + p.cantidad, 0);
      const nb = 1 + Math.floor(rnd() * 3);
      const conTope = rnd() < 0.6;
      const bloques: BloqueRolliza[] = [];
      for (let i = 0; i < nb; i++) {
        const frac = (0.2 + rnd() * 0.5) / nb;
        bloques.push({
          id: `b${i}`, etiqueta: `B${i}`, especie: "TORNILLO",
          m3: Math.round(totalM3 * frac * 10000) / 10000,
          tipo: "aserrada", origen: "manual",
          ...(conTope ? { piezasManual: Math.max(1, Math.round(totalPz * frac)) } : {}),
        });
      }
      const esp = distribuirPorCapacidad(bloques, lote, "tipo").especies[0];
      if (!esp) continue;
      let minFaltante = Infinity;
      for (const f of esp.faltante) for (const m of f.medidas) if (m.piezas > 0) minFaltante = Math.min(minFaltante, m.m3 / m.piezas);
      if (!Number.isFinite(minFaltante)) continue; // no falta nada: cerró entero
      for (const b of esp.bloques) {
        const tieneCupo = b.piezasLibres == null || b.piezasLibres > 0;
        if (b.libreM3 >= minFaltante && tieneCupo) {
          fallas.push(`n=${n} ${b.bloque.etiqueta}: libre ${b.libreM3} ≥ pieza más chica sin amparar ${minFaltante.toFixed(4)}`);
        }
      }
    }
    expect(fallas).toEqual([]);
  }, 30_000);
});

/**
 * El caso de la captura (Brandon, 2026-09-02): dos paquetes que suman EXACTO el
 * lote —30,721 m³ y 1.151 piezas entre los dos— y aun así 11 piezas quedaban
 * sin distribuir. El primero había llegado a su tope de 787 piezas con 0,580 m³
 * de capacidad libre: se llenó con piezas demasiado chicas y las grandes que
 * faltaban ya no le entraban.
 *
 * Ni la repesca ni la cuota lo resuelven —no sobra lugar, sobra volumen en uno
 * y cupo en el otro—: hace falta INTERCAMBIAR piezas entre bloques.
 */
describe("intercambio: sobra volumen en un bloque y cupo en el otro", () => {
  it("cierra el lote entero en vez de dejar el 3,5 % sin amparar", () => {
    const lote = [
      pieza("g", 60, 3, 12, 14),   // pocas grandes
      pieza("m", 500, 2, 6, 10),   // muchas medias
      pieza("c", 591, 1, 6, 10),   // muchas chicas
    ];
    const u = (p: PiezaCubicada) => p.m3 / p.cantidad;
    const totalM3 = lote.reduce((a, p) => a + p.m3, 0);
    const totalPz = lote.reduce((a, p) => a + p.cantidad, 0);
    // La partición del operario: el primer paquete se lleva TODAS las grandes.
    const b1M3 = 60 * u(lote[0]) + 500 * u(lote[1]) + 227 * u(lote[2]);
    const d = distribuirPorCapacidad(
      [
        { id: "b1", etiqueta: "1", especie: "TORNILLO", m3: Math.round(b1M3 * 1e4) / 1e4, tipo: "aserrada", origen: "manual", piezasManual: 787 },
        { id: "b2", etiqueta: "2", especie: "TORNILLO", m3: Math.round((totalM3 - b1M3) * 1e4) / 1e4, tipo: "aserrada", origen: "manual", piezasManual: totalPz - 787 },
      ],
      lote,
      "tipo",
    );
    const sinAmparar = d.especies[0].faltante.reduce((a, f) => a + f.piezas, 0);
    // Sin el intercambio quedaban 88 piezas (1,04 m³) afuera; ahora cierra.
    expect(sinAmparar).toBe(0);
    expect(d.totales.faltanteM3).toBe(0);
    for (const b of d.especies[0].bloques) {
      /* Un bloque puede pasarse unos litros para no dejar una pieza real sin
         papel (Brandon, 2026-09-02: «ponerlo así normal, sólo un aviso que
         falta o sobra»), pero nunca más que la tolerancia de medición: 50
         litros, y sólo si el resto entero era ruido frente al lote. */
      expect(b.usadoM3).toBeLessThanOrEqual(b.capacidadM3 + 0.05);
      expect(b.asignado.reduce((a, g) => a + g.piezas, 0)).toBeLessThanOrEqual(Number(b.bloque.piezasManual));
    }
    // Si algún bloque tuvo que pasarse para cerrar, el exceso queda a la vista
    // y dentro de la tolerancia — nunca escondido.
    for (const b of d.especies[0].bloques) {
      if (b.libreM3 < 0) expect(-b.libreM3).toBeLessThan(0.05);
    }
  }, 20_000);
});
