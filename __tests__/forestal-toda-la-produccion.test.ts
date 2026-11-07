/**
 * «Registrar toda la producción» (ADR-464, Brandon 2026-10-03) — el plan de la
 * tanda y su recorrido. Puro: sin DB ni red; el escritor es un mock.
 *
 * Lo que se cuida:
 *  · el plan es la MISMA secuencia que el botón de cada día: bloque por bloque,
 *    día por día, y si un día se apaga los siguientes de ese bloque no entran;
 *  · ninguna troza en dos pasos (T1) y lo que no entra lleva su motivo;
 *  · el recorrido escribe uno por vez, nunca dos en vuelo, y se para en el
 *    primer paso que no quede declarado;
 *  · reintentar es volver a planear: lo escrito sale «en el libro» y no se repite.
 */
import { describe, expect, it } from "vitest";
import type { AsignacionGrupo, BloqueRolliza, DiaDistribuido } from "@/lib/forestal/cubicacion-reparto";
import type { CorridaDelLote, TrozaDelLote } from "@/lib/forestal/lotes-aserrio";
import type { LoteParaLibro } from "@/lib/forestal/jornadas-de-bloque";
import {
  planTodaLaProduccion,
  recorrerPlan,
  textoDias,
  type EntradaDeProduccion,
  type PasoDeProduccion,
  type ResultadoDePaso,
} from "@/lib/forestal/toda-la-produccion";

const HOY = "2026-10-03";

const grupo = (m3: number, piezas = 30): AsignacionGrupo => ({
  clave: "tipo|comercial", label: "Comercial", piezas, m3, pieTablar: Math.round(m3 * 424),
  medidas: [{ clave: "c-m", medida: "2×8×10", espesor: 2, ancho: 8, largo: 10, uEspesor: "pulg", uAncho: "pulg", uLargo: "pie", m3, pieTablar: Math.round(m3 * 424), piezas }],
});
const dia = (n: number, m3 = 0.9): DiaDistribuido => {
  const g = grupo(m3);
  return { dia: n, grupos: [g], piezas: g.piezas, m3: g.m3, pieTablar: g.pieTablar };
};
const troza = (id: string, volumenM3: number, consumidaEnId: string | null = null): TrozaDelLote => ({
  id, codificacion: null, codigoPlanta: `P-${id}`, volumenM3, consumidaEnId,
});
const corrida = (id: string, lineNo: number, quantity: number | null): CorridaDelLote => ({
  id, lineNo, entryDate: "2026-10-01T12:00:00.000Z", productType: "MADERA ASERRADA (COMERCIAL)", quantity, volumeInputM3: 2, unit: "m3", status: "registrado", viva: true,
});
const bloque = (id: string, trozaIds: string[], extra: Partial<BloqueRolliza> = {}): BloqueRolliza => ({
  id, etiqueta: `Guía ${id}`, especie: "Tornillo", m3: 4, origen: "trozas", trozaIds, loteId: `L-${id}`, dias: 2, fecha: "2026-10-01", ...extra,
});
const lote = (id: string, trozas: TrozaDelLote[], corridas: CorridaDelLote[] = []): LoteParaLibro => ({
  id, code: `LA-${id}`, trozas, corridas, volumenM3: trozas.reduce((a, t) => a + (t.volumenM3 ?? 0), 0),
});
/** Un bloque de 4 trozas (4 m³) y su lote, con `dias` jornadas de 0,9 m³. */
const entrada = (id: string, dias = 2, extra: Partial<BloqueRolliza> = {}, trozas?: TrozaDelLote[], corridas: CorridaDelLote[] = []): EntradaDeProduccion => {
  const ts = trozas ?? [troza(`${id}-1`, 1.2), troza(`${id}-2`, 1.1), troza(`${id}-3`, 0.9), troza(`${id}-4`, 0.8)];
  const b = bloque(id, ts.map((t) => t.id), { dias, ...extra });
  return { bd: { bloque: b, porDia: Array.from({ length: dias }, (_, i) => dia(i + 1)) }, lote: lote(`L-${id}`, ts, corridas) };
};
const ok = (corridaId: string, lineNo: number): ResultadoDePaso => ({ estado: "declarada", corridaId, lineNo });

