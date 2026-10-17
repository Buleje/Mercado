/**
 * Vista «Extracción» del Libro TH (ADR-454) — `lib/forestal/loth-extraccion.ts`
 * y, contra la base real, `ForestPlanDB.extraccion`.
 *
 * Los fixtures copian los datos reales (29-09-2026):
 *  · main, plan «PO 12»: Tornillo censado 4,2474, talado 5,003, 4 trozas
 *    (4,887), 2 despachadas (2,761), anuladas vivas que no deben sumar;
 *  · QA-ui: 8 líneas sin plan, una troza despachada sin su trozado;
 *  · Blas, plantación 19-SEC/REG-PLT-2025-096: POA sin configurar y el
 *    regente sin semilleros. Desde el ADR-455 una plantación sin config
 *    reserva 0 % (antes, 10 %: 11 árboles y 162,882 m³ fuera de la base).
 *
 * La parte de base real SÓLO LEE, con `hasta` fijo (lo que se asiente después
 * no la mueve):
 *   node --env-file=.env.local node_modules/.bin/vitest run __tests__/forestal-loth-extraccion.test.ts
 */

import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ForestPlanDB } from "@/lib/db/forest-plan.db";
import { ForestLothPoaDB } from "@/lib/db/forest-loth-poa.db";
import {
  PLAN_ID_SIN_PLAN,
  armarExtraccion,
  atribuirLineas,
  censoPorEspecie,
  embudoDe,
  lunesDe,
  permisoDelPlan,
  saldoContra,
  semanasDeExtraccion,
  type ArbolDeExtraccion,
  type EntradaExtraccion,
  type LineaDeExtraccion,
  type PlanDeExtraccion,
} from "@/lib/forestal/loth-extraccion";
import type { ExtraccionResponse, FilaExtraccion } from "@/lib/forestal/loth-extraccion-tipos";

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** 29-09-2026, 12:00 de Lima. */
const HOY = new Date("2026-09-29T17:00:00Z");
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

const poa = (semillerosPct: number, configurado = true) => ({ config: { dmcOverrides: {}, semillerosPct }, configurado });

const plan = (over: Partial<PlanDeExtraccion> = {}): PlanDeExtraccion => ({
  id: "p1",
  planNumber: "PO 12",
  planType: "PO",
  titular: "QA",
  alias: null,
  estado: "vigente",
  tituloHabilitante: null,
  contratoId: null,
  vigenciaDesde: "2026-01-15",
  vigenciaHasta: "2027-01-14",
  areaHa: null,
  poa: poa(0),
  especies: [],
  ...over,
});

const arbol = (id: string, treeCode: string, speciesCommon: string, volumen: number, over: Partial<ArbolDeExtraccion> = {}): ArbolDeExtraccion => ({
  id,
  planId: "p1",
  treeCode,
  speciesCommon,
  cites: false,
  dapM: 0.8,
  volumenEstimadoM3: volumen,
  estado: "en_pie",
  condicion: null,
  ...over,
});

let seq = 0;
const linea = (section: string, over: Partial<LineaDeExtraccion> = {}): LineaDeExtraccion => {
  seq += 1;
  return {
    id: `l${seq}`,
    planId: "p1",
    section,
    status: "registrado",
    lineNo: seq,
    entryDate: "2026-05-28",
    treeCode: null,
    trozaCode: null,
    speciesCommon: null,
    cites: false,
    volumeM3: null,
    quantity: null,
    unit: null,
    gtfNumber: null,
    ...over,
  };
};

const entrada = (over: Partial<EntradaExtraccion> = {}): EntradaExtraccion => ({
  hoy: HOY,
  alcance: { planId: null, contratoId: null },
  planesEnAlcance: null,
  conSinPlan: true,
  planes: [plan()],
  permisos: [],
  arboles: [],
  lineas: [],
  recepciones: [],
  limites: { arbolesLeidos: 0, lineasLeidas: 0, truncado: false },
  ...over,
});

/** El plan «PO 12» de main tal como está en la base (29-09). */
function main() {
  const arboles = [
    arbol("t85", "85-TOR", "Tornillo", 4.2474, { dapM: 0.8 }),
    arbol("t50", "50-MIS", "Misa", 5.149, { dapM: 0.82 }),
    arbol("t2", "2-AZ", "Azúcar huayo", 4.3074, { dapM: 0.75 }),
    arbol("t1", "1-SHI", "Shihuahuaco", 7.5278, { dapM: 0.96 }),
  ];
  const especies = [
    { speciesCommon: "Tornillo", cites: false, volumenAutorizadoM3: 80, arbolesAutorizados: 12 },
    { speciesCommon: "Azúcar huayo", cites: false, volumenAutorizadoM3: 45, arbolesAutorizados: 7 },
    { speciesCommon: "Shihuahuaco", cites: false, volumenAutorizadoM3: 60, arbolesAutorizados: 8 },
  ];
  const troza = (code: string, v: number) =>
    linea("trozado", { treeCode: "85-TOR", trozaCode: code, speciesCommon: "Tornillo", volumeM3: v });
  const lineas = [
    linea("tala", { treeCode: "85-TOR", speciesCommon: "Tornillo", volumeM3: 5.003 }),
    linea("tala", { treeCode: "50-MIS", speciesCommon: "Misa", volumeM3: 6.8047, status: "anulado", entryDate: "2026-09-28" }),
    troza("85-TOR-A", 1.471),
    troza("85-TOR-B", 1.29),
    troza("85-TOR-C", 0.995),
    troza("85-TOR-D", 1.131),
    linea("trozado", { treeCode: "85-TOR", trozaCode: "85-TOR-E", volumeM3: 0.0891, status: "anulado", entryDate: "2026-09-28" }),
    // La línea de despacho NO trae m³ (main 2/2): el volumen es el de su trozado.
    linea("despacho_troza", { trozaCode: "85-TOR-A", gtfNumber: "001-0000120" }),
    linea("despacho_troza", { trozaCode: "85-TOR-B", gtfNumber: "001-0000120" }),
    linea("despacho_troza", { trozaCode: "85-TOR-C", gtfNumber: "001-0000123", status: "anulado", entryDate: "2026-09-28" }),
  ];
  return entrada({ planes: [plan({ especies })], arboles, lineas });
}

const especie = (r: { especies: FilaExtraccion[] }, nombre: string): FilaExtraccion => {
  const e = r.especies.find((x) => x.etiqueta === nombre);
  if (!e) throw new Error(`sin fila ${nombre}: ${r.especies.map((x) => x.etiqueta).join(", ")}`);
  return e;
};

/** Cada troza en UNA salida: despachada + consumida + en el monte = trozada, exacto. */
function identidad(f: FilaExtraccion) {
  expect(r4(f.despachado.m3 + f.consumidoTh.m3 + f.enElMonte.m3)).toBe(f.trozado.m3);
  expect(f.despachado.n + f.consumidoTh.n + f.enElMonte.n).toBe(f.trozado.n);
}

// ─── main: cada operación por separado ───────────────────────────────────────

