/**
 * ADR-459 · Plantación sin censo: el registro es la base.
 *
 *  1. La especie del registro se reconoce por CLAVE (tildes, mayúsculas, el
 *     científico entre paréntesis), nunca por texto exacto.
 *  2. T7 en la tala de una plantación con especies registradas — por el camino
 *     real (`ForestLothDB.create` → `enforceInvariants`), con la base simulada.
 *     Sin especies registradas NO frena (la plantación 19-SEC de Blas tiene 0).
 *  3. El despacho (T7/T6) usa la MISMA regla de especie: «Tornillo» contra
 *     «Tornillo (Cedrelinga catenaeformis)» pasa, y el techo de T6 se encuentra.
 *  4. Extracción: plantación sin censo con registro → la base del saldo por
 *     operación es lo registrado (`contra: "autorizado"`), no 0 − talado.
 *  5. El Zod del alta: especies repetidas, vacío = null, tope de 60.
 *  6. Revisión 02-10: la especie por científico vale IGUAL en T7, T6 y el saldo
 *     (Cedro / Cedro rojo, los dos *Cedrela odorata*); el patio no resta dos
 *     veces el producto despachado; una línea con un plan que no existe, 400.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => {
  type Especie = { id: string; speciesCommon: string; speciesScientific: string | null; volumenAutorizadoM3: number };
  const estado = {
    plan: null as null | { planType: string; planNumber: string | null; tituloHabilitante: string | null },
    registro: [] as Especie[],
    /** La línea de Trozado que encuentra T2 (para el despacho). */
    trozado: null as null | { id: string; speciesCommon: string; speciesScientific: string | null; volumeM3: number },
  };
  const creadas: Record<string, unknown>[] = [];
  const tx = {
    $queryRaw: async () => [],
    forestPlan: { findFirst: async () => estado.plan },
    forestPlanSpecies: {
      findMany: async () => estado.registro,
      aggregate: async ({ where }: { where: { id: { in: string[] } } }) => {
        const filas = estado.registro.filter((r) => where.id.in.includes(r.id));
        return { _sum: { volumenAutorizadoM3: filas.length ? filas.reduce((s, r) => s + r.volumenAutorizadoM3, 0) : null } };
      },
    },
    forestLothEntry: {
      findFirst: async ({ where }: { where: { section?: unknown } }) => (where.section === "trozado" ? estado.trozado : null),
      findMany: async () => [],
      groupBy: async () => [],
      aggregate: async () => ({ _max: { lineNo: 0 }, _sum: { volumeM3: null, quantity: null } }),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        creadas.push(data);
        return { id: `nueva-${creadas.length}`, lineNo: 1, ...data };
      },
    },
  };
  return { estado, creadas, tx };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) => fn(H.tx),
    forestCensusTree: { findFirst: async () => null },
    // El plan citado por la línea: existe en este negocio si la prueba puso uno.
    forestPlan: { findFirst: async () => (H.estado.plan ? { id: "p1" } : null) },
  },
}));
vi.mock("@/lib/cache", () => ({ invalidate: () => {}, invalidateByPrefix: () => {} }));
vi.mock("@/lib/forestal/loth-audit", () => ({ auditLoth: () => {} }));
vi.mock("@/lib/db/forest-loth-cierre.db", () => ({ ForestLothCierreDB: { closedPeriodOf: async () => null } }));

const { ForestLothDB } = await import("@/lib/db/forest-loth.db");
const { especieEnRegistro, especiesDelAltaSchema, especieDelPlanSchema } = await import("@/lib/forestal/loth-plan-especie");
const { armarExtraccion } = await import("@/lib/forestal/loth-extraccion");
const { computeBalance } = await import("@/lib/forestal/loth-constants");
const { cascadaDeFila } = await import("@/lib/forestal/loth-saldo-cascada");
type EntradaExtraccion = import("@/lib/forestal/loth-extraccion").EntradaExtraccion;
type LineaDeExtraccion = import("@/lib/forestal/loth-extraccion").LineaDeExtraccion;
type PlanDeExtraccion = import("@/lib/forestal/loth-extraccion").PlanDeExtraccion;

