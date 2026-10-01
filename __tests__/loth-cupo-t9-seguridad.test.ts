/**
 * T9 · auditoría de seguridad (30-09). Cada hallazgo con su test, contra
 * `ForestLothDB.create` con un `prisma` falso (sin base en el sandbox: la suite
 * real `forestal-loth-invariantes` se salta sola).
 *
 *  ALTO 1 · la especie la pone el CENSO, no el navegador («Tornilo» no esquiva el cupo).
 *  ALTO 2 · el planId se valida: inexistente/ajeno → 422; distinto al del árbol → 422;
 *           sin planId, se toma el del árbol del censo.
 *  MEDIO  · la excepción sobre lo AUTORIZADO sólo la asienta admin/owner (403).
 *  BAJO   · el motivo exige 5 letras de verdad (no «.....» ni invisibles).
 *  BAJO   · el evento sobre-cupo se audita DENTRO de la tx de la tala.
 *  BAJO   · el lock del cupo usa dos claves int4 (tenant, plan+especie), con parámetros.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown>;

const H = vi.hoisted(() => {
  const estado = {
    enTx: false,
    planes: [] as { id: string; tenantId: string }[],
    censo: [] as Fila[],
    autorizadas: [] as Fila[],
    talas: [] as Fila[],
    creadas: [] as Fila[],
    auditEnTx: [] as { data: Fila; enTx: boolean }[],
    auditFuera: [] as Fila[],
    executeRaw: [] as { sql: string; values: unknown[] }[],
    getPlan: [] as unknown[][],
  };
  const deTenant = (where: Fila) => (f: Fila) =>
    f.tenantId === where.tenantId &&
    (where.treeCode == null || typeof where.treeCode !== "string" || f.treeCode === where.treeCode) &&
    (where.planId == null || f.planId === where.planId);
  const censoDelegate = {
    findFirst: async ({ where }: { where: Fila }) => estado.censo.find(deTenant(where)) ?? null,
    findMany: async ({ where }: { where: Fila }) => estado.censo.filter(deTenant(where)),
  };
  const tx = {
    $queryRaw: async () => [],
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      estado.executeRaw.push({ sql: strings.join("?"), values });
      return 1;
    },
    forestCensusTree: censoDelegate,
    forestPlanSpecies: { findMany: async ({ where }: { where: Fila }) => estado.autorizadas.filter((s) => s.planId === where.planId) },
    forestLothEntry: {
      findFirst: async () => null,
      aggregate: async () => ({ _max: { lineNo: 0 } }),
      findMany: async () => estado.talas,
      create: async ({ data }: { data: Fila }) => {
        const fila = { id: `e${estado.creadas.length + 1}`, ...data };
        estado.creadas.push(fila);
        return fila;
      },
    },
    activityLog: {
      create: async ({ data }: { data: Fila }) => {
        estado.auditEnTx.push({ data, enTx: estado.enTx });
        return data;
      },
    },
  };
  return { estado, tx, censoDelegate };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    forestCensusTree: H.censoDelegate,
    $transaction: async (fn: (t: unknown) => Promise<unknown>) => {
      H.estado.enTx = true;
      try {
        return await fn(H.tx);
      } finally {
        H.estado.enTx = false;
      }
    },
  },
}));
vi.mock("@/lib/db/forest-loth-cierre.db", () => ({ ForestLothCierreDB: { closedPeriodOf: async () => null } }));
vi.mock("@/lib/db/forest-loth-poa.db", () => ({ ForestLothPoaDB: { get: async () => ({ dmcOverrides: {} }) } }));
vi.mock("@/lib/db/forest-plan.db", () => ({
  ForestPlanDB: {
    getPlan: async (...args: unknown[]) => {
      H.estado.getPlan.push(args);
      const [tenantId, id] = args;
      return H.estado.planes.find((p) => p.tenantId === tenantId && p.id === id) ?? null;
    },
  },
}));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: () => {} }));
vi.mock("@/lib/forestal/loth-audit", () => ({
  auditLoth: (p: Fila) => {
    H.estado.auditFuera.push(p);
  },
}));

import { ForestLothDB, LothInvariantError, LothPermisoError, type LothEntryCreateInput } from "@/lib/db/forest-loth.db";
import { motivoCupoValido, notaSobreCupo, type AvisoCupo } from "@/lib/forestal/loth-cupo-especie";

const T = "tenant-blas";
const OTRO = "tenant-ajeno";

beforeEach(() => {
  Object.assign(H.estado, {
    enTx: false,
    planes: [
      { id: "P1", tenantId: T },
      { id: "P2", tenantId: T },
      { id: "PX", tenantId: OTRO },
    ],
    censo: [
      { tenantId: T, planId: "P1", treeCode: "001-TOR", speciesCommon: "Tornillo", speciesScientific: "Cedrelinga cateniformis", volumenEstimadoM3: 2.9 },
      { tenantId: T, planId: "P1", treeCode: "002-TOR", speciesCommon: "Tornillo", speciesScientific: "Cedrelinga cateniformis", volumenEstimadoM3: 3.3 },
      { tenantId: T, planId: "P1", treeCode: "010-CAT", speciesCommon: "Catahua", speciesScientific: null, volumenEstimadoM3: 2 },
    ],
    // Tornillo: 5 m³ autorizados. Ya se taló 001-TOR con 3 m³.
    autorizadas: [{ planId: "P1", speciesCommon: "Tornillo", volumenAutorizadoM3: 5, arbolesAutorizados: 2 }],
    talas: [{ treeCode: "001-TOR", speciesCommon: "Tornillo", volumeM3: 3, planId: "P1" }],
    creadas: [],
    auditEnTx: [],
    auditFuera: [],
    executeRaw: [],
    getPlan: [],
  });
});

const talar = (input: Omit<LothEntryCreateInput, "createdBy" | "section">) =>
  ForestLothDB.create(T, { section: "tala", createdBy: "qaadmin", ...input });

describe("ALTO 1 · la especie del árbol la pone el censo", () => {
  it("talar un Tornillo mandando «Tornilo» → 422 con el nombre del censo, y no se guarda nada", async () => {
    const p = talar({ treeCode: "002-TOR", speciesCommon: "Tornilo", volumeM3: 3, planId: "P1", puedeExcederCupo: true });
    await expect(p).rejects.toBeInstanceOf(LothInvariantError);
    await expect(p).rejects.toMatchObject({
      code: "TALA_ESPECIE_DISTINTA_AL_CENSO",
      message: expect.stringContaining("El árbol 002-TOR es Tornillo en el censo, no Tornilo"),
    });
    expect(H.estado.creadas).toHaveLength(0);
  });

  it("sin especie (o la misma escrita distinto) se guarda la del censo, y el cupo la mide", async () => {
    await expect(talar({ treeCode: "002-TOR", speciesCommon: "  TORNILLO ", volumeM3: 1, planId: "P1" })).resolves.toBeTruthy();
    expect(H.estado.creadas[0]).toMatchObject({ speciesCommon: "Tornillo", speciesScientific: "Cedrelinga cateniformis", planId: "P1" });
  });

  it("con la especie correcta, el exceso sobre lo autorizado sí frena (ya no se esquiva)", async () => {
    await expect(talar({ treeCode: "002-TOR", speciesCommon: null, volumeM3: 3, planId: "P1", puedeExcederCupo: true })).rejects.toMatchObject({
      code: "T9_CUPO_ESPECIE",
    });
  });
});

describe("ALTO 2 · planId validado contra el tenant y el árbol", () => {
  it("planId inventado → 422, sin tala", async () => {
    await expect(talar({ treeCode: "002-TOR", speciesCommon: "Tornillo", volumeM3: 3, planId: "P-FALSO" })).rejects.toMatchObject({
      code: "PLAN_INEXISTENTE",
    });
    expect(H.estado.creadas).toHaveLength(0);
  });

  it("planId de OTRO tenant → 422 (se busca con tenantId como 1er argumento)", async () => {
    await expect(talar({ treeCode: "002-TOR", speciesCommon: "Tornillo", volumeM3: 3, planId: "PX" })).rejects.toMatchObject({
      code: "PLAN_INEXISTENTE",
    });
    expect(H.estado.getPlan[0]).toEqual([T, "PX"]);
  });

  it("planId del tenant pero distinto al del árbol en el censo → 422", async () => {
    await expect(talar({ treeCode: "002-TOR", speciesCommon: "Tornillo", volumeM3: 3, planId: "P2" })).rejects.toMatchObject({
      code: "TALA_PLAN_DISTINTO_AL_CENSO",
    });
    expect(H.estado.creadas).toHaveLength(0);
  });

  it("sin planId, la tala toma el plan del árbol del censo (y se mide el cupo)", async () => {
    await expect(talar({ treeCode: "002-TOR", volumeM3: 1 })).resolves.toBeTruthy();
    expect(H.estado.creadas[0]).toMatchObject({ planId: "P1", speciesCommon: "Tornillo" });
    await expect(talar({ treeCode: "002-TOR", volumeM3: 3, puedeExcederCupo: true })).rejects.toMatchObject({ code: "T9_CUPO_ESPECIE" });
  });

  it("el planId de un despacho también se valida (T6/T7 miden por plan)", async () => {
    await expect(ForestLothDB.create(T, { section: "despacho_troza", trozaCode: "X", planId: "PX", createdBy: "q" })).rejects.toMatchObject({
      code: "PLAN_INEXISTENTE",
    });
  });

  it("un código libre (fuera del censo) con un plan válido se registra con lo que mandó", async () => {
    await expect(talar({ treeCode: "LIBRE-1", speciesCommon: "Tornilo", volumeM3: 50, planId: "P2" })).resolves.toBeTruthy();
    expect(H.estado.creadas[0]).toMatchObject({ planId: "P2", speciesCommon: "Tornilo" });
  });
});

describe("MEDIO · sólo admin/owner asientan la excepción sobre lo AUTORIZADO", () => {
  const exceso = { treeCode: "002-TOR", volumeM3: 3, planId: "P1", motivoSobreCupo: "Ampliación de volumen en trámite" };

  it("sin permiso → LothPermisoError aunque traiga motivo; no se guarda", async () => {
    const p = talar({ ...exceso, puedeExcederCupo: false });
    await expect(p).rejects.toBeInstanceOf(LothPermisoError);
    await expect(p).rejects.toMatchObject({ message: expect.stringContaining("Pídele al dueño o al administrador que registre esta tala") });
    expect(H.estado.creadas).toHaveLength(0);
  });

  it("con permiso y motivo → se registra con la nota", async () => {
    await expect(talar({ ...exceso, puedeExcederCupo: true })).resolves.toBeTruthy();
    expect(String(H.estado.creadas[0]?.observations)).toContain("Motivo: Ampliación de volumen en trámite");
  });

  it("contra el CENSO (sin autorizado) no cambia: un almacenero registra y queda el aviso", async () => {
    await expect(talar({ treeCode: "010-CAT", volumeM3: 9, planId: "P1", puedeExcederCupo: false })).resolves.toBeTruthy();
    expect(H.estado.auditEnTx.map((a) => a.data.action)).toEqual(["loth_tala_sobre_censo"]);
  });
});

describe("BAJO · el motivo pide letras de verdad", () => {
  it("invisibles, puntos o menos de 5 letras no alcanzan; el mismo criterio en la ruta", async () => {
    expect(motivoCupoValido("​".repeat(5))).toBe(false);
    expect(motivoCupoValido(".....")).toBe(false);
    expect(motivoCupoValido("​ab​c d.")).toBe(false);
    expect(motivoCupoValido(" 12345 ")).toBe(false);
    expect(motivoCupoValido("Árbol caído")).toBe(true);
    await expect(talar({ treeCode: "002-TOR", volumeM3: 3, planId: "P1", motivoSobreCupo: ".....", puedeExcederCupo: true })).rejects.toMatchObject({
      code: "T9_CUPO_ESPECIE",
    });
  });

  it("la nota del libro guarda el motivo sin los invisibles", () => {
    const aviso = { especie: "Tornillo", fuente: "autorizado", cupoM3: 5, taladoConEsteM3: 6, pctConEste: 120 } as AvisoCupo;
    expect(notaSobreCupo(aviso, "​ Tormenta ​")).toContain("Motivo: Tormenta]");
  });
});

describe("BAJO · la auditoría del exceso va en la MISMA tx de la tala", () => {
  it("el evento sobre-cupo se escribe dentro de la tx, con el tenant fijado para RLS", async () => {
    await talar({ treeCode: "002-TOR", volumeM3: 3, planId: "P1", motivoSobreCupo: "Ampliación en trámite", puedeExcederCupo: true });
    expect(H.estado.auditEnTx).toHaveLength(1);
    expect(H.estado.auditEnTx[0]).toMatchObject({
      enTx: true,
      data: { tenantId: T, action: "loth_tala_sobre_cupo", entity: "ForestLothEntry", entityId: "e1", user: "qaadmin" },
    });
    expect(H.estado.auditFuera.some((a) => String(a.action).startsWith("loth_tala_sobre"))).toBe(false);
    const rls = H.estado.executeRaw.find((e) => e.sql.includes("set_config('app.tenant_id'"));
    expect(rls?.values).toEqual([T]);
  });
});

describe("BAJO · lock del cupo con dos claves int4", () => {
  it("pg_advisory_xact_lock(hashtext($1), hashtext($2)) — tenant y plan+especie, parametrizados", async () => {
    await talar({ treeCode: "002-TOR", volumeM3: 1, planId: "P1" });
    const lock = H.estado.executeRaw.find((e) => e.sql.includes("pg_advisory_xact_lock"));
    expect(lock?.sql.replace(/\s+/g, "")).toBe("SELECTpg_advisory_xact_lock(hashtext(?),hashtext(?))");
    expect(lock?.values).toEqual([T, "P1:tornillo"]);
  });
});