describe("armarExtraccion — main, plan PO 12", () => {
  const r = armarExtraccion(main());
  const tornillo = especie(r, "Tornillo");

  it("suma cada operación por separado: talado 5,003 · trozado 4,887 · despachado 2,761 · en el monte 2,126", () => {
    expect(tornillo.talado).toEqual({ m3: 5.003, n: 1, sinVolumen: 0 });
    expect(tornillo.trozado).toEqual({ m3: 4.887, n: 4, sinVolumen: 0, arboles: 1 });
    expect(tornillo.despachado).toEqual({ m3: 2.761, n: 2, sinVolumen: 0 });
    expect(tornillo.enElMonte).toEqual({ m3: 2.126, n: 2, sinVolumen: 0 });
    expect(tornillo.consumidoTh.n).toBe(0);
    identidad(tornillo);
    identidad(r.total);
  });

  it("saldo = censo − operación: −0,7556 de tala es ámbar (se midió más), nunca exceso", () => {
    expect(tornillo.censo.aprovechableM3).toBe(4.2474);
    expect(tornillo.saldo.tala).toEqual({ m3: -0.7556, pct: 117.79, nivel: "tope" });
    expect(tornillo.saldo.trozado.m3).toBe(-0.6396);
    expect(tornillo.saldo.despacho.m3).toBe(1.4864);
  });

  it("el tornillo talado sobre el censo avisa medido_sobre_censo con la cifra", () => {
    const a = r.avisos.find((x) => x.tipo === "medido_sobre_censo");
    expect(a).toMatchObject({ nivel: "warning", especie: "tornillo", cifraM3: 0.7556 });
    expect(a?.texto).toMatch(/no es una infracci/);
  });

  it("saldo autorizado = la cuenta de la vista Plan: 80 − 2,761 = 77,239", () => {
    expect(tornillo.censo.autorizadoM3).toBe(80);
    expect(tornillo.movilizadoM3).toBe(2.761);
    expect(tornillo.saldoAutorizado).toEqual({ m3: 77.239, pct: 3.45, nivel: "ok" });
    expect(tornillo.tope).toEqual({ base: "autorizado", m3: 80 });
  });

  it("las anuladas no suman: la Misa anulada no es tala y la troza C sigue en el monte", () => {
    const misa = especie(r, "Misa");
    expect(misa.talado.n).toBe(0);
    expect(misa.censo.autorizadoM3).toBe(0); // el plan autoriza especies, la Misa no: 0, no «sin dato»
    expect(misa.fueraDelPlan).toBe(false); // censada, sin operaciones: no es infracción
    expect(r.total.trozado.n).toBe(4); // la troza E anulada no entra
  });

  it("la etapa de cada árbol sale de la misma función que el mapa, con su aviso", () => {
    const p = r.permisos[0];
    expect(p.arboles.porEtapa).toEqual({ despachado_parcial: 1, en_pie: 3 });
    expect(p.arboles.avisos).toEqual({ censo_no_dice_talado: 1 });
    expect(r.avisos.some((a) => a.tipo === "censo_libro_distinto")).toBe(true);
  });

  it("Σ especies = total en cada columna", () => {
    const suma = (k: (f: FilaExtraccion) => number) => r4(r.especies.reduce((s, f) => s + k(f), 0));
    expect(suma((f) => f.censo.aprovechableM3)).toBe(r.total.censo.aprovechableM3);
    expect(suma((f) => f.talado.m3)).toBe(r.total.talado.m3);
    expect(suma((f) => f.trozado.m3)).toBe(r.total.trozado.m3);
    expect(suma((f) => f.despachado.m3)).toBe(r.total.despachado.m3);
    expect(suma((f) => f.censo.autorizadoM3 ?? 0)).toBe(185);
  });
});

// ─── Atribución ──────────────────────────────────────────────────────────────

describe("atribuirLineas — a qué plan y a qué salida va cada línea", () => {
  it("un despacho sin árbol ni plan sigue a su trozado", () => {
    const e = main();
    const lineas = e.lineas.map((l) => (l.section === "despacho_troza" ? { ...l, planId: null } : l));
    const r = armarExtraccion({ ...e, lineas });
    expect(especie(r, "Tornillo").despachado.m3).toBe(2.761);
    expect(r.permisos.map((p) => p.planId)).toEqual(["p1"]); // no aparece «Sin plan»
  });

  it("consumo en el TH = otra salida; un despacho de la misma troza después no suma (T1)", () => {
    const e = main();
    const lineas = [
      ...e.lineas,
      linea("consumo_troza", { trozaCode: "85-TOR-C", volumeM3: 0.995, entryDate: "2026-06-01" }),
      linea("despacho_troza", { trozaCode: "85-TOR-C", entryDate: "2026-06-02" }),
    ];
    const t = especie(armarExtraccion({ ...e, lineas }), "Tornillo");
    expect(t.consumidoTh).toEqual({ m3: 0.995, n: 1, sinVolumen: 0 });
    expect(t.despachado.m3).toBe(2.761);
    expect(t.enElMonte).toEqual({ m3: 1.131, n: 1, sinVolumen: 0 });
    identidad(t);
  });

  it("una salida sin trozado queda fuera de la cadena, con su aviso y sin fila de ceros (QA DEMO-999-X)", () => {
    const e = entrada({
      planes: [],
      lineas: [
        linea("trozado", { planId: null, treeCode: "021-CAP", trozaCode: "DEMO-021-A", speciesCommon: "Capirona", volumeM3: 4.1 }),
        linea("despacho_troza", { planId: null, trozaCode: "DEMO-021-A" }),
        linea("despacho_troza", { planId: null, trozaCode: "DEMO-999-X" }),
      ],
    });
    const r = armarExtraccion(e);
    expect(r.permisos).toHaveLength(1);
    expect(r.permisos[0].planId).toBeNull();
    expect(r.total.despachado).toEqual({ m3: 4.1, n: 1, sinVolumen: 0 });
    identidad(r.total);
    expect(r.especies.map((f) => f.etiqueta)).toEqual(["Capirona"]);
    expect(r.avisos.map((a) => a.tipo).sort()).toEqual(["lineas_sin_plan", "salida_sin_trozado"]);
  });

  it("una línea sin plan va al plan cuyo censo tiene su árbol", () => {
    const planes = [plan({ id: "pA", planNumber: "A" }), plan({ id: "pB", planNumber: "B" })];
    const arboles = [arbol("a1", "10", "Copaiba", 5, { planId: "pA" }), arbol("b1", "0020", "Lupuna", 7, { planId: "pB" })];
    const lineas = [linea("tala", { planId: null, treeCode: "20", speciesCommon: "Lupuna", volumeM3: 6.5 })];
    const r = armarExtraccion(entrada({ planes, arboles, lineas }));
    const b = r.permisos.find((p) => p.planId === "pB");
    expect(b?.total.talado.m3).toBe(6.5); // «20» = «0020»
    expect(r.permisos.find((p) => p.planId === "pA")?.total.talado.n).toBe(0);
    expect(r.permisos.some((p) => p.planId === null)).toBe(false);
  });

  it("si el árbol está en dos censos no se elige uno a ciegas: va a «Sin plan» y se dice", () => {
    const planes = [plan({ id: "pA", planNumber: "A" }), plan({ id: "pB", planNumber: "B" })];
    const arboles = [arbol("a1", "7", "Copaiba", 5, { planId: "pA" }), arbol("b1", "7", "Copaiba", 5, { planId: "pB" })];
    const lineas = [linea("tala", { planId: null, treeCode: "7", speciesCommon: "Copaiba", volumeM3: 4 })];
    const r = armarExtraccion(entrada({ planes, arboles, lineas }));
    expect(r.permisos.find((p) => p.planId === null)?.total.talado.m3).toBe(4);
    expect(r.avisos.find((a) => a.tipo === "lineas_sin_plan")?.texto).toMatch(/1 con el árbol en dos censos/);
  });

  it("lo asentado después de `hasta` no cuenta: el despacho posterior deja la troza en el monte", () => {
    const e = main();
    const lineas = [...e.lineas, linea("despacho_troza", { trozaCode: "85-TOR-D", entryDate: "2026-09-29" })];
    const antes = especie(armarExtraccion({ ...e, lineas, hasta: "2026-09-28" }), "Tornillo");
    const despues = especie(armarExtraccion({ ...e, lineas, hasta: "2026-09-29" }), "Tornillo");
    expect(antes.despachado.n).toBe(2);
    expect(despues.despachado.n).toBe(3);
    expect(despues.despachado.m3).toBe(3.892);
  });

  it("T3: la misma troza dos veces cuenta una", () => {
    const at = atribuirLineas(
      [{ id: "p1" }],
      [],
      [
        linea("trozado", { treeCode: "9", trozaCode: "9-A", volumeM3: 1 }),
        linea("trozado", { treeCode: "9", trozaCode: "9 a", volumeM3: 1 }),
      ],
      "2026-12-31",
    );
    expect(at.trozas).toHaveLength(1);
  });
});