describe("planTodaLaProduccion", () => {
  it("todo lo pendiente, bloque por bloque y día por día; ninguna troza en dos pasos", () => {
    const p = planTodaLaProduccion([entrada("a"), entrada("b")], HOY);
    expect(p.pasos.map((x) => `${x.bloqueId}#${x.jornada.dia}`)).toEqual(["a#1", "a#2", "b#1", "b#2"]);
    expect(p.pasos.every((x) => x.jornada.estado === "lista" && x.jornada.trozaIds.length > 0)).toBe(true);
    const trozas = p.pasos.flatMap((x) => x.jornada.trozaIds);
    expect(new Set(trozas).size).toBe(8);
    expect(p).toMatchObject({ bloques: 2, dias: 4, trozas: 8, rollizaM3: 8, piezas: 120, m3: 3.6, yaEnLibro: 0 });
    expect(p.noEntran).toEqual([]);
    /* El día 2 lleva su fecha: la del bloque + 1. */
    expect(p.pasos[1]!.jornada.fecha).toBe("2026-10-02");
  });

  it("bloque a mano o sin lote: no entra ninguno de sus días, con el motivo", () => {
    const manual = entrada("m", 2, { trozaIds: null, origen: "manual" });
    const sinLote = entrada("s", 3, { loteId: null });
    const p = planTodaLaProduccion([manual, { ...sinLote, lote: null }, entrada("a")], HOY);
    expect(p.pasos.map((x) => x.bloqueId)).toEqual(["a", "a"]);
    expect(p.noEntran).toEqual([
      expect.objectContaining({ bloqueId: "m", dia: null, dias: 2, tipo: "bloque", motivo: expect.stringMatching(/Tráelo del Libro/) }),
      expect.objectContaining({ bloqueId: "s", dia: null, dias: 3, tipo: "bloque", motivo: expect.stringMatching(/Crea su lote primero/) }),
    ]);
  });

  it("un día que no pasó corta su bloque: entran los anteriores, no los siguientes", () => {
    /* Arranca ayer con 3 días: el 2 es hoy y el 3 mañana. */
    const p = planTodaLaProduccion([entrada("a", 3, { fecha: "2026-10-02" }, [troza("t1", 2), troza("t2", 1.9), troza("t3", 1.8)])], HOY);
    expect(p.pasos.map((x) => x.jornada.dia)).toEqual([1, 2]);
    expect(p.noEntran).toEqual([
      expect.objectContaining({ dia: 3, dias: 1, tipo: "dia", motivo: expect.stringMatching(/no registra un día que no pasó/) }),
    ]);
  });

  it("tope del 56 %: el día que lo pasa queda fuera con los que vienen detrás", () => {
    /* Día 1 rinde 45 %; al día 2 le quedan 2 m³ de rolliza y pide 1,6 (80 %). */
    const e = entrada("a", 3);
    e.bd.porDia = [dia(1, 0.5), dia(2, 1.6), dia(3, 0.1)];
    const p = planTodaLaProduccion([e], HOY);
    expect(p.pasos.map((x) => x.jornada.dia)).toEqual([1]);
    expect(p.noEntran[0]).toMatchObject({ dia: 2, dias: 2, tipo: "dia" });
    expect(p.noEntran[0]!.motivo).toMatch(/tope del 56 %/);
  });

  it("menos trozas que días: el motivo es el de T1 (el de antes de simular), no «sin madera»", () => {
    const p = planTodaLaProduccion([entrada("a", 2, {}, [troza("t1", 2)])], HOY);
    expect(p.pasos.map((x) => x.jornada.dia)).toEqual([1]);
    expect(p.noEntran[0]).toMatchObject({ dia: 2, dias: 1 });
    expect(p.noEntran[0]!.motivo).toMatch(/una troza no se parte entre dos corridas \(T1\)/);
  });

  it("corrida abierta: se avisa aparte y no frena el día siguiente (como el botón del día)", () => {
    const ts = [troza("t1", 1.2, "c1"), troza("t2", 1.1), troza("t3", 0.9), troza("t4", 0.8, "c1")];
    const e = entrada("a", 2, { jornadasLibro: [{ dia: 1, corridaId: "c1", lineNo: 41, estado: "abierta", fecha: "2026-10-01" }] }, ts, [corrida("c1", 41, null)]);
    const p = planTodaLaProduccion([e], HOY);
    expect(p.pasos.map((x) => x.jornada.dia)).toEqual([2]);
    expect(p.pasos[0]!.jornada.trozaIds.sort()).toEqual(["t2", "t3"]);
    expect(p.noEntran).toEqual([expect.objectContaining({ dia: 1, tipo: "abierta", motivo: expect.stringMatching(/corrida N° 41/) })]);
  });

  it("reintentar recalcula: lo ya escrito sale «en el libro» y la tanda sigue desde lo pendiente", () => {
    const antes = planTodaLaProduccion([entrada("a"), entrada("b")], HOY);
    /* El Libro después de escribir los dos días de «a» (y fallar en «b» día 1). */
    const [a1, a2] = antes.pasos;
    const ea = entrada("a");
    const escritos = [{ paso: a1!, id: "c41", n: 41 }, { paso: a2!, id: "c42", n: 42 }];
    const consumida = new Map(escritos.flatMap((x) => x.paso.jornada.trozaIds.map((t) => [t, x.id] as const)));
    ea.bd.bloque.jornadasLibro = escritos.map((x) => ({ dia: x.paso.jornada.dia, corridaId: x.id, lineNo: x.n, estado: "declarada" as const, fecha: x.paso.jornada.fecha }));
    ea.lote = lote("L-a", ea.lote!.trozas.map((t) => ({ ...t, consumidaEnId: consumida.get(t.id) ?? null })), escritos.map((x) => corrida(x.id, x.n, 0.9)));

    const despues = planTodaLaProduccion([ea, entrada("b")], HOY);
    expect(despues.pasos.map((x) => `${x.bloqueId}#${x.jornada.dia}`)).toEqual(["b#1", "b#2"]);
    expect(despues.yaEnLibro).toBe(2);
    /* Mismas trozas que el plan de antes le daba a «b»: el plan es determinista. */
    expect(despues.pasos.map((x) => x.jornada.trozaIds)).toEqual(antes.pasos.slice(2).map((x) => x.jornada.trozaIds));
  });

  it("dos bloques sobre el mismo lote: el segundo ve lo que el primero ya se llevó", () => {
    const ts = [troza("t1", 1.2), troza("t2", 1.1), troza("t3", 0.9), troza("t4", 0.8)];
    const comun = lote("L1", ts);
    const a: EntradaDeProduccion = { bd: { bloque: bloque("a", ["t1", "t2"], { loteId: "L1", dias: 1, m3: 2.3 }), porDia: [dia(1)] }, lote: comun };
    /* «b» dice tener t2 (mal sembrado): el plan no se la da dos veces. */
    const b: EntradaDeProduccion = { bd: { bloque: bloque("b", ["t2", "t3", "t4"], { loteId: "L1", dias: 1, m3: 2.8 }), porDia: [dia(1)] }, lote: comun };
    const p = planTodaLaProduccion([a, b], HOY);
    const trozas = p.pasos.flatMap((x) => x.jornada.trozaIds);
    expect(new Set(trozas).size).toBe(trozas.length);
  });
});

