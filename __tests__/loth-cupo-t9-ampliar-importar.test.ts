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
 *
 * 04-10 (la guía que pasa el cupo no se podía importar: nadie mandaba el
 * motivo): la VISTA PREVIA mide el mismo exceso que la importación
 * (`entradaCupoDelPlan` + `cupoDeLaGuia`, sin escribir), y la RUTA (con el
 * `requireAdmin` real, sólo se finge la sesión) manda el motivo del cuerpo y
 * el rol del JWT.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

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
    payload: null as null | { username: string; role: string; tenantId: string },
    resueltas: [] as unknown[],
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
      // T6 (lo despachado) se prueba en `loth-importar-guia-t6-vista`: acá, sin techo.
      aggregate: async () => ({ _sum: { volumenAutorizadoM3: null } }),
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

/* Fuera de la tx (la vista previa) se lee lo MISMO que dentro: misma base. */
vi.mock("@/lib/prisma", () => ({
  prisma: { ...H.tx, $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(H.tx) },
}));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
vi.mock("@/lib/session", async (real) => ({ ...(await real<typeof import("@/lib/session")>()), getSessionPayload: async () => H.estado.payload }));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/forestal/loth-importar-guia-fuentes", () => ({ resolverFuentes: async () => H.estado.resueltas, cobrarConsultasSerfor: () => null }));
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
import { talasAEscribir } from "@/lib/forestal/loth-importar-guia";
import { cupoDeLaGuia } from "@/lib/forestal/loth-importar-guia-cupo";
import type { TalaReferencial } from "@/lib/forestal/loth-importar-guia-tipos";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import { POST as postImportar } from "@/app/api/admin/forestal/loth/importar-guia/route";

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

let libro: { trozados: unknown[]; talas: ReturnType<typeof previa>[]; salidas: never[]; guias: never[]; cierres: never[] };

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

const importar = (extra: { motivoSobreCupo?: string; puedeExcederCupo?: boolean; crearTala?: boolean } = {}) =>
  ForestLothImportarDB.importarGuia(T, {
    ficha: { gtfNumber: GTF, numeroRegistro: "R-99", fechaExpedicion: "15/09/2026", estado: "Vigente", trozas: [] } as unknown as GtfSerfor,
    verificada: true,
    planDestino: { tipo: "existente", planId: "P1" },
    crearTala: true,
    createdBy: "qaadmin",
    ...extra,
  });