// ─── Dos planes y los filtros ────────────────────────────────────────────────

describe("dos planes — «Todos», un plan y «Sin plan»", () => {
  const planes = [
    plan({ id: "pA", planNumber: "A", especies: [{ speciesCommon: "Tornillo (Cedrelinga catenaeformis)", cites: false, volumenAutorizadoM3: 20, arbolesAutorizados: 3 }] }),
    plan({ id: "pB", planNumber: "B", vigenciaDesde: null, vigenciaHasta: null }),
  ];
  const arboles = [
    arbol("a1", "1", "Tornillo", 6, { planId: "pA" }),
    arbol("b1", "1", "Tornillo", 3, { planId: "pB" }),
    arbol("b2", "2", "Copaiba", 9, { planId: "pB", dapM: 0.9 }),
  ];
  const lineas = [
    linea("tala", { planId: "pA", treeCode: "1", speciesCommon: "Tornillo", volumeM3: 5 }),
    linea("tala", { planId: "pB", treeCode: "1", speciesCommon: "Tornillo", volumeM3: 3.5 }),
    linea("tala", { planId: null, treeCode: "X-9", speciesCommon: "Cedro", volumeM3: 2 }),
  ];
  const base = entrada({ planes, arboles, lineas });

  it("«Todos» suma los dos planes y junta la especie escrita distinto («Tornillo (Cedrelinga …)» = «Tornillo»)", () => {
    const r = armarExtraccion(base);
    expect(r.permisos.map((p) => p.planNumber)).toEqual(["A", "B", null]);
    const t = especie(r, "Tornillo");
    expect(t.talado).toEqual({ m3: 8.5, n: 2, sinVolumen: 0 });
    expect(t.censo.aprovechableM3).toBe(9);
    expect(t.censo.autorizadoM3).toBe(20); // sólo A autoriza; B no suma un 0 falso
    expect(r.total.talado.m3).toBe(10.5); // con el Cedro sin plan
    expect(r.total.censo.aprovechableM3).toBe(18);
  });

  it("un plan pedido sólo trae ese plan, y sus saldos no ven la madera del otro", () => {
    const r = armarExtraccion({ ...base, alcance: { planId: "pA", contratoId: null }, planesEnAlcance: ["pA"], conSinPlan: false });
    expect(r.permisos.map((p) => p.planId)).toEqual(["pA"]);
    expect(r.total.talado.m3).toBe(5);
    expect(r.total.saldo.tala.m3).toBe(1);
    expect(r.total.tope).toEqual({ base: "autorizado", m3: 20 });
  });

  it("«Sin plan» (`planId=sin-plan`) sólo trae lo que no tiene plan", () => {
    expect(PLAN_ID_SIN_PLAN).toBe("sin-plan");
    const r = armarExtraccion({ ...base, planesEnAlcance: [], conSinPlan: true });
    expect(r.permisos.map((p) => p.planId)).toEqual([null]);
    expect(r.total.talado.m3).toBe(2);
    expect(r.total.saldo.tala.nivel).toBe("sin_base");
  });
});

// ─── Censo ───────────────────────────────────────────────────────────────────