const PLANTACION = { planType: "PLANTACION", planNumber: "PO1", tituloHabilitante: null };
const BOSQUE = { planType: "PO", planNumber: "PO 12", tituloHabilitante: null };
const especie = (id: string, speciesCommon: string, volumenAutorizadoM3 = 100, speciesScientific: string | null = null) => ({
  id,
  speciesCommon,
  speciesScientific,
  volumenAutorizadoM3,
});
const talar = (speciesCommon: string, over: Record<string, unknown> = {}) =>
  ForestLothDB.create("main", {
    section: "tala",
    planId: "p1",
    treeCode: `T-${Math.random().toString(36).slice(2, 7)}`,
    speciesCommon,
    volumeM3: 2,
    createdBy: "test-adr459",
    ...over,
  });

beforeEach(() => {
  H.estado.plan = null;
  H.estado.registro = [];
  H.estado.trozado = null;
  H.creadas.length = 0;
});

// ─── 1. La especie del registro ──────────────────────────────────────────────

describe("especieEnRegistro — por clave, nunca por texto exacto", () => {
  const registro = [
    { speciesCommon: "Tornillo (Cedrelinga catenaeformis)", speciesScientific: null },
    { speciesCommon: "Marupá", speciesScientific: null },
    { speciesCommon: "Bolaina blanca", speciesScientific: "Guazuma crinita" },
  ];
  it("tilde, mayúsculas y el científico entre paréntesis no cambian la especie", () => {
    expect(especieEnRegistro(registro, "tornillo")).toBe(true);
    expect(especieEnRegistro(registro, "MARUPA")).toBe(true);
    expect(especieEnRegistro(registro, "  Bolaina   Blanca ")).toBe(true);
  });
  it("con el mismo científico, «Bolaina» es la «Bolaina blanca» del registro", () => {
    expect(especieEnRegistro(registro, "Bolaina", "guazuma crinita")).toBe(true);
    expect(especieEnRegistro(registro, "Bolaina")).toBe(false);
  });
  it("otra especie no está", () => {
    expect(especieEnRegistro(registro, "Capirona")).toBe(false);
    expect(especieEnRegistro(registro, "")).toBe(false);
  });
});

// ─── 2. T7 en la tala de una plantación ──────────────────────────────────────

