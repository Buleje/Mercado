// @vitest-environment node
/**
 * Devolución del POS (components/admin/pos/devolucion): búsqueda local de ventas, cuerpo de la
 * Nota de Crédito contra el Zod REAL de POST /api/notas-credito, y cuándo se deja repetir.
 * Antes el cuerpo mandaba `orderId`/`codigoMotivo`/`descripcionMotivo`: 400 siempre (0 NC en la base).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  coincideVenta,
  cuerpoNotaCredito,
  mensajeErrorNc,
  fallaSeguraDeRepetir,
  type ReturnItem,
  type SaleRecord,
} from "@/components/admin/pos/devolucion/devolucion-shared";

const { mockGetSale, mockSum, mockNumero, mockCreate } = vi.hoisted(() => ({
  mockGetSale: vi.fn(),
  mockSum: vi.fn(),
  mockNumero: vi.fn(),
  mockCreate: vi.fn(),
}));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(() => Promise.resolve({ role: "admin", username: "qa", tenantId: "tenant-a" })),
}));
vi.mock("@/lib/db", () => ({
  NotasCreditoDB: { sumActiveForSale: mockSum, siguienteNumero: mockNumero, create: mockCreate, getAll: vi.fn() },
}));
vi.mock("@/lib/db/sales.db", () => ({ SalesDB: { getById: mockGetSale } }));
vi.mock("@/lib/audit-logger", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/admin-cache", () => ({ invalidateAdminCache: { afterDocument: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const VENTA: SaleRecord = {
  id: "cmabc123venta",
  createdAt: "2026-10-09T15:00:00.000Z",
  total: 23.6,
  payment: "efectivo",
  customerPhone: "987000001",
  customerName: "Rosa Quispe",
  items: [
    { productId: 1, name: "Arroz Costeño 5 kg", price: 11.8, quantity: 1, unit: "und" },
    { productId: 2, name: "Leche Gloria", price: 3.93, quantity: 3, unit: "und" },
  ],
};

const item = (over: Partial<ReturnItem>): ReturnItem => ({
  productId: 1, name: "Arroz Costeño 5 kg", price: 11.8, maxQty: 1, returnQty: 0, selected: false, ...over,
});

const postNc = (body: unknown) =>
  new NextRequest("http://localhost/api/notas-credito", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("coincideVenta", () => {
  it("por número con o sin #, teléfono, cliente y producto", () => {
    expect(coincideVenta(VENTA, "#cmabc1")).toBe(true);
    expect(coincideVenta(VENTA, "cmabc1")).toBe(true);
    expect(coincideVenta(VENTA, "987000")).toBe(true);
    expect(coincideVenta(VENTA, "rosa")).toBe(true);
    expect(coincideVenta(VENTA, "  GLORIA ")).toBe(true);
  });
  it("lo que no está no coincide; vacío deja pasar todo", () => {
    expect(coincideVenta(VENTA, "azúcar")).toBe(false);
    expect(coincideVenta(VENTA, "   ")).toBe(true);
  });
});

describe("cuerpoNotaCredito", () => {
  it("parcial = 07 y la base sin IGV (el servidor le suma el 18 %)", () => {
    const items = [item({ selected: true, returnQty: 1 }), item({ productId: 2, name: "Leche Gloria", maxQty: 3 })];
    const c = cuerpoNotaCredito(VENTA.id, items, 11.8);
    expect(c).toEqual({ saleId: VENTA.id, motivoCodigo: "07", motivoDesc: "Devolución de mercadería: 1x Arroz Costeño 5 kg", monto: 10 });
    expect(Math.round(c.monto * 1.18 * 100) / 100).toBe(11.8);
    expect(c).not.toHaveProperty("orderId");
  });
  it("todo lo vendido = 06; la descripción no pasa de 500", () => {
    const largo = "x".repeat(600);
    const items = [item({ selected: true, returnQty: 1, name: largo })];
    const c = cuerpoNotaCredito(VENTA.id, items, 23.6);
    expect(c.motivoCodigo).toBe("06");
    expect(c.motivoDesc.length).toBe(500);
  });
});

describe("POST /api/notas-credito con el cuerpo del POS (Zod real)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSale.mockResolvedValue({ id: VENTA.id, total: 23.6 });
    mockSum.mockResolvedValue(0);
    mockNumero.mockResolvedValue("B001-NC-0001");
    mockCreate.mockImplementation((_t: string, d: Record<string, unknown>) => Promise.resolve({ id: "nc1", ...d }));
  });

  it("el cuerpo nuevo pasa: 201, va por saleId (tope anti-fraude) y el total vuelve a lo devuelto", async () => {
    const { POST } = await import("@/app/api/notas-credito/route");
    const res = await POST(postNc(cuerpoNotaCredito(VENTA.id, [item({ selected: true, returnQty: 1 })], 11.8)));
    expect(res.status).toBe(201);
    expect(mockGetSale).toHaveBeenCalledWith("tenant-a", VENTA.id);
    const data = await res.json();
    expect(data.numero).toBe("B001-NC-0001");
    expect(data.total).toBeCloseTo(11.8, 2);
  });

  it("el cuerpo viejo daba 400 con un objeto en `error` → el mensaje ya no es «[object Object]»", async () => {
    const { POST } = await import("@/app/api/notas-credito/route");
    const res = await POST(postNc({ orderId: VENTA.id, codigoMotivo: "06", descripcionMotivo: "x", monto: 11.8 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(typeof data.error).toBe("object");
    expect(mensajeErrorNc(res.status, data)).toBe("No se pudo crear la Nota de Crédito.");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("errores con texto se muestran; 403 dice quién la emite", () => {
    expect(mensajeErrorNc(400, { error: "El monto excede el total de la venta" })).toBe("El monto excede el total de la venta");
    expect(mensajeErrorNc(403, { error: "Forbidden" })).toBe("La Nota de Crédito la emite el dueño o un admin.");
  });
});

describe("fallaSeguraDeRepetir", () => {
  it("sólo un 4xx deja «Volver y corregir»; sin red o 5xx no se sabe si quedó", () => {
    expect(fallaSeguraDeRepetir(400)).toBe(true);
    expect(fallaSeguraDeRepetir(403)).toBe(true);
    expect(fallaSeguraDeRepetir(500)).toBe(false);
    expect(fallaSeguraDeRepetir(503)).toBe(false);
    expect(fallaSeguraDeRepetir(null)).toBe(false);
  });
});
