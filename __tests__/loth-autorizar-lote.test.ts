/**
 * Cargar lo autorizado por especie, varias de una vez (30-09).
 *
 * Medido en Blas: el plan grande tiene 65 árboles de censo en 8 especies y
 * CERO especies autorizadas — el cupo de cada una cae a lo censado. El editor
 * que había carga de a una. Esto prueba:
 *  - la tabla trae TODAS las especies del censo, sin duplicar por tilde o por
 *    el científico entre paréntesis;
 *  - qué se manda (filas vacías no, errores sí se dicen);
 *  - el upsert por especie normalizada (corrige la que estaba, crea la nueva);
 *  - la ruta: 401 sin sesión, 404 con el plan de otro negocio, un solo guardar.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import {
  filasParaAutorizar,
  leerFilas,
  planDeUpsert,
  type FilaAutorizar,
} from "@/lib/forestal/loth-autorizar-lote";

// ─── Mocks de la DB / auth (la ruta usa la DB class REAL sobre este prisma) ──

const H = vi.hoisted(() => {
  const estado = {
    /** Planes que existen, por tenant. */
    planes: new Map<string, Set<string>>(),
    especies: [] as { id: string; tenantId: string; planId: string; speciesCommon: string; deletedAt: null }[],
    auth: { tenantId: "t-blas", role: "admin", username: "qaadmin" } as Record<string, unknown> | "401",
  };
  const locks: unknown[][] = [];
  const updates: { where: Record<string, unknown>; data: Record<string, unknown> }[] = [];
  const creates: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];
  const invalidados: string[] = [];
  return { estado, locks, updates, creates, audits, invalidados };
});

vi.mock("@/lib/prisma", () => {
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...vals: unknown[]) => {
      H.locks.push([strings.join("?"), ...vals]);
      const [planId, tenantId] = vals as string[];
      return H.estado.planes.get(tenantId)?.has(planId) ? [{ id: planId }] : [];
    },
    forestPlanSpecies: {
      findMany: async ({ where }: { where: { tenantId: string; planId: string } }) =>
        H.estado.especies.filter((e) => e.tenantId === where.tenantId && e.planId === where.planId),
      update: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        H.updates.push(args);
        return { id: args.where.id };
      },
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
        H.creates.push(...data);
        return { count: data.length };
      },
    },
  };
  return { prisma: { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } };
});
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: (p: string) => { H.invalidados.push(p); } }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: (p: Record<string, unknown>) => { H.audits.push(p); } }));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: async () =>
    H.estado.auth === "401" ? NextResponse.json({ error: "unauthorized" }, { status: 401 }) : H.estado.auth,
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));

const { ForestPlanDB, PlanNoEncontradoError, EspecieDuplicadaEnPlanError } = await import("@/lib/db/forest-plan.db");
const { PUT } = await import("@/app/api/admin/forestal/plan/species/route");

/** El censo del plan grande de Blas (65 árboles, 8 especies), resumido. */
const CENSO_BLAS = [
  ...Array.from({ length: 20 }, () => ({ speciesCommon: "Copaiba", volumenEstimadoM3: 6.5 })),
  ...Array.from({ length: 12 }, () => ({ speciesCommon: "Lupuna", volumenEstimadoM3: 9.1 })),
  ...Array.from({ length: 9 }, () => ({ speciesCommon: "Catahua", volumenEstimadoM3: 5 })),
  ...Array.from({ length: 8 }, () => ({ speciesCommon: "Mashonaste", volumenEstimadoM3: 3.2 })),
  ...Array.from({ length: 6 }, () => ({ speciesCommon: "Sapotillo", volumenEstimadoM3: 2.1 })),
  ...Array.from({ length: 4 }, () => ({ speciesCommon: "Aguanomasha", volumenEstimadoM3: 1.9 })),
  ...Array.from({ length: 3 }, () => ({ speciesCommon: "Congona", volumenEstimadoM3: 1.2 })),
  ...Array.from({ length: 3 }, () => ({ speciesCommon: "Quinilla", volumenEstimadoM3: 4.4 })),
];

const put = (body: unknown) =>
  PUT(new NextRequest("http://localhost/api/admin/forestal/plan/species", { method: "PUT", body: JSON.stringify(body) }));

beforeEach(() => {
  H.estado.planes = new Map([
    ["t-blas", new Set(["plan-grande"])],
    ["t-otro", new Set(["plan-ajeno"])],
  ]);
  H.estado.especies = [];
  H.estado.auth = { tenantId: "t-blas", role: "admin", username: "qaadmin" };
  for (const a of [H.locks, H.updates, H.creates, H.audits, H.invalidados]) a.length = 0;
});

// ─── La tabla ───────────────────────────────────────────────────────────────

