/**
 * «¿De qué trozas salió?» en tanda (ADR-447) — la parte pura:
 * `lib/forestal/origen-en-tanda.ts` y los motivos/arreglos nuevos de
 * `lib/forestal/vincular-trozas.ts`.
 *
 * El fixture es Blas CONGELADO el 28-09 con la MISMA lectura del servidor
 * (`ForestVincularTrozasDB.entradasDelDiagnostico`, sólo lectura): 44 corridas
 * sin origen, 65 trozas candidatas, 19 trozas tomadas por las N° 61/62 y 25
 * filas de guía. Los números son los del ADR, salvo la tanda (ver abajo).
 *
 * La tanda da 11 tras la llegada (el ADR decía 10) y 12 tras recibir (el ADR,
 * 11). La diferencia es la N° 59 de Mashonaste (1,2014 m³ = 20,432 − 19,231):
 * sus 3 trozas (4,441 · 3,058 · 1,921 m³) alcanzan para las 3 corridas si cada
 * una cubre primero lo que produjo, que es lo que hace `repartoDelGrupo` (el
 * reparto que manda el ADR). El 10 sale de darle a cada corrida hasta el 56 %
 * antes de pasar a la siguiente: la N° 55 se lleva dos trozas y la N° 59 queda
 * sin nada. Con el reparto de siempre la N° 55 rinde 65,0 % y la N° 59 62,5 %:
 * pasan el 56 %, lo que se AVISA y se firma igual (ADR-358).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  diagnosticarSinOrigen,
  especiesParecidas,
  proponerTrozas,
  type ContextoDelPatio,
  type CorridaParaDiagnostico,
  type TrozaParaDiagnostico,
} from "@/lib/forestal/vincular-trozas";
import { proponerTandaDeOrigen, simularArreglos } from "@/lib/forestal/origen-en-tanda";
import { claveEspecie } from "@/lib/forestal/loth-constants";

interface Fixture {
  corridas: CorridaParaDiagnostico[];
  trozas: TrozaParaDiagnostico[];
  contexto: ContextoDelPatio;
}

const BLAS: Fixture = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "blas-sin-origen-2026-09-28.json"), "utf8"),
) as Fixture;
const opciones = { contexto: BLAS.contexto };

const lineNosDe = (xs: readonly { lineNo: number | null }[]) => xs.map((x) => x.lineNo).sort((a, b) => (a ?? 0) - (b ?? 0));

describe("Blas congelado el 28-09 (sólo lectura)", () => {
  const diag = diagnosticarSinOrigen(BLAS.corridas, BLAS.trozas, undefined, opciones);

  it("44 corridas sin origen, ninguna vinculable hoy, y cada una con el motivo que dice la verdad", () => {
    expect(diag.total).toBe(44);
    expect(diag.porMotivo).toEqual({
      lista: 0,
      llegada_posterior: 11,
      fila_de_otra_especie: 0,
      guia_sin_recibir: 1,
      tomada_por_otra_corrida: 10,
      permiso_distinto: 2,
      especie_parecida: 4,
      guia_sin_trozas: 8,
      apertura: 5,
      sin_trozas_de_la_especie: 3,
    });
    /* Lo que queda sin madera de verdad: Tacho y Machimango. */
    const sinMadera = diag.corridas.filter((c) => c.motivo === "sin_trozas_de_la_especie");
    expect(sinMadera.map((c) => c.especie).sort()).toEqual(["Machimango", "Machimango", "Tacho"]);
  });

  it("Cachimbo y Panguana ya no dicen «No hay trozas en el patio»: nombran la corrida que tomó su madera", () => {
    const cachimbo = diag.corridas.filter((c) => c.especie === "Cachimbo");
    const panguana = diag.corridas.filter((c) => c.especie === "Panguana");
    expect(cachimbo).toHaveLength(5);
    expect(panguana).toHaveLength(5);
    for (const c of [...cachimbo, ...panguana]) {
      expect(c.motivo).toBe("tomada_por_otra_corrida");
      expect(c.detalle).not.toMatch(/No hay trozas/);
      expect(c.propuesta).toEqual([]);
    }
    const a = cachimbo.find((c) => c.lineNo === 32)!;
    expect(a.arreglo).toMatchObject({
      tipo: "soltar_corrida",
      corridas: [{ lineNo: 61, fecha: "2026-09-27", trozas: 12, m3: 28.947, abierta: false, sumadasPct: 53.4 }],
    });
    expect(a.detalle).toContain("corrida N° 61 del 27/09");
    /* La N° 62 todavía no declara lo producido: se dice, y no se inventa un rendimiento suyo. */
    const b = panguana.find((c) => c.lineNo === 45)!;
    expect(b.arreglo).toMatchObject({ tipo: "soltar_corrida", corridas: [{ lineNo: 62, trozas: 7, abierta: true, m3Producido: null }] });
    expect(b.detalle).toContain("que todavía no declara lo producido");
  });

  it("los arreglos traen el dato para abrir su modal: guías, fecha propuesta y su fuente", () => {
    const c31 = diag.corridas.find((c) => c.lineNo === 31)!;
    expect(c31.arreglo).toEqual({
      tipo: "corregir_llegada",
      guias: [
        expect.objectContaining({
          gtfNumber: "010-001-0000013",
          llegada: "2026-09-23",
          propuesta: "2026-09-07",
          fuente: "guia",
          sirve: true,
        }),
      ],
    });
    const c36 = diag.corridas.find((c) => c.lineNo === 36)!;
    expect(c36.arreglo).toMatchObject({
      tipo: "recibir_guia",
      guias: [{ gtfNumber: "019-001-0000004", trozas: 31, llegada: null, propuesta: "2026-08-15", fuente: "guia" }],
    });
    /* Permiso sin ninguna guía vs guía sin su lista de trozas. */
    expect(diag.corridas.find((c) => c.lineNo === 20)!.arreglo).toEqual({
      tipo: "cargar_guia",
      permiso: "19-SEC/REG-PLT-2025-096",
      guias: [],
    });
    expect(diag.corridas.find((c) => c.lineNo === 23)!.arreglo).toMatchObject({
      tipo: "cargar_guia",
      guias: [{ gtfNumber: "019-001-0000013", recibida: false }],
    });
    expect(diag.corridas.find((c) => c.lineNo === 56)!.arreglo).toMatchObject({
      tipo: "corregir_corrida",
      campo: "permiso",
      propuestos: [{ codigo: "19-SEC/PER-FMC-2024-008", trozas: 4 }],
    });
    expect(diag.corridas.find((c) => c.lineNo === 43)!.arreglo).toMatchObject({
      tipo: "corregir_corrida",
      campo: "especie",
      actual: "Huayruro Negro",
      propuesta: "Huayruro",
      trozas: 2,
    });
    expect(diag.corridas.filter((c) => c.motivo === "apertura").every((c) => c.arreglo.tipo === "declarar_apertura")).toBe(true);
  });

  const sim = simularArreglos(BLAS.corridas, BLAS.trozas, BLAS.contexto);

  it("hoy 0 · tras corregir la llegada 11 (en tanda 11) · tras recibir 12 (en tanda 12)", () => {
    expect(sim.hoy).toMatchObject({ listas: 0, enTanda: 0, m3EnTanda: 0 });
    expect(sim.trasLlegada).toMatchObject({ listas: 11, enTanda: 11, m3EnTanda: 20.432 });
    /* Para las 11 alcanza con 5 de las 8 guías recibidas tarde: las otras 3
       (0000009, 0000010, 0000014) traen madera que otra corrida ya tomó. */
    expect(sim.trasLlegada.guias).toEqual([
      "010-001-0000005",
      "010-001-0000006",
      "010-001-0000007",
      "010-001-0000008",
      "010-001-0000013",
    ]);
    expect(sim.trasRecibir).toMatchObject({ listas: 12, enTanda: 12, m3EnTanda: 30.8383 });
    expect(sim.trasRecibir.guias).toEqual(["019-0000001", "019-001-0000004"]);
    expect(sim.trasRecibir.lineNos).toContain(36);
  });

  it("el permiso frena 7: los 5 Tornillo del 2018-020/2026-032 y las 2 Copaiba", () => {
    expect(sim.frenaElPermiso.corridas).toBe(7);
    expect([...sim.frenaElPermiso.lineNos].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([23, 24, 25, 26, 27, 56, 60]);
  });

  it("en la tanda ninguna troza va a dos corridas, y cada una pasa T3, permiso e I2 por fila", () => {
    /* El escenario más lleno: tras corregir y recibir. */
    const llegadas = new Map<string, string>();
    for (const c of diag.corridas) {
      if (c.arreglo.tipo === "corregir_llegada") for (const g of c.arreglo.guias) if (g.propuesta) llegadas.set(g.gtfNumber, g.propuesta);
    }
    const trozas = BLAS.trozas.map((t) => {
      const p = t.gtfNumber ? llegadas.get(t.gtfNumber) : undefined;
      if (!t.guiaRecibida) return { ...t, guiaRecibida: true, fechaIngreso: t.llegada?.guia ?? t.fechaIngreso };
      return p && t.fechaIngreso && p < t.fechaIngreso ? { ...t, fechaIngreso: p } : t;
    });
    const t = proponerTandaDeOrigen(BLAS.corridas, trozas, undefined, opciones);
    expect(t.vinculables).toBe(12);
    const ids = t.pedido.flatMap((p) => p.trozaIds);
    expect(new Set(ids).size).toBe(ids.length);
    const porId = new Map(trozas.map((x) => [x.id, x]));
    const corrida = new Map(BLAS.corridas.map((c) => [c.id, c]));
    const usoFila = new Map<string, number>();
    for (const p of t.pedido) {
      const c = corrida.get(p.corridaId)!;
      for (const id of p.trozaIds) {
        const x = porId.get(id)!;
        expect(claveEspecie(x.especie)).toBe(claveEspecie(c.especie));
        expect((x.fechaIngreso ?? "") <= c.fecha.slice(0, 10)).toBe(true);
        if (c.permiso.codigo) expect(x.permiso.codigo).toBe(c.permiso.codigo);
        usoFila.set(x.fila.id, (usoFila.get(x.fila.id) ?? 0) + x.m3);
      }
      /* De la sierra no sale más de lo que entró (≤, con los 10 litros del patio). */
      const m3 = p.trozaIds.reduce((a, id) => a + porId.get(id)!.m3, 0);
      expect(c.m3Producido).toBeLessThanOrEqual(m3 + 0.01);
    }
    for (const [filaId, usado] of usoFila) {
      const f = trozas.find((x) => x.fila.id === filaId)!.fila;
      expect(usado).toBeLessThanOrEqual(f.m3 - f.consumidoM3 + 1e-9);
    }
    /* La más vieja primero. */
    const fechas = t.pedido.map((p) => corrida.get(p.corridaId)!.fecha);
    expect([...fechas].sort()).toEqual(fechas);
  });

  it("Mashonaste: por qué la tanda da 11 y no 10 (el reparto de siempre cubre primero lo producido)", () => {
    const llegadas: Record<string, string> = { "010-001-0000013": "2026-09-07" };
    const trozas = BLAS.trozas.map((t) =>
      t.gtfNumber && llegadas[t.gtfNumber] && t.guiaRecibida ? { ...t, fechaIngreso: llegadas[t.gtfNumber]! } : t,
    );
    const t = proponerTandaDeOrigen(BLAS.corridas, trozas, undefined, opciones);
    const g = t.grupos.find((x) => x.especie === "Mashonaste")!;
    expect(lineNosDe(g.corridas)).toEqual([31, 55, 59]);
    expect(g.corridas.map((c) => c.m3Trozas)).toEqual([4.441, 3.058, 1.921]);
    expect(g.corridas.filter((c) => c.sobreElTope).map((c) => [c.lineNo, c.rendimientoPct])).toEqual([
      [55, 65.01],
      [59, 62.54],
    ]);
    expect(g.fuera).toEqual([]);
  });
});

