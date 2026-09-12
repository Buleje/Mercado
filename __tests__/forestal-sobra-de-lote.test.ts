/**
 * Cuánta madera le queda a un lote, y si eso es «poco» o «mucho».
 *
 * La escala es relativa a propósito: 0.641 m³ es casi nada en un lote de 35 m³
 * y es medio lote en uno de 1.2 m³. Lo que se prueba acá es justamente que la
 * misma cantidad caiga en niveles distintos según el lote, y que el denominador
 * cambie cuando cambia el significado de «restante».
 */

import { describe, expect, it } from "vitest";
import {
  etiquetaDeSobra,
  facetasDeLotes,
  filtrarLotes,
  ordenarLotes,
  sobraDeLote,
  type LoteAserrio,
} from "@/lib/forestal/lotes-aserrio";

function loteAbierto(volumenM3: number, libres: number[]): LoteAserrio {
  return {
    id: "L1",
    code: "13-2026",
    speciesCommon: "Tornillo",
    speciesScientific: null,
    status: "abierto",
    notes: null,
    fechaApertura: "2026-08-01",
    fechaConsumo: null,
    produccionEntryId: null,
    piezas: libres.length,
    volumenM3,
    trozas: libres.map((v, i) => ({
      id: `t${i}`,
      codificacion: `C-${i}`,
      especieComun: "Tornillo",
      volumenM3: v,
    })),
  } as unknown as LoteAserrio;
}

/** Un lote ya aserrado: lo «restante» es cupo para declarar, no madera. */
function loteAserrado(entradaM3: number, declaradoM3: number): LoteAserrio {
  return {
    id: "L2",
    code: "15-2026",
    speciesCommon: "Tornillo",
    speciesScientific: null,
    status: "consumido",
    notes: null,
    fechaApertura: "2026-08-01",
    fechaConsumo: "2026-08-01",
    produccionEntryId: "c1",
    piezas: 0,
    volumenM3: entradaM3,
    trozas: [],
    produccion: {
      id: "c1",
      lineNo: 19,
      entryDate: "2026-08-01",
      productType: "MADERA ASERRADA (COMERCIAL)",
      speciesCommon: "Tornillo",
      volumeInputM3: entradaM3,
      quantity: declaradoM3,
      unit: "m3",
      status: "registrado",
      viva: true,
    },
  } as unknown as LoteAserrio;
}

describe("sobraDeLote — un lote abierto mide rolliza sin aserrar", () => {
  it("la MISMA cantidad es «poco» en un lote grande y «casi entero» en uno chico", () => {
    /* El corazón de la escala: 1 m³ sobre 20 es un resto; sobre 1.2 es el lote. */
    expect(sobraDeLote(loteAbierto(20, [1])).nivel).toBe("poco");
    expect(sobraDeLote(loteAbierto(1.2, [1])).nivel).toBe("casi_entero");
  });

  it("sin piezas libres no queda nada, aunque el lote tenga volumen", () => {
    const s = sobraDeLote(loteAbierto(35.257, []));
    expect(s.nivel).toBe("sin_sobra");
    expect(s.m3).toBe(0);
    expect(etiquetaDeSobra(s).texto).toBe("Sin madera libre");
  });

  it("por debajo del 2 % no es «poco»: son litros, no una tanda", () => {
    expect(sobraDeLote(loteAbierto(100, [1])).nivel).toBe("sin_sobra");
    expect(sobraDeLote(loteAbierto(100, [3])).nivel).toBe("poco");
  });

  it("entre 20 % y 60 % queda bastante", () => {
    expect(sobraDeLote(loteAbierto(10, [3])).nivel).toBe("bastante");
    expect(sobraDeLote(loteAbierto(10, [7])).nivel).toBe("casi_entero");
  });
});

