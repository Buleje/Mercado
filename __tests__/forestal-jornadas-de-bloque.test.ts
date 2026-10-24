/**
 * ADR-464, fases 3 y 4 — el plan de qué escribe cada jornada del bloque en el
 * Libro y qué falta para completar su lote. Puro: sin DB ni red.
 *
 * Lo que se cuida (invariantes del Libro):
 *  · T1: una troza va a UNA sola jornada y nunca dos veces; la ya consumida por
 *    otra corrida no entra (queda sin atribuir, no se fuerza);
 *  · el tope del 56 % y el «no registrar el futuro» se avisan ANTES de abrir la
 *    corrida (abrirla y no poder declararla deja materia prima colgada);
 *  · idempotencia: el día escrito no se ofrece de nuevo, salvo que su corrida
 *    se haya anulado (manda el Libro, no la marca guardada).
 */
import { describe, expect, it } from "vitest";
import type { AsignacionGrupo, BloqueRolliza, DiaDistribuido } from "@/lib/forestal/cubicacion-reparto";
import type { CorridaDelLote, TrozaDelLote } from "@/lib/forestal/lotes-aserrio";
import { completarDelLote, motivoLpc, planLibroDeBloque, type LoteParaLibro } from "@/lib/forestal/jornadas-de-bloque";
import { registrarJornadas } from "@/lib/forestal/registrar-jornadas";

const HOY = "2026-10-03";

const grupo = (clave: string, label: string, piezas: number, m3: number): AsignacionGrupo => ({
  clave, label, piezas, m3, pieTablar: Math.round(m3 * 424),
  medidas: [{ clave: `${clave}-m`, medida: "2×8×10", espesor: 2, ancho: 8, largo: 10, uEspesor: "pulg", uAncho: "pulg", uLargo: "pie", m3, pieTablar: Math.round(m3 * 424), piezas }],
});
const dia = (n: number, grupos: AsignacionGrupo[]): DiaDistribuido => ({
  dia: n, grupos, piezas: grupos.reduce((a, g) => a + g.piezas, 0), m3: grupos.reduce((a, g) => a + g.m3, 0), pieTablar: grupos.reduce((a, g) => a + g.pieTablar, 0),
});
const troza = (id: string, volumenM3: number, consumidaEnId: string | null = null): TrozaDelLote => ({
  id, codificacion: null, codigoPlanta: `P-${id}`, volumenM3, consumidaEnId,
});
const corrida = (id: string, lineNo: number, quantity: number | null, extra: Partial<CorridaDelLote> = {}): CorridaDelLote => ({
  id, lineNo, entryDate: "2026-10-01T12:00:00.000Z", productType: "MADERA ASERRADA (COMERCIAL)", quantity, volumeInputM3: 2, unit: "m3", status: "registrado", viva: true, ...extra,
});
const bloque = (extra: Partial<BloqueRolliza> = {}): BloqueRolliza => ({
  id: "b1", etiqueta: "Guía 019-11", especie: "Tornillo", m3: 4, origen: "trozas",
  trozaIds: ["t1", "t2", "t3", "t4"], loteId: "L1", dias: 2, fecha: "2026-10-01", ...extra,
});
const lote = (trozas: TrozaDelLote[], corridas: CorridaDelLote[] = []): LoteParaLibro => ({
  id: "L1", code: "LA-2026-014", trozas, corridas, volumenM3: trozas.reduce((a, t) => a + (t.volumenM3 ?? 0), 0),
});
const cuatroTrozas = () => [troza("t1", 1.2), troza("t2", 1.1), troza("t3", 0.9), troza("t4", 0.8)];
/* 0,9 + 0,9 m³ de aserrada sobre 4 m³ de rolliza: 45 %, bajo el tope. */
const dosDias = () => [dia(1, [grupo("tipo|comercial", "Comercial", 30, 0.9)]), dia(2, [grupo("tipo|comercial", "Comercial", 30, 0.9)])];