// ── Casos chicos, con la forma de Blas ──────────────────────────────────────

const HUA = { contratoId: "ctr_hua", codigo: "10-HUA-PUE/PER-FMP-2026-007" };
const OTRO = { contratoId: null, codigo: "19-SEC/PER-FMC-2024-008" };
const HOY = "2026-09-28";

let n = 0;
function troza(p: Partial<TrozaParaDiagnostico> & { especie: string; m3: number }): TrozaParaDiagnostico {
  n += 1;
  return {
    id: `t${n}`,
    codigo: `A-${String(n).padStart(3, "0")}`,
    gtfNumber: "010-001-0000013",
    fila: { id: `fila-${p.especie}`, especie: p.especie, m3: 100, consumidoM3: 0 },
    permiso: HUA,
    guiaRecibida: true,
    fechaIngreso: "2026-09-01",
    fuera: null,
    lote: null,
    llegada: { guia: "2026-09-01", asiento: "2026-09-08", sigueALaGuia: true },
    ...p,
  };
}
function corrida(p: Partial<CorridaParaDiagnostico> & { id: string; especie: string; m3Producido: number }): CorridaParaDiagnostico {
  return { lineNo: 1, fecha: "2026-09-10", permiso: HUA, materiaPrimaSinTrozas: null, ...p };
}
const ctx = (p: Partial<ContextoDelPatio> = {}): ContextoDelPatio => ({ tomadas: [], guias: [], hoy: HOY, ...p });

