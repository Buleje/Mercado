/**
 * T9 al AGRANDAR una tala (revisión de seguridad 04-10). El importador de guías
 * (ADR-461) amplía la tala referencial de un árbol con las trozas de otra guía;
 * antes actualizaba `volumeM3` sin medir el cupo ni dejar `loth_tala_sobre_cupo`.
 *
 * Contra `ForestLothImportarDB.importarGuia` con un `prisma` falso (estilo de
 * `loth-cupo-t9-seguridad`): la revisión de la guía y el libro se fijan; la
 * medición (`cupoAlAmpliarTalaEnTx` → `enforceCupoEspecie`) y el evento corren
 * de verdad.
 *
 * Escenario: Tornillo con 5 m³ AUTORIZADOS. En el libro: 001-TOR con 3 m³ (la
 * tala referencial que se agranda) y 002-TOR con 1 m³ → 4 m³ talados.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown>;

const H = vi.hoisted(() => {
  const estado = {
    censo: [] as Fila[],
    autorizadas: [] as Fila[],
    talas: [] as Fila[],
    updates: [] as { where: Fila; data: Fila }[],
    audit: [] as Fila[],
    executeRaw: [] as string[],
    autorizadasLeidas: 0,
    orden: [] as string[],
    rev: null as unknown,
  };
  const deTenant = (where: Fila) => (f: Fila) =>
    f.tenantId === where.tenantId &&
    (where.treeCode == null || typeof where.treeCode !== "string" || f.treeCode === where.treeCode) &&
    (where.planId == null || f.planId === where.planId);
  const tx = {
    $queryRaw: async () => [{ ok: true }],
    $executeRaw: async (strings: TemplateStringsArray) => {
      estado.executeRaw.push(strings.join("?"));
      return 1;
    },
    forestCensusTree: { findMany: async ({ where }: { where: Fila }) => estado.censo.filter(deTenant(where)) },
    forestPlanSpecies: {
      findMany: async ({ where }: { where: Fila }) => {
        estado.autorizadasLeidas += 1;
        return estado.autorizadas.filter((s) => s.planId === where.planId);
      },
    },
    // La fuente de la línea (`planDeLaFuente`, en el alta de una tala nueva).
    forestPlan: { findFirst: async () => null },
    forestLothEntry: {
      findFirst: async () => null,
      aggregate: async () => ({ _max: { lineNo: estado.talas.length } }),
      findMany: async () => estado.talas,
      // Como la base: lo escrito en la tx lo ve la medición siguiente de la misma tx.
      create: async ({ data }: { data: Fila }) => {
        const fila = { ...data, id: `n${estado.talas.length + 1}`, volumeM3: data.volumeM3 == null ? null : Number(data.volumeM3) };
        estado.talas.push(fila);
        estado.orden.push(`create ${String(data.treeCode)}`);
        return fila;
      },
      update: async (args: { where: Fila; data: Fila }) => {
        estado.updates.push(args);
        const fila = estado.talas.find((t) => t.id === args.where.id);
        if (fila && args.data.volumeM3 != null) fila.volumeM3 = Number(args.data.volumeM3);
        estado.orden.push(`update ${String(fila?.treeCode ?? args.where.id)}`);
        return { id: args.where.id };
      },
    },
    activityLog: {
      create: async ({ data }: { data: Fila }) => {
        estado.audit.push(data);
        estado.orden.push(`evento ${String(data.entityId)}`);
        return data;
      },
    },
  };
  return { estado, tx };
});

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(H.tx) },
}));
vi.mock("@/lib/db/forest-loth-cierre.db", () => ({ ForestLothCierreDB: { list: async () => [], closedPeriodOf: async () => null } }));
vi.mock("@/lib/db/forest-loth-poa.db", () => ({ ForestLothPoaDB: { get: async () => ({ dmcOverrides: {} }) } }));
vi.mock("@/lib/db/forest-plan.db", () => ({
  ForestPlanDB: { getPlan: async () => null, crearPlanEnTx: async () => null, despuesDelAlta: () => {} },
  ContratoAjenoError: class ContratoAjenoError extends Error {},
}));
vi.mock("@/lib/db/gtf-numero.db", () => ({ GtfNumeroDB: { bloquear: async () => {} }, ESTADOS_SIN_INGRESO: [] }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: () => {} }));
vi.mock("@/lib/forestal/loth-audit", () => ({ auditLoth: () => {} }));
vi.mock("@/lib/forestal/loth-importar-guia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/forestal/loth-importar-guia")>()),
  revisarGuia: () => H.estado.rev,
}));

import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { ForestLothImportarDB } from "@/lib/db/forest-loth-importar.db";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";

const T = "tenant-blas";
const GTF = "019-001-0000099";
const MOTIVO = "El árbol salió más grande que lo censado";

/** La tala 001-TOR en el libro (lo que lee `libroDe`). */
const previa = (volumeM3: number, speciesCommon = "Tornillo", id = "t1", treeCode = "001-TOR", lineNo = 1) => ({
  id,
  lineNo,
  section: "tala" as const,
  planId: "P1",
  treeCode,
  trozaCode: null,
  speciesCommon,
  speciesScientific: "Cedrelinga cateniformis",
  diamMayorM: 0.8,
  diamMenorM: 0.6,
  lengthM: 8,
  volumeM3,
  fecha: "2026-09-01",
  referencial: { gtfs: ["019-001-0000090"], registros: ["R-90"], trozas: ["001-TOR-A"] },
});