describe("censoPorEspecie — la base «aprobado según censo»", () => {
  /** 12 copaibas como la plantación de Blas: todas sobre el DMC (56 cm), el regente las declaró «Aprovechable». */
  const copaibas = Array.from({ length: 12 }, (_, i) =>
    arbol(`c${i}`, String(100 + i), "Copaiba", 5 + i, { dapM: 0.6 + i * 0.01, condicion: "Aprovechable" }),
  );

  it("con el 10 % por defecto: 2 semilleros de mayor DAP sobre el censo ORIGINAL, aunque uno ya se taló", () => {
    const talado = new Set(["c11"]); // el de mayor DAP ya se taló
    const c = censoPorEspecie(copaibas, [], poa(10, false).config, talado).get("copaiba");
    // 12 sobre el DMC → ceil(1,2) = 2 semilleros: c11 (16) y c10 (15). Talar c11 no lo saca de semillero.
    expect(c).toMatchObject({ censados: 12, semillerosPoa: 2, semillerosRegente: 0, semillerosM3: 31, aprovechables: 10, enPieAprovechables: 10 });
    expect(c?.censadoM3).toBe(126);
    expect(c?.aprovechableM3).toBe(95); // 126 − 31
  });

  it("la base NO crece al talar: una, dos o tres copaibas taladas dejan la base y los semilleros iguales; sólo baja el saldo", () => {
    const conTalas = (codigos: string[]) =>
      armarExtraccion(
        entrada({
          planes: [plan({ planType: "PO", poa: poa(10, false) })],
          arboles: copaibas,
          lineas: codigos.map((c) => linea("tala", { treeCode: c, speciesCommon: "Copaiba", volumeM3: 5.2 })),
        }),
      ).total;
    const sin = conTalas([]);
    for (const codigos of [["100"], ["100", "101"], ["100", "101", "102"]]) {
      const t = conTalas(codigos);
      expect([codigos.length, t.censo.aprovechableM3, t.censo.semillerosPoa]).toEqual([codigos.length, sin.censo.aprovechableM3, 2]);
      expect(t.censo.enPieAprovechables).toBe(sin.censo.enPieAprovechables - codigos.length);
      expect(t.saldo.tala.m3).toBe(r4(sin.censo.aprovechableM3 - 5.2 * codigos.length));
    }
    // Antes (semilleros sobre lo que quedaba en pie): con 2 taladas, 10 en pie → 1 semillero y la base subía 14 m³.
    expect(sin.censo.aprovechableM3).toBe(95);
  });

  it("bosque: el aviso dice cuánto le quita el 10 % por defecto cuando el regente declaró 0", () => {
    const r = armarExtraccion(
      entrada({
        planes: [plan({ planType: "PO", poa: poa(10, false) })],
        arboles: copaibas,
        lineas: [linea("tala", { treeCode: "111", speciesCommon: "Copaiba", volumeM3: 10.3697 })],
      }),
    );
    const a = r.avisos.find((x) => x.tipo === "semilleros_sistema_vs_regente");
    expect(a?.cifraM3).toBe(31);
    expect(a?.texto).toMatch(/10 % por defecto/);
    expect(a?.texto).toMatch(/el regente no declaró ninguno/);
    expect(a?.texto).toMatch(/Si el plan no los exige, pon 0 % en Parámetros del POA/);
    expect(r.permisos[0].poa).toEqual({ semillerosPct: 10, configurado: false, semillerosRegente: 0, plantacion: false });
  });

  it("⭐ plantación sin config (ADR-455): 0 %, la base es el censo entero y el aviso de semilleros no aparece", () => {
    // El 0 % lo resuelve ForestLothPoaDB (defecto de plantación); acá llega hecho.
    const r = armarExtraccion(
      entrada({
        planes: [plan({ planType: "PLANTACION", planNumber: "19-SEC/REG-PLT-2025-096", poa: poa(0, false) })],
        arboles: copaibas,
        lineas: [linea("tala", { treeCode: "111", speciesCommon: "Copaiba", volumeM3: 10.3697 })],
      }),
    );
    expect(r.total.censo).toMatchObject({ censadoM3: 126, semillerosPoa: 0, semillerosM3: 0, aprovechableM3: 126, aprovechables: 12 });
    expect(r.total.saldo.tala.m3).toBe(r4(126 - 10.3697));
    expect(r.avisos.some((x) => x.tipo === "semilleros_sistema_vs_regente")).toBe(false);
    expect(r.permisos[0].poa).toEqual({ semillerosPct: 0, configurado: false, semillerosRegente: 0, plantacion: true });
  });

  it("plantación con 10 % guardado a mano: el aviso sigue, y dice que la norma no los pide", () => {
    const r = armarExtraccion(
      entrada({
        planes: [plan({ planType: "PLANTACION", poa: poa(10, true) })],
        arboles: copaibas,
        lineas: [],
      }),
    );
    const a = r.avisos.find((x) => x.tipo === "semilleros_sistema_vs_regente");
    expect(a?.cifraM3).toBe(31);
    expect(a?.texto).toMatch(/el 10 % de Parámetros del POA/);
    expect(a?.texto).toMatch(/Es una plantación: la norma no los pide/);
    expect(r.permisos[0].poa.plantacion).toBe(true);
  });

  it("semillero del regente, bajo DMC y descartado salen de la base", () => {
    const arboles = [
      arbol("s", "1", "Tornillo", 8, { dapM: 0.9, condicion: "Árbol semillero" }),
      arbol("b", "2", "Tornillo", 2, { dapM: 0.3 }),
      arbol("d", "3", "Tornillo", 4, { dapM: 0.9, estado: "descartado" }),
      arbol("a", "4", "Tornillo", 6, { dapM: 0.9 }),
    ];
    const c = censoPorEspecie(arboles, [], poa(0).config, new Set()).get("tornillo");
    expect(c).toMatchObject({ semillerosRegente: 1, semillerosPoa: 0, excluidos: 2, excluidosM3: 6, aprovechables: 1, aprovechableM3: 6 });
    // Talados (el semillero, el bajo DMC y el descartado) siguen FUERA de la base: su tala resta del saldo.
    const talados = censoPorEspecie(arboles, [], poa(0).config, new Set(["s", "b", "d"])).get("tornillo");
    expect(talados).toMatchObject({ semillerosRegente: 1, excluidos: 2, aprovechables: 1, aprovechableM3: 6, enPieAprovechables: 1 });
  });
});

// ─── Saldo y avisos 80 / 100 ─────────────────────────────────────────────────

describe("saldoContra", () => {
  it.each([
    [100, 50, "censo", { m3: 50, pct: 50, nivel: "ok" }],
    [100, 80, "autorizado", { m3: 20, pct: 80, nivel: "atencion" }],
    [100, 99.995, "autorizado", { m3: 0.005, pct: 100, nivel: "tope" }],
    [100, 101, "autorizado", { m3: -1, pct: 101, nivel: "exceso" }],
    [100, 101, "censo", { m3: -1, pct: 101, nivel: "tope" }],
    [0, 0, "autorizado", { m3: 0, pct: null, nivel: "sin_base" }],
    [0, 2, "autorizado", { m3: -2, pct: null, nivel: "exceso" }],
    [null, 3, "censo", { m3: -3, pct: null, nivel: "sin_base" }],
  ] as const)("base %s − %s contra %s", (base, op, contra, esperado) => {
    expect(saldoContra(base, op, contra)).toEqual(esperado);
  });
});

describe("avisos al 80 % y al 100 %", () => {
  const conTala = (m3: number, autorizado: number | null) =>
    armarExtraccion(
      entrada({
        planes: [plan({ especies: autorizado == null ? [] : [{ speciesCommon: "Lupuna", cites: false, volumenAutorizadoM3: autorizado, arbolesAutorizados: null }] })],
        arboles: [arbol("x", "1", "Lupuna", 50, { dapM: 1 })],
        lineas: [linea("tala", { treeCode: "1", speciesCommon: "Lupuna", volumeM3: m3 })],
      }),
    ).avisos.map((a) => `${a.tipo}:${a.nivel}`);

  it("contra lo autorizado: 80 % avisa, 100 % es tope, pasarse es exceso", () => {
    expect(conTala(8.5, 10)).toContain("avance_80:warning");
    expect(conTala(10, 10)).toContain("avance_100:error");
    expect(conTala(12, 10)).toContain("exceso_autorizado:error");
    expect(conTala(5, 10).filter((t) => t.startsWith("avance"))).toEqual([]);
  });

  it("sin autorizado, el tope es el censo aprovechable (ámbar)", () => {
    expect(conTala(42, null)).toContain("avance_80:warning");
    expect(conTala(50, null)).toContain("avance_100:warning");
    const sobre = conTala(55, null);
    expect(sobre).toContain("medido_sobre_censo:warning");
    expect(sobre.some((t) => t.startsWith("avance_100"))).toBe(false); // una sola voz para lo mismo
  });

  it("una especie talada que el plan no autoriza es error, no «exceso»", () => {
    const r = armarExtraccion(
      entrada({
        planes: [plan({ especies: [{ speciesCommon: "Tornillo", cites: false, volumenAutorizadoM3: 80, arbolesAutorizados: null }] })],
        arboles: [arbol("m", "50-MIS", "Misa", 5.149)],
        lineas: [linea("tala", { treeCode: "50-MIS", speciesCommon: "Misa", volumeM3: 6.8 })],
      }),
    );
    expect(especie(r, "Misa").fueraDelPlan).toBe(true);
    expect(r.avisos.map((a) => a.tipo)).toContain("especie_fuera_del_plan");
    expect(r.avisos.map((a) => a.tipo)).not.toContain("exceso_autorizado");
  });
});

// ─── Planta ──────────────────────────────────────────────────────────────────