describe("recorrerPlan", () => {
  const pasos = () => planTodaLaProduccion([entrada("a", 3, { fecha: "2026-09-30" }, [troza("t1", 2), troza("t2", 1.9), troza("t3", 1.8)]), entrada("b")], HOY).pasos;

  it("uno por vez, en el orden del plan: nunca dos escrituras en vuelo", async () => {
    let enVuelo = 0;
    let maximo = 0;
    const orden: string[] = [];
    const avances: number[] = [];
    const r = await recorrerPlan(
      pasos(),
      async (p: PasoDeProduccion, i) => {
        enVuelo += 1;
        maximo = Math.max(maximo, enVuelo);
        orden.push(`${p.bloqueId}#${p.jornada.dia}`);
        await new Promise((res) => setTimeout(res, 1));
        enVuelo -= 1;
        return ok(`c${i}`, 40 + i);
      },
      { onAvance: (a) => avances.push(a.hechos) },
    );
    expect(maximo).toBe(1);
    expect(orden).toEqual(["a#1", "a#2", "a#3", "b#1", "b#2"]);
    expect(r.escritos.map((x) => x.resultado.lineNo)).toEqual([40, 41, 42, 43, 44]);
    expect(r).toMatchObject({ fallo: null, detenido: false, pendientes: [] });
    expect(avances).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("se para en el primer paso que no queda declarado: lo de antes queda, lo de después ni se intenta", async () => {
    const llamados: string[] = [];
    const r = await recorrerPlan(pasos(), async (p, i) => {
      llamados.push(`${p.bloqueId}#${p.jornada.dia}`);
      return i === 1 ? { estado: "corrida-abierta", corridaId: "c-x", lineNo: 77, detalle: "tope" } : ok(`c${i}`, 40 + i);
    });
    expect(llamados).toEqual(["a#1", "a#2"]);
    expect(r.escritos).toHaveLength(1);
    expect(r.fallo).toMatchObject({ resultado: { estado: "corrida-abierta", lineNo: 77 } });
    expect(r.fallo!.paso.jornada.dia).toBe(2);
    expect(r.pendientes.map((x) => `${x.bloqueId}#${x.jornada.dia}`)).toEqual(["a#3", "b#1", "b#2"]);
  });

  it("un escritor que tira cuenta como error con su mensaje, y corta igual", async () => {
    const r = await recorrerPlan(pasos(), async (_p, i) => {
      if (i === 0) throw new Error("El servidor respondió 409");
      return ok("c", 1);
    });
    expect(r.escritos).toHaveLength(0);
    expect(r.fallo!.resultado).toEqual({ estado: "error", detalle: "El servidor respondió 409" });
    expect(r.pendientes).toHaveLength(4);
  });

  it("«Detener» corta ENTRE pasos: el que está en curso termina", async () => {
    let parar = false;
    const r = await recorrerPlan(
      pasos(),
      async (_p, i) => {
        if (i === 1) parar = true;
        return ok(`c${i}`, i);
      },
      { detener: () => parar },
    );
    expect(r.escritos).toHaveLength(2);
    expect(r).toMatchObject({ detenido: true, fallo: null });
    expect(r.pendientes).toHaveLength(3);
  });
});

describe("textoDias", () => {
  it("dice los días como se leen", () => {
    expect(textoDias([2])).toBe("día 2");
    expect(textoDias([3, 1, 2])).toBe("días 1 a 3");
    expect(textoDias([1, 3, 4])).toBe("días 1, 3 y 4");
  });
});