describe("planLibroDeBloque — fase 3", () => {
  it("bloque a mano o sin lote: todas las jornadas apagadas con el motivo", () => {
    const manual = planLibroDeBloque({ bloque: bloque({ trozaIds: null, origen: "manual" }), porDia: dosDias() }, null, HOY);
    expect(manual.jornadas.map((j) => j.estado)).toEqual(["apagada", "apagada"]);
    expect(manual.motivo).toMatch(/Tráelo del Libro/);

    const sinLote = planLibroDeBloque({ bloque: bloque({ loteId: null }), porDia: dosDias() }, null, HOY);
    expect(sinLote.motivo).toMatch(/Crea su lote primero/);
  });

  it("reparte trozas ENTERAS: ninguna en dos días, todas usadas, y el Libro se llena en orden", () => {
    const p = planLibroDeBloque({ bloque: bloque(), porDia: dosDias() }, lote(cuatroTrozas()), HOY);
    const [d1, d2] = p.jornadas;
    const todas = [...d1!.trozaIds, ...d2!.trozaIds];
    expect(new Set(todas).size).toBe(4);
    expect(todas.sort()).toEqual(["t1", "t2", "t3", "t4"]);
    expect(d1!.trozaIds.length).toBeGreaterThan(0);
    expect(d2!.trozaIds.length).toBeGreaterThan(0);
    /* Partes parecidas: 2 m³ cada día (1,2 + 0,8 y 1,1 + 0,9). */
    expect(d1!.rollizaM3).toBeCloseTo(2, 4);
    expect(d2!.rollizaM3).toBeCloseTo(2, 4);
    expect(d1!.estado).toBe("lista");
    expect(d2!.estado).toBe("apagada");
    expect(d2!.motivo).toMatch(/Registra primero el día 1/);
    expect(d1!.fecha).toBe("2026-10-01");
    expect(d2!.fecha).toBe("2026-10-02");
  });

  it("idempotencia: el día escrito queda «en el libro» y sus trozas ya no se reparten", () => {
    const trozas = [troza("t1", 1.2, "c1"), troza("t2", 1.1), troza("t3", 0.9), troza("t4", 0.8, "c1")];
    const b = bloque({ jornadasLibro: [{ dia: 1, corridaId: "c1", lineNo: 41, estado: "declarada", fecha: "2026-10-01" }] });
    const p = planLibroDeBloque({ bloque: b, porDia: dosDias() }, lote(trozas, [corrida("c1", 41, 0.9)]), HOY);
    expect(p.jornadas[0]).toMatchObject({ estado: "en-libro", lineNo: 41, corridaId: "c1" });
    expect(p.jornadas[1]!.estado).toBe("lista");
    expect(p.jornadas[1]!.trozaIds.sort()).toEqual(["t2", "t3"]);
    expect(p.noDisponibles).toBe(0);
  });

  it("si la corrida del día se anuló, el día vuelve a poder registrarse (manda el Libro)", () => {
    const b = bloque({ jornadasLibro: [{ dia: 1, corridaId: "c-anulada", lineNo: 41, estado: "declarada", fecha: "2026-10-01" }] });
    const p = planLibroDeBloque({ bloque: b, porDia: dosDias() }, lote(cuatroTrozas(), []), HOY);
    expect(p.jornadas[0]!.estado).toBe("lista");
    expect(p.jornadas[0]!.aviso).toMatch(/se anuló/);
  });

  it("corrida que consumió y no declaró: «abierta», no se ofrece registrar otra vez", () => {
    const trozas = [troza("t1", 1.2, "c1"), troza("t2", 1.1), troza("t3", 0.9), troza("t4", 0.8, "c1")];
    const b = bloque({ jornadasLibro: [{ dia: 1, corridaId: "c1", lineNo: 41, estado: "declarada", fecha: "2026-10-01" }] });
    const p = planLibroDeBloque({ bloque: b, porDia: dosDias() }, lote(trozas, [corrida("c1", 41, null)]), HOY);
    expect(p.jornadas[0]!.estado).toBe("abierta");
    expect(p.jornadas[0]!.motivo).toMatch(/declárale la producción a la corrida N° 41/);
  });

  it("T1: la troza consumida por OTRA corrida no entra, queda sin atribuir y frena los días (pudo ser esta jornada desde otro equipo)", () => {
    const trozas = [troza("t1", 1.2, "ajena"), troza("t2", 1.1), troza("t3", 0.9), troza("t4", 0.8)];
    const p = planLibroDeBloque({ bloque: bloque(), porDia: dosDias() }, lote(trozas, [corrida("ajena", 77, 0.9)]), HOY);
    expect(p.jornadas.flatMap((j) => j.trozaIds)).not.toContain("t1");
    expect(p.noDisponibles).toBe(1);
    expect(p.sinAtribuirM3).toBeCloseTo(1.2, 4);
    expect(p.jornadas.map((j) => j.estado)).toEqual(["apagada", "apagada"]);
    expect(p.jornadas[0]!.motivo).toMatch(/corrida N° 77/);
  });

  it("una troza que salió del lote (no consumida) sólo resta: los días siguen con las demás", () => {
    const trozas = [troza("t2", 1.1), troza("t3", 0.9), troza("t4", 0.8)];
    /* 0,6 por día: con 1,1 m³ el tope deja 0,616 (con 0,9 por día lo apagaba el tope, no esto). */
    const porDia = [dia(1, [grupo("tipo|comercial", "Comercial", 20, 0.6)]), dia(2, [grupo("tipo|comercial", "Comercial", 20, 0.6)])];
    const p = planLibroDeBloque({ bloque: bloque(), porDia }, lote(trozas), HOY);
    expect(p.noDisponibles).toBe(1);
    expect(p.jornadas[0]!.estado).toBe("lista");
    expect(p.jornadas.flatMap((j) => j.trozaIds).sort()).toEqual(["t2", "t3", "t4"]);
  });

  it("T1: menos trozas que días → el día sin troza entera se apaga (no se parte una)", () => {
    const b = bloque({ trozaIds: ["t1"] , m3: 2 });
    const porDia = [dia(1, [grupo("tipo|comercial", "Comercial", 10, 0.3)]), dia(2, [grupo("tipo|comercial", "Comercial", 10, 0.3)])];
    const p = planLibroDeBloque({ bloque: b, porDia }, lote([troza("t1", 2)]), HOY);
    const sinTroza = p.jornadas.find((j) => j.trozaIds.length === 0)!;
    expect(sinTroza.estado).toBe("apagada");
    expect(sinTroza.motivo).toMatch(/una troza no se parte entre dos corridas/);
  });

  it("tope del 56 %: el día que lo pasaría se apaga antes de abrir la corrida", () => {
    const porDia = [dia(1, [grupo("tipo|comercial", "Comercial", 80, 2.5)])];
    const p = planLibroDeBloque({ bloque: bloque({ dias: 1 }), porDia }, lote(cuatroTrozas()), HOY);
    expect(p.jornadas[0]!.estado).toBe("apagada");
    expect(p.jornadas[0]!.motivo).toMatch(/tope del 56 %/);
  });

  it("un día que todavía no pasó no se registra", () => {
    const p = planLibroDeBloque({ bloque: bloque({ dias: 1, fecha: "2026-10-09" }), porDia: [dosDias()[0]!] }, lote(cuatroTrozas()), HOY);
    expect(p.jornadas[0]!.estado).toBe("apagada");
    expect(p.jornadas[0]!.motivo).toMatch(/no registra un día que no pasó/);
  });

  it("un día futuro sin escribir queda «en espera» (por él no se ofrece «Completar»)", () => {
    const p = planLibroDeBloque({ bloque: bloque({ fecha: "2026-10-03" }), porDia: dosDias() }, lote(cuatroTrozas()), HOY);
    expect(p.jornadas[0]!.enEspera).toBeFalsy();
    expect(p.jornadas[1]!.enEspera).toBe(true); // el día 2 cae el 04-10
  });

  it("un «Completar» cuya corrida se anuló ya no apaga el día (no traba el bloque)", () => {
    const b = bloque({ complementos: [{ linea: "LPC", corridaId: "c-anulada", lineNo: 9, claves: ["tipo|comercial"], m3: 0.9, fecha: HOY }] });
    const l = lote(cuatroTrozas(), [corrida("c-anulada", 9, 0.9, { viva: false })]);
    const p = planLibroDeBloque({ bloque: b, porDia: dosDias() }, l, HOY);
    expect(p.jornadas[0]!.motivo ?? "").not.toMatch(/ya se declaró con «Completar»/);
  });

  it("madera ya aserrada: no dibuja nada", () => {
    expect(planLibroDeBloque({ bloque: bloque({ tipo: "aserrada" }), porDia: dosDias() }, lote(cuatroTrozas()), HOY).oculto).toBe(true);
  });

  it("una línea que ya salió con «Completar» apaga el día que la lleva", () => {
    const b = bloque({ complementos: [{ linea: "LRE", corridaId: null, lineNo: null, claves: ["tipo|comercial"], m3: 0.9, fecha: HOY }] });
    const p = planLibroDeBloque({ bloque: b, porDia: dosDias() }, lote(cuatroTrozas()), HOY);
    expect(p.jornadas[0]!.estado).toBe("apagada");
    expect(p.jornadas[0]!.motivo).toMatch(/ya se declaró con «Completar»/);
  });
});