describe("recibido en planta y aserrado", () => {
  it("m³ del trozado para la cadena, m³ de la guía aparte; lo recibido sin despacho avisa", () => {
    const e = main();
    const id = (code: string) => e.lineas.find((l) => l.trozaCode === code && l.section === "trozado" && l.status === "registrado")?.id ?? "";
    const r = armarExtraccion({
      ...e,
      recepciones: [
        { lothTrozadoId: id("85-TOR-A"), volumenM3: 1.5, aserrada: true },
        { lothTrozadoId: id("85-TOR-C"), volumenM3: 1.0, aserrada: false },
      ],
    });
    const t = especie(r, "Tornillo");
    expect(t.recibido).toEqual({ m3: 2.466, n: 2, sinVolumen: 0, m3Guia: 2.5 });
    expect(t.aserrado).toEqual({ m3: 1.471, n: 1, sinVolumen: 0 });
    // De las 2 despachadas llegó 1; la C llegó sin despacho: va a su aviso, no infla «llegó».
    expect(r.kpis.llegoAPlanta).toEqual({ pct: 50, recibidas: 1, despachadas: 2 });
    expect(r.avisos.find((a) => a.tipo === "recibida_sin_despacho")?.cifraM3).toBe(0.995);
    expect(r.embudo.map((p) => p.paso)).toEqual(["censo", "autorizado", "talado", "trozado", "despachado", "recibido", "aserrado"]);
  });
});

// ─── Tiempo ──────────────────────────────────────────────────────────────────

describe("período, semanas y KPIs", () => {
  it("«hoy» es el día de Lima: a las 21:00 del 29-09 (02:00 UTC del 30) todavía es el 29", () => {
    const r = armarExtraccion({ ...main(), hoy: new Date("2026-09-30T02:00:00Z") });
    expect(r.periodo.hasta).toBe("2026-09-29");
    expect(r.periodo.desde).toBe("2026-05-28"); // por defecto, la primera línea
  });

  it("la semana empieza el lunes", () => {
    expect(lunesDe("2026-09-29")).toBe("2026-09-28");
    expect(lunesDe("2026-09-28")).toBe("2026-09-28");
    expect(lunesDe("2026-10-04")).toBe("2026-09-28");
  });

  it("semanas: flujo por semana, acumulado desde la primera tala y meta lineal a la vigencia", () => {
    seq = 0;
    const talas = [
      { planId: "p1", arbol: "1", especie: "x", etiqueta: "X", cites: false, dia: "2026-01-20", m3: 10 },
      { planId: "p1", arbol: "2", especie: "x", etiqueta: "X", cites: false, dia: "2026-02-03", m3: 4 },
    ];
    const s = semanasDeExtraccion(talas, [], "2026-02-01", "2026-02-10", [
      { vigenciaDesde: "2026-01-01", vigenciaHasta: "2026-12-31", topeM3: 364 },
    ]);
    expect(s.map((x) => x.semana)).toEqual(["2026-01-26", "2026-02-02", "2026-02-09"]);
    expect(s.map((x) => x.taladoM3)).toEqual([0, 4, 0]); // la del 20-01 cae antes de `desde`
    expect(s.map((x) => x.taladoAcumM3)).toEqual([10, 14, 14]); // …pero cuenta en el acumulado
    expect(s[0].metaAcumM3).toBe(31); // al domingo 01-02 van 31 de 364 días → 364 × 31/364
    // Si un permiso con tope no tiene vigencia, no hay meta (media meta miente).
    expect(semanasDeExtraccion(talas, [], "2026-02-01", "2026-02-10", [{ vigenciaDesde: null, vigenciaHasta: null, topeM3: 10 }])[0].metaAcumM3).toBeNull();
  });

  it("ritmo: sin 14 días de tala no hay ritmo; con ellos, m³ por semana contra la ventana anterior", () => {
    const arboles = Array.from({ length: 30 }, (_, i) => arbol(`a${i}`, String(i + 1), "Copaiba", 20, { dapM: 1 }));
    const tala = (i: number, dia: string, m3: number) => linea("tala", { treeCode: String(i + 1), speciesCommon: "Copaiba", volumeM3: m3, entryDate: dia });
    const dia = (d: number) => `2026-09-${String(d).padStart(2, "0")}`;
    const lineas = [
      ...Array.from({ length: 14 }, (_, i) => tala(i, dia(i + 1), 2)), // 01..14 set: 28 m³
      ...Array.from({ length: 14 }, (_, i) => tala(14 + i, `2026-08-${String(i + 1).padStart(2, "0")}`, 1)), // 01..14 ago: 14 m³
    ];
    const r = armarExtraccion(
      entrada({ arboles, lineas, desde: "2026-09-01", hasta: "2026-09-14", antDesde: "2026-08-01", antHasta: "2026-08-14" }),
    );
    expect(r.kpis.ritmoSemanal).toEqual({ m3: 14, anteriorM3: 7, variacionPct: 100, motivoSinDato: null });
    // «Hoy» del cálculo = `hasta` (14-09), no el día de la consulta: 42 m³ en 44 días
    // (01-08 → 14-09) → 558 ÷ (42/44) = 584,6 → 585 días → 21-04-2028, después del cierre.
    expect(r.kpis.agotamiento).toEqual({
      fecha: "2028-04-21",
      dias: 585,
      vigenciaHasta: "2027-01-14",
      llegaAlCierre: false,
      motivoSinDato: null,
    });

    const sinRitmo = armarExtraccion(main());
    expect(sinRitmo.kpis.ritmoSemanal.m3).toBeNull();
    expect(sinRitmo.kpis.ritmoSemanal.motivoSinDato).toMatch(/14 días.*hay 1 día/);
    expect(sinRitmo.kpis.agotamiento.motivoSinDato).toBe("Sin ritmo de tala todavía.");
  });

  it("aviso `agota_pronto`: <60 días con ritmo = warning, <15 = error, y ninguno con horizonte largo o sin ritmo", () => {
    const talas = (vol: number, n: number) =>
      Array.from({ length: n }, (_, i) =>
        linea("tala", { treeCode: String(i + 1), speciesCommon: "Copaiba", volumeM3: vol, entryDate: `2026-09-${String(i + 1).padStart(2, "0")}` }),
      );
    const correr = (nArboles: number, volArbol: number, volTala: number) =>
      armarExtraccion(
        entrada({
          arboles: Array.from({ length: nArboles }, (_, i) => arbol(`a${i}`, String(i + 1), "Copaiba", volArbol, { dapM: 1 })),
          lineas: talas(volTala, 14),
          hasta: "2026-09-14",
        }),
      );
    const aviso = (r: ReturnType<typeof correr>) => r.avisos.find((a) => a.tipo === "agota_pronto");

    const warning = correr(30, 20, 19); // saldo 334 m³ a ~20,5 m³/día → ~17 días
    expect(warning.kpis.agotamiento.dias).toBeLessThan(60);
    expect(warning.kpis.agotamiento.dias).toBeGreaterThanOrEqual(15);
    expect(aviso(warning)).toMatchObject({ nivel: "warning", planId: null });
    expect(aviso(warning)?.texto).toContain(`${warning.kpis.agotamiento.dias} días`);
    expect(aviso(warning)?.texto).toContain(warning.kpis.agotamiento.fecha!.split("-").reverse().join("-"));
    expect(aviso(warning)?.cifraM3).toBe(warning.kpis.porTalar.m3);

    const urgente = correr(15, 40, 38); // saldo 68 m³ a ~41 m³/día → 2 días
    expect(urgente.kpis.agotamiento.dias).toBeLessThan(15);
    expect(aviso(urgente)?.nivel).toBe("error");

    const largo = correr(30, 20, 2); // 266 días
    expect(largo.kpis.agotamiento.dias).toBeGreaterThan(60);
    expect(aviso(largo)).toBeUndefined();
    expect(aviso(armarExtraccion(main()))).toBeUndefined(); // sin ritmo: no inventa fecha
  });

  it("con un `hasta` pasado, plazo, ritmo, proyección y trozas en el monte no cambian con el día de la consulta", () => {
    const arboles = Array.from({ length: 30 }, (_, i) => arbol(`a${i}`, String(i + 1), "Copaiba", 20, { dapM: 1 }));
    const lineas = [
      ...Array.from({ length: 14 }, (_, i) =>
        linea("tala", { treeCode: String(i + 1), speciesCommon: "Copaiba", volumeM3: 2, entryDate: `2026-09-${String(i + 1).padStart(2, "0")}` }),
      ),
      linea("trozado", { treeCode: "1", trozaCode: "1-A", volumeM3: 1, entryDate: "2026-09-02" }),
    ];
    const base = entrada({ arboles, lineas, hasta: "2026-09-14" });
    const k1 = armarExtraccion({ ...base, hoy: new Date("2026-09-29T17:00:00Z") }).kpis;
    const k2 = armarExtraccion({ ...base, hoy: new Date("2026-11-20T17:00:00Z") }).kpis;
    expect(k2).toEqual(k1);
    expect(k1.trozasEnElMonte.diasMasVieja).toBe(12); // 02-09 → 14-09, no → hoy
    expect(k1.extraido.plazoPct).toBe(66.8); // 15-01 → 14-09 12:00 = 242,5 → 243 de 364 días (hasta el 29-09 serían 70,9)
    // 28 m³ en 13 días (01-09 → 14-09) → saldo 572 ÷ (28/13) = 265,6 → 266 días.
    expect(k1.agotamiento.dias).toBe(266);
  });

  it("KPIs de main: 23,56 % extraído, 2 trozas en el monte desde el 28-05, 0 de 2 llegaron a planta", () => {
    const k = armarExtraccion(main()).kpis;
    expect(k.extraido).toEqual({ pct: 23.56, taladoM3: 5.003, baseM3: 21.2316, plazoPct: 70.9 });
    expect(k.porTalar).toMatchObject({ m3: 16.2286, arbolesEnPie: 3 });
    expect(k.trozasEnElMonte).toEqual({ n: 2, m3: 2.126, diasMasVieja: 124 });
    expect(k.llegoAPlanta).toEqual({ pct: 0, recibidas: 0, despachadas: 2 });
  });

  it("embudo: cada paso contra el anterior de la cadena; el autorizado va aparte", () => {
    const e = embudoDe(armarExtraccion(main()).total);
    expect(e.map((p) => [p.paso, p.m3, p.pctDelAnterior])).toEqual([
      ["censo", 21.2316, null],
      ["autorizado", 185, null], // el tope legal, no un paso: sin % contra el censo
      ["talado", 5.003, 23.56],
      ["trozado", 4.887, 97.68],
      ["despachado", 2.761, 56.5],
      ["recibido", 0, 0],
      ["aserrado", 0, null],
    ]);
  });
});

