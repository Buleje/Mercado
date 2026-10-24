/**
 * T9 · MEDIO (auditoría 30-09): la excepción sobre lo AUTORIZADO la asienta
 * sólo el dueño o el administrador. La ruta le dice a la DB class quién puede
 * (por el rol del JWT, no por el body) y un `LothPermisoError` sale como 403
 * con el mensaje en español.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
  role: "admin",
  create: vi.fn(async (..._a: unknown[]): Promise<unknown> => ({ id: "e1" })),
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: async () => ({ tenantId: "tenant-blas", username: "u", role: H.role }),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null, getClientIp: () => "127.0.0.1" }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/db/rrhh-colaboradores.db", () => ({ ColaboradoresDB: { existe: async () => false } }));
vi.mock("@/lib/db/forest-plan.db", () => ({ ForestPlanDB: { markTreeStatusByCode: async () => undefined } }));
vi.mock("@/lib/db/forest-loth.db", async (real) => {
  const mod = (await real()) as Record<string, unknown>;
  return { ...mod, ForestLothDB: { create: (...a: unknown[]) => H.create(...a) } };
});

import { POST } from "@/app/api/admin/forestal/loth/route";
import { LothPermisoError } from "@/lib/db/forest-loth.db";

const body = { section: "tala", treeCode: "002-TOR", volumeM3: 3, motivoSobreCupo: "Ampliación en trámite", puedeExcederCupo: true };
const post = () =>
  POST(new NextRequest("http://localhost/api/admin/forestal/loth", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  H.create.mockClear();
  H.create.mockImplementation(async () => ({ id: "e1" }));
});

describe("POST /api/admin/forestal/loth · quién puede pasar el cupo autorizado", () => {
  it.each([
    ["admin", true],
    ["owner", true],
    ["almacenero", false],
    ["manager", false],
  ])("rol %s → puedeExcederCupo=%s (el body no lo decide)", async (role, puede) => {
    H.role = role;
    const res = await post();
    expect(res.status).toBe(201);
    expect(H.create).toHaveBeenCalledWith("tenant-blas", expect.objectContaining({ puedeExcederCupo: puede }));
  });

  it("LothPermisoError → 403 con el mensaje para el operador", async () => {
    H.role = "almacenero";
    H.create.mockImplementation(async () => {
      throw new LothPermisoError("Tornillo llega a 120 %. Pídele al dueño o al administrador que registre esta tala.", { especie: "Tornillo" });
    });
    const res = await post();
    expect(res.status).toBe(403);
    const j = (await res.json()) as Record<string, unknown>;
    expect(j).toMatchObject({ error: "T9_SOLO_DUENO", message: expect.stringContaining("Pídele al dueño o al administrador") });
  });
});