describe("T7 en la tala de una plantación (ADR-459)", () => {
  it("una especie que no está en el registro frena con el mensaje del contrato", async () => {
    H.estado.plan = PLANTACION;
    H.estado.registro = [especie("s1", "Bolaina blanca")];
    await expect(talar("Capirona")).rejects.toMatchObject({
      code: "T7_ESPECIE_NO_AUTORIZADA",
      message: "La especie Capirona no está en el registro de la plantación: agrégala en Plan de manejo → Registro.",
    });
    expect(H.creadas).toHaveLength(0);
  });

  it("la especie del registro escrita con otra tilde o mayúscula SÍ pasa", async () => {
    H.estado.plan = PLANTACION;
    H.estado.registro = [especie("s1", "Marupá"), especie("s2", "Tornillo (Cedrelinga catenaeformis)")];
    await expect(talar("MARUPA")).resolves.toMatchObject({ speciesCommon: "MARUPA" });
    await expect(talar("tornillo")).resolves.toMatchObject({ speciesCommon: "tornillo" });
    expect(H.creadas).toHaveLength(2);
  });

  it("sin especies registradas NO frena (Blas 19-SEC: plantación con 0 especies y 4 talas)", async () => {
    H.estado.plan = PLANTACION;
    H.estado.registro = [];
    await expect(talar("Lupuna")).resolves.toBeTruthy();
  });

  it("sin código de árbol (plantación sin censo) igual se juzga la especie", async () => {
    H.estado.plan = PLANTACION;
    H.estado.registro = [especie("s1", "Bolaina blanca")];
    await expect(talar("Capirona", { treeCode: null })).rejects.toMatchObject({ code: "T7_ESPECIE_NO_AUTORIZADA" });
  });

  it("un plan con «REG-PLT» en el código es plantación aunque se haya cargado como PO", async () => {
    H.estado.plan = { planType: "PO", planNumber: "19-SEC/REG-PLT-2025-096", tituloHabilitante: null };
    H.estado.registro = [especie("s1", "Copaiba")];
    await expect(talar("Mashonaste")).rejects.toMatchObject({ code: "T7_ESPECIE_NO_AUTORIZADA" });
  });

  it("en bosque natural la tala no la juzga T7 (la juzgan el censo y el DMC)", async () => {
    H.estado.plan = BOSQUE;
    H.estado.registro = [especie("s1", "Tornillo")];
    await expect(talar("Capirona")).resolves.toBeTruthy();
  });

  it("una tala sin plan atado (código libre) no se juzga", async () => {
    H.estado.plan = PLANTACION;
    H.estado.registro = [especie("s1", "Bolaina blanca")];
    await expect(talar("Capirona", { planId: null })).resolves.toBeTruthy();
  });

  it("pasarse del volumen registrado en la tala NO frena (lo frena T6 al despachar)", async () => {
    H.estado.plan = PLANTACION;
    H.estado.registro = [especie("s1", "Bolaina blanca", 1)];
    await expect(talar("Bolaina blanca", { volumeM3: 50 })).resolves.toBeTruthy();
  });
});

// ─── 3. El despacho usa la misma regla ───────────────────────────────────────

describe("despacho: T7 y T6 reconocen la especie por clave", () => {
  const despachar = () =>
    ForestLothDB.create("main", { section: "despacho_troza", planId: "p1", trozaCode: "T-1-A", gtfNumber: "G-1", createdBy: "test-adr459" });

  it("«Tornillo» del trozado contra «Tornillo (Cedrelinga catenaeformis)» del plan pasa (antes: T7 falso)", async () => {
    H.estado.plan = BOSQUE;
    H.estado.registro = [especie("s1", "Tornillo (Cedrelinga catenaeformis)", 80)];
    H.estado.trozado = { id: "tz", speciesCommon: "Tornillo", speciesScientific: null, volumeM3: 2 };
    await expect(despachar()).resolves.toBeTruthy();
  });

  it("y el techo de T6 se encuentra: 4 m³ contra 3 registrados frena (antes se salteaba)", async () => {
    H.estado.plan = PLANTACION;
    H.estado.registro = [especie("s1", "Tornillo (Cedrelinga catenaeformis)", 3)];
    H.estado.trozado = { id: "tz", speciesCommon: "tornillo", speciesScientific: null, volumeM3: 4 };
    await expect(despachar()).rejects.toMatchObject({
      code: "T6_EXCESO_AUTORIZADO",
      message: expect.stringContaining("El registro de la plantación tiene 3 m³ de tornillo"),
    });
  });

  it("una especie fuera del POA sigue frenando el despacho", async () => {
    H.estado.plan = BOSQUE;
    H.estado.registro = [especie("s1", "Tornillo")];
    H.estado.trozado = { id: "tz", speciesCommon: "Cedro", speciesScientific: null, volumeM3: 1 };
    await expect(despachar()).rejects.toMatchObject({ code: "T7_ESPECIE_NO_AUTORIZADA" });
  });
});

// ─── 4. Extracción: el registro es la base ───────────────────────────────────

