/**
 * Qué borra el vaciado del Libro con VARIOS alcances a la vez, y la regla de
 * dependencias de «Lotes» (Brandon 2026-10-02).
 *
 * El plan es puro (`planificarVaciado` sobre una foto armada a mano): acá se
 * prueba cada regla sin base. La escritura y el todo-o-nada se prueban en
 * `forestal-purga-vaciar.test.ts` con una base simulada.
 */
import { describe, expect, it } from "vitest";
import {
  alcancesDeLaUrl,
  alcancesSchema,
  planificarVaciado,
  type PlanVaciado,
  type SnapCorrida,
  type SnapTroza,
  type SnapshotLibro,
} from "@/lib/forestal/ctp-purga-plan";
import type { AlcanceParcial } from "@/lib/forestal/ctp-purga-tipos";

const corrida = (id: string, extra: Partial<SnapCorrida> = {}): SnapCorrida => ({
  id,
  section: "produccion",
  status: "registrado",
  borrada: false,
  quantity: 10,
  lineNo: Number(id.replace(/\D/g, "")) || 1,
  gtfNumber: null,
  ...extra,
});
const troza = (id: string, extra: Partial<SnapTroza> = {}): SnapTroza => ({
  id,
  consumidaEnId: null,
  despachadaEnId: null,
  loteAserrioId: null,
  loteMixtoId: null,
  trozaOrigenId: null,
  ...extra,
});
const libro = (x: Partial<SnapshotLibro> = {}): SnapshotLibro => ({
  corridas: [],
  trozas: [],
  despachoOrigenes: [],
  reprocesos: [],
  loteMiembros: [],
  consumos: [],
  lotesAserrio: [],
  lotesMixtos: [],
  lotesComerciales: [],
  ...x,
});
const lote = (id: string, extra: Partial<SnapshotLibro["lotesAserrio"][number]> = {}) => ({
  id,
  code: id.toUpperCase(),
  status: "abierto",
  produccionEntryId: null,
  loteMixtoId: null,
  ...extra,
});

/**
 * Referencias que quedarían apuntando a algo borrado si se aplicara el plan.
 * Es el invariante que el vaciado NUNCA puede romper.
 */
function colgantes(snap: SnapshotLibro, plan: PlanVaciado): string[] {
  const corridasFuera = new Set(plan.corridasABorrar);
  const lotesFuera = new Set(plan.lotesAserrioABorrar);
  const mixtosFuera = new Set(plan.lotesMixtosABorrar);
  const comercialesFuera = new Set(plan.lotesComercialesABorrar);
  const trozasFuera = new Set(plan.trozasABorrar);
  const soltarC = new Set(plan.soltarConsumo);
  const soltarL = new Set(plan.soltarDeLote);
  const soltarM = new Set(plan.soltarDeMixto);
  const out: string[] = [];
  for (const t of snap.trozas) {
    if (trozasFuera.has(t.id)) continue;
    if (t.consumidaEnId && corridasFuera.has(t.consumidaEnId) && !soltarC.has(t.id)) out.push(`troza ${t.id} → corrida`);
    if (t.loteAserrioId && lotesFuera.has(t.loteAserrioId) && !soltarL.has(t.id)) out.push(`troza ${t.id} → lote`);
    if (t.loteMixtoId && mixtosFuera.has(t.loteMixtoId) && !soltarM.has(t.id)) out.push(`troza ${t.id} → mixto`);
  }
  for (const m of snap.loteMiembros) {
    if (corridasFuera.has(m.produccionEntryId) && !comercialesFuera.has(m.loteId)) out.push(`miembro ${m.loteId} → corrida`);
  }
  for (const l of snap.lotesAserrio) {
    if (lotesFuera.has(l.id)) continue;
    if (l.produccionEntryId && corridasFuera.has(l.produccionEntryId)) out.push(`lote ${l.id} → corrida`);
    if (l.loteMixtoId && mixtosFuera.has(l.loteMixtoId)) out.push(`lote ${l.id} → mixto`);
  }
  for (const o of snap.despachoOrigenes) if (corridasFuera.has(o.produccionEntryId)) out.push(`despacho → corrida`);
  for (const r of snap.reprocesos) {
    if (corridasFuera.has(r.origenEntryId) || corridasFuera.has(r.destinoEntryId)) out.push(`reproceso → corrida`);
  }
  return out;
}

const plan = (snap: SnapshotLibro, ...alcances: AlcanceParcial[]) => planificarVaciado(snap, alcances);

