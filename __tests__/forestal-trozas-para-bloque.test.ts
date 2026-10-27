/**
 * ADR-519, fase 1 — «Elegir las trozas»: un bloque sembrado desde Capacidad
 * trae TODAS las trozas del grupo (65 trozas, 96,957 m³ para amparar 10 m³).
 * La regla pura propone sólo las que hacen falta; el lote por bloque y las
 * jornadas leen `trozasElegidas ?? trozaIds`.
 *
 * Lo que se cuida:
 *  · trozas ENTERAS, primero las que llegaron antes, determinista;
 *  · objetivo = máx(usado ÷ %, usado ÷ 56 %) y cada día bajo su tope;
 *  · la que no llegó, la de mes cerrado y la de otro lote no entran;
 *  · si no alcanza se dice (`faltaM3`), nunca se fuerza.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany, listCierres } = vi.hoisted(() => ({ findMany: vi.fn(), listCierres: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { woodEntryTroza: { findMany } } }));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({ ForestCtpCierreDB: { list: listCierres } }));

import type { AsignacionGrupo, BloqueRolliza, DiaDistribuido } from "@/lib/forestal/cubicacion-reparto";
import type { TrozaDelLote } from "@/lib/forestal/lotes-aserrio";
import { planLibroDeBloque, type LoteParaLibro } from "@/lib/forestal/jornadas-de-bloque";
import { lotesPorBloque, pedidoDelBloque, type TrozaDelBloque } from "@/lib/forestal/lotes-por-bloque";
import {
  elegirTrozasParaBloque,
  rollizaNecesariaM3,
  trozasDelBloque,
  type BloqueParaElegir,
  type TrozaCandidata,
} from "@/lib/forestal/trozas-para-bloque";
import { ForestLoteAserrioDB } from "@/lib/db/forest-lote-aserrio.db";
import { topeDeclarableM3 } from "@/lib/forestal/produccion-paquetes";

const c = (id: string, volumenM3: number, llega: string | null, extra: Partial<TrozaCandidata> = {}): TrozaCandidata => ({
  id,
  volumenM3,
  llegaISO: llega ? `${llega}T12:00:00.000Z` : null,
  ...extra,
});
const unDia = (usadoM3: number, aprovechablePct = 55, extra: Partial<BloqueParaElegir> = {}): BloqueParaElegir => ({
  usadoM3,
  aprovechablePct,
  porDia: [{ dia: 1, m3: usadoM3 }],
  ...extra,
});

describe("elegirTrozasParaBloque — la regla", () => {
  it("alcanza justo: toma por orden de llegada hasta cubrir y deja el resto libre", () => {
    /* 5,5 m³ al 55 % → 10 m³ de rolliza (el 56 % pediría 9,821). */
    const s = elegirTrozasParaBloque(unDia(5.5), [c("t1", 4, "2026-10-01"), c("t2", 3, "2026-10-02"), c("t3", 3, "2026-10-03"), c("t4", 5, "2026-10-04")]);
    expect(s.objetivoRollizaM3).toBe(10);
    expect(s.elegidas).toEqual(["t1", "t2", "t3"]);
    expect(s.elegidasM3).toBe(10);
    expect(s.faltaM3).toBe(0);
    expect(s.excesoM3).toBe(0);
    expect(s.porDia[0]!.motivo).toBeNull();
  });

  it("no alcanza: elige todo lo que hay y dice cuánto falta, sin forzar", () => {
    const s = elegirTrozasParaBloque(unDia(5.5), [c("t1", 4, "2026-10-01"), c("t2", 3, "2026-10-02")]);
    expect(s.elegidas).toEqual(["t1", "t2"]);
    expect(s.faltaM3).toBe(3);
    expect(s.porDia[0]!.motivo).toMatch(/Le faltan 3\.000 m³/);
  });

  it("trozas enteras: la última no se parte y lo que sobra es exceso", () => {
    const s = elegirTrozasParaBloque(unDia(5.5), [c("t1", 4, "2026-10-01"), c("t2", 7, "2026-10-02"), c("t3", 1, "2026-10-03")]);
    expect(s.elegidas).toEqual(["t1", "t2"]);
    expect(s.excesoM3).toBe(1);
  });

  it("tope del 56 % por día: con 70 % de aprovechamiento manda el tope y ningún día lo pasa", () => {
    expect(rollizaNecesariaM3(5.6, 70)).toBe(10);
    const bd: BloqueParaElegir = { usadoM3: 5.6, aprovechablePct: 70, porDia: [{ dia: 1, m3: 2.8 }, { dia: 2, m3: 2.8 }] };
    const s = elegirTrozasParaBloque(bd, ["a", "b", "c", "d", "e"].map((id, i) => c(id, 2.5, `2026-10-0${i + 1}`)));
    expect(s.objetivoRollizaM3).toBe(10);
    expect(s.elegidas).toEqual(["a", "b", "c", "d"]);
    for (const d of s.porDia) {
      expect(d.rollizaM3).toBe(5);
      expect(d.m3).toBeLessThanOrEqual(d.topeM3 + 1e-9);
      expect(d.rendimientoPct).toBeLessThanOrEqual(56);
    }
    /* Ninguna troza en dos días. */
    expect(new Set(s.porDia.flatMap((d) => d.trozaIds)).size).toBe(4);
  });

  it("la troza por recepcionar no entra aunque llegó antes, ni la sin volumen", () => {
    const s = elegirTrozasParaBloque(unDia(1.1), [
      c("t0", 5, "2026-09-01", { porRecepcionar: true }),
      c("tv", 0, "2026-09-02"),
      c("t1", 2, "2026-10-01"),
    ]);
    expect(s.elegidas).toEqual(["t1"]);
    expect(s.descartadas).toEqual([
      { id: "t0", motivo: expect.stringMatching(/por recepcionar/) },
      { id: "tv", motivo: expect.stringMatching(/sin volumen|no tiene volumen/) },
    ]);
  });

  it("mes cerrado: el día cerrado no recibe trozas y su rolliza se dice aparte (no es falta de trozas); la troza con motivo del servidor no entra", () => {
    const bd: BloqueParaElegir = {
      usadoM3: 2.2,
      aprovechablePct: 55,
      porDia: [{ dia: 1, m3: 1.1, cerrado: "setiembre de 2026" }, { dia: 2, m3: 1.1 }],
    };
    const s = elegirTrozasParaBloque(bd, [
      c("tc", 3, "2026-09-01", { motivo: "sus jornadas caen en setiembre de 2026, mes cerrado del libro" }),
      c("t1", 2, "2026-09-02"),
      c("t2", 2, "2026-09-03"),
    ]);
    expect(s.porDia[0]).toMatchObject({ trozaIds: [], rollizaM3: 0, motivo: expect.stringMatching(/mes cerrado/) });
    expect(s.porDia[1]!.trozaIds).toEqual(["t1"]);
    expect(s.elegidas).toEqual(["t1"]);
    expect(s.faltaM3).toBe(0);
    expect(s.faltaPorCierreM3).toBe(2);
    expect(s.objetivoRollizaM3).toBe(2);
    expect(s.descartadas.map((d) => d.id)).toEqual(["tc"]);
  });

  it("orden por llegada: la que llegó antes primero, a igual día por id, sin fecha al final", () => {
    const s = elegirTrozasParaBloque(unDia(5.5), [c("z", 3, null), c("b", 3, "2026-10-02"), c("a", 3, "2026-10-02"), c("y", 3, "2026-10-01"), c("x", 3, "2026-10-05")]);
    expect(s.elegidas).toEqual(["y", "a", "b", "x"]);
  });

  it("determinista: el mismo grupo en otro orden da la misma propuesta", () => {
    const grupo = Array.from({ length: 30 }, (_, i) => c(`t${String(i).padStart(2, "0")}`, 0.8 + (i % 7) * 0.31, `2026-10-${String((i % 9) + 1).padStart(2, "0")}`));
    const bd: BloqueParaElegir = { usadoM3: 6, aprovechablePct: 55, porDia: [{ dia: 1, m3: 2 }, { dia: 2, m3: 2.5 }, { dia: 3, m3: 1.5 }] };
    const a = elegirTrozasParaBloque(bd, grupo);
    const b = elegirTrozasParaBloque(bd, [...grupo].reverse());
    expect(b).toEqual(a);
    expect(a.faltaM3).toBe(0);
    expect(a.elegidas.length).toBeLessThan(grupo.length);
  });

  it("medidas (ADR-505): la única troza que da la pieza larga entra aunque llegó última", () => {
    const pieza = { medida: "2×8×16", espesor: 2, ancho: 8, largo: 16, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", piezas: 4 };
    const corta = { largoM: 3, diametroCm: 60 };
    const s = elegirTrozasParaBloque(unDia(1, 55, { asignado: [{ medidas: [pieza] }] }), [
      c("a", 1, "2026-10-01", { medidas: corta }),
      c("b", 1, "2026-10-02", { medidas: corta }),
      c("larga", 1, "2026-10-09", { medidas: { largoM: 5.2, diametroCm: 60 } }),
    ]);
    expect(s.elegidas).toContain("larga");
    expect(s.elegidas).toEqual(["a", "larga"]);
    expect(s.avisos).toEqual([]);
  });
});

