/**
 * Me deben: antigüedad ≠ vencimiento (auditoría 15-10, H03/M31/M33).
 *
 * - Un deudor sin ninguna fecha no cae en los tramos de mora por los días que
 *   lleva abierto: va a «Sin plazo».
 * - PATCH /api/fiados/[id] { fechaVence } pone el plazo sólo si no había, de
 *   hoy a un año, y nunca hacia atrás (vencería al instante y podría bloquear
 *   al cliente).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { cajonDelDeudor, validarPlazoNuevo } from "@/lib/fiados/plazo";
import { deudoresDeCobranza } from "@/lib/fiados/urgencia-cobranza";

const { mockRequireAdmin, mockGetById, mockPonerFechaVence } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockGetById: vi.fn(),
  mockPonerFechaVence: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/db/fiados.db", () => ({
  FiadosDB: { getById: mockGetById, ponerFechaVence: mockPonerFechaVence, updateStatus: vi.fn(), updateDescripcion: vi.fn() },
}));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const AHORA = Date.parse("2026-10-17T15:00:00.000Z");

describe("cajonDelDeudor", () => {
  it("sin fecha y 40 días abierto: «sinplazo», no «31 a 60»", () => {
    const [d] = deudoresDeCobranza([{ id: "f1", customerId: "987", saldo: 50, status: "ACTIVO", createdAt: "2026-09-07T15:00:00.000Z" }], AHORA);
    expect(d.base).toBe("antiguedad");
    expect(d.dias).toBe(40);
    expect(cajonDelDeudor(d)).toBe("sinplazo");
  });

  it("vencido hace 40 días: sí es «31 a 60»", () => {
    const [d] = deudoresDeCobranza([{ id: "f1", customerId: "987", saldo: 50, status: "VENCIDO", createdAt: "2026-08-01T15:00:00.000Z", fechaVence: "2026-09-07T00:00:00.000Z" }], AHORA);
    expect(cajonDelDeudor(d)).toBe("t60");
  });

  it("con fecha que todavía no llega: al día", () => {
    const [d] = deudoresDeCobranza([{ id: "f1", customerId: "987", saldo: 50, status: "ACTIVO", createdAt: "2026-08-01T15:00:00.000Z", fechaVence: "2026-10-30T00:00:00.000Z" }], AHORA);
    expect(cajonDelDeudor(d)).toBe("corriente");
  });
});

describe("validarPlazoNuevo", () => {
  it("hoy y dentro del año: vale", () => {
    expect(validarPlazoNuevo("2026-10-17", "2026-10-17")).toBeNull();
    expect(validarPlazoNuevo("2027-10-17", "2026-10-17")).toBeNull();
  });
  it("ayer, más de un año o un día que no existe: no", () => {
    expect(validarPlazoNuevo("2026-10-16", "2026-10-17")).toMatch(/anterior a hoy/);
    expect(validarPlazoNuevo("2027-10-18", "2026-10-17")).toMatch(/un año/);
    expect(validarPlazoNuevo("2026-02-30", "2026-10-17")).toBe("Fecha inválida");
  });
});

describe("PATCH /api/fiados/[id] { fechaVence }", () => {
  const ctx = { params: Promise.resolve({ id: "f1" }) };
  const pedido = (body: unknown) =>
    new NextRequest("http://localhost/api/fiados/f1", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const manana = () => {
    const d = new Date(Date.now() + 2 * 86_400_000);
    return d.toISOString().slice(0, 10);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ role: "cajero", username: "caja1", tenantId: "t-1" });
  });

  it("fiado abierto sin fecha: la pone, como medianoche UTC del día elegido", async () => {
    mockGetById.mockResolvedValue({ id: "f1", tenantId: "t-1", status: "ACTIVO", fechaVence: undefined });
    mockPonerFechaVence.mockResolvedValue({ id: "f1", fechaVence: `${manana()}T00:00:00.000Z` });
    const { PATCH } = await import("@/app/api/fiados/[id]/route");
    const res = await PATCH(pedido({ fechaVence: manana() }), ctx);
    expect(res.status).toBe(200);
    const [tenantId, id, fecha] = mockPonerFechaVence.mock.calls[0];
    expect([tenantId, id, (fecha as Date).toISOString()]).toEqual(["t-1", "f1", `${manana()}T00:00:00.000Z`]);
  });

  it("ya tenía fecha: 409, no la mueve", async () => {
    mockGetById.mockResolvedValue({ id: "f1", tenantId: "t-1", status: "ACTIVO", fechaVence: "2026-10-20T00:00:00.000Z" });
    const { PATCH } = await import("@/app/api/fiados/[id]/route");
    const res = await PATCH(pedido({ fechaVence: manana() }), ctx);
    expect(res.status).toBe(409);
    expect(mockPonerFechaVence).not.toHaveBeenCalled();
  });

  it("fecha pasada: 400", async () => {
    mockGetById.mockResolvedValue({ id: "f1", tenantId: "t-1", status: "ACTIVO" });
    const { PATCH } = await import("@/app/api/fiados/[id]/route");
    const res = await PATCH(pedido({ fechaVence: "2020-01-01" }), ctx);
    expect(res.status).toBe(400);
    expect(mockPonerFechaVence).not.toHaveBeenCalled();
  });

  it("fiado pagado: 409", async () => {
    mockGetById.mockResolvedValue({ id: "f1", tenantId: "t-1", status: "PAGADO" });
    const { PATCH } = await import("@/app/api/fiados/[id]/route");
    const res = await PATCH(pedido({ fechaVence: manana() }), ctx);
    expect(res.status).toBe(409);
  });

  it("carrera: la DB no actualiza (alguien la puso antes) → 409", async () => {
    mockGetById.mockResolvedValue({ id: "f1", tenantId: "t-1", status: "ACTIVO" });
    mockPonerFechaVence.mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/fiados/[id]/route");
    const res = await PATCH(pedido({ fechaVence: manana() }), ctx);
    expect(res.status).toBe(409);
  });
});