// ── Entrada ────────────────────────────────────────────────────────────────

describe("alcances: qué se acepta", () => {
  it("un alcance desconocido se rechaza (no cae en «todo» como antes)", () => {
    expect(alcancesSchema.safeParse(["trozas_disponibles", "inventado"]).success).toBe(false);
    expect(alcancesDeLaUrl(new URLSearchParams("scope=borrar_todo")).success).toBe(false);
  });

  it("sin alcances se rechaza", () => {
    expect(alcancesSchema.safeParse([]).success).toBe(false);
    expect(alcancesDeLaUrl(new URLSearchParams("")).success).toBe(false);
  });

  it("«todo» es excluyente: combinado con otro se rechaza", () => {
    const r = alcancesSchema.safeParse(["todo", "lotes"]);
    expect(r.success).toBe(false);
    expect(alcancesSchema.safeParse(["todo"]).success).toBe(true);
  });

  it("repetidos se juntan y el orden se normaliza (coma o parámetro repetido)", () => {
    const r = alcancesDeLaUrl(new URLSearchParams("scope=lotes,trozas_disponibles&scope=lotes"));
    expect(r.success && r.data).toEqual(["trozas_disponibles", "lotes"]);
  });
});

// ── Unión ──────────────────────────────────────────────────────────────────

describe("varios alcances = la unión, sin contar dos veces", () => {
  const snap = libro({
    corridas: [corrida("c1", { quantity: 8 }), corrida("c2", { quantity: 0 })],
    consumos: [
      { ctpEntryId: "c1", congelado: false },
      { ctpEntryId: "c1", congelado: false },
      { ctpEntryId: "c2", congelado: false },
    ],
    trozas: [troza("z1"), troza("z2")],
  });

  it("«Madera aserrada» + «Consumos»: la corrida con madera cae en los dos y se cuenta una vez", () => {
    const p = plan(snap, "madera_disponible", "consumo");
    expect(p.porAlcance.madera_disponible).toEqual({ corridas: 1, consumos: 2 });
    expect(p.porAlcance.consumo?.corridas).toBe(2);
    expect(p.corridasABorrar.sort()).toEqual(["c1", "c2"]);
    expect(p.conteo.produccion).toBe(2);
    expect(p.conteo.consumos).toBe(3);
  });

  it("trozas + producción suman en el total", () => {
    const p = plan(snap, "trozas_disponibles", "madera_disponible");
    expect(p.conteo).toMatchObject({ trozas: 2, produccion: 1, total: 3 });
  });

  it("cada alcance solo da lo mismo que antes (madera excluye la que no declaró)", () => {
    expect(plan(snap, "madera_disponible").corridasABorrar).toEqual(["c1"]);
    expect(plan(snap, "consumo").corridasABorrar.sort()).toEqual(["c1", "c2"]);
    expect(plan(snap, "trozas_disponibles").trozasABorrar).toEqual(["z1", "z2"]);
  });
});

// ── Lo que salva a una corrida (puerto de forestal-purga-referencias) ──────

describe("trozas del patio", () => {
  it("no borra las apartadas en un lote de aserrío NI en un lote mixto, ni madres retrozadas", () => {
    const p = plan(
      libro({
        trozas: [
          troza("libre"),
          troza("en-lote", { loteAserrioId: "la1" }),
          troza("en-mixto", { loteMixtoId: "lm1" }),
          troza("madre"),
          troza("pedazo", { trozaOrigenId: "madre" }),
          troza("aserrada", { consumidaEnId: "c1" }),
          troza("salio", { despachadaEnId: "d1" }),
        ],
      }),
      "trozas_disponibles",
    );
    expect(p.trozasABorrar.sort()).toEqual(["libre", "pedazo"]);
  });
});

// ── Lotes ──────────────────────────────────────────────────────────────────