describe("completarDelLote — fase 4", () => {
  const consumidas = () => cuatroTrozas().map((t) => ({ ...t, consumidaEnId: "c1" }));

  it("sin rolliza libre: LPC se suma a una corrida con margen; lo que falta son los días no escritos", () => {
    /* La corrida c1 entró con 4 m³ y declaró 0,9: tope 2,24 → margen 1,34. */
    const b = bloque({ jornadasLibro: [{ dia: 1, corridaId: "c1", lineNo: 41, estado: "declarada", fecha: "2026-10-01" }] });
    const plan = completarDelLote({ bloque: b, porDia: dosDias() }, lote(consumidas(), [corrida("c1", 41, 0.9, { volumeInputM3: 4 })]))!;
    expect(plan.ofrecer).toBe(true);
    expect(plan.trozasLibres).toHaveLength(0);
    expect(plan.lineas.map((g) => [g.clave, g.piezas])).toEqual([["tipo|comercial", 30]]);
    expect(plan.corridas[0]!.margen?.margenM3).toBeCloseTo(1.34, 4);
    expect(plan.margenLoteM3).toBeCloseTo(1.34, 4);
    expect(motivoLpc(plan, plan.lineas, { corridaId: "c1", fecha: HOY, hoy: HOY })).toBeNull();
  });

  it("LPC nunca pasa el margen de la corrida elegida", () => {
    const b = bloque();
    const porDia = [dia(1, [grupo("tipo|comercial", "Comercial", 60, 1.8)])];
    const plan = completarDelLote({ bloque: b, porDia }, lote(consumidas(), [corrida("c1", 41, 0.9, { volumeInputM3: 4 })]))!;
    expect(motivoLpc(plan, plan.lineas, { corridaId: "c1", fecha: HOY, hoy: HOY })).toMatch(/le quedan 1[.,]34/);
  });

  it("con rolliza libre: corrida nueva con su propio tope", () => {
    const trozas = [troza("t1", 1.2, "c1"), troza("t2", 1.1, "c1"), troza("t3", 0.9), troza("t4", 0.8)];
    const plan = completarDelLote({ bloque: bloque(), porDia: dosDias() }, lote(trozas, [corrida("c1", 41, 0.9, { volumeInputM3: 2.3 })]))!;
    expect(plan.trozasLibres.map((t) => t.id).sort()).toEqual(["t3", "t4"]);
    expect(plan.rollizaLibreM3).toBeCloseTo(1.7, 4);
    expect(plan.topeCorridaNuevaM3).toBeCloseTo(0.952, 4);
    const una = plan.lineas.map((g) => ({ ...g, piezas: 30, m3: 0.9 }));
    expect(motivoLpc(plan, una, { corridaId: null, fecha: HOY, hoy: HOY })).toBeNull();
    expect(motivoLpc(plan, una, { corridaId: null, fecha: "2026-10-05", hoy: HOY })).toMatch(/todavía no pasó/);
  });

  it("lo ya completado no se ofrece otra vez; un lote sin producción no ofrece «Completar»", () => {
    const b = bloque({ complementos: [{ linea: "LPC", corridaId: "c1", lineNo: 41, claves: ["tipo|comercial"], m3: 1.8, fecha: HOY }] });
    const plan = completarDelLote({ bloque: b, porDia: dosDias() }, lote(consumidas(), [corrida("c1", 41, 0.9, { volumeInputM3: 4 })]))!;
    expect(plan.lineas).toHaveLength(0);
    const sinProduccion = completarDelLote({ bloque: bloque(), porDia: dosDias() }, lote(cuatroTrozas(), []))!;
    expect(sinProduccion.ofrecer).toBe(false);
  });
});

describe("registrarJornadas devuelve el id de la corrida (para guardarlo en el bloque)", () => {
  it("declarada y abierta traen `corridaId`; la que no consumió, no", async () => {
    const jornadas = [1, 2, 3].map((n) => ({ dia: n, fecha: HOY, trozaIds: [`t${n}`], etiquetas: [], rollizaM3: 1, grupos: [], piezas: 1, pieTablar: 1, m3: 0.4 }));
    const r = await registrarJornadas(jornadas, {
      consumir: async (j) => {
        if (j.dia === 3) throw new Error("La troza ya se consumió");
        return { id: `c${j.dia}`, lineNo: 40 + j.dia };
      },
      declarar: async (id) => {
        if (id === "c2") throw new Error("pasa el tope");
      },
    });
    expect(r.resultados.map((x) => [x.estado, x.corridaId])).toEqual([
      ["declarada", "c1"],
      ["corrida-abierta", "c2"],
      ["no-consumio", undefined],
    ]);
  });
});