// ─── Dos planes con los mismos códigos (revisión 29-09) ──────────────────────

describe("atribución entre planes con códigos repetidos", () => {
  const planes = [plan({ id: "A", planNumber: "A" }), plan({ id: "B", planNumber: "B" })];
  const arboles = [arbol("a1", "1", "Tornillo", 5, { planId: "A" }), arbol("b1", "1", "Tornillo", 5, { planId: "B" })];

  it("un despacho repetido del plan A no despacha la troza homónima del plan B", () => {
    const lineas = [
      linea("trozado", { planId: "A", treeCode: "1", trozaCode: "1-A", volumeM3: 2 }),
      linea("trozado", { planId: "B", treeCode: "1", trozaCode: "1-A", volumeM3: 3 }),
      linea("despacho_troza", { planId: "A", trozaCode: "1-A", entryDate: "2026-05-29" }),
      linea("despacho_troza", { planId: "A", trozaCode: "1-A", entryDate: "2026-05-30" }),
    ];
    const atr = atribuirLineas(planes, arboles, lineas, "2026-09-29");
    expect(atr.trozas.map((t) => [t.planId, t.salida])).toEqual([["A", "despacho"], ["B", null]]);
    const b = armarExtraccion(entrada({ planes, arboles, lineas, planesEnAlcance: ["B"], conSinPlan: false })).total;
    expect([b.despachado.m3, b.enElMonte.m3]).toEqual([0, 3]);
  });

  it("el censo de un plan dado de baja no se traga sus líneas: van a «Sin plan»", () => {
    const lineas = [linea("tala", { planId: "MUERTO", treeCode: "7", volumeM3: 4 })];
    const r = armarExtraccion(entrada({ planes: [plan()], arboles: [arbol("m1", "7", "Tornillo", 5, { planId: "MUERTO" })], lineas }));
    expect(r.permisos.find((p) => p.planId == null)?.total.talado.m3).toBe(4);
    expect(r.total.talado.m3).toBe(4);
  });
});

// ─── Permiso, límites y tiempo de cálculo ────────────────────────────────────

describe("permisoDelPlan", () => {
  const permisos = [
    { id: "c1", codigo: "19-SEC/REG-PLT-2025-096", codigoNorm: "19-SEC/REG-PLT-2025-096", planId: null },
    { id: "c2", codigo: "OTRO", codigoNorm: "OTRO", planId: "p9" },
  ];
  it("el que guarda el plan, el que apunta al plan, o el gemelo por código (sugerido)", () => {
    expect(permisoDelPlan({ id: "p1", contratoId: "c2", planNumber: null, tituloHabilitante: null }, permisos)?.vinculo).toBe("plan");
    expect(permisoDelPlan({ id: "p9", contratoId: null, planNumber: null, tituloHabilitante: null }, permisos)?.vinculo).toBe("permiso");
    expect(permisoDelPlan({ id: "p1", contratoId: null, planNumber: "19-SEC/ REG-PLT-2025-096", tituloHabilitante: null }, permisos)).toEqual({
      contratoId: "c1",
      codigo: "19-SEC/REG-PLT-2025-096",
      vinculo: "gemelo",
    });
    expect(permisoDelPlan({ id: "p1", contratoId: null, planNumber: "X", tituloHabilitante: null }, permisos)).toBeNull();
  });

  it("el aviso «plan sin permiso» lleva el permiso para «Unir» (gemelo) o `null` para «Elegir permiso» (ADR-455)", () => {
    const conGemelo = armarExtraccion(
      entrada({ planes: [plan({ id: "p1", planNumber: "19-SEC/REG-PLT-2025-096" })], permisos, conSinPlan: false }),
    ).avisos.find((a) => a.tipo === "plan_sin_permiso");
    expect(conGemelo).toMatchObject({ planId: "p1", nivel: "info", permisoSugerido: { contratoId: "c1", codigo: "19-SEC/REG-PLT-2025-096" } });
    expect(conGemelo?.texto).toMatch(/el permiso 19-SEC\/REG-PLT-2025-096 tiene el mismo código/);

    const sinGemelo = armarExtraccion(entrada({ planes: [plan({ id: "p1", planNumber: "X" })], permisos, conSinPlan: false })).avisos.find(
      (a) => a.tipo === "plan_sin_permiso",
    );
    expect(sinGemelo).toMatchObject({ planId: "p1", permisoSugerido: null });

    // Ya unido (por el plan o por el permiso): no hay aviso ni botón.
    const unido = armarExtraccion(entrada({ planes: [plan({ id: "p1", contratoId: "c1" })], permisos, conSinPlan: false }));
    expect(unido.avisos.some((a) => a.tipo === "plan_sin_permiso")).toBe(false);
  });
});

