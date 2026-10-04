/**
 * POST /api/admin/forestal/plan/species — el plan tiene que ser de este negocio.
 * `ForestPlanSpecies.planId` no tiene FK con el tenant: sin el chequeo, una
 * especie quedaba colgada de un plan ajeno.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  planes: new Map<string, Set<string>>(),
  altas: [] as { tenantId: string; data: Record<string, unknown> }[],
}));

vi.mock("@/lib/db/forest-plan.db", () => ({
  ForestPlanDB: {
    getPlan: async (tenantId: string, id: string) => (H.planes.get(tenantId)?.has(id) ? { id, tenantId } : null),
    addSpecies: async (tenantId: string, data: Record<string, unknown>) => {
      H.altas.push({ tenantId, data });
      return { id: "sp-1", tenantId, ...data };
    },
  },
  PlanNoEncontradoError: class extends Error {},
  EspecieDuplicadaEnPlanError: class extends Error {},
}));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: async () => ({ tenantId: "t-blas", role: "admin", username: "qaadmin" }),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));

const { POST } = await import("@/app/api/admin/forestal/plan/species/route");

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/admin/forestal/plan/species", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  H.planes = new Map([
    ["t-blas", new Set(["plan-grande"])],
    ["t-otro", new Set(["plan-ajeno"])],
  ]);
  H.altas.length = 0;
});

describe("POST /api/admin/forestal/plan/species", () => {
  it("plan de otro negocio: 404 y nada escrito", async () => {
    const res = await post({ planId: "plan-ajeno", speciesCommon: "Copaiba", volumenAutorizadoM3: 50 });
    expect(res.status).toBe(404);
    expect(H.altas).toHaveLength(0);
  });

  it("plan inexistente: 404", async () => {
    expect((await post({ planId: "no-existe", speciesCommon: "Copaiba", volumenAutorizadoM3: 50 })).status).toBe(404);
  });

  it("plan propio: 201", async () => {
    const res = await post({ planId: "plan-grande", speciesCommon: "Copaiba", volumenAutorizadoM3: 50 });
    expect(res.status).toBe(201);
    expect(H.altas[0]?.tenantId).toBe("t-blas");
  });
});

void NextResponse;