const HOY = new Date("2026-10-02T17:00:00Z");
let seq = 0;
const linea = (section: string, over: Partial<LineaDeExtraccion> = {}): LineaDeExtraccion => {
  seq += 1;
  return {
    id: `l${seq}`, planId: "p1", section, status: "registrado", lineNo: seq, entryDate: "2026-09-20",
    treeCode: null, trozaCode: null, speciesCommon: null, cites: false, volumeM3: null, quantity: null, unit: null, gtfNumber: null,
    ...over,
  };
};
const planX = (over: Partial<PlanDeExtraccion> = {}): PlanDeExtraccion => ({
  id: "p1", planNumber: "PO1", planType: "PLANTACION", titular: "QA", alias: null, estado: "vigente",
  tituloHabilitante: null, contratoId: null, vigenciaDesde: "2026-01-01", vigenciaHasta: "2027-12-31", areaHa: null,
  poa: { config: { dmcOverrides: {}, semillerosPct: 0 }, configurado: false },
  especies: [{ speciesCommon: "Bolaina blanca", cites: false, volumenAutorizadoM3: 100, arbolesAutorizados: null }],
  ...over,
});
const entrada = (plan: PlanDeExtraccion, lineas: LineaDeExtraccion[]): EntradaExtraccion => ({
  hoy: HOY,
  alcance: { planId: plan.id, contratoId: null },
  planesEnAlcance: [plan.id],
  conSinPlan: false,
  planes: [plan],
  permisos: [],
  arboles: [],
  lineas,
  recepciones: [],
  limites: { arbolesLeidos: 0, lineasLeidas: lineas.length, truncado: false },
});
/** 30 m³ talados de Bolaina, 12 trozados; nada de censo. */
const lineasBolaina = () => [
  linea("tala", { treeCode: "B-1", speciesCommon: "Bolaina blanca", volumeM3: 30 }),
  linea("trozado", { treeCode: "B-1", trozaCode: "B-1-A", speciesCommon: "Bolaina blanca", volumeM3: 12 }),
];

describe("extracción de una plantación sin censo (ADR-459)", () => {
  it("la base del saldo es lo registrado: 100 − 30 talado = 70 (ok), no 0 − 30 = «tope»", () => {
    const r = armarExtraccion(entrada(planX(), lineasBolaina()));
    const fila = r.especies.find((e) => e.clave === "bolaina blanca");
    expect(fila?.baseSaldo).toEqual({ m3: 100, contra: "autorizado" });
    expect(fila?.saldo.tala).toEqual({ m3: 70, pct: 30, nivel: "ok" });
    expect(fila?.saldo.trozado).toEqual({ m3: 88, pct: 12, nivel: "ok" });
    expect(r.total.saldo.tala.nivel).toBe("ok");
    expect(r.kpis.extraido).toMatchObject({ pct: 30, baseM3: 100 });
    expect(r.kpis.porTalar.m3).toBe(70);
    // Sin censo no hay «medido sobre el censo» ni «autoriza más de lo que el censo sostiene».
    expect(r.avisos.map((a) => a.tipo)).not.toContain("medido_sobre_censo");
    expect(r.avisos.map((a) => a.tipo)).not.toContain("autorizado_sin_respaldo");
  });

  it("control: el mismo libro en un plan de bosque (PO) sigue midiendo contra el censo (0 → tope)", () => {
    const r = armarExtraccion(entrada(planX({ planType: "PO", planNumber: "PO 12" }), lineasBolaina()));
    const fila = r.especies.find((e) => e.clave === "bolaina blanca");
    expect(fila?.baseSaldo).toEqual({ m3: 0, contra: "censo" });
    expect(fila?.saldo.tala.nivel).toBe("tope");
  });

  it("pasarse de lo registrado es `exceso` (rojo), no `tope`", () => {
    const r = armarExtraccion(
      entrada(planX(), [linea("tala", { treeCode: "B-9", speciesCommon: "bolaina blanca", volumeM3: 120 })]),
    );
    expect(r.especies[0].saldo.tala).toEqual({ m3: -20, pct: 120, nivel: "exceso" });
    // En una plantación nadie «autoriza»: el aviso habla del registro, con su nombre oficial.
    expect(r.avisos.find((a) => a.tipo === "exceso_autorizado")?.texto).toMatch(/^Bolaina blanca: se talaron .* y el registro tiene /);
  });

  it("una plantación CON censo aprovechable sigue midiendo contra el censo", () => {
    const e = entrada(planX(), lineasBolaina());
    e.arboles = [
      { id: "a1", planId: "p1", treeCode: "B-1", speciesCommon: "Bolaina blanca", cites: false, dapM: 0.5, volumenEstimadoM3: 40, estado: "en_pie", condicion: null },
    ];
    const r = armarExtraccion(e);
    expect(r.especies[0].baseSaldo).toEqual({ m3: 40, contra: "censo" });
  });

  it("sin especies registradas, la plantación sin censo no inventa base (Blas PO1 hoy)", () => {
    const r = armarExtraccion(entrada(planX({ especies: [] }), lineasBolaina()));
    expect(r.especies[0].baseSaldo).toEqual({ m3: 0, contra: "censo" });
  });
});