describe("trozasElegidas — lo leen el lote por bloque y las jornadas", () => {
  it("trozasDelBloque: las elegidas que siguen siendo del bloque; vacías = todas", () => {
    expect(trozasDelBloque({ trozaIds: ["a", "b", "c"], trozasElegidas: ["c", "x", "a", "a"] })).toEqual(["c", "a"]);
    expect(trozasDelBloque({ trozaIds: ["a", "b"], trozasElegidas: [] })).toEqual(["a", "b"]);
    expect(trozasDelBloque({ trozaIds: ["a", "b"], trozasElegidas: null })).toEqual(["a", "b"]);
    /* Sin trozas del bloque no hay elegidas que valgan: nunca una de afuera. */
    expect(trozasDelBloque({ trozaIds: [], trozasElegidas: ["a"] })).toEqual([]);
    expect(trozasDelBloque({ trozaIds: null, trozasElegidas: ["a"] })).toEqual([]);
  });

  it("lotes-por-bloque: el pedido y el lote salen sólo con las elegidas", () => {
    const b = { id: "b1", etiqueta: "019-001-0000004", trozaIds: ["a", "b", "c", "d"], trozasElegidas: ["a", "c"] };
    expect(pedidoDelBloque(b)).toEqual({ bloqueId: "b1", etiqueta: "019-001-0000004", trozaIds: ["a", "c"] });
    const t = (id: string): TrozaDelBloque => ({
      id, especieComun: "Tornillo", especieCientifica: null, permiso: "19-SEC/REG-PLT-2021-017", titular: null,
      volumenM3: 1.25, gtfNumber: "019-001-0000004", estado: "elegible", enLote: null, motivo: null,
    });
    const [r] = lotesPorBloque([pedidoDelBloque(b)], ["a", "b", "c", "d"].map(t));
    expect(r).toMatchObject({ listo: true, trozas: 2, m3: 2.5 });
    expect(r!.listo && [...r!.trozaIds].sort()).toEqual(["a", "c"]);
  });

  it("planLibroDeBloque: las jornadas consumen sólo las elegidas y el faltante se mide contra ellas", () => {
    const grupo = (m3: number): AsignacionGrupo => ({
      clave: "tipo|comercial", label: "Comercial", piezas: 30, m3, pieTablar: Math.round(m3 * 424),
      medidas: [{ clave: "m", medida: "2×8×10", espesor: 2, ancho: 8, largo: 10, uEspesor: "pulg", uAncho: "pulg", uLargo: "pie", m3, pieTablar: Math.round(m3 * 424), piezas: 30 }],
    });
    const dia: DiaDistribuido = { dia: 1, grupos: [grupo(0.9)], piezas: 30, m3: 0.9, pieTablar: 382 };
    const troza = (id: string, volumenM3: number): TrozaDelLote => ({ id, codificacion: null, codigoPlanta: `P-${id}`, volumenM3, consumidaEnId: null });
    const trozas = [troza("t1", 1.2), troza("t2", 1.1), troza("t3", 0.9), troza("t4", 0.8)];
    const lote: LoteParaLibro = { id: "L1", code: "LA-2026-014", trozas, corridas: [], volumenM3: 4 };
    const bloque: BloqueRolliza = {
      id: "b1", etiqueta: "Guía 019-11", especie: "Tornillo", m3: 4, origen: "trozas",
      trozaIds: ["t1", "t2", "t3", "t4"], trozasElegidas: ["t1", "t2"], loteId: "L1", dias: 1, fecha: "2026-10-01",
    };
    const p = planLibroDeBloque({ bloque, porDia: [dia] }, lote, "2026-10-03");
    expect([...p.jornadas[0]!.trozaIds].sort()).toEqual(["t1", "t2"]);
    expect(p.jornadas[0]!.rollizaM3).toBeCloseTo(2.3, 4);
    expect(p.sinAtribuirM3).toBe(0);

    /* Sin elegir: las cuatro, como siempre. */
    const todas = planLibroDeBloque({ bloque: { ...bloque, trozasElegidas: null }, porDia: [dia] }, lote, "2026-10-03");
    expect([...todas.jornadas[0]!.trozaIds].sort()).toEqual(["t1", "t2", "t3", "t4"]);

    /* Las elegidas no alcanzan (2 m³ al 55 % piden 3,6364 de rolliza): el faltante se dice. */
    const corto: DiaDistribuido = { ...dia, grupos: [grupo(2)], m3: 2 };
    const p2 = planLibroDeBloque({ bloque, porDia: [corto], aprovechablePct: 55 }, lote, "2026-10-03");
    expect(p2.sinAtribuirM3).toBeCloseTo(1.3364, 4);
    expect(p2.jornadas[0]!.estado).toBe("apagada");
  });
});