/** La vista previa del servidor sobre la revisión fijada (misma lectura del plan que la importación). */
const vistaDelCupo = async (crearTala: boolean) =>
  cupoDeLaGuia(
    await ForestLothDB.entradaCupoDelPlan(H.tx as never, T, "P1"),
    talasAEscribir((H.estado.rev as { talas: TalaReferencial[] }).talas, crearTala),
  ).sobreCupo;

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

  it("una tala NUEVA sobre lo autorizado deja el evento con su GTF, su volumen y el exceso (como la agrandada)", async () => {
    guiaConTres();
    H.estado.autorizadas = [{ planId: "P1", speciesCommon: "Tornillo", volumenAutorizadoM3: 5, arbolesAutorizados: 3 }];
    (H.estado.rev as { talas: unknown[] }).talas = [talaDeGuia("003-TOR", 2, "nueva", null, 0)];
    expect((await importar({ motivoSobreCupo: MOTIVO, puedeExcederCupo: true })).estado).toBe("importada");
    // 3 + 1 + 2 = 6 de 5 → exceso 1.
    const detail = String(H.estado.audit[0].detail);
    expect(detail).toContain(`003-TOR (tala nueva de la GTF ${GTF}: ${fmtM3(2)} m³; exceso ${fmtM3(1)} m³)`);
    expect(detail).toContain(`(${fmtM3(6)} de ${fmtM3(5)} m³). Motivo: ${MOTIVO}`);
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

describe("T9 en la VISTA PREVIA: el mismo exceso que la importación, sin escribir", () => {
  /** Una guía de verdad (la revisión real arma la ampliación): trae 001-TOR-B con 3 m³ → 001-TOR pasa de 3 a 6. */
  const FICHA_AGRANDA = {
    gtfNumber: GTF,
    numeroRegistro: "R-99",
    fechaExpedicion: "15/09/2026",
    estado: "Vigente",
    titular: "Blas",
    numeroTitulo: "PMFI-01",
    trozas: [
      { codificacion: "001-TOR-B", dimensiones: "60 X 80 X 6", comun: "Tornillo", cientifico: "Cedrelinga cateniformis", tipoProducto: "Troza", presentacion: null, cantidad: 1, unidad: "m3", volumen: 3 },
    ],
  } as unknown as GtfSerfor;

  it("vistaPrevia (revisión real): «Tornillo: 7 de 5 m³ autorizados — exceso 2», sin lock ni escritura; la importación mide lo mismo", async () => {
    guiaQueAgranda(6);
    libro.trozados = [
      { ...previa(3), id: "z1", section: "trozado", trozaCode: "001-TOR-A", referencial: null, gtfNumber: "019-001-0000090" },
    ];
    const {
      guias: [g],
    } = await ForestLothImportarDB.vistaPrevia(T, [
      { clave: "c1", fuente: { tipo: "ficha", ficha: FICHA_AGRANDA } as never, ficha: FICHA_AGRANDA, verificada: true, falla: null, planElegido: "P1" },
    ]);
    expect(g.talas.map((t) => [t.treeCode, t.estado, t.volumeM3])).toEqual([["001-TOR", "ampliar", 6]]);
    const fila = { especie: "Tornillo", fuente: "autorizado", cupoM3: 5, totalConLaGuiaM3: 7, excesoM3: 2, exigeMotivo: true };
    expect(g.sobreCupo?.conTala).toEqual([expect.objectContaining(fila)]);
    // Con el interruptor apagado la ampliación se escribe igual: el mismo exceso.
    expect(g.sobreCupo?.sinTala).toEqual([expect.objectContaining(fila)]);
    expect(g.sobreCupo?.conTala[0].mensaje).toBe(`Tornillo: ${fmtM3(7)} de ${fmtM3(5)} m³ autorizados — exceso ${fmtM3(2)} m³`);
    expect(midioElCupo()).toBe(false);
    expect(H.estado.updates).toHaveLength(0);
    expect(H.estado.audit).toHaveLength(0);

    // La importación, con ESA misma revisión: rechaza sin motivo y registra el mismo exceso con él.
    H.estado.rev = { yaImportada: null, avisos: [], trozas: [], talas: g.talas };
    const sinMotivo = await importar();
    expect(sinMotivo).toMatchObject({ estado: "rechazada", codigo: "T9_CUPO_ESPECIE" });
    expect(sinMotivo.mensaje).toContain(`${fmtM3(7)} de ${fmtM3(5)} m³`);
    expect((await importar({ motivoSobreCupo: MOTIVO, puedeExcederCupo: true })).estado).toBe("importada");
    expect(String(H.estado.audit[0].detail)).toContain(`exceso ${fmtM3(2)} m³`);
  });

  it("nueva + dos ampliadas: la vista dice 8 de 7 (exceso 1), lo mismo que el evento de la importación", async () => {
    guiaConTres();
    const vista = await vistaDelCupo(true);
    expect(vista).toEqual([expect.objectContaining({ especie: "Tornillo", cupoM3: 7, totalConLaGuiaM3: 8, excesoM3: 1, exigeMotivo: true })]);
    expect(await importar({ motivoSobreCupo: MOTIVO, puedeExcederCupo: true })).toMatchObject({ estado: "importada" });
    expect(String(H.estado.audit[0].detail)).toContain(`exceso ${fmtM3(vista[0].excesoM3)} m³`);
  });

  it("crearTala=false: las ampliaciones se escriben y se miden igual (6 de 7: sin exceso en la vista, la importación entra sin motivo)", async () => {
    guiaConTres();
    expect(await vistaDelCupo(false)).toEqual([]);
    const r = await importar({ crearTala: false });
    expect(r.estado).toBe("importada");
    expect(midioElCupo()).toBe(true);
    expect(H.estado.orden).toEqual(["update 001-TOR", "update 002-TOR"]);
  });

  it("dentro del cupo (3 → 3,8) → la vista no avisa", async () => {
    guiaQueAgranda(3.8);
    expect(await vistaDelCupo(true)).toEqual([]);
  });
});

describe("POST /api/admin/forestal/loth/importar-guia — el motivo del cuerpo, el rol de la sesión", () => {
  let ip = 0;
  const FICHA = { gtfNumber: GTF, numeroRegistro: "R-99", fechaExpedicion: "15/09/2026", estado: "Vigente", trozas: [] };
  const post = (item: Record<string, unknown> = {}) =>
    postImportar(
      new NextRequest("http://localhost/api/admin/forestal/loth/importar-guia", {
        method: "POST",
        headers: { cookie: "buleje-admin-sess=token-falso", "content-type": "application/json", "x-forwarded-for": `10.9.0.${++ip}` },
        body: JSON.stringify({
          items: [{ fuente: { tipo: "ctp", woodEntryId: "w1" }, planDestino: { tipo: "existente", planId: "P1" }, crearTala: true, ...item }],
        }),
      }),
    );

  beforeEach(() => {
    H.estado.payload = { username: "qa-admin", role: "admin", tenantId: T };
    H.estado.resueltas = [{ clave: "ctp:w1", fuente: { tipo: "ctp", woodEntryId: "w1" }, ficha: FICHA, verificada: true, falla: null, planElegido: null }];
    guiaQueAgranda(6);
  });

  it("sin motivo → la guía vuelve rechazada con T9_CUPO_ESPECIE, sin escribir", async () => {
    const r = await post();
    expect(r.status).toBe(200);
    expect((await r.json()).resultados[0]).toMatchObject({ estado: "rechazada", codigo: "T9_CUPO_ESPECIE" });
    expect(H.estado.updates).toHaveLength(0);
    expect(H.estado.audit).toHaveLength(0);
  });

  it("con motivo (admin) → importada + `loth_tala_sobre_cupo` con el motivo limpio y el usuario de la sesión", async () => {
    const r = await post({ motivoSobreCupo: `  ${MOTIVO}\u200B ` });
    expect(r.status).toBe(201);
    expect((await r.json()).resultados[0].estado).toBe("importada");
    expect(H.estado.audit).toEqual([expect.objectContaining({ tenantId: T, action: "loth_tala_sobre_cupo", user: "qa-admin" })]);
    expect(String(H.estado.audit[0].detail)).toContain(`Motivo: ${MOTIVO}]`);
  });

  it("el cuerpo no decide el rol: `puedeExcederCupo:false` en el ítem se ignora (sale del JWT)", async () => {
    const r = await post({ motivoSobreCupo: MOTIVO, puedeExcederCupo: false });
    expect((await r.json()).resultados[0].estado).toBe("importada");
  });

  it("motivo en el cuerpo pero rol encargado → 403, nada escrito", async () => {
    H.estado.payload = { username: "enc", role: "manager", tenantId: T };
    const r = await post({ motivoSobreCupo: MOTIVO });
    expect(r.status).toBe(403);
    expect(H.estado.updates).toHaveLength(0);
    expect(H.estado.audit).toHaveLength(0);
  });

  it("motivo sin 5 letras («.....», «abc» + invisibles) → 400 antes de tocar la base", async () => {
    for (const malo of [".....", "abc\u3164\u3164\u3164"]) {
      const r = await post({ motivoSobreCupo: malo });
      expect(r.status).toBe(400);
      // UN mensaje, no el mismo dos veces.
      expect((await r.json()).issues).toHaveLength(1);
    }
    expect(H.estado.executeRaw).toHaveLength(0);
  });

  it("sin sesión → 401", async () => {
    H.estado.payload = null;
    expect((await post({ motivoSobreCupo: MOTIVO })).status).toBe(401);
  });
});