// ─── 5. El Zod del alta ──────────────────────────────────────────────────────

describe("Zod del alta del plan con especies", () => {
  const ok = { speciesCommon: "Bolaina blanca", volumenAutorizadoM3: 120 };
  it("la misma especie dos veces (por clave) no entra", () => {
    const r = especiesDelAltaSchema.safeParse([ok, { ...ok, speciesCommon: "BOLAINA  blanca" }]);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]).toMatchObject({ path: [1, "speciesCommon"] });
  });
  it("hasta 60 especies", () => {
    const filas = Array.from({ length: 61 }, (_, i) => ({ ...ok, speciesCommon: `Especie ${i}` }));
    expect(especiesDelAltaSchema.safeParse(filas).success).toBe(false);
    expect(especiesDelAltaSchema.safeParse(filas.slice(0, 60)).success).toBe(true);
  });
  it("vacío = no se sabe (null), nunca 0; el año va de 1900 a 2100", () => {
    expect(especieDelPlanSchema.safeParse({ ...ok, anioInstalacion: "", superficieHa: "" }).data).toMatchObject({
      anioInstalacion: null,
      superficieHa: null,
    });
    expect(especieDelPlanSchema.safeParse({ ...ok, anioInstalacion: "2019", superficieHa: "12.5" }).data).toMatchObject({
      anioInstalacion: 2019,
      superficieHa: 12.5,
    });
    expect(especieDelPlanSchema.safeParse({ ...ok, anioInstalacion: 1899 }).success).toBe(false);
    expect(especieDelPlanSchema.safeParse({ ...ok, superficieHa: -1 }).success).toBe(false);
  });
  it("un PATCH de un solo campo no trae los demás (sin defaults que pisen)", () => {
    expect(especieDelPlanSchema.partial().safeParse({ anioInstalacion: 2020 }).data).toEqual({ anioInstalacion: 2020 });
  });
});

// ─── 6. Revisión 02-10 ───────────────────────────────────────────────────────

