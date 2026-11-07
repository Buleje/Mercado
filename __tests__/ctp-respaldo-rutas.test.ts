/**
 * ADR-530 — rutas de respaldos del libro: el encargado (`manager`) no guarda,
 * borra, compara, recupera ni descarga (requireAdmin lo deja pasar siempre, el
 * corte es `soloAdminODueno`), y comparar/recuperar tienen cupo propio.
 * El mock de requireAdmin devuelve el ROL de la sesión y se mira la respuesta.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  cupo: vi.fn(async () => true),
  db: {
    crear: vi.fn(),
    eliminar: vi.fn(),
    comparar: vi.fn(),
    recuperar: vi.fn(),
    descargar: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: H.requireAdmin }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: vi.fn(() => null) }));
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(() => null),
  createDistributedRateLimiter: vi.fn(() => ({ check: H.cupo, remaining: vi.fn(async () => 1), windowMs: 60_000, distributed: false })),
}));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: vi.fn(async () => true) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/db/forest-ctp-respaldo.db", () => {
  class RespaldoError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    ForestCtpRespaldoDB: H.db,
    RespaldoError,
    ESTADO_HTTP_RESPALDO: { NO_EXISTE: 404, TOPE_MANUALES: 409, LIBRO_CAMBIO: 409, NO_SE_PUEDE: 422, RESPALDO_PREVIO: 503, SOLO_MANUALES: 409, SIN_AUDITORIA: 503 },
  };
});

const lista = await import("@/app/api/admin/forestal/ctp/respaldos/route");
const uno = await import("@/app/api/admin/forestal/ctp/respaldos/[id]/route");
const comparar = await import("@/app/api/admin/forestal/ctp/respaldos/[id]/comparar/route");
const recuperar = await import("@/app/api/admin/forestal/ctp/respaldos/[id]/recuperar/route");
const descargar = await import("@/app/api/admin/forestal/ctp/respaldos/[id]/descargar/route");
const { RespaldoError } = await import("@/lib/db/forest-ctp-respaldo.db");

const ID = "cmrespaldo0000000000000001";
const BASE = "https://host/api/admin/forestal/ctp/respaldos";
const ctx = { params: Promise.resolve({ id: ID }) };
const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(url, { method, ...(body ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}) });
const sesion = (role: string) => ({ tenantId: "tenant-del-jwt", username: "quien", role });

const LLAMADAS = [
  ["guardar", () => lista.POST(req(BASE, "POST", {}), { params: Promise.resolve({}) } as never), H.db.crear],
  ["borrar", () => uno.DELETE(req(`${BASE}/${ID}`, "DELETE"), ctx), H.db.eliminar],
  ["comparar", () => comparar.GET(req(`${BASE}/${ID}/comparar`), ctx), H.db.comparar],
  ["recuperar", () => recuperar.POST(req(`${BASE}/${ID}/recuperar`, "POST", { seleccion: "todo_lo_borrado", esperado: "a".repeat(64) }), ctx), H.db.recuperar],
  ["descargar", () => descargar.GET(req(`${BASE}/${ID}/descargar`), ctx), H.db.descargar],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  H.cupo.mockResolvedValue(true);
});

describe("respaldos del libro: solo admin o dueño", () => {
  it.each(LLAMADAS)("encargado (manager) → 403 al %s, sin tocar la base", async (_que, llamar, metodo) => {
    H.requireAdmin.mockResolvedValue(sesion("manager"));
    const res = await llamar();
    expect(res.status).toBe(403);
    expect(metodo).not.toHaveBeenCalled();
  });

  it("el dueño compara", async () => {
    H.requireAdmin.mockResolvedValue(sesion("owner"));
    H.db.comparar.mockResolvedValue({ grupos: [] });
    const res = await comparar.GET(req(`${BASE}/${ID}/comparar`), ctx);
    expect(res.status).toBe(200);
    expect(H.db.comparar).toHaveBeenCalledWith("tenant-del-jwt", ID);
  });
});

describe("cupo propio y auditoría", () => {
  it.each([LLAMADAS[2], LLAMADAS[3]])("%s sin cupo → 429 sin leer el libro", async (_que, llamar, metodo) => {
    H.requireAdmin.mockResolvedValue(sesion("admin"));
    H.cupo.mockResolvedValue(false);
    const res = await llamar();
    expect(res.status).toBe(429);
    expect(metodo).not.toHaveBeenCalled();
    expect(H.cupo).toHaveBeenCalledWith("tenant-del-jwt:quien");
  });

  it("descargar sin asiento de auditoría → 503, no sale el archivo", async () => {
    H.requireAdmin.mockResolvedValue(sesion("admin"));
    H.db.descargar.mockRejectedValue(new RespaldoError("SIN_AUDITORIA" as never, "No se pudo anotar quién descarga el respaldo."));
    const res = await descargar.GET(req(`${BASE}/${ID}/descargar`), ctx);
    expect(res.status).toBe(503);
    expect(res.headers.get("Content-Disposition")).toBeNull();
  });
});