describe("«Lotes»: qué pasa con lo que cuelga", () => {
  it("un lote abierto se borra y sus trozas vuelven al patio (no se borran)", () => {
    const snap = libro({
      lotesAserrio: [lote("la1")],
      trozas: [troza("z1", { loteAserrioId: "la1" }), troza("z2", { loteAserrioId: "la1" })],
    });
    const p = plan(snap, "lotes");
    expect(p.lotesAserrioABorrar).toEqual(["la1"]);
    expect(p.soltarDeLote.sort()).toEqual(["z1", "z2"]);
    expect(p.trozasABorrar).toEqual([]);
    expect(p.conteo).toMatchObject({ lotes: 1, trozasAlPatio: 2, total: 1 });
    expect(colgantes(snap, p)).toEqual([]);
  });

  it("con «Trozas del patio» también, las del lote vuelven al patio pero NO se borran (unión, no secuencia)", () => {
    const snap = libro({
      lotesAserrio: [lote("la1")],
      trozas: [troza("z1", { loteAserrioId: "la1" }), troza("suelta")],
    });
    const p = plan(snap, "trozas_disponibles", "lotes");
    expect(p.trozasABorrar).toEqual(["suelta"]);
    expect(p.soltarDeLote).toEqual(["z1"]);
  });

  describe("lote ya aserrado (corrida viva)", () => {
    const snap = libro({
      corridas: [corrida("c2", { quantity: 5 })],
      consumos: [{ ctpEntryId: "c2", congelado: false }],
      lotesAserrio: [lote("la2", { status: "consumido", produccionEntryId: "c2" })],
      trozas: [
        troza("z3", { loteAserrioId: "la2", consumidaEnId: "c2" }),
        troza("z4", { loteAserrioId: "la2", consumidaEnId: "c2" }),
      ],
    });

    it("sólo «Lotes»: NO se borra y dice que marques «Consumos» (no se borra producción por arrastre)", () => {
      const p = plan(snap, "lotes");
      expect(p.lotesAserrioABorrar).toEqual([]);
      expect(p.corridasABorrar).toEqual([]);
      expect(p.soltarDeLote).toEqual([]);
      expect(p.lotesBloqueados).toEqual([
        expect.objectContaining({ codigo: "LA2", tipo: "aserrio", motivo: expect.stringContaining("«Consumos»") }),
      ]);
    });

    it("sólo «Consumos»: la corrida se salva por su lote y sus piezas, como siempre", () => {
      const p = plan(snap, "consumo");
      expect(p.corridasABorrar).toEqual([]);
      expect(p.conteo.saltadas).toBe(1);
    });

    it("«Lotes» + «Consumos»: caen el lote y su corrida; las piezas vuelven al patio enteras", () => {
      const p = plan(snap, "consumo", "lotes");
      expect(p.lotesAserrioABorrar).toEqual(["la2"]);
      expect(p.corridasABorrar).toEqual(["c2"]);
      expect(p.soltarConsumo.sort()).toEqual(["z3", "z4"]);
      expect(p.soltarDeLote.sort()).toEqual(["z3", "z4"]);
      expect(p.porAlcance.consumo).toEqual({ corridas: 1, consumos: 1, deLotes: 1 });
      expect(colgantes(snap, p)).toEqual([]);
    });

    it("«Lotes» + «Madera aserrada» con una corrida que no declaró madera: bloqueado, pide «Consumos»", () => {
      const sinMadera = { ...snap, corridas: [corrida("c2", { quantity: 0 })] };
      const p = plan(sinMadera, "madera_disponible", "lotes");
      expect(p.lotesAserrioABorrar).toEqual([]);
      expect(p.lotesBloqueados[0].motivo).toContain("no declaró madera");
    });
  });

  it("un lote cuya madera salió con una guía NO se borra y lo dice con el N° de guía; nada se toca", () => {
    const snap = libro({
      corridas: [corrida("c3"), corrida("d1", { section: "despacho", gtfNumber: "019-001-0000123" })],
      despachoOrigenes: [{ despachoEntryId: "d1", produccionEntryId: "c3" }],
      lotesAserrio: [lote("la3", { status: "consumido", produccionEntryId: "c3" })],
      trozas: [troza("z5", { loteAserrioId: "la3", consumidaEnId: "c3" })],
    });
    const p = plan(snap, "consumo", "lotes");
    expect(p.lotesAserrioABorrar).toEqual([]);
    expect(p.corridasABorrar).toEqual([]);
    expect(p.soltarConsumo).toEqual([]);
    expect(p.soltarDeLote).toEqual([]);
    expect(p.lotesBloqueados[0]).toMatchObject({ codigo: "LA3", tipo: "aserrio" });
    expect(p.lotesBloqueados[0].motivo).toContain("019-001-0000123");
  });

  it("una guía ANULADA que todavía cita la corrida también bloquea (la FK es Restrict)", () => {
    const snap = libro({
      corridas: [corrida("c3"), corrida("d1", { section: "despacho", status: "anulado", gtfNumber: "019-001-0000999" })],
      despachoOrigenes: [{ despachoEntryId: "d1", produccionEntryId: "c3" }],
      lotesAserrio: [lote("la3", { status: "consumido", produccionEntryId: "c3" })],
    });
    const p = plan(snap, "consumo", "lotes");
    expect(p.lotesBloqueados[0].motivo).toContain("anulada");
  });

  it("una corrida con el consumo congelado (mes cerrado) bloquea su lote y no se borra", () => {
    const snap = libro({
      corridas: [corrida("c2")],
      consumos: [{ ctpEntryId: "c2", congelado: true }],
      lotesAserrio: [lote("la2", { status: "consumido", produccionEntryId: "c2" })],
    });
    const p = plan(snap, "consumo", "lotes");
    expect(p.corridasABorrar).toEqual([]);
    expect(p.lotesBloqueados[0].motivo).toContain("mes que ya se cerró");
    expect(plan(libro({ corridas: [corrida("c9")], consumos: [{ ctpEntryId: "c9", congelado: true }] }), "consumo").corridasABorrar).toEqual([]);
  });

  it("un lote cuya corrida se ANULÓ se borra y suelta el consumo muerto de sus piezas", () => {
    const snap = libro({
      corridas: [corrida("c7", { status: "anulado" })],
      lotesAserrio: [lote("la7", { status: "consumido", produccionEntryId: "c7" })],
      trozas: [troza("z9", { loteAserrioId: "la7", consumidaEnId: "c7" })],
    });
    const p = plan(snap, "lotes");
    expect(p.lotesAserrioABorrar).toEqual(["la7"]);
    expect(p.soltarConsumo).toEqual(["z9"]);
    expect(p.corridasABorrar).toEqual([]);
  });

  it("punto fijo: dos lotes que comparten corrida; si uno no puede, el otro tampoco", () => {
    const snap = libro({
      corridas: [corrida("c1"), corrida("c2"), corrida("d1", { section: "despacho", gtfNumber: "G-1" })],
      despachoOrigenes: [{ despachoEntryId: "d1", produccionEntryId: "c2" }],
      lotesAserrio: [lote("la1", { status: "consumido" }), lote("la2", { status: "consumido" })],
      trozas: [
        troza("a", { loteAserrioId: "la1", consumidaEnId: "c1" }),
        troza("b", { loteAserrioId: "la2", consumidaEnId: "c1" }),
        troza("c", { loteAserrioId: "la2", consumidaEnId: "c2" }),
      ],
    });
    const p = plan(snap, "consumo", "lotes");
    expect(p.lotesAserrioABorrar).toEqual([]);
    expect(p.corridasABorrar).toEqual([]);
    const motivos = Object.fromEntries(p.lotesBloqueados.map((b) => [b.codigo, b.motivo]));
    expect(motivos.LA2).toContain("G-1");
    expect(motivos.LA1).toContain("LA2");
    expect(colgantes(snap, p)).toEqual([]);
  });

  it("lote mixto: abierto cae y suelta sus trozas; repartido con un hijo bloqueado se queda", () => {
    const snap = libro({
      corridas: [corrida("c3"), corrida("d1", { section: "despacho", gtfNumber: "G-9" })],
      despachoOrigenes: [{ despachoEntryId: "d1", produccionEntryId: "c3" }],
      lotesMixtos: [
        { id: "lm1", code: "LM-1", status: "abierto" },
        { id: "lm2", code: "LM-2", status: "repartido" },
      ],
      lotesAserrio: [lote("hijo", { status: "consumido", produccionEntryId: "c3", loteMixtoId: "lm2" })],
      trozas: [troza("z6", { loteMixtoId: "lm1" })],
    });
    const p = plan(snap, "lotes");
    expect(p.lotesMixtosABorrar).toEqual(["lm1"]);
    expect(p.soltarDeMixto).toEqual(["z6"]);
    expect(p.lotesBloqueados.map((b) => b.codigo)).toEqual(["HIJO", "LM-2"]);
    expect(colgantes(snap, p)).toEqual([]);
  });

  describe("lotes comerciales", () => {
    const snap = libro({
      corridas: [
        corrida("c4", { quantity: 3 }),
        corrida("c5"),
        corrida("c6"),
        corrida("d2", { section: "despacho", gtfNumber: "019-001-0000200" }),
      ],
      despachoOrigenes: [{ despachoEntryId: "d2", produccionEntryId: "c6" }],
      lotesComerciales: [
        { id: "l1", code: "L-2026-001", status: "abierto" },
        { id: "l2", code: "L-2026-002", status: "despachado" },
        { id: "l3", code: "L-2026-003", status: "cerrado" },
      ],
      loteMiembros: [
        { loteId: "l1", produccionEntryId: "c4" },
        { loteId: "l2", produccionEntryId: "c5" },
        { loteId: "l3", produccionEntryId: "c6" },
      ],
    });

    it("se borra el lote con sus miembros, pero NO sus corridas", () => {
      const p = plan(snap, "lotes");
      expect(p.lotesComercialesABorrar).toEqual(["l1"]);
      expect(p.miembrosABorrar).toBe(1);
      expect(p.corridasABorrar).toEqual([]);
      const motivos = Object.fromEntries(p.lotesBloqueados.map((b) => [b.codigo, b.motivo]));
      expect(motivos["L-2026-002"]).toContain("despachó");
      expect(motivos["L-2026-003"]).toContain("019-001-0000200");
    });

    it("con «Consumos», la corrida que sólo protegía el lote borrado cae; las de lotes bloqueados no", () => {
      const p = plan(snap, "consumo", "lotes");
      expect(p.corridasABorrar).toEqual(["c4"]);
      expect(colgantes(snap, p)).toEqual([]);
    });
  });
});