let libro: { trozados: never[]; talas: ReturnType<typeof previa>[]; salidas: never[]; guias: never[]; cierres: never[] };

/** La guía agranda 001-TOR de 3 m³ a `nuevo`. */
function guiaQueAgranda(nuevo: number, especieTala = "Tornillo") {
  libro = { trozados: [], talas: [previa(3, especieTala)], salidas: [], guias: [], cierres: [] };
  H.estado.talas = [
    { id: "t1", treeCode: "001-TOR", speciesCommon: especieTala, volumeM3: 3, planId: "P1" },
    { id: "t2", treeCode: "002-TOR", speciesCommon: "Tornillo", volumeM3: 1, planId: "P1" },
  ];
  H.estado.rev = {
    yaImportada: null,
    avisos: [],
    trozas: [],
    talas: [
      {
        treeCode: "001-TOR",
        trozas: ["001-TOR-A", "001-TOR-B"],
        speciesCommon: "Tornillo",
        speciesScientific: "Cedrelinga cateniformis",
        diamMayorM: 0.8,
        diamMenorM: 0.6,
        lengthM: 14,
        volumeM3: nuevo,
        estado: "ampliar",
        talaExistente: { lineNo: 1, volumeM3: 3, planId: "P1" },
        detalle: null,
      },
    ],
  };
}

const talaDeGuia = (treeCode: string, volumeM3: number, estado: "nueva" | "ampliar", antes: number | null, lineNo: number) => ({
  treeCode,
  trozas: [`${treeCode}-B`],
  speciesCommon: "Tornillo",
  speciesScientific: "Cedrelinga cateniformis",
  diamMayorM: 0.7,
  diamMenorM: 0.5,
  lengthM: 10,
  volumeM3,
  estado,
  talaExistente: antes == null ? null : { lineNo, volumeM3: antes, planId: "P1" },
  detalle: null,
});

/** 7 m³ autorizados. Libro: 001 con 3, 002 con 1. Guía: amplía 001 (→ 4) y 002 (→ 2) y trae 003 nueva (2). */
function guiaConTres() {
  H.estado.autorizadas = [{ planId: "P1", speciesCommon: "Tornillo", volumenAutorizadoM3: 7, arbolesAutorizados: 3 }];
  libro = { trozados: [], talas: [previa(3), previa(1, "Tornillo", "t2", "002-TOR", 2)], salidas: [], guias: [], cierres: [] };
  H.estado.talas = [
    { id: "t1", treeCode: "001-TOR", speciesCommon: "Tornillo", volumeM3: 3, planId: "P1" },
    { id: "t2", treeCode: "002-TOR", speciesCommon: "Tornillo", volumeM3: 1, planId: "P1" },
  ];
  H.estado.rev = {
    yaImportada: null,
    avisos: [],
    trozas: [],
    talas: [talaDeGuia("001-TOR", 4, "ampliar", 3, 1), talaDeGuia("002-TOR", 2, "ampliar", 1, 2), talaDeGuia("003-TOR", 2, "nueva", null, 0)],
  };
}

const importar = (extra: { motivoSobreCupo?: string; puedeExcederCupo?: boolean } = {}) =>
  ForestLothImportarDB.importarGuia(T, {
    ficha: { gtfNumber: GTF, numeroRegistro: "R-99", fechaExpedicion: "15/09/2026", estado: "Vigente", trozas: [] } as unknown as GtfSerfor,
    verificada: true,
    planDestino: { tipo: "existente", planId: "P1" },
    crearTala: true,
    createdBy: "qaadmin",
    ...extra,
  });