describe("límites", () => {
  it("un libro truncado lo dice con un error, y un permiso sin plan con su aviso", () => {
    const r = armarExtraccion(
      entrada({
        planes: [],
        conSinPlan: false,
        permisoSinPlan: { contratoId: "c1", codigo: "CON-25-UCA-0207" },
        limites: { arbolesLeidos: 20_000, lineasLeidas: 50_000, truncado: true },
      }),
    );
    expect(r.permisos).toEqual([]);
    expect(r.avisos.map((a) => `${a.tipo}:${a.nivel}`)).toEqual(["libro_truncado:error", "permiso_sin_plan:warning"]);
    expect(r.limites.truncado).toBe(true);
  });
});

describe("rendimiento", () => {
  /* 02-10-2026: el umbral fijo («< 150 ms») frenó 3 commits: el hook corre ~80
     archivos de tests a la vez y la MISMA función tardaba el doble con la máquina
     tomada (aislada pasaba). Ahora se mide lo que de verdad se cuida —que escale—
     comparando N contra 2N bajo la MISMA carga: lineal da ≈2, cuadrático ≈4. El
     tope absoluto queda para un desastre, no para el ruido. */
  const especies = ["Copaiba", "Lupuna", "Catahua", "Mashonaste", "Sapotillo", "Aguanomasha", "Congona", "Quinilla"];
  const dia = (i: number) => `2026-${String(1 + (i % 9)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`;
  /** 2N árboles y 5N líneas, la misma forma que el libro real. */
  function libro(n: number) {
    const planes = [plan({ id: "pA", planNumber: "A" }), plan({ id: "pB", planNumber: "B", poa: poa(10, false) })];
    const arboles = Array.from({ length: 2 * n }, (_, i) =>
      arbol(`t${i}`, String(i + 1), especies[i % 8], 5 + (i % 17), { planId: i < n ? "pA" : "pB", dapM: 0.4 + (i % 50) / 100 }),
    );
    const lineas: LineaDeExtraccion[] = [];
    const mitad = n / 2;
    for (let i = 0; i < n; i++) {
      const pid = i < mitad ? "pA" : "pB";
      const code = String(i < mitad ? i + 1 : n + i - (mitad - 1));
      lineas.push(linea("tala", { planId: pid, treeCode: code, speciesCommon: especies[(Number(code) - 1) % 8], volumeM3: 4, entryDate: dia(i) }));
      lineas.push(linea("trozado", { planId: pid, treeCode: code, trozaCode: `${code}-A`, volumeM3: 1.5, entryDate: dia(i) }));
      lineas.push(linea("trozado", { planId: i % 3 === 0 ? null : pid, treeCode: code, trozaCode: `${code}-B`, volumeM3: 1.2, entryDate: dia(i) }));
      lineas.push(linea(i % 4 === 0 ? "consumo_troza" : "despacho_troza", { planId: null, trozaCode: `${code}-A`, entryDate: dia(i + 1) }));
      lineas.push(linea("despacho_troza", { planId: pid, trozaCode: `${code}-B`, status: i % 5 === 0 ? "anulado" : "registrado", entryDate: dia(i + 2) }));
    }
    return entrada({ planes, arboles, lineas, hasta: "2026-12-31", limites: { arbolesLeidos: 2 * n, lineasLeidas: 5 * n, truncado: false } });
  }
  /** El mejor de 3 corridas en caliente. */
  function medir(e: ReturnType<typeof libro>): number {
    armarExtraccion(e);
    let mejor = Infinity;
    for (let k = 0; k < 3; k++) {
      const t = performance.now();
      armarExtraccion(e);
      mejor = Math.min(mejor, performance.now() - t);
    }
    return mejor;
  }

  it("2 000 árboles y 5 000 líneas: cuadra y escala lineal (2N ≈ 2× N, nunca ≈ 4×)", () => {
    const grande = libro(1_000);
    expect(grande.lineas).toHaveLength(5_000);
    const r = armarExtraccion(grande);
    expect(r.total.talado.n).toBe(1_000);
    expect(r.total.trozado.n).toBe(2_000);
    identidad(r.total);

    const tN = medir(libro(500));
    const t2N = medir(grande);
    console.info(`[extraccion] 1 000/2 500: ${tN.toFixed(1)} ms · 2 000/5 000: ${t2N.toFixed(1)} ms · razón ${(t2N / tN).toFixed(2)}`);
    expect(t2N / tN).toBeLessThan(3.2);
    expect(t2N).toBeLessThan(600);
  });
});

// ─── Base real (sólo lectura) ────────────────────────────────────────────────

const HAS_DB: boolean = await prisma
  .$queryRaw`SELECT 1`
  .then(() => true)
  .catch(() => false);

const BLAS = "cmpxiv6p4000bohvzwl6bnfpv";
const PLAN_PLANTACION = "cmuamvvnu00018tvz1owuk0h0";
const PLAN_MAIN = "cmpq6yhdu000073vzx1khmlap";
const QA_UI = "cmtqtncxz001vs8vze4o3y7j9";