describe("la especie por científico vale igual en T7, T6 y el saldo (reviewer 02-10)", () => {
  const despacharCedro = () =>
    ForestLothDB.create("main", { section: "despacho_troza", planId: "p1", trozaCode: "C-1-A", gtfNumber: "G-9", createdBy: "test-adr459" });

  it("«Cedro» (Cedrela odorata) contra el registro «Cedro rojo» (Cedrela odorata) de 3 m³: el despacho de 50 m³ frena con T6", async () => {
    H.estado.plan = PLANTACION;
    H.estado.registro = [especie("s1", "Cedro rojo", 3, "Cedrela odorata")];
    H.estado.trozado = { id: "tz", speciesCommon: "Cedro", speciesScientific: "Cedrela odorata", volumeM3: 50 };
    await expect(despacharCedro()).rejects.toMatchObject({
      code: "T6_EXCESO_AUTORIZADO",
      detail: { autorizado: 3, movilizado: 0, pedido: 50 },
    });
  });

  it("la tala aceptada por el científico DESCUENTA del saldo de esa especie (no queda «fuera del plan»)", () => {
    const b = computeBalance(
      [{ speciesCommon: "Cedro rojo", speciesScientific: "Cedrela odorata", cites: false, volumenAutorizadoM3: 100 }],
      [
        { section: "tala", speciesCommon: "Cedro", speciesScientific: "Cedrela odorata", trozaCode: null, volumeM3: 10, quantity: null, unit: null },
        { section: "trozado", speciesCommon: "Cedro", speciesScientific: "Cedrela odorata", trozaCode: "C-1-A", volumeM3: 8, quantity: null, unit: null },
        { section: "despacho_troza", speciesCommon: null, trozaCode: "C-1-A", volumeM3: null, quantity: null, unit: null },
      ],
    );
    expect(b.rows[0]).toMatchObject({ talado: 10, trozado: 8, movilizado: 8, saldo: 92 });
    expect(b.fueraDePlan).toEqual([]);
  });

  it("sin científico no se inventa el cruce: «Cedro» sin más sigue fuera del registro «Cedro rojo»", () => {
    const b = computeBalance(
      [{ speciesCommon: "Cedro rojo", speciesScientific: "Cedrela odorata", cites: false, volumenAutorizadoM3: 100 }],
      [{ section: "despacho_producto", speciesCommon: "Cedro", trozaCode: null, volumeM3: null, quantity: 2, unit: "m3" }],
    );
    expect(b.rows[0].movilizado).toBe(0);
    expect(b.fueraDePlan).toEqual([{ species: "Cedro", movilizadoM3: 2 }]);
  });
});

describe("el patio no resta dos veces el producto despachado (reviewer 02-10)", () => {
  it("2 trozas de 5, una consumida y 2 m³ de producto despachado → patio 5 (antes 3)", () => {
    const b = computeBalance(
      [{ speciesCommon: "Bolaina blanca", cites: false, volumenAutorizadoM3: 100 }],
      [
        { section: "tala", speciesCommon: "Bolaina blanca", trozaCode: null, volumeM3: 11, quantity: null, unit: null },
        { section: "trozado", speciesCommon: "Bolaina blanca", trozaCode: "B-1-A", volumeM3: 5, quantity: null, unit: null },
        { section: "trozado", speciesCommon: "Bolaina blanca", trozaCode: "B-1-B", volumeM3: 5, quantity: null, unit: null },
        { section: "consumo_troza", speciesCommon: null, trozaCode: "B-1-B", volumeM3: null, quantity: null, unit: null },
        { section: "despacho_producto", speciesCommon: "Bolaina blanca", trozaCode: null, volumeM3: null, quantity: 2, unit: "m3" },
      ],
    );
    const fila = b.rows[0];
    expect(fila).toMatchObject({ trozado: 10, consumido: 5, movilizado: 2, movilizadoTroza: 0 });
    expect(cascadaDeFila(fila).enPatioM3).toBe(5);
    // Una respuesta vieja sin `movilizadoTroza` cae a `movilizado`, como antes.
    const { movilizadoTroza: _sinCampo, ...vieja } = fila;
    expect(cascadaDeFila(vieja).enPatioM3).toBe(3);
  });
});

describe("una línea con un plan que no es de este negocio", () => {
  it("no entra: PLAN_NO_EXISTE (la ruta lo devuelve como 400)", async () => {
    H.estado.plan = null;
    await expect(talar("Capirona", { planId: "plan-de-otro-negocio" })).rejects.toMatchObject({ code: "PLAN_NO_EXISTE" });
    expect(H.creadas).toHaveLength(0);
  });
});