const midioElCupo = () => H.estado.executeRaw.some((s) => s.includes("pg_advisory_xact_lock(hashtext(?), hashtext(?))"));

beforeEach(() => {
  vi.restoreAllMocks();
  Object.assign(H.estado, {
    censo: [
      { tenantId: T, planId: "P1", treeCode: "001-TOR", speciesCommon: "Tornillo", speciesScientific: "Cedrelinga cateniformis", volumenEstimadoM3: 2.9 },
      { tenantId: T, planId: "P1", treeCode: "002-TOR", speciesCommon: "Tornillo", speciesScientific: "Cedrelinga cateniformis", volumenEstimadoM3: 3.3 },
      { tenantId: T, planId: "P1", treeCode: "003-TOR", speciesCommon: "Tornillo", speciesScientific: "Cedrelinga cateniformis", volumenEstimadoM3: 2.5 },
      // El mismo código en OTRO tenant, con otra especie: no se mira.
      { tenantId: "tenant-ajeno", planId: "P1", treeCode: "001-TOR", speciesCommon: "Catahua", speciesScientific: null, volumenEstimadoM3: 9 },
    ],
    autorizadas: [{ planId: "P1", speciesCommon: "Tornillo", volumenAutorizadoM3: 5, arbolesAutorizados: 2 }],
    updates: [],
    audit: [],
    executeRaw: [],
    autorizadasLeidas: 0,
    orden: [],
  });
  vi.spyOn(ForestLothDB, "getActiveCaratula").mockResolvedValue(null as never);
  vi.spyOn(ForestLothDB, "despacharConGuiaEnTx").mockResolvedValue({ gtf: { id: "g1" }, lineas: [], volumen: 0 } as never);
  vi.spyOn(ForestLothDB, "auditarDespachoConGuia").mockImplementation(() => {});
  vi.spyOn(ForestLothImportarDB, "bajoDmcDe").mockResolvedValue(new Map());
  vi.spyOn(ForestLothImportarDB, "planesYContratos").mockResolvedValue({
    planes: [
      {
        id: "P1",
        planType: "PMFI",
        planNumber: "PMFI-01",
        tituloHabilitante: null,
        titularName: "Blas",
        contratoId: null,
        especies: [{ planId: "P1", speciesCommon: "Tornillo", speciesScientific: "Cedrelinga cateniformis" }],
      },
    ],
    contratos: [],
  } as never);
  vi.spyOn(ForestLothImportarDB, "libroDe").mockImplementation(async () => libro as never);
});