describe("filasParaAutorizar", () => {
  it("el plan grande de Blas: 8 filas, una por especie, con lo censado al lado", () => {
    const filas = filasParaAutorizar(CENSO_BLAS, []);
    expect(filas.map((f) => f.especie)).toEqual([
      "Aguanomasha", "Catahua", "Congona", "Copaiba", "Lupuna", "Mashonaste", "Quinilla", "Sapotillo",
    ]);
    const copaiba = filas.find((f) => f.especie === "Copaiba");
    expect(copaiba).toMatchObject({ arbolesCensados: 20, censadoM3: 130, id: null, volumen: "", arboles: "" });
    expect(filas.reduce((s, f) => s + f.arbolesCensados, 0)).toBe(65);
  });

  it("la especie ya autorizada con el científico entre paréntesis es la MISMA fila, con sus números", () => {
    const filas = filasParaAutorizar(
      [{ speciesCommon: "Tornillo", volumenEstimadoM3: 3.1 }, { speciesCommon: "tornillo ", volumenEstimadoM3: 3.1 }],
      [{ id: "sp-1", speciesCommon: "Tornillo (Cedrelinga cateniformis)", volumenAutorizadoM3: "320.0000", arbolesAutorizados: 45 }],
    );
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ id: "sp-1", volumen: "320", arboles: "45", arbolesCensados: 2, censadoM3: 6.2 });
  });

  it("la especie pedida que no está en el censo igual tiene su fila", () => {
    const filas = filasParaAutorizar(CENSO_BLAS, [], "Shihuahuaco");
    expect(filas.some((f) => f.especie === "Shihuahuaco" && f.arbolesCensados === 0)).toBe(true);
  });
});

// ─── Lo tipeado ─────────────────────────────────────────────────────────────

const fila = (p: Partial<FilaAutorizar>): FilaAutorizar => ({
  clave: "x", especie: "X", arbolesCensados: 0, censadoM3: 0, id: null,
  volumenGuardado: null, arbolesGuardados: null, volumen: "", arboles: "", ...p,
});

describe("leerFilas", () => {
  it("las vacías no viajan; coma decimal se acepta", () => {
    const { items, errores } = leerFilas([
      fila({ clave: "copaiba", especie: "Copaiba", volumen: "120,5", arboles: "14" }),
      fila({ clave: "lupuna", especie: "Lupuna" }),
    ]);
    expect(errores).toEqual([]);
    expect(items).toEqual([{ speciesCommon: "Copaiba", volumenAutorizadoM3: 120.5, arbolesAutorizados: 14 }]);
  });

  it("árboles sin m³, m³ en cero y árboles con decimales son errores con su motivo", () => {
    const { items, errores } = leerFilas([
      fila({ clave: "a", especie: "A", arboles: "3" }),
      fila({ clave: "b", especie: "B", volumen: "0" }),
      fila({ clave: "c", especie: "C", volumen: "5", arboles: "2.5" }),
    ]);
    expect(items).toEqual([]);
    expect(errores.map((e) => e.clave)).toEqual(["a", "b", "c"]);
    expect(errores[0].motivo).toMatch(/volumen/);
  });

  it("la ya cargada sin cambios no se reenvía; con cambios, sí", () => {
    const base = { clave: "t", especie: "Tornillo", id: "sp-1", volumenGuardado: 320, arbolesGuardados: 45 };
    expect(leerFilas([fila({ ...base, volumen: "320", arboles: "45" })]).items).toEqual([]);
    expect(leerFilas([fila({ ...base, volumen: "300", arboles: "45" })]).items).toHaveLength(1);
  });
});

// ─── El upsert ──────────────────────────────────────────────────────────────

describe("planDeUpsert", () => {
  it("corrige la que estaba (por clave) y crea la nueva", () => {
    const r = planDeUpsert(
      [{ id: "sp-1", speciesCommon: "Tornillo (Cedrelinga cateniformis)" }],
      [
        { speciesCommon: "tornillo", volumenAutorizadoM3: 300, arbolesAutorizados: 40 },
        { speciesCommon: " Copaiba ", volumenAutorizadoM3: 120.5, arbolesAutorizados: null },
      ],
    );
    expect(r.actualizar).toEqual([{ id: "sp-1", speciesCommon: "tornillo", volumenAutorizadoM3: 300, arbolesAutorizados: 40 }]);
    expect(r.crear).toEqual([{ speciesCommon: "Copaiba", volumenAutorizadoM3: 120.5, arbolesAutorizados: null }]);
  });

  it("la misma especie dos veces en el pedido (con y sin tilde) no se adivina", () => {
    const r = planDeUpsert([], [
      { speciesCommon: "Catahua", volumenAutorizadoM3: 1, arbolesAutorizados: null },
      { speciesCommon: "catáhua", volumenAutorizadoM3: 2, arbolesAutorizados: null },
    ]);
    expect(r.repetidas).toEqual(["catáhua"]);
  });

  it("si el plan ya la tiene dos veces, no se toca ninguna", () => {
    const r = planDeUpsert(
      [{ id: "a", speciesCommon: "Lupuna" }, { id: "b", speciesCommon: "lupuna" }],
      [{ speciesCommon: "Lupuna", volumenAutorizadoM3: 9, arbolesAutorizados: null }],
    );
    expect(r).toMatchObject({ actualizar: [], crear: [], duplicadasEnPlan: ["Lupuna"] });
  });
});