describe.skipIf(!HAS_DB)("ForestPlanDB.extraccion — la tabla real del ADR-454 (sólo lectura)", () => {
  /** La tabla del ADR §2, especie por especie. `hasta` fijo: lo que se asiente después no la mueve. */
  const ADR: [string, number, number, number, number, number, number, number, number, number][] = [
    // especie, censado, árb., sem. POA, aprovechable, árb., talado, saldo tala, trozado, saldo trozado
    ["Copaiba", 126.922, 12, 2, 91.768, 10, 10.3697, 81.3983, 4.951, 86.817],
    ["Lupuna", 92.666, 4, 1, 50.934, 3, 15.5863, 35.3477, 0, 50.934],
    ["Catahua", 89.894, 6, 1, 71.699, 5, 0, 71.699, 0, 71.699],
    ["Mashonaste", 80.233, 13, 2, 62.54, 11, 2.8368, 59.7032, 0, 62.54],
    ["Sapotillo", 72.397, 16, 2, 58.805, 14, 4.1418, 54.6632, 1.6592, 57.1458],
    ["Aguanomasha", 51.843, 8, 1, 42.527, 7, 0, 42.527, 0, 42.527],
    ["Congona", 31.189, 3, 1, 13.178, 2, 0, 13.178, 0, 13.178],
    ["Quinilla", 18.257, 3, 1, 9.068, 2, 0, 9.068, 0, 9.068],
  ];
  let plantacion: ExtraccionResponse;

  it("Blas, plantación: la tabla del ADR-454 con 0 % de semilleros (ADR-455): la base es el censo entero", async () => {
    const r = await ForestPlanDB.extraccion(BLAS, { planId: PLAN_PLANTACION, hasta: "2026-09-28" });
    expect(r).not.toBeNull();
    plantacion = r as ExtraccionResponse;
    for (const [nombre, censado, censados, , , , talado, , trozado] of ADR) {
      const e = especie(plantacion, nombre);
      // Sin semilleros ni bajo DMC: lo aprovechable ES lo censado, y cada saldo es censado − operación.
      expect([nombre, e.censo.censadoM3, e.censo.censados, e.censo.semillerosPoa, e.censo.aprovechableM3, e.censo.aprovechables]).toEqual([
        nombre, censado, censados, 0, censado, censados,
      ]);
      expect([nombre, e.talado.m3, e.saldo.tala.m3, e.trozado.m3, e.saldo.trozado.m3]).toEqual([
        nombre, talado, r4(censado - talado), trozado, r4(censado - trozado),
      ]);
      expect([nombre, e.despachado.m3, e.saldo.despacho.m3, e.enElMonte.m3]).toEqual([nombre, 0, censado, trozado]);
    }
    const t = plantacion.total;
    // Antes (10 % por defecto): 11 semilleros, 162,882 m³ fuera, base 400,519 y 8,22 % extraído.
    expect(t.censo).toMatchObject({ censadoM3: 563.401, censados: 65, semillerosPoa: 0, semillerosM3: 0, semillerosRegente: 0, excluidos: 0, aprovechableM3: 563.401, aprovechables: 65, autorizadoM3: null });
    expect(t.talado).toEqual({ m3: 32.9346, n: 4, sinVolumen: 0 });
    expect(t.saldo.tala.m3).toBe(530.4664);
    expect(t.trozado).toMatchObject({ m3: 6.6102, n: 2 });
    expect(t.saldo.trozado.m3).toBe(556.7908);
    expect(t.despachado.m3).toBe(0);
    expect(t.saldo.despacho.m3).toBe(563.401);
    expect(t.enElMonte).toEqual({ m3: 6.6102, n: 2, sinVolumen: 0 });
    expect([t.recibido.n, t.aserrado.n]).toEqual([0, 0]);
    expect(t.taladosSinTrozar).toEqual({ m3: 18.4231, n: 2, sinVolumen: 0 });
    expect(plantacion.kpis.extraido.pct).toBe(5.85);
    expect(plantacion.permisos[0].poa).toEqual({ semillerosPct: 0, configurado: false, semillerosRegente: 0, plantacion: true });
    expect(plantacion.permisos[0].arboles.porEtapa).toEqual({ en_pie: 61, talado: 2, trozado: 2 });
    expect(plantacion.permisos[0].permiso).toEqual({ contratoId: "ctr_165b5048de1f37205cca0c", codigo: "19-SEC/REG-PLT-2025-096", vinculo: "gemelo" });
  });

  it("Blas: el aviso de semilleros ya no aparece y el de «plan sin permiso» trae el gemelo para «Unir»", () => {
    expect(plantacion.avisos.some((x) => x.tipo === "semilleros_sistema_vs_regente")).toBe(false);
    const unir = plantacion.avisos.find((x) => x.tipo === "plan_sin_permiso");
    expect(unir?.permisoSugerido).toEqual({ contratoId: "ctr_165b5048de1f37205cca0c", codigo: "19-SEC/REG-PLT-2025-096" });
  });

  it("Blas: la config del POA sale de UN lugar — la plantación por defecto 0 %, PO-2026-001 lo guardado (10 %)", async () => {
    expect(await ForestLothPoaDB.leer(BLAS, PLAN_PLANTACION)).toEqual({ config: { dmcOverrides: {}, semillerosPct: 0 }, origen: "plantacion" });
    expect(await ForestLothPoaDB.leer(BLAS, "cmrtxh5bp000irrvzgw5y9yb0")).toEqual({ config: { dmcOverrides: {}, semillerosPct: 10 }, origen: "guardado" });
  });

  it("Blas «Todos»: el plan de prueba PO-2026-001 aporta 0 a la base; «Todos» = la plantación entera (563,401)", async () => {
    const r = await ForestPlanDB.extraccion(BLAS, { hasta: "2026-09-28" });
    // Censo ORIGINAL de PO-2026-001 (2 tornillos, el censo los dice «talados», 0 líneas vivas):
    // 002-TOR DAP 55 cm < DMC 61 → excluido (2,3164); 001-TOR 65 cm es el único sobre el DMC y
    // con el 10 % configurado es el semillero mínimo (3,8824). Antes entraban por «talado».
    const prueba = r?.permisos.find((p) => p.planNumber === "PO-2026-001");
    expect(prueba?.total.censo).toMatchObject({ censadoM3: 6.1988, semillerosPoa: 1, semillerosM3: 3.8824, excluidos: 1, excluidosM3: 2.3164, aprovechableM3: 0 });
    expect(r?.total.censo.aprovechableM3).toBe(563.401);
    expect(r?.kpis.extraido.pct).toBe(5.85);
    expect(r?.avisos.filter((a) => a.tipo === "censo_libro_distinto")).toHaveLength(1);
    expect(r?.recibidoAlDia).toBe(true);
  });

  it("main, PO 12: Tornillo −0,7556 / −0,6396 / 1,4864 y saldo autorizado 77,239", async () => {
    const r = await ForestPlanDB.extraccion("main", { planId: PLAN_MAIN, hasta: "2026-08-31" });
    const t = especie(r as ExtraccionResponse, "Tornillo");
    expect([t.saldo.tala.m3, t.saldo.trozado.m3, t.saldo.despacho.m3]).toEqual([-0.7556, -0.6396, 1.4864]);
    expect(t.enElMonte).toEqual({ m3: 2.126, n: 2, sinVolumen: 0 });
    expect(t.saldoAutorizado?.m3).toBe(77.239);
    identidad(t);
  });

  it("QA: las 8 líneas sin plan → «Sin plan» 16,985 = 4,1 despachado + 5,63 consumido + 7,255 en el monte", async () => {
    const r = await ForestPlanDB.extraccion(QA_UI, { planId: PLAN_ID_SIN_PLAN, hasta: "2026-09-29" });
    const t = (r as ExtraccionResponse).total;
    expect([t.trozado.m3, t.despachado.m3, t.consumidoTh.m3, t.enElMonte.m3]).toEqual([16.985, 4.1, 5.63, 7.255]);
    expect(r?.avisos.map((a) => a.tipo)).toEqual(expect.arrayContaining(["lineas_sin_plan", "salida_sin_trozado"]));
  });

  it("multi-tenant: el plan de Blas pedido desde main no existe (404)", async () => {
    expect(await ForestPlanDB.extraccion("main", { planId: PLAN_PLANTACION })).toBeNull();
    expect(await ForestPlanDB.extraccion("main", { contratoId: "ctr_165b5048de1f37205cca0c" })).toBeNull();
  });
});