describe("revisión: elegir lo justo y que el Libro reparta lo mismo", () => {
  const grupoDe = (m3: number): AsignacionGrupo => ({
    clave: "tipo|comercial", label: "Comercial", piezas: 10, m3, pieTablar: Math.round(m3 * 424),
    medidas: [{ clave: "m", medida: "2×8×10", espesor: 2, ancho: 8, largo: 10, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", m3, pieTablar: Math.round(m3 * 424), piezas: 10 }],
  });
  const diaDe = (dia: number, m3: number): DiaDistribuido => ({ dia, grupos: [grupoDe(m3)], piezas: 10, m3, pieTablar: Math.round(m3 * 424) });
  /** Elige con la regla y corre el plan del Libro con esas elegidas. */
  const elegirYPlanear = (m3PorDia: number[], pct: number, trozas: TrozaCandidata[]) => {
    const sel = elegirTrozasParaBloque(
      { usadoM3: m3PorDia.reduce((a, x) => a + x, 0), aprovechablePct: pct, porDia: m3PorDia.map((m3, i) => ({ dia: i + 1, m3 })) },
      trozas,
    );
    const lote: LoteParaLibro = {
      id: "L1", code: "LA-2026-099", corridas: [], volumenM3: 0,
      trozas: trozas.map((t) => ({ id: t.id, codificacion: null, codigoPlanta: null, volumenM3: t.volumenM3, consumidaEnId: null })),
    };
    const bloque: BloqueRolliza = {
      id: "b1", etiqueta: "Guía 019-99", especie: "Tornillo", m3: 0, origen: "trozas", trozaIds: trozas.map((t) => t.id),
      trozasElegidas: sel.elegidas, loteId: "L1", dias: m3PorDia.length, fecha: "2026-10-01",
    };
    const plan = planLibroDeBloque({ bloque, porDia: m3PorDia.map((m3, i) => diaDe(i + 1, m3)), aprovechablePct: pct }, lote, "2026-10-27");
    return { sel, plan };
  };

  it("repro de la revisión: días 1,749 / 4,242 / 0,956 → el Libro usa el mismo reparto y ningún día pasa su tope", () => {
    const trozas = [c("t1", 3, "2026-09-01"), c("t2", 1.832, "2026-09-02"), c("t3", 6.021, "2026-09-03"), c("t4", 1.839, "2026-09-04"), c("t5", 1.839, "2026-09-05")];
    const { sel, plan } = elegirYPlanear([1.749, 4.242, 0.956], 55, trozas);
    expect(sel.faltaM3).toBe(0);
    expect(sel.porDia.map((d) => d.rollizaM3)).toEqual([4.832, 7.86, 1.839]);
    expect(plan.jornadas.map((j) => j.rollizaM3)).toEqual([4.832, 7.86, 1.839]);
    expect(plan.jornadas.map((j) => [...j.trozaIds].sort())).toEqual(sel.porDia.map((d) => [...d.trozaIds].sort()));
    expect(plan.jornadas[0]!.estado).toBe("lista");
    for (const j of plan.jornadas) expect(j.m3).toBeLessThanOrEqual(topeDeclarableM3(j.rollizaM3) + 0.001);
  });

  it("caso A (días 1 / 1 / 8; trozas 1,9 / 1,9 / 14,6): alcanza con las 3 y no inventa faltas", () => {
    const s = elegirTrozasParaBloque(
      { usadoM3: 10, aprovechablePct: 55, porDia: [{ dia: 1, m3: 1 }, { dia: 2, m3: 1 }, { dia: 3, m3: 8 }] },
      [c("a", 1.9, "2026-09-01"), c("b", 1.9, "2026-09-02"), c("g", 14.6, "2026-09-03")],
    );
    expect(s.faltaM3).toBe(0);
    expect(s.elegidas).toEqual(["a", "b", "g"]);
    expect(s.porDia.map((d) => d.trozaIds)).toEqual([["a"], ["b"], ["g"]]);
    expect(s.porDia.every((d) => d.motivo === null)).toBe(true);
  });

  it("caso B (+2 trozas de 1,9 que llegaron después): sigue eligiendo 3, no 5", () => {
    const s = elegirTrozasParaBloque(
      { usadoM3: 10, aprovechablePct: 55, porDia: [{ dia: 1, m3: 1 }, { dia: 2, m3: 1 }, { dia: 3, m3: 8 }] },
      [c("a", 1.9, "2026-09-01"), c("b", 1.9, "2026-09-02"), c("g", 14.6, "2026-09-03"), c("d", 1.9, "2026-09-04"), c("e", 1.9, "2026-09-05")],
    );
    expect(s.faltaM3).toBe(0);
    expect(s.elegidas).toEqual(["a", "b", "g"]);
    expect(s.elegidasM3).toBe(18.4);
  });

  it("búsqueda aleatoria (semilla fija, 400 casos con falta 0): el Libro nunca deja un día sobre su tope", () => {
    let semilla = 519;
    const azar = () => {
      semilla = (semilla + 0x6d2b79f5) | 0;
      let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const r3 = (x: number) => Math.round(x * 1000) / 1000;
    let casos = 0;
    let intentos = 0;
    while (casos < 400 && intentos < 5000) {
      intentos++;
      const dias = 1 + Math.floor(azar() * 4);
      const m3PorDia = Array.from({ length: dias }, () => r3(0.2 + azar() * 4.8));
      const pct = Math.round(35 + azar() * 40);
      const trozas = Array.from({ length: 3 + Math.floor(azar() * 22) }, (_, i) =>
        c(`t${String(i).padStart(2, "0")}`, r3(0.2 + azar() * (azar() < 0.2 ? 14 : 4)), `2026-09-${String(1 + Math.floor(azar() * 28)).padStart(2, "0")}`),
      );
      const { sel, plan } = elegirYPlanear(m3PorDia, pct, trozas);
      if (sel.faltaM3 !== 0) continue;
      casos++;
      for (const j of plan.jornadas) {
        expect(j.trozaIds.length, `caso ${intentos}, día ${j.dia}`).toBeGreaterThan(0);
        expect(j.m3, `caso ${intentos}, día ${j.dia}`).toBeLessThanOrEqual(topeDeclarableM3(j.rollizaM3) + 0.001);
        expect(j.motivo ?? "", `caso ${intentos}, día ${j.dia}`).not.toMatch(/tope/);
      }
      expect(plan.sinAtribuirM3).toBe(0);
      expect(plan.jornadas.map((j) => j.rollizaM3)).toEqual(sel.porDia.map((d) => d.rollizaM3));
    }
    expect(casos).toBe(400);
  });
});

describe("ForestLoteAserrioDB.elegiblesDe — relee las trozas (mes cerrado, llegada, otro lote)", () => {
  const fila = (id: string, extra: Record<string, unknown> = {}) => ({
    id, codigoPlanta: `P-${id}`, codificacion: null, especieComun: "Tornillo", volumenM3: 2,
    largoM: null, d1Cm: null, d2Cm: null, diametroCm: null, recibidaD1Cm: null, recibidaD2Cm: null, oxD1Pulg: null, oxD2Pulg: null,
    consumidaEnId: null, noRecepcionada: false, fechaRecepcion: new Date("2026-09-20T12:00:00Z"), descarte: false,
    loteAserrioId: null, loteAserrio: null, _count: { retrozos: 0 }, despachadaEn: null, loteMixto: null,
    entry: { status: "validado", deletedAt: null, fechaRecepcion: new Date("2026-09-20T12:00:00Z"), gtfNumber: "019-1", entryDate: new Date("2026-09-19T00:00:00Z"), originCode: "P-1" },
    ...extra,
  });
  const setiembre = { periodKey: "2026-09", from: "2026-09-01T05:00:00.000Z", to: "2026-10-01T04:59:59.999Z", label: "setiembre de 2026", closedAt: "2026-10-02T00:00:00.000Z", reabierto: false };

  beforeEach(() => {
    findMany.mockReset();
    listCierres.mockReset();
  });

  it("filtra por tenant y marca mes cerrado, llegada posterior, otro lote y la que no es del negocio", async () => {
    findMany.mockResolvedValue([
      fila("ok"),
      fila("tarde", { fechaRecepcion: new Date("2026-10-08T12:00:00Z") }),
      fila("otroLote", { loteAserrioId: "L9", loteAserrio: { code: "LA-2026-009", deletedAt: null } }),
      fila("propio", { loteAserrioId: "L1", loteAserrio: { code: "LA-2026-001", deletedAt: null } }),
    ]);
    listCierres.mockResolvedValue([setiembre]);
    const r = await ForestLoteAserrioDB.elegiblesDe("tenant-1", ["ok", "tarde", "otroLote", "propio", "ajena"], {
      loteId: "L1", especie: "Tornillo", fechas: ["2026-10-01", "2026-10-02"],
    });
    expect(findMany.mock.calls[0]![0].where).toEqual({ id: { in: ["ok", "tarde", "otroLote", "propio", "ajena"] }, tenantId: "tenant-1" });
    const motivo = Object.fromEntries(r.trozas.map((t) => [t.id, t.motivo]));
    expect(motivo.ok).toBeNull();
    expect(motivo.propio).toBeNull();
    expect(motivo.otroLote).toMatch(/LA-2026-009/);
    expect(motivo.tarde).toMatch(/después de la última jornada/);
    expect(r.noEncontradas).toEqual(["ajena"]);
    expect(r.cerradoDe).toEqual({});
  });

  it("si todas las jornadas caen en mes cerrado, ninguna troza entra; con un día abierto sí", async () => {
    findMany.mockResolvedValue([fila("ok")]);
    listCierres.mockResolvedValue([setiembre]);
    const cerrado = await ForestLoteAserrioDB.elegiblesDe("tenant-1", ["ok"], { fechas: ["2026-09-25", "2026-09-26"] });
    expect(cerrado.trozas[0]!.motivo).toMatch(/setiembre de 2026, mes cerrado/);
    expect(cerrado.cerradoDe).toEqual({ "2026-09-25": "setiembre de 2026", "2026-09-26": "setiembre de 2026" });

    const mixto = await ForestLoteAserrioDB.elegiblesDe("tenant-1", ["ok"], { fechas: ["2026-09-30", "2026-10-01"] });
    expect(mixto.trozas[0]!.motivo).toBeNull();
    expect(mixto.cerradoDe).toEqual({ "2026-09-30": "setiembre de 2026" });
  });

  it("tenantId vacío no lee nada", async () => {
    await expect(ForestLoteAserrioDB.elegiblesDe("", ["ok"])).rejects.toThrow(/tenantId/);
    expect(findMany).not.toHaveBeenCalled();
  });
});