// ─── La DB class ────────────────────────────────────────────────────────────

describe("ForestPlanDB.guardarAutorizadasLote", () => {
  it("bloquea el plan con tenantId en el WHERE, crea y corrige en una tx, audita e invalida", async () => {
    H.estado.especies = [{ id: "sp-1", tenantId: "t-blas", planId: "plan-grande", speciesCommon: "Tornillo", deletedAt: null }];
    const r = await ForestPlanDB.guardarAutorizadasLote(
      "t-blas",
      "plan-grande",
      [
        { speciesCommon: "Tornillo", volumenAutorizadoM3: 320, arbolesAutorizados: 45 },
        { speciesCommon: "Copaiba", volumenAutorizadoM3: 120.5, arbolesAutorizados: 14 },
      ],
      "qaadmin",
    );
    expect(r).toEqual({ creadas: 1, actualizadas: 1 });
    expect(H.locks[0][0]).toMatch(/FOR UPDATE/);
    expect(H.locks[0].slice(1)).toEqual(["plan-grande", "t-blas"]);
    expect(H.updates[0].where).toEqual({ id: "sp-1", tenantId: "t-blas" });
    expect(H.creates[0]).toMatchObject({ tenantId: "t-blas", planId: "plan-grande", speciesCommon: "Copaiba", arbolesAutorizados: 14 });
    expect(String(H.creates[0].volumenAutorizadoM3)).toBe("120.5");
    expect(H.invalidados).toEqual(["forest-plan:t-blas"]);
    expect(H.audits[0]).toMatchObject({ action: "ctp_plan_especies_lote", entityId: "plan-grande", user: "qaadmin" });
  });

  it("el plan de otro negocio: PlanNoEncontradoError y nada escrito", async () => {
    await expect(
      ForestPlanDB.guardarAutorizadasLote("t-blas", "plan-ajeno", [{ speciesCommon: "Copaiba", volumenAutorizadoM3: 1, arbolesAutorizados: null }], "x"),
    ).rejects.toBeInstanceOf(PlanNoEncontradoError);
    expect(H.creates).toHaveLength(0);
    expect(H.audits).toHaveLength(0);
  });

  it("especie duplicada en el plan: rompe sin escribir", async () => {
    H.estado.especies = [
      { id: "a", tenantId: "t-blas", planId: "plan-grande", speciesCommon: "Lupuna", deletedAt: null },
      { id: "b", tenantId: "t-blas", planId: "plan-grande", speciesCommon: "LUPUNA", deletedAt: null },
    ];
    await expect(
      ForestPlanDB.guardarAutorizadasLote("t-blas", "plan-grande", [{ speciesCommon: "Lupuna", volumenAutorizadoM3: 9, arbolesAutorizados: null }], "x"),
    ).rejects.toBeInstanceOf(EspecieDuplicadaEnPlanError);
    expect(H.updates).toHaveLength(0);
  });
});

// ─── La ruta ────────────────────────────────────────────────────────────────

describe("PUT /api/admin/forestal/plan/species", () => {
  it("las 8 especies del censo de Blas en UNA llamada → 8 creadas", async () => {
    const especies = filasParaAutorizar(CENSO_BLAS, []).map((f, i) => ({
      speciesCommon: f.especie,
      volumenAutorizadoM3: 10 + i,
      arbolesAutorizados: f.arbolesCensados,
    }));
    const res = await put({ planId: "plan-grande", especies });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, creadas: 8, actualizadas: 0 });
    expect(H.creates.every((c) => c.tenantId === "t-blas")).toBe(true);
  });

  it("sin sesión: 401 (nunca 404)", async () => {
    H.estado.auth = "401";
    const res = await put({ planId: "plan-grande", especies: [{ speciesCommon: "Copaiba", volumenAutorizadoM3: 1 }] });
    expect(res.status).toBe(401);
  });

  it("el plan de otro negocio: 404 y nada escrito", async () => {
    const res = await put({ planId: "plan-ajeno", especies: [{ speciesCommon: "Copaiba", volumenAutorizadoM3: 1 }] });
    expect(res.status).toBe(404);
    expect(H.creates).toHaveLength(0);
  });

  it("volumen en cero o lista vacía: 400 de validación", async () => {
    expect((await put({ planId: "plan-grande", especies: [] })).status).toBe(400);
    expect((await put({ planId: "plan-grande", especies: [{ speciesCommon: "Copaiba", volumenAutorizadoM3: 0 }] })).status).toBe(400);
  });

  it("la misma especie dos veces: 400 especie_repetida", async () => {
    const res = await put({
      planId: "plan-grande",
      especies: [
        { speciesCommon: "Copaiba", volumenAutorizadoM3: 1 },
        { speciesCommon: "copaiba", volumenAutorizadoM3: 2 },
      ],
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("especie_repetida");
  });
});