describe("sobraDeLote — un lote aserrado mide cupo contra el tope, no madera", () => {
  it("el denominador es el tope del 56 %, no el volumen del lote", () => {
    /* Con los números reales del tenant: 35.257 m³ entraron y se declararon
       19.103. El tope son 19.744, así que el margen es 0.641 — el 3.2 % del
       tope. Medido contra el volumen del lote daría 1.8 % y caería en
       «sin_sobra», diciendo que no queda cupo cuando sí queda. */
    const s = sobraDeLote(loteAserrado(35.257, 19.103));
    expect(s.m3).toBeCloseTo(0.641, 3);
    expect(s.pct).toBeCloseTo(3.2, 1);
    expect(s.nivel).toBe("poco");
    expect(s.esRolliza).toBe(false);
    expect(etiquetaDeSobra(s).texto).toContain("Cupo corto");
  });

  it("un lote que ya tocó el tope no tiene nada por declarar", () => {
    const s = sobraDeLote(loteAserrado(10, 5.6));
    expect(s.nivel).toBe("sin_sobra");
    expect(etiquetaDeSobra(s).texto).toBe("Nada por declarar");
  });

  it("un lote recién declarado a medias tiene cupo de sobra", () => {
    const s = sobraDeLote(loteAserrado(10, 1));
    expect(s.nivel).toBe("casi_entero");
    expect(etiquetaDeSobra(s).texto).toContain("Cupo casi entero");
  });
});

describe("filtros y orden de la pantalla de lotes", () => {
  const AHORA = new Date("2026-09-12T12:00:00.000Z");
  /** Un lote abierto con piezas libres y, si se le da, fecha de fin. */
  const abierto = (code: string, especie: string, libres: number[], finProceso?: string) =>
    ({
      ...loteAbierto(libres.reduce((a, b) => a + b, 0) || 10, libres),
      code,
      speciesCommon: especie,
      finProceso: finProceso ?? null,
    }) as LoteAserrio;

  const LOTES = [
    abierto("13-2026", "Tornillo", [5], "2026-09-09"), // vencido
    abierto("9-2026", "Tornillo", [1], "2026-09-14"), // por vencer
    abierto("15-2026", "Cachimbo", [8], "2026-10-30"), // en fecha
    abierto("16-2026", "Cachimbo", [], undefined), // sin nada para usar
  ];

  it("multi-selección: adentro de un eje suma, entre ejes cruza", () => {
    /* Dos especies elegidas traen las de ambas (OR)… */
    expect(filtrarLotes(LOTES, { especie: ["Tornillo", "Cachimbo"] }, AHORA)).toHaveLength(4);
    /* …y el otro eje las acota (AND). */
    const r = filtrarLotes(LOTES, { especie: ["Tornillo", "Cachimbo"], situacion: ["vencido"] }, AHORA);
    expect(r.map((l) => l.code)).toEqual(["13-2026"]);
  });

  it("se puede filtrar por cuánto queda, que es lo que muestra la etiqueta", () => {
    const r = filtrarLotes(LOTES, { sobra: ["sin_sobra"] }, AHORA);
    expect(r.map((l) => l.code)).toEqual(["16-2026"]);
  });

  it("una faceta NO se cuenta a sí misma: si no, no se podría agregar un segundo valor", () => {
    /* Con «Tornillo» ya elegido, el desplegable de especies tiene que seguir
       ofreciendo Cachimbo — es el error clásico de las facetas cruzadas. */
    const f = facetasDeLotes(LOTES, { especie: ["Tornillo"] }, AHORA);
    expect(f.especie.map((o) => o.value).sort()).toEqual(["Cachimbo", "Tornillo"]);
    /* Los OTROS ejes sí se cuentan ya filtrados por Tornillo: dos lotes. */
    expect(f.situacion.reduce((a, o) => a + o.count, 0)).toBe(2);
  });

  it("el orden por urgencia pone primero lo que se está pasando de fecha", () => {
    const r = ordenarLotes(LOTES, "urgencia", AHORA);
    expect(r.map((l) => l.code)).toEqual(["13-2026", "9-2026", "15-2026", "16-2026"]);
  });

  it("el orden por código lee los números como una persona", () => {
    /* Alfabéticamente «13-2026» iría antes que «9-2026»; en el patio no. */
    const r = ordenarLotes(LOTES, "codigo", AHORA);
    expect(r.map((l) => l.code)).toEqual(["9-2026", "13-2026", "15-2026", "16-2026"]);
  });

  it("ordenar no muta la lista original", () => {
    const original = LOTES.map((l) => l.code);
    ordenarLotes(LOTES, "volumen", AHORA);
    expect(LOTES.map((l) => l.code)).toEqual(original);
  });
});
