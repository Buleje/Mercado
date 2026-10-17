/**
 * POST /api/fiados/[id]/pagar — roles y paso a la caja.
 * Con `aCaja` el cobro mete plata en la caja: sólo admin (y su tier) y cajero,
 * igual que /cobrar y /cobro-masivo. VENCIDO también se cobra.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { mockRequireAdmin, mockGetById, mockRegisterPago, mockUpdateStatus, mockUpdateDescripcion } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockGetById: vi.fn(),
  mockRegisterPago: vi.fn(),
  mockUpdateStatus: vi.fn(),
  mockUpdateDescripcion: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/db/fiados.db", () => {
  class FiadoConflictError extends Error {}
  class FiadoOverpaymentError extends Error {}
  return {
    FiadosDB: {
      getById: mockGetById,
      registerPago: mockRegisterPago,
      updateStatus: mockUpdateStatus,
      updateDescripcion: mockUpdateDescripcion,
    },
    FiadoConflictError,
    FiadoOverpaymentError,
  };
});
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const SESION = { role: "cajero" as const, username: "caja1", tenantId: "t-1" };
const ctx = { params: Promise.resolve({ id: "f1" }) };

function pedido(body: unknown) {
  return new NextRequest("http://localhost/api/fiados/f1/pagar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/fiados/[id]/pagar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(SESION);
  });

  it("pide admin o cajero (almacenero/analista/repartidor no cobran a la caja)", async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({ error: "Prohibido" }, { status: 403 }));
    const { POST } = await import("@/app/api/fiados/[id]/pagar/route");
    const res = await POST(pedido({ monto: 5 }), ctx);
    expect(res.status).toBe(403);
    expect(mockRequireAdmin).toHaveBeenCalledWith(expect.anything(), ["admin", "cajero"]);
    expect(mockRegisterPago).not.toHaveBeenCalled();
  });

  it("un fiado VENCIDO con aCaja llega a registerPago con la caja y el medio", async () => {
    mockGetById.mockResolvedValue({ id: "f1", tenantId: "t-1", status: "VENCIDO", customerName: "Rosa", customerId: "987000001", saldo: 30.3 });
    mockRegisterPago.mockResolvedValue({ id: "f1", saldo: 20.3 });
    const { POST } = await import("@/app/api/fiados/[id]/pagar/route");
    const res = await POST(pedido({ monto: 10, metodo: "yape", aCaja: true }), ctx);
    expect(res.status).toBe(200);
    expect(mockRegisterPago).toHaveBeenCalledTimes(1);
    const [tenantId, id, monto, , caja] = mockRegisterPago.mock.calls[0];
    expect([tenantId, id, monto]).toEqual(["t-1", "f1", 10]);
    expect(caja).toMatchObject({ metodo: "yape" });
    expect(String(caja.etiqueta)).toContain("Rosa");
  });

  it("sin aCaja no toca la caja", async () => {
    mockGetById.mockResolvedValue({ id: "f1", tenantId: "t-1", status: "ACTIVO", customerName: "Rosa", customerId: "987000001", saldo: 30.3 });
    mockRegisterPago.mockResolvedValue({ id: "f1", saldo: 25.3 });
    const { POST } = await import("@/app/api/fiados/[id]/pagar/route");
    await POST(pedido({ monto: 5 }), ctx);
    expect(mockRegisterPago.mock.calls[0][4]).toBeUndefined();
  });
});

/**
 * /api/fiados/[id] — ver un fiado y cambiarlo. Ver: admin y cajero (datos
 * personales, Ley 29733). Cambiar el estado (PAGADO/CANCELADO = perdonar la
 * deuda sin plata): sólo admin y su nivel. La cajera sí anota la descripción.
 */
describe("/api/fiados/[id] — roles", () => {
  const FIADO = { id: "f1", tenantId: "t-1", status: "ACTIVO", customerName: "Rosa", customerId: "987000001", saldo: 30 };
  const PROHIBIDO = () => NextResponse.json({ error: "forbidden" }, { status: 403 });
  function patch(body: unknown) {
    return new NextRequest("http://localhost/api/fiados/f1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetById.mockResolvedValue(FIADO);
  });

  it("GET pide admin o cajero: el almacenero recibe 403", async () => {
    mockRequireAdmin.mockResolvedValue(PROHIBIDO());
    const { GET } = await import("@/app/api/fiados/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/fiados/f1"), ctx);
    expect(res.status).toBe(403);
    expect(mockRequireAdmin).toHaveBeenCalledWith(expect.anything(), ["admin", "cajero"]);
    expect(mockGetById).not.toHaveBeenCalled();
  });

  it("PATCH del almacenero: 403 y no toca el fiado", async () => {
    mockRequireAdmin.mockResolvedValue(PROHIBIDO());
    const { PATCH } = await import("@/app/api/fiados/[id]/route");
    const res = await PATCH(patch({ status: "PAGADO" }), ctx);
    expect(res.status).toBe(403);
    expect(mockRequireAdmin).toHaveBeenCalledWith(expect.anything(), ["admin", "cajero"]);
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it("PATCH de la cajera con status: 403 (no perdona deudas)", async () => {
    mockRequireAdmin.mockResolvedValue(SESION);
    const { PATCH } = await import("@/app/api/fiados/[id]/route");
    for (const status of ["PAGADO", "CANCELADO"]) {
      const res = await PATCH(patch({ status }), ctx);
      expect(res.status).toBe(403);
    }
    // Con descripción y status juntos tampoco: no se aplica ni la mitad.
    const mixto = await PATCH(patch({ status: "PAGADO", descripcion: "firmó" }), ctx);
    expect(mixto.status).toBe(403);
    expect(mockUpdateStatus).not.toHaveBeenCalled();
    expect(mockUpdateDescripcion).not.toHaveBeenCalled();
  });

  it("PATCH de la cajera sólo con descripción: 200", async () => {
    mockRequireAdmin.mockResolvedValue(SESION);
    mockUpdateDescripcion.mockResolvedValue({ ...FIADO, descripcion: "firmó compromiso" });
    const { PATCH } = await import("@/app/api/fiados/[id]/route");
    const res = await PATCH(patch({ descripcion: "firmó compromiso" }), ctx);
    expect(res.status).toBe(200);
    expect(mockUpdateDescripcion).toHaveBeenCalledWith("t-1", "f1", "firmó compromiso");
  });

  it("PATCH del admin con status: 200", async () => {
    mockRequireAdmin.mockResolvedValue({ ...SESION, role: "admin", username: "dueno" });
    mockUpdateStatus.mockResolvedValue({ ...FIADO, status: "CANCELADO" });
    const { PATCH } = await import("@/app/api/fiados/[id]/route");
    const res = await PATCH(patch({ status: "CANCELADO" }), ctx);
    expect(res.status).toBe(200);
    expect(mockUpdateStatus).toHaveBeenCalledWith("t-1", "f1", "CANCELADO");
  });

  it("PATCH de un fiado de otro negocio: 404", async () => {
    mockRequireAdmin.mockResolvedValue({ ...SESION, role: "admin" });
    mockGetById.mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/fiados/[id]/route");
    const res = await PATCH(patch({ status: "PAGADO" }), ctx);
    expect(res.status).toBe(404);
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });
});