describe("T9 al agrandar una tala con el importador de guías", () => {
  it("(a) agrandar DENTRO del cupo (3 → 3,8; especie 4,8 de 5) → se mide, se actualiza, sin evento", async () => {
    guiaQueAgranda(3.8);
    const r = await importar();
    expect(r.estado).toBe("importada");
    expect(midioElCupo()).toBe(true);
    expect(H.estado.updates).toHaveLength(1);
    expect(H.estado.updates[0].where).toEqual({ id: "t1", tenantId: T });
    expect(Number(H.estado.updates[0].data.volumeM3)).toBe(3.8);
    expect(H.estado.audit).toHaveLength(0);
  });

  it("(b) agrandar POR ENCIMA sin motivo (3 → 6; especie 7 de 5) → rechazo de la guía con T9, sin update", async () => {
    guiaQueAgranda(6);
    const r = await importar();
    expect(r).toMatchObject({ estado: "rechazada", codigo: "T9_CUPO_ESPECIE", gtfId: null });
    expect(r.mensaje).toContain(`${fmtM3(7)} de ${fmtM3(5)} m³`);
    expect(H.estado.updates).toHaveLength(0);
    expect(H.estado.audit).toHaveLength(0);
  });

  it("(c) por encima CON motivo y rol → update + `loth_tala_sobre_cupo` con el exceso del aumento (7 − 5 = 2, no 10 − 5)", async () => {
    guiaQueAgranda(6);
    const r = await importar({ motivoSobreCupo: MOTIVO, puedeExcederCupo: true });
    expect(r.estado).toBe("importada");
    expect(H.estado.orden).toEqual(["update 001-TOR", "evento t1"]);
    expect(String(H.estado.updates[0].data.observations)).toMatch(/^\[Tala sobre el cupo: Tornillo 140 % de lo autorizado/);
    expect(H.estado.audit).toHaveLength(1);
    const ev = H.estado.audit[0];
    expect(ev).toMatchObject({ tenantId: T, action: "loth_tala_sobre_cupo", entity: "ForestLothEntry", entityId: "t1", user: "qaadmin" });
    const detail = String(ev.detail);
    // Talado con la ampliación: 1 (002) + 6 (001 agrandada) = 7. Contar la previa
    // encima (3 + 6 + 1 = 10) daría exceso 5; medir sólo el aumento suelto (1 + 3) no daría nada.
    expect(detail).toContain(`${fmtM3(3)} → ${fmtM3(6)} m³, +${fmtM3(3)}; exceso ${fmtM3(2)} m³`);
    expect(detail).toContain(`(${fmtM3(7)} de ${fmtM3(5)} m³). Motivo: ${MOTIVO}`);
    expect(detail).not.toContain(fmtM3(10));
    // RLS del ActivityLog fijado en la misma tx (como en el alta).
    expect(H.estado.executeRaw.some((s) => s.includes("set_config('app.tenant_id'"))).toBe(true);
  });

  it("(d) ACHICAR (3 → 2) o quedar igual → no se mide el cupo, sólo el update", async () => {
    guiaQueAgranda(2);
    expect((await importar()).estado).toBe("importada");
    guiaQueAgranda(3);
    expect((await importar()).estado).toBe("importada");
    expect(midioElCupo()).toBe(false);
    expect(H.estado.autorizadasLeidas).toBe(0);
    expect(H.estado.updates).toHaveLength(2);
    expect(H.estado.audit).toHaveLength(0);
  });

  it("motivo SIN rol decidido → rechazo de la guía con T9_SOLO_DUENO (no un 500), sin update", async () => {
    guiaQueAgranda(6);
    const r = await importar({ motivoSobreCupo: MOTIVO });
    expect(r).toMatchObject({ estado: "rechazada", codigo: "T9_SOLO_DUENO" });
    expect(H.estado.updates).toHaveLength(0);
  });

  it("UNA nueva + DOS ampliadas en la misma guía: la nueva va primero y cada medición ve lo anterior de la tx", async () => {
    guiaConTres();
    const r = await importar({ motivoSobreCupo: MOTIVO, puedeExcederCupo: true });
    expect(r.estado).toBe("importada");
    // La revisión las trae ampliadas primero; se escribe la nueva antes (lock del cupo tras el correlativo).
    expect(H.estado.orden).toEqual(["create 003-TOR", "update 001-TOR", "update 002-TOR", "evento t2"]);
    // nueva 003: 3 + 1 + 2 = 6 ≤ 7 · ampliar 001 (3 → 4): 4 + 1 + 2 = 7 ≤ 7 · ampliar 002 (1 → 2): 4 + 2 + 2 = 8 → exceso 1.
    // Si la 2.ª ampliación no viera la 1.ª (7) o la nueva (6), no habría exceso; contando la previa encima, 9.
    expect(H.estado.audit).toHaveLength(1);
    const detail = String(H.estado.audit[0].detail);
    expect(detail).toContain(`${fmtM3(1)} → ${fmtM3(2)} m³, +${fmtM3(1)}; exceso ${fmtM3(1)} m³`);
    expect(detail).toContain(`(${fmtM3(8)} de ${fmtM3(7)} m³)`);
    expect(H.estado.talas.map((t) => [t.treeCode, t.volumeM3])).toEqual([
      ["001-TOR", 4],
      ["002-TOR", 2],
      ["003-TOR", 2],
    ]);
  });

  it("la misma guía SIN motivo → rechazo T9 con lo medido (8 de 7), aunque la nueva y la 1.ª ampliación cupieran", async () => {
    guiaConTres();
    const r = await importar();
    expect(r).toMatchObject({ estado: "rechazada", codigo: "T9_CUPO_ESPECIE" });
    expect(r.mensaje).toContain(`${fmtM3(8)} de ${fmtM3(7)} m³`);
    expect(H.estado.audit).toHaveLength(0);
  });

  it("la especie la pone el censo: una tala vieja escrita «Tornilo» no esquiva el cupo ni frena por el nombre", async () => {
    guiaQueAgranda(6, "Tornilo");
    expect(await importar()).toMatchObject({ estado: "rechazada", codigo: "T9_CUPO_ESPECIE" });
    guiaQueAgranda(3.8, "Tornilo");
    expect((await importar()).estado).toBe("importada");
  });
});
