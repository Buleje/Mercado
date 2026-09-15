/**
 * __tests__/rrhh-desde-adelantos-route.test.ts
 *
 * `GET/POST /api/rrhh/colaboradores/desde-adelantos` son de nivel `completo`
 * (admin/owner) — ni `gestion` (manager) ni `marcar` (almacenero/cajero)
 * pueden verlos ni traer gente, aunque `requireAdmin` los deje pasar (manager
 * es management-tier y `requireAdmin` lo bypassea; el 403 real lo pone el
 * segundo chequeo de `nivel` en la ruta — esto es lo que fija este test).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: vi.fn(() => null) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const mockRequireAdmin = vi.fn();
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));

const mockCandidatos = vi.fn();
const mockTraer = vi.fn();
vi.mock("@/lib/db/rrhh-colaboradores.db", () => ({
  ColaboradoresDB: { candidatosDesdeAdelantos: mockCandidatos, traerDesdeAdelantos: mockTraer },
}));

const { GET, POST } = await import("@/app/api/rrhh/colaboradores/desde-adelantos/route");

function getReq(): NextRequest {
  return new NextRequest("https://host/api/rrhh/colaboradores/desde-adelantos", { method: "GET" });
}
function postReq(body: unknown): NextRequest {
  return new NextRequest("https://host/api/rrhh/colaboradores/desde-adelantos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function auth(role: string) {
  return { tenantId: "t1", username: "qauser", role };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCandidatos.mockResolvedValue({ candidatos: [], yaVinculados: 0 });
  mockTraer.mockResolvedValue({ creados: [], omitidos: [] });
});

describe.each([
  ["gestion (manager)", "manager"],
  ["marcar (almacenero)", "almacenero"],
])("nivel %s → 403 en las dos rutas", (_label, role) => {
  it(`GET con rol ${role} → 403, no llama a la DB`, async () => {
    mockRequireAdmin.mockResolvedValue(auth(role));
    const res = await GET(getReq());
    expect(res.status).toBe(403);
    expect(mockCandidatos).not.toHaveBeenCalled();
  });

  it(`POST con rol ${role} → 403, no llama a la DB`, async () => {
    mockRequireAdmin.mockResolvedValue(auth(role));
    const res = await POST(postReq({ beneficiarioIds: ["b1"] }));
    expect(res.status).toBe(403);
    expect(mockTraer).not.toHaveBeenCalled();
  });
});

describe("nivel completo (admin/owner) — pasa", () => {
  it("GET con admin → 200, llama a candidatosDesdeAdelantos con el tenant del auth", async () => {
    mockRequireAdmin.mockResolvedValue(auth("admin"));
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect(mockCandidatos).toHaveBeenCalledWith("t1");
  });

  it("POST con owner → 200, llama a traerDesdeAdelantos con el body validado", async () => {
    mockRequireAdmin.mockResolvedValue(auth("owner"));
    const res = await POST(postReq({ beneficiarioIds: ["b1", "b2"] }));
    expect(res.status).toBe(200);
    expect(mockTraer).toHaveBeenCalledWith("t1", expect.objectContaining({ beneficiarioIds: ["b1", "b2"] }), "qauser");
  });

  it("POST sin beneficiarioIds → 422, no llama a la DB", async () => {
    mockRequireAdmin.mockResolvedValue(auth("admin"));
    const res = await POST(postReq({}));
    expect(res.status).toBe(422);
    expect(mockTraer).not.toHaveBeenCalled();
  });
});