// ── Invariante sobre todas las combinaciones ───────────────────────────────

describe("ninguna combinación deja referencias colgando", () => {
  const snap = libro({
    corridas: [
      corrida("c1", { quantity: 4 }),
      corrida("c2", { quantity: 0 }),
      corrida("c3"),
      corrida("c4"),
      corrida("c5", { status: "anulado" }),
      corrida("c6"),
      corrida("d1", { section: "despacho", gtfNumber: "G-1" }),
    ],
    despachoOrigenes: [{ despachoEntryId: "d1", produccionEntryId: "c3" }],
    reprocesos: [{ origenEntryId: "c6", destinoEntryId: "c1" }],
    consumos: [
      { ctpEntryId: "c1", congelado: false },
      { ctpEntryId: "c2", congelado: false },
      { ctpEntryId: "c4", congelado: false },
    ],
    lotesAserrio: [
      lote("la1"),
      lote("la2", { status: "consumido", produccionEntryId: "c2" }),
      lote("la3", { status: "consumido", produccionEntryId: "c3", loteMixtoId: "lm2" }),
      lote("la5", { status: "consumido", produccionEntryId: "c5" }),
    ],
    lotesMixtos: [
      { id: "lm1", code: "LM-1", status: "abierto" },
      { id: "lm2", code: "LM-2", status: "repartido" },
    ],
    lotesComerciales: [{ id: "l1", code: "L-1", status: "abierto" }],
    loteMiembros: [
      { loteId: "l1", produccionEntryId: "c4" },
      { loteId: "baja", produccionEntryId: "c4" },
    ],
    trozas: [
      troza("p1"),
      troza("p2", { loteAserrioId: "la1" }),
      troza("p3", { loteAserrioId: "la2", consumidaEnId: "c2" }),
      troza("p4", { loteAserrioId: "la3", consumidaEnId: "c3" }),
      troza("p5", { loteAserrioId: "la5", consumidaEnId: "c5" }),
      troza("p6", { loteMixtoId: "lm1" }),
      troza("p7", { consumidaEnId: "c4" }),
    ],
  });
  const PARCIALES: AlcanceParcial[] = ["trozas_disponibles", "madera_disponible", "consumo", "lotes"];
  const combos = Array.from({ length: 15 }, (_, i) => PARCIALES.filter((_, b) => (i + 1) & (1 << b)));

  it.each(combos.map((c) => [c.join(" + "), c] as const))("%s", (_, alcances) => {
    const p = planificarVaciado(snap, alcances);
    expect(colgantes(snap, p)).toEqual([]);
    // El total es la unión sin repetir.
    expect(p.conteo.total).toBe(
      new Set(p.trozasABorrar).size +
        new Set(p.corridasABorrar).size +
        p.lotesAserrioABorrar.length +
        p.lotesMixtosABorrar.length +
        p.lotesComercialesABorrar.length,
    );
    // Una troza nunca se borra Y se suelta a la vez.
    const borradas = new Set(p.trozasABorrar);
    expect([...p.soltarConsumo, ...p.soltarDeLote, ...p.soltarDeMixto].some((id) => borradas.has(id))).toBe(false);
  });
});