describe("la tanda: ninguna troza a dos corridas", () => {
  it("dos corridas de la misma especie y permiso con UNA troza: de a una las dos están listas; en tanda, sólo la más vieja", () => {
    const t1 = troza({ especie: "Copal", m3: 1.2 });
    const a = corrida({ id: "a", lineNo: 10, especie: "Copal", m3Producido: 0.5, fecha: "2026-09-10" });
    const b = corrida({ id: "b", lineNo: 11, especie: "Copal", m3Producido: 0.5, fecha: "2026-09-11" });
    const d = diagnosticarSinOrigen([b, a], [t1], undefined, { contexto: ctx() });
    expect(d.porMotivo.lista).toBe(2);
    const t = proponerTandaDeOrigen([b, a], [t1], undefined, { contexto: ctx() });
    expect(t).toMatchObject({ listas: 2, vinculables: 1, pedido: [{ corridaId: "a", trozaIds: [t1.id] }] });
    expect(t.grupos[0]!.fuera).toEqual([expect.objectContaining({ corridaId: "b", motivo: "sin_madera" })]);
  });

  it("corridas de otro permiso no comparten grupo ni madera", () => {
    const hua = troza({ especie: "Copal", m3: 2 });
    const otro = troza({ especie: "Copal", m3: 2, permiso: OTRO, fila: { id: "fila-otro", especie: "Copal", m3: 10, consumidoM3: 0 } });
    const a = corrida({ id: "a", especie: "Copal", m3Producido: 0.5 });
    const b = corrida({ id: "b", especie: "Copal", m3Producido: 0.5, permiso: OTRO, fecha: "2026-09-11" });
    const t = proponerTandaDeOrigen([a, b], [hua, otro], undefined, { contexto: ctx() });
    expect(t.grupos).toHaveLength(2);
    expect(t.pedido).toEqual([
      { corridaId: "a", trozaIds: [hua.id] },
      { corridaId: "b", trozaIds: [otro.id] },
    ]);
  });

  it("I2 por fila en la tanda: lo que toma la primera corrida ya no está para la segunda", () => {
    const fila = { id: "fila-chica", especie: "Pashaco", m3: 2, consumidoM3: 0.5 };
    const t1 = troza({ especie: "Pashaco", m3: 1, fila });
    const t2 = troza({ especie: "Pashaco", m3: 1, fila });
    const a = corrida({ id: "a", especie: "Pashaco", m3Producido: 0.4 });
    const t = proponerTandaDeOrigen([a], [t1, t2], undefined, { contexto: ctx() });
    /* 2 − 0,5 = 1,5 libres en la fila: entra una troza de 1, no las dos. */
    expect(t.pedido).toEqual([{ corridaId: "a", trozaIds: [t1.id] }]);
  });

  it("la corrida con la madera llegada después no entra en la tanda: su arreglo es la llegada", () => {
    const tarde = troza({ especie: "Cumala", m3: 3, fechaIngreso: "2026-09-23", llegada: { guia: "2026-09-02", asiento: "2026-09-08", sigueALaGuia: true } });
    const c = corrida({ id: "c", especie: "Cumala", m3Producido: 1, fecha: "2026-09-07" });
    const t = proponerTandaDeOrigen([c], [tarde], undefined, { contexto: ctx() });
    expect(t.vinculables).toBe(0);
    const s = simularArreglos([c], [tarde], ctx());
    expect(s.hoy.listas).toBe(0);
    expect(s.trasLlegada).toMatchObject({ listas: 1, enTanda: 1 });
  });
});

