// @vitest-environment node
/**
 * Tope EXACTO de la Nota de Crédito (09-10): total con IGV contra lo que el documento cobró menos el
 * `total` de sus notas activas, en céntimos y sin tolerancia; mismo tope para ventas (saleId) y para
 * pedidos de la tienda (orderId, que antes no tenían ninguno).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { topeNotaCredito } from "@/lib/notas-credito/tope";
import { desgloseNotaCredito } from "@/lib/pos/reembolso";

const { mockGetSale, mockGetOrder, mockSumVenta, mockSumPedido, mockCreate, mockAggregate } = vi.hoisted(() => ({
  mockGetSale: vi.fn(),
  mockGetOrder: vi.fn(),
  mockSumVenta: vi.fn(),
  mockSumPedido: vi.fn(),
  mockCreate: vi.fn(),
  mockAggregate: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: { notaCredito: { aggregate: mockAggregate } } }));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(() => Promise.resolve({ role: "admin", username: "qa", tenantId: "tenant-a" })),
}));
vi.mock("@/lib/db", () => ({
  NotasCreditoDB: {
    sumActiveTotalForSale: mockSumVenta,
    sumActiveTotalForOrder: mockSumPedido,
    siguienteNumero: vi.fn(() => Promise.resolve("NC01-0001")),
    create: mockCreate,
    getAll: vi.fn(),
  },
}));
vi.mock("@/lib/db/sales.db", () => ({ SalesDB: { getById: mockGetSale } }));
vi.mock("@/lib/db/orders.db", () => ({ OrdersDB: { getById: mockGetOrder } }));
vi.mock("@/lib/db/settings.db", () => ({ SettingsDB: { get: vi.fn(() => Promise.resolve({ taxRate: 18 })) } }));
vi.mock("@/lib/audit-logger", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/admin-cache", () => ({ invalidateAdminCache: { afterDocument: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const post = (body: Record<string, unknown>) =>
  new NextRequest("http://localhost/api/notas-credito", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ motivoCodigo: "07", motivoDesc: "Devolución por ítem", ...body }),
  });

describe("topeNotaCredito (puro)", () => {
  const por = (base: number) => desgloseNotaCredito({ base }, 0.18);
  const conIgv = (totalConIgv: number) => desgloseNotaCredito({ totalConIgv }, 0.18);

  it("venta de S/ 10,06 por base 8,53: el IGV redondeado daba 10,07 (1 céntimo de más) → cierra en 10,06", () => {
    expect(por(8.53).total).toBe(10.07);
    const t = topeNotaCredito({ totalDocumento: 10.06, totalYaEmitido: 0, pedido: por(8.53), tasa: 0.18, porBase: true });
    expect(t).toMatchObject({ ok: true, desglose: { monto: 8.53, igv: 1.53, total: 10.06 }, disponible: 8.53, disponibleConIgv: 10.06 });
  });

  it("por base, una base que no cabe en la que queda no se ajusta: 400", () => {
    const t = topeNotaCredito({ totalDocumento: 10.06, totalYaEmitido: 0, pedido: por(8.54), tasa: 0.18, porBase: true });
    expect(t.ok).toBe(false);
  });

  it("con IGV incluido no hay ajuste: 10,07 contra 10,06 es 400 (antes pasaba por el céntimo de tolerancia)", () => {
    expect(topeNotaCredito({ totalDocumento: 10.06, totalYaEmitido: 0, pedido: conIgv(10.07), tasa: 0.18, porBase: false }).ok).toBe(false);
    expect(topeNotaCredito({ totalDocumento: 10.06, totalYaEmitido: 0, pedido: conIgv(10.06), tasa: 0.18, porBase: false }))
      .toMatchObject({ ok: true, desglose: { total: 10.06 } });
  });

  it("descuenta lo ya emitido CON IGV y nunca deja pasar con el documento acreditado entero", () => {
    expect(topeNotaCredito({ totalDocumento: 23.6, totalYaEmitido: 11.8, pedido: conIgv(11.8), tasa: 0.18, porBase: false }).ok).toBe(true);
    expect(topeNotaCredito({ totalDocumento: 23.6, totalYaEmitido: 11.8, pedido: conIgv(11.81), tasa: 0.18, porBase: false }).ok).toBe(false);
    const lleno = topeNotaCredito({ totalDocumento: 23.6, totalYaEmitido: 23.6, pedido: por(0.01), tasa: 0.18, porBase: true });
    expect(lleno).toMatchObject({ ok: false, disponible: 0, disponibleConIgv: 0 });
  });

  it("exonerado (tasa 0): base = total", () => {
    const t = topeNotaCredito({ totalDocumento: 50, totalYaEmitido: 0, pedido: desgloseNotaCredito({ base: 50 }, 0), tasa: 0, porBase: true });
    expect(t).toMatchObject({ ok: true, disponible: 50, desglose: { monto: 50, igv: 0, total: 50 } });
  });
});

describe("POST /api/notas-credito: tope por venta y por pedido", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSumVenta.mockResolvedValue(0);
    mockSumPedido.mockResolvedValue(0);
    mockCreate.mockImplementation((_t: string, d: Record<string, unknown>) => Promise.resolve({ id: "nc1", ...d }));
  });

  it("venta: suma `total` de la venta y guarda la nota que cierra el saldo exacto", async () => {
    const { POST } = await import("@/app/api/notas-credito/route");
    mockGetSale.mockResolvedValue({ id: "v1", total: 10.06 });
    const res = await POST(post({ saleId: "v1", monto: 8.53 }));
    expect(res.status).toBe(201);
    expect(mockSumVenta).toHaveBeenCalledWith("tenant-a", "v1");
    expect(mockCreate.mock.calls[0][1]).toMatchObject({ monto: 8.53, igv: 1.53, total: 10.06 });
  });

  it("venta: con 10,05 ya emitido, 0,02 da 400 con lo que queda", async () => {
    const { POST } = await import("@/app/api/notas-credito/route");
    mockGetSale.mockResolvedValue({ id: "v1", total: 10.06 });
    mockSumVenta.mockResolvedValue(10.05);
    const res = await POST(post({ saleId: "v1", totalConIgv: 0.02 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ saleTotal: 10.06, yaEmitidoConIgv: 10.05, disponibleConIgv: 0.01 });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("pedido: antes sin tope; ahora 400 si se pasa y 201 al justo", async () => {
    const { POST } = await import("@/app/api/notas-credito/route");
    mockGetOrder.mockResolvedValue({ id: "p1", total: 50 });
    mockSumPedido.mockResolvedValue(40);
    const pasada = await POST(post({ orderId: "p1", totalConIgv: 10.01 }));
    expect(pasada.status).toBe(400);
    const cuerpo = await pasada.json();
    expect(cuerpo.error).toContain("del pedido");
    expect(cuerpo).toMatchObject({ orderTotal: 50, yaEmitidoConIgv: 40, disponibleConIgv: 10 });
    expect(mockGetOrder).toHaveBeenCalledWith("tenant-a", "p1");
    expect(mockSumPedido).toHaveBeenCalledWith("tenant-a", "p1");
    const justa = await POST(post({ orderId: "p1", totalConIgv: 10 }));
    expect(justa.status).toBe(201);
    expect(mockCreate.mock.calls[0][1]).toMatchObject({ orderId: "p1", total: 10 });
  });

  it("pedido de otro tenant (o inexistente): 404 sin crear", async () => {
    const { POST } = await import("@/app/api/notas-credito/route");
    mockGetOrder.mockResolvedValue(null);
    const res = await POST(post({ orderId: "ajeno", totalConIgv: 1 }));
    expect(res.status).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("venta y pedido a la vez: manda el más chico", async () => {
    const { POST } = await import("@/app/api/notas-credito/route");
    mockGetSale.mockResolvedValue({ id: "v1", total: 100 });
    mockGetOrder.mockResolvedValue({ id: "p1", total: 30 });
    const res = await POST(post({ saleId: "v1", orderId: "p1", totalConIgv: 31 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("del pedido");
  });
});

describe("NotasCreditoDB: sumas por `total` sin las anuladas", () => {
  it("venta y pedido agregan `total` con el tenant y sin ANULADA", async () => {
    const { NotasCreditoDB } = await vi.importActual<typeof import("@/lib/db/notas-credito.db")>("@/lib/db/notas-credito.db");
    mockAggregate.mockResolvedValue({ _sum: { total: "12.34" } });
    expect(await NotasCreditoDB.sumActiveTotalForSale("tenant-a", "v1")).toBe(12.34);
    expect(mockAggregate).toHaveBeenLastCalledWith({
      _sum: { total: true },
      where: { tenantId: "tenant-a", saleId: "v1", status: { not: "ANULADA" } },
    });
    mockAggregate.mockResolvedValue({ _sum: { total: null } });
    expect(await NotasCreditoDB.sumActiveTotalForOrder("tenant-a", "p1")).toBe(0);
    expect(mockAggregate).toHaveBeenLastCalledWith({
      _sum: { total: true },
      where: { tenantId: "tenant-a", orderId: "p1", status: { not: "ANULADA" } },
    });
  });
});
