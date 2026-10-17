/**
 * __tests__/contratos-colaborador-cruce.test.ts
 *
 * ADR-414 §6 — `Contract.colaboradorId` se relee SIEMPRE con `tenantId` antes
 * de guardar (mismo criterio IDOR que `beneficiarioId`/`puestoId`). Un id que
 * pertenece a OTRO tenant nunca puede vincularse a un contrato: 422
 * `colaborador_no_encontrado`, y el contrato NO se toca.
 *
 * MEDIO de la revisión 2026-09-14: no había test de este cruce.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () => ({ tenantId: "tenant-a", username: "qaadmin", role: "admin" })),
}));

vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(() => null),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/audit-logger", () => ({
  logAudit: vi.fn(),
}));

const mockExiste = vi.fn();
vi.mock("@/lib/db/rrhh-colaboradores.db", () => ({
  ColaboradoresDB: { existe: mockExiste },
}));

const mockCreate = vi.fn();
const mockAddEvent = vi.fn();
const mockGetById = vi.fn();
const mockUpdate = vi.fn();
vi.mock("@/lib/db/contracts.db", () => ({
  ContractsDB: {
    create: mockCreate,
    addEvent: mockAddEvent,
    getById: mockGetById,
    update: mockUpdate,
  },
}));

// Import DESPUÉS de los mocks (los handlers capturan las referencias mockeadas).
const { POST } = await import("@/app/api/contratos/route");
const { PUT } = await import("@/app/api/contratos/[id]/route");

function postReq(body: unknown): NextRequest {
  return new NextRequest("https://host/api/contratos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function putReq(body: unknown): NextRequest {
  return new NextRequest("https://host/api/contratos/c1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const contratoBase = { tipo: "SERVICIO", clienteNombre: "Rosa Gutiérrez", fecha: "2026-01-01" };
const CTX = { params: Promise.resolve({ id: "c1" }) };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/contratos — colaboradorId se relee con tenantId", () => {
  it("un id de OTRO tenant → 422 colaborador_no_encontrado, NO crea el contrato", async () => {
    mockExiste.mockResolvedValue(false);
    const res = await POST(postReq({ ...contratoBase, colaboradorId: "ajeno-1" }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("colaborador_no_encontrado");
    expect(mockExiste).toHaveBeenCalledWith("tenant-a", "ajeno-1");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("CONTROL NEGATIVO: un id del MISMO tenant sí crea el contrato con ese colaboradorId", async () => {
    mockExiste.mockResolvedValue(true);
    mockCreate.mockResolvedValue({ id: "c1", numero: "CONT-2026-0001", monto: 0 });
    const res = await POST(postReq({ ...contratoBase, colaboradorId: "propio-1" }));
    expect(res.status).toBe(201);
    expect(mockExiste).toHaveBeenCalledWith("tenant-a", "propio-1");
    expect(mockCreate).toHaveBeenCalledWith("tenant-a", expect.objectContaining({ colaboradorId: "propio-1" }));
  });

  it("sin colaboradorId: ni se llama a existe, crea normal", async () => {
    mockCreate.mockResolvedValue({ id: "c2", numero: "CONT-2026-0002", monto: 0 });
    const res = await POST(postReq(contratoBase));
    expect(res.status).toBe(201);
    expect(mockExiste).not.toHaveBeenCalled();
  });
});

describe("PUT /api/contratos/[id] — colaboradorId se relee con tenantId", () => {
  const actual = { id: "c1", tenantId: "tenant-a", estado: "VIGENTE", firmadoEn: null, fechaInicio: "2026-01-01T12:00:00.000Z" };

  it("un id de OTRO tenant → 422 colaborador_no_encontrado, NO actualiza", async () => {
    mockExiste.mockResolvedValue(false);
    mockGetById.mockResolvedValue(actual);
    const res = await PUT(putReq({ colaboradorId: "ajeno-1" }), CTX);
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("colaborador_no_encontrado");
    expect(mockExiste).toHaveBeenCalledWith("tenant-a", "ajeno-1");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("CONTROL NEGATIVO: un id del MISMO tenant sí actualiza", async () => {
    mockExiste.mockResolvedValue(true);
    mockGetById.mockResolvedValue(actual);
    mockUpdate.mockResolvedValue({ ...actual, numero: "CONT-2026-0001", colaboradorId: "propio-1" });
    const res = await PUT(putReq({ colaboradorId: "propio-1" }), CTX);
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith("tenant-a", "c1", expect.objectContaining({ colaboradorId: "propio-1" }));
  });
});