describe("arreglos: se proponen, nunca se inventan ni se aplican solos", () => {
  it("la llegada propuesta es la de la guía; una guía con fecha posterior a la corrida no sirve y se dice", () => {
    const c = corrida({ id: "c", especie: "Cumala", m3Producido: 1, fecha: "2026-09-07" });
    const r = proponerTrozas(c, [
      troza({ especie: "Cumala", m3: 3, fechaIngreso: "2026-09-23", llegada: { guia: "2026-09-12", asiento: "2026-09-13", sigueALaGuia: true } }),
    ], undefined, { contexto: ctx() });
    expect(r.motivo).toBe("llegada_posterior");
    expect(r.arreglo).toMatchObject({ tipo: "corregir_llegada", guias: [{ propuesta: "2026-09-12", fuente: "guia", sirve: false }] });
  });

  it("nunca una fecha futura: si la guía dice mañana, se propone hoy", () => {
    const c = corrida({ id: "c", especie: "Cumala", m3Producido: 1, fecha: "2026-09-29" });
    const r = proponerTrozas(c, [
      troza({ especie: "Cumala", m3: 3, fechaIngreso: "2026-09-30", llegada: { guia: "2026-10-05", asiento: "2026-10-05", sigueALaGuia: true } }),
    ], undefined, { contexto: ctx() });
    expect(r.arreglo).toMatchObject({ tipo: "corregir_llegada", guias: [{ propuesta: HOY, fuente: "hoy" }] });
  });

  it("una troza que bajó en otro viaje conserva su fecha: corregir la guía no la mueve", () => {
    const propia = troza({ especie: "Cumala", m3: 3, fechaIngreso: "2026-09-23", llegada: { guia: "2026-09-02", asiento: "2026-09-08", sigueALaGuia: false } });
    const c = corrida({ id: "c", especie: "Cumala", m3Producido: 1, fecha: "2026-09-07" });
    const s = simularArreglos([c], [propia], ctx());
    expect(s.trasLlegada.listas).toBe(0);
  });

  it("«Huayruro» NO es «Huayruro Negro» en la regla: se sugiere, no se propone ninguna troza", () => {
    const r = proponerTrozas(corrida({ id: "h", especie: "Huayruro Negro", m3Producido: 0.5 }), [troza({ especie: "Huayruro", m3: 4 })], undefined, {
      contexto: ctx(),
    });
    expect(r.motivo).toBe("especie_parecida");
    expect(r.propuesta).toEqual([]);
    expect(especiesParecidas("Huayruro", "Huayruro Negro")).toBe(true);
    expect(especiesParecidas("Palo sangre", "Palo rosa")).toBe(false);
    expect(especiesParecidas("Cumala", "CUMALA")).toBe(false);
  });

  it("si HAY trozas de la especie y no alcanzan, no se dice «en el patio no hay X» (la parecida no se sugiere)", () => {
    const r = proponerTrozas(
      corrida({ id: "h", especie: "Huayruro Negro", m3Producido: 2 }),
      [troza({ especie: "Huayruro Negro", m3: 1 }), troza({ especie: "Huayruro", m3: 4 })],
      undefined,
      { contexto: ctx({ guias: [{ id: "w8", gtfNumber: "010-001-0000008", especie: "Huayruro", m3: 2.5, recibida: true, trozas: 1, permiso: HUA }] }) },
    );
    expect(r.motivo).toBe("sin_trozas_de_la_especie");
    expect(r.detalle).toMatch(/faltan trozas\.$/);
  });

  it("madera tomada por otra corrida: dice cuál y cuánto rinden juntas; sin contexto, como antes", () => {
    const tomadas = [1, 2].map((k) => ({
      id: `x${k}`,
      especie: "Cachimbo",
      m3: 2,
      permiso: HUA,
      corrida: { id: "c61", lineNo: 61, fecha: "2026-09-27", m3Producido: 1.5 },
    }));
    const c = corrida({ id: "c32", lineNo: 32, especie: "Cachimbo", m3Producido: 0.5 });
    const r = proponerTrozas(c, [], undefined, { contexto: ctx({ tomadas }) });
    expect(r.motivo).toBe("tomada_por_otra_corrida");
    expect(r.arreglo).toEqual({
      tipo: "soltar_corrida",
      corridas: [{ corridaId: "c61", lineNo: 61, fecha: "2026-09-27", m3Producido: 1.5, abierta: false, trozas: 2, m3: 4, sumadasPct: 50 }],
    });
    /* De otro permiso no cuenta: la madera de un título no explica la de otro.
       (El permiso tiene su guía de Copal, así que tampoco «le falta la guía».) */
    const ajena = tomadas.map((t) => ({ ...t, permiso: OTRO }));
    const guias = [{ id: "w5", gtfNumber: "010-001-0000005", especie: "Copal", m3: 1.752, recibida: true, trozas: 1, permiso: HUA }];
    expect(proponerTrozas(c, [], undefined, { contexto: ctx({ tomadas: ajena, guias }) }).motivo).toBe("sin_trozas_de_la_especie");
    expect(proponerTrozas(c, []).motivo).toBe("sin_trozas_de_la_especie");
  });

  it("el permiso de la corrida sin guía, o con su guía sin lista de trozas → cargar la guía", () => {
    const c = corrida({ id: "t", especie: "Tornillo", m3Producido: 1, permiso: { contratoId: null, codigo: "19-SEC/REG-PLT-2018-020" } });
    const ajena = troza({ especie: "Tornillo", m3: 5, permiso: OTRO });
    const sinGuia = proponerTrozas(c, [ajena], undefined, { contexto: ctx() });
    expect(sinGuia).toMatchObject({ motivo: "guia_sin_trozas", arreglo: { tipo: "cargar_guia", guias: [] } });
    const guias = [
      { id: "w13", gtfNumber: "019-001-0000013", especie: "Tornillo", m3: 21.311, recibida: false, trozas: 0, permiso: c.permiso },
    ];
    const conGuia = proponerTrozas(c, [ajena], undefined, { contexto: ctx({ guias }) });
    expect(conGuia.motivo).toBe("guia_sin_trozas");
    expect(conGuia.detalle).toBe("La guía 019-001-0000013 de este permiso no tiene su lista de trozas y todavía no se recibió: cárgala en Ingresos.");
    /* Con guías de otra especie (el permiso existe en el libro) → es madera de otro permiso. */
    const deOtra = [{ ...guias[0]!, especie: "Copal", trozas: 3 }];
    expect(proponerTrozas(c, [ajena], undefined, { contexto: ctx({ guias: deOtra }) }).motivo).toBe("permiso_distinto");
  });
});
