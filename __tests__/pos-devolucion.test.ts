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
  huboDevolucionAntes,
  previaReembolso,
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
vi.mock("@/lib/db/settings.db", () => ({ SettingsDB: { get: vi.fn(() => Promise.resolve({ taxRate: 18 })) } }));
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
  it("con algo ya devuelto antes, completar el resto es 07 (maxQty = lo que queda, el monto es parcial)", () => {
    // Venta de 3 leches, ya volvió 1: maxQty = 2 y se devuelven las 2 → antes «06 total» por S/ 7,86.
    const items = [item({ productId: 2, name: "Leche Gloria", price: 3.93, maxQty: 2, returnQty: 2, selected: true })];
    expect(cuerpoNotaCredito(VENTA.id, items, 7.86).motivoCodigo).toBe("06");
    expect(cuerpoNotaCredito(VENTA.id, items, 7.86, true).motivoCodigo).toBe("07");
  });
});

describe("huboDevolucionAntes", () => {
  it("unidades o plata devueltas = sí; vacío o en 0 = no", () => {
    expect(huboDevolucionAntes({ unidades: new Map(), plata: 0 })).toBe(false);
    expect(huboDevolucionAntes({ unidades: new Map([[2, 0]]), plata: 0 })).toBe(false);
    expect(huboDevolucionAntes({ unidades: new Map([[2, 1]]), plata: 0 })).toBe(true);
    expect(huboDevolucionAntes({ unidades: new Map(), plata: 3.93 })).toBe(true);
  });
});

describe("previaReembolso (la misma cuenta que el servidor)", () => {
  // El mismo producto en dos líneas a precios distintos: el servidor cobra desde la primera que queda.
  const DOS_LINEAS = {
    total: 15,
    items: [
      { productId: 7, name: "Aceite", price: 10, quantity: 1, unit: "und" },
      { productId: 7, name: "Aceite", price: 5, quantity: 1, unit: "und" },
    ],
  };
  const NADA = { unidades: new Map<number, number>(), plata: 0 };

  it("elegir la 2.ª línea (S/ 5) muestra S/ 10, lo que devuelve el servidor (antes mostraba 5)", () => {
    const items = [
      { productId: 7, name: "Aceite", price: 10, maxQty: 1, returnQty: 0, selected: false },
      { productId: 7, name: "Aceite", price: 5, maxQty: 1, returnQty: 1, selected: true },
    ];
    expect(previaReembolso(DOS_LINEAS, items, NADA)).toBe(10);
  });

  it("con la 1.ª ya devuelta, la que queda vale S/ 5 y no pasa de lo que falta reembolsar", () => {
    const items = [{ productId: 7, name: "Aceite", price: 5, maxQty: 1, returnQty: 1, selected: true }];
    expect(previaReembolso(DOS_LINEAS, items, { unidades: new Map([[7, 1]]), plata: 10 })).toBe(5);
  });

  it("nada elegido = 0", () => {
    expect(previaReembolso(DOS_LINEAS, [], NADA)).toBe(0);
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

  it("con `totalConIgv` (lo devuelto) la NC suma exacto: 11,80 = 10,00 + 1,80", async () => {
    const { POST } = await import("@/app/api/notas-credito/route");
    const res = await POST(postNc({ ...cuerpoNotaCredito(VENTA.id, [item({ selected: true, returnQty: 1 })], 11.8), totalConIgv: 11.8 }));
    expect(res.status).toBe(201);
    expect(mockCreate.mock.calls[0][1]).toMatchObject({ monto: 10, igv: 1.8, total: 11.8 });
  });

  it("IGV al céntimo: base 8,47 guarda 1,52 y 9,99 (antes 9,9946)", async () => {
    const { POST } = await import("@/app/api/notas-credito/route");
    await POST(postNc({ saleId: VENTA.id, motivoCodigo: "07", motivoDesc: "x", monto: 8.47 }));
    expect(mockCreate.mock.calls[0][1]).toMatchObject({ monto: 8.47, igv: 1.52, total: 9.99 });
  });

  it("tope en base: una venta de S/ 23,60 con IGV no admite una nota de base 23,60 (18 % de más)", async () => {
    const { POST } = await import("@/app/api/notas-credito/route");
    const pasada = await POST(postNc({ saleId: VENTA.id, motivoCodigo: "06", motivoDesc: "x", monto: 23.6 }));
    expect(pasada.status).toBe(400);
    const data = await pasada.json();
    expect(data).toMatchObject({ disponible: 20, disponibleConIgv: 23.6 });
    expect(mockCreate).not.toHaveBeenCalled();
    const justa = await POST(postNc({ saleId: VENTA.id, motivoCodigo: "06", motivoDesc: "x", monto: 20 }));
    expect(justa.status).toBe(201);
  });

  it("con la base entera ya acreditada, una NC de S/ 0,01 da 400 (antes el céntimo de tolerancia las dejaba sin fin)", async () => {
    const { POST } = await import("@/app/api/notas-credito/route");
    mockSum.mockResolvedValue(20); // base de 23,60 = 20,00, ya emitida entera
    const res = await POST(postNc({ saleId: VENTA.id, motivoCodigo: "07", motivoDesc: "x", monto: 0.01 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ disponible: 0, disponibleConIgv: 0 });
    const conIgv = await POST(postNc({ saleId: VENTA.id, motivoCodigo: "07", motivoDesc: "x", totalConIgv: 0.01 }));
    expect(conIgv.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("si todavía queda algo, el céntimo de redondeo sigue entrando (queda 0,01 → pasa 0,02, no 0,03)", async () => {
    const { POST } = await import("@/app/api/notas-credito/route");
    mockSum.mockResolvedValue(19.99);
    const pasada = await POST(postNc({ saleId: VENTA.id, motivoCodigo: "07", motivoDesc: "x", monto: 0.03 }));
    expect(pasada.status).toBe(400);
    const justa = await POST(postNc({ saleId: VENTA.id, motivoCodigo: "07", motivoDesc: "x", monto: 0.02 }));
    expect(justa.status).toBe(201);
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
