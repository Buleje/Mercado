/**
 * Precio de revendedora en la caja (ADR-507 → POS, 20-10).
 *
 * - `precioDeCaja` (puro): rige sólo con el módulo activo y el pedido mínimo;
 *   ofertas sin descuento, piso de ganancia y nivel del mes vienen de `cotizarPedido`.
 * - `POST /api/sales`: con una revendedora el SERVIDOR pone el precio. El precio
 *   y el descuento por ítem que mande el POS se ignoran; sin cotización se cobra
 *   el precio normal; otra clienta (o de otro negocio) paga el catálogo.
 * - `POST /api/sales/precio-cliente`: la vista previa; sin sesión 401.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { cotizarPedido, type ConfigRevendedoras, type LineaPedido } from "@/lib/revendedoras/reglas";
import { precioDeCaja, preciosQueRigen } from "@/lib/pos/precio-revendedora";
import { celularDeCaja, formatosDelCelular } from "@/lib/pos/celular-de-caja";

const { mockRequireAdmin, mockTransaction, mockCustomerFindFirst, mockSaleCreate, mockCotizarEnCaja, mockClientaDeLaCaja, mockAltaSinPisar } = vi.hoisted(() => ({
  mockAltaSinPisar: vi.fn(),
  mockRequireAdmin: vi.fn(),
  mockTransaction: vi.fn(),
  mockCustomerFindFirst: vi.fn(),
  mockSaleCreate: vi.fn(),
  mockCotizarEnCaja: vi.fn(),
  mockClientaDeLaCaja: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/billing/require-active-subscription", () => ({ requireActiveSubscription: vi.fn(() => null) }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null, rateLimit: () => null, getClientIp: () => "127.0.0.1" }));
vi.mock("@/lib/db-retry", () => ({ withDbRetry: <T,>(fn: () => Promise<T>) => fn() }));
vi.mock("@/lib/cache", () => ({
  revalidateTenantTag: vi.fn(),
  getOrSet: <T,>(_k: string, _ttl: number, fn: () => Promise<T>) => fn(),
  invalidate: vi.fn(),
  invalidateByPrefix: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/audit-logger", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/audit/audit-context", () => ({
  runWithAuditContext: <T,>(_req: unknown, _user: unknown, fn: () => Promise<T>) => fn(),
  getAuditContext: () => null,
}));
vi.mock("@/lib/inventory/fefo-deduct", () => ({ deductStockFEFO: vi.fn(), hasBatchesWithStock: vi.fn(() => Promise.resolve(false)) }));
vi.mock("@/lib/jsondb", () => ({
  SalesDB: { getAll: vi.fn() },
  InventoryMovementsDB: { record: vi.fn(() => Promise.resolve()) },
  CashRegistersDB: { getOpen: vi.fn(() => Promise.resolve(null)) },
  LoyaltyDB: { accruePoints: vi.fn(() => Promise.resolve()) },
}));
vi.mock("@/lib/decimal-utils", () => ({ toNumOrZero: (n: unknown) => Number(n) || 0 }));
vi.mock("@/app/api/inventory/conteo/route", () => ({ conteoLockKey: vi.fn() }));
vi.mock("@/lib/db/customers.db", () => ({ CustomersDB: { getByPhone: vi.fn(), upsert: vi.fn(), altaSinPisar: mockAltaSinPisar } }));
vi.mock("@/lib/db/fiados.db", () => ({ FiadosDB: { validateForNewFiado: vi.fn(), createInTransaction: vi.fn() } }));
vi.mock("@/lib/caja/invalidar-ventas-overview", () => ({
  invalidarVentasOverview: vi.fn(),
  tagVentasOverview: (t: string) => `ventas-overview-${t}`,
}));
vi.mock("@/lib/db/revendedoras.db", () => ({
  RevendedorasDB: { cotizarEnCaja: mockCotizarEnCaja, clientaDeLaCaja: mockClientaDeLaCaja },
}));

/** Catálogo de la base: shampoo S/ 50 (costo 20), kit en oferta S/ 80 (costo 40). */
const CATALOGO = [
  { id: 1, price: 50, costPrice: 20, name: "Shampoo", category: "Cabello" },
  { id: 2, price: 80, costPrice: 40, name: "Kit", category: "Kits y ofertas" },
];
vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: { findFirst: mockCustomerFindFirst },
    sale: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
    product: { findMany: vi.fn(async () => CATALOGO.map(({ id, price, costPrice }) => ({ id, price, costPrice }))) },
    $transaction: mockTransaction,
  },
}));

const MUSA: ConfigRevendedoras = {
  activo: true,
  niveles: [{ desde: 0, descuento: 20 }, { desde: 600, descuento: 25 }],
  pedidoMinimo: 150,
  envioGratisDesde: 300,
  margenMinimo: 30,
  categoriasSinDescuento: ["Kits y ofertas"],
  mesesSinCredito: 3,
  metaActivas: 8,
};

/** Lo que haría `RevendedorasDB.cotizarEnCaja` con el catálogo de arriba y lo comprado en el mes. */
function cotizarComoLaBase(config: ConfigRevendedoras, compradoEnElMes: number) {
  return async (_t: string, _c: string, items: { productId: number; quantity: number }[]) => {
    const lineas: LineaPedido[] = items.flatMap((i) => {
      const p = CATALOGO.find((x) => x.id === i.productId);
      return p ? [{ productId: p.id, nombre: p.name, categoria: p.category, precioCatalogo: p.price, costo: p.costPrice, cantidad: i.quantity }] : [];
    });
    return precioDeCaja(config, cotizarPedido(config, { compradoEnElMes, lineas }));
  };
}

function post(url: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const CAJERO = { role: "cajero", username: "cajero1", tenantId: "tenant-1" };

describe("precioDeCaja (puro)", () => {
  const linea = (productId: number, cantidad: number): LineaPedido => {
    const p = CATALOGO.find((x) => x.id === productId)!;
    return { productId, nombre: p.name, categoria: p.category, precioCatalogo: p.price, costo: p.costPrice, cantidad };
  };

  it("nivel 20 % con pedido ≥ mínimo; la oferta paga su precio", () => {
    const r = precioDeCaja(MUSA, cotizarPedido(MUSA, { compradoEnElMes: 0, lineas: [linea(1, 4), linea(2, 1)] }));
    expect(r.aplica).toBe(true);
    expect(r.nivel).toBe(20);
    expect(r.lineas.find((l) => l.productId === 1)?.precio).toBe(40);
    expect(r.lineas.find((l) => l.productId === 2)).toMatchObject({ precio: 80, motivo: "oferta" });
    expect(r.total).toBe(240);
    expect(preciosQueRigen(r)?.get(1)).toBe(40);
  });

  it("bajo el mínimo no rige (precio normal) y dice cuánto falta", () => {
    const r = precioDeCaja(MUSA, cotizarPedido(MUSA, { compradoEnElMes: 0, lineas: [linea(1, 2)] }));
    expect(r).toMatchObject({ aplica: false, motivo: "bajo-minimo", faltaMinimo: 70 });
    expect(preciosQueRigen(r)).toBeNull();
  });

  it("módulo apagado: no rige", () => {
    const apagado = { ...MUSA, activo: false };
    const r = precioDeCaja(apagado, cotizarPedido(apagado, { compradoEnElMes: 0, lineas: [linea(1, 4)] }));
    expect(r).toMatchObject({ aplica: false, motivo: "inactivo" });
  });

  it("con S/ 600 comprados en el mes cobra el 25 %; el piso de ganancia lo topa", () => {
    const r = precioDeCaja(MUSA, cotizarPedido(MUSA, { compradoEnElMes: 600, lineas: [linea(1, 4)] }));
    expect(r.nivel).toBe(25);
    expect(r.lineas[0]?.precio).toBe(37.5);
    const caro = { ...MUSA, margenMinimo: 50 };
    const t = precioDeCaja(caro, cotizarPedido(caro, { compradoEnElMes: 0, lineas: [linea(1, 4)] }));
    expect(t.lineas[0]).toMatchObject({ precio: 40, motivo: null });
    const topado = { ...MUSA, margenMinimo: 65 };
    const m = precioDeCaja(topado, cotizarPedido(topado, { compradoEnElMes: 0, lineas: [linea(1, 4)] }));
    expect(m.lineas[0]).toMatchObject({ precio: 50, motivo: "catalogo-bajo-margen" });
  });
});

describe("POST /api/sales — precio de revendedora puesto por el servidor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(CAJERO);
    mockCotizarEnCaja.mockImplementation(cotizarComoLaBase(MUSA, 0));
    mockSaleCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      createdAt: new Date(),
      items: (data.items as { create: unknown[] } | undefined)?.create ?? [],
    }));
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        product: {
          findMany: vi.fn().mockResolvedValue(CATALOGO.map((p) => ({ id: p.id, stock: 100, name: p.name }))),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        sale: { create: mockSaleCreate },
        fiado: {},
      }),
    );
  });

  const VENTA = {
    // El POS manda precios y descuentos «suyos»: el servidor no los usa.
    items: [
      { productId: 1, price: 0.01, quantity: 4, name: "Shampoo", unit: "und", discount: 0 },
      { productId: 2, price: 999, quantity: 1, name: "Kit", unit: "und", discount: 10 },
    ],
    payment: "efectivo",
    amountPaid: 300,
    customerPhone: "916409675",
  };

  it("revendedora: cobra 4 × 40 + kit 80 = 240 (ignora price 0.01/999 y el 10 % del kit)", async () => {
    mockClientaDeLaCaja.mockResolvedValue({ phone: "916409675", id: "c-1", listaPrecio: "revendedora" });
    const { POST } = await import("@/app/api/sales/route");
    const res = await POST(post("/api/sales", VENTA));
    expect(res.status).toBe(201);
    const { data } = mockSaleCreate.mock.calls[0]![0];
    expect(data.total).toBe(240);
    expect(data.customerPhone).toBe("916409675");
    expect(data.items.create.map((i: { price: number }) => i.price)).toEqual([40, 80]);
    expect(data.change).toBe(60);
    // La clienta se busca SIEMPRE dentro del negocio de la sesión (la clase pone el tenant en el WHERE).
    expect(mockClientaDeLaCaja).toHaveBeenCalledWith("tenant-1", "916409675");
    expect(mockAltaSinPisar).not.toHaveBeenCalled();
    expect(mockCotizarEnCaja).toHaveBeenCalledWith("tenant-1", "c-1", [
      { productId: 1, quantity: 4 },
      { productId: 2, quantity: 1 },
    ]);
  });

  it("clienta general: catálogo (el precio del POS tampoco cuenta) y no se cotiza", async () => {
    mockClientaDeLaCaja.mockResolvedValue({ phone: "916409675", id: "c-2", listaPrecio: null });
    const { POST } = await import("@/app/api/sales/route");
    const res = await POST(post("/api/sales", { ...VENTA, items: [VENTA.items[0]], amountPaid: 200 }));
    expect(res.status).toBe(201);
    const { data } = mockSaleCreate.mock.calls[0]![0];
    expect(data.total).toBe(200);
    expect(data.customerPhone).toBe("916409675");
    expect(mockCotizarEnCaja).not.toHaveBeenCalled();
  });

  it("celular nuevo en el negocio: alta rápida con la venta (nombre opcional) y la venta queda con su celular", async () => {
    mockClientaDeLaCaja.mockResolvedValue(null);
    mockAltaSinPisar.mockResolvedValue({ estado: "creado", cliente: { phone: "916409675", name: "Cliente 9675" } });
    const { POST } = await import("@/app/api/sales/route");
    const res = await POST(post("/api/sales", { ...VENTA, customerPhone: "916 409 675", items: [VENTA.items[0]], amountPaid: 200 }));
    expect(res.status).toBe(201);
    expect(mockAltaSinPisar).toHaveBeenCalledWith("tenant-1", { phone: "916409675", name: "Cliente 9675" });
    expect(mockSaleCreate.mock.calls[0]![0].data.customerPhone).toBe("916409675");
    expect(mockSaleCreate.mock.calls[0]![0].data.total).toBe(200);
  });

  it("alta con nombre tipeado; un celular que no es celular no da de alta", async () => {
    mockClientaDeLaCaja.mockResolvedValue(null);
    mockAltaSinPisar.mockResolvedValue({ estado: "creado", cliente: { phone: "916409675", name: "Rosa" } });
    const { POST } = await import("@/app/api/sales/route");
    await POST(post("/api/sales", { ...VENTA, customerName: " Rosa ", items: [VENTA.items[0]], amountPaid: 200 }));
    expect(mockAltaSinPisar).toHaveBeenCalledWith("tenant-1", { phone: "916409675", name: "Rosa" });
    mockAltaSinPisar.mockClear();
    const res = await POST(post("/api/sales", { ...VENTA, customerPhone: "123", items: [VENTA.items[0]], amountPaid: 200 }));
    expect(res.status).toBe(201);
    expect(mockAltaSinPisar).not.toHaveBeenCalled();
  });

  it("celular de otro negocio (no está en este tenant): sin celular, sin precio de lista", async () => {
    mockClientaDeLaCaja.mockResolvedValue(null);
    mockAltaSinPisar.mockResolvedValue({ estado: "otra_tienda" });
    const { POST } = await import("@/app/api/sales/route");
    const res = await POST(post("/api/sales", { ...VENTA, items: [VENTA.items[0]], amountPaid: 200 }));
    expect(res.status).toBe(201);
    const { data } = mockSaleCreate.mock.calls[0]![0];
    expect(data.total).toBe(200);
    expect(data.customerPhone).toBeNull();
    expect(mockCotizarEnCaja).not.toHaveBeenCalled();
  });

  it("bajo el pedido mínimo: precio normal", async () => {
    mockClientaDeLaCaja.mockResolvedValue({ phone: "916409675", id: "c-1", listaPrecio: "revendedora" });
    const { POST } = await import("@/app/api/sales/route");
    const res = await POST(post("/api/sales", { ...VENTA, items: [{ ...VENTA.items[0], quantity: 2 }], amountPaid: 100 }));
    expect(res.status).toBe(201);
    expect(mockSaleCreate.mock.calls[0]![0].data.total).toBe(100);
  });

  it("si la cotización falla, cobra el precio normal (nunca uno inventado)", async () => {
    mockClientaDeLaCaja.mockResolvedValue({ phone: "916409675", id: "c-1", listaPrecio: "revendedora" });
    mockCotizarEnCaja.mockRejectedValue(new Error("db caída"));
    const { POST } = await import("@/app/api/sales/route");
    const res = await POST(post("/api/sales", { ...VENTA, items: [VENTA.items[0]], amountPaid: 200 }));
    expect(res.status).toBe(201);
    expect(mockSaleCreate.mock.calls[0]![0].data.total).toBe(200);
  });

  it("el pago con el precio de catálogo menor al de revendedora no pasa: el total es el del servidor", async () => {
    mockClientaDeLaCaja.mockResolvedValue({ phone: "916409675", id: "c-1", listaPrecio: "revendedora" });
    const { POST } = await import("@/app/api/sales/route");
    const res = await POST(post("/api/sales", { ...VENTA, amountPaid: 100 }));
    expect(res.status).toBe(400);
    expect(mockSaleCreate).not.toHaveBeenCalled();
  });
});

describe("celular de la caja (puro)", () => {
  it("9 dígitos que empiezan con 9, con espacios o +51", () => {
    expect(celularDeCaja("916 409 675")).toBe("916409675");
    expect(celularDeCaja("+51 916409675")).toBe("916409675");
    expect(celularDeCaja("12345")).toBeNull();
    expect(celularDeCaja("016409675")).toBeNull();
  });
  it("formatos guardados posibles; la ficha social va exacta", () => {
    expect(formatosDelCelular("+51916409675")).toEqual(["916409675", "51916409675", "+51916409675"]);
    expect(formatosDelCelular("google_1177916409675")).toEqual(["google_1177916409675"]);
    expect(formatosDelCelular("  ")).toEqual([]);
  });
});

describe("POST /api/sales/precio-cliente — vista previa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(CAJERO);
    mockCotizarEnCaja.mockImplementation(cotizarComoLaBase(MUSA, 0));
  });
  const BODY = { customerPhone: "916409675", items: [{ productId: 1, quantity: 4 }] };

  it("sin sesión: 401 y no lee nada", async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({ error: "No autorizado" }, { status: 401 }));
    const { POST } = await import("@/app/api/sales/precio-cliente/route");
    const res = await POST(post("/api/sales/precio-cliente", BODY));
    expect(res.status).toBe(401);
    expect(mockClientaDeLaCaja).not.toHaveBeenCalled();
  });

  it("revendedora: devuelve nivel y total del servidor", async () => {
    mockClientaDeLaCaja.mockResolvedValue({ id: "c-1", listaPrecio: "revendedora" });
    const { POST } = await import("@/app/api/sales/precio-cliente/route");
    const res = await POST(post("/api/sales/precio-cliente", BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ aplica: true, nivel: 20, total: 160, catalogo: 200 });
    expect(mockClientaDeLaCaja).toHaveBeenCalledWith("tenant-1", "916409675");
  });

  it("clienta de otro negocio o general: «general», sin cotizar", async () => {
    mockClientaDeLaCaja.mockResolvedValue(null);
    const { POST } = await import("@/app/api/sales/precio-cliente/route");
    const res = await POST(post("/api/sales/precio-cliente", BODY));
    expect(await res.json()).toEqual({ aplica: false, motivo: "general" });
    expect(mockCotizarEnCaja).not.toHaveBeenCalled();
  });

  it("cuerpo inválido: 400", async () => {
    const { POST } = await import("@/app/api/sales/precio-cliente/route");
    const res = await POST(post("/api/sales/precio-cliente", { customerPhone: "", items: [] }));
    expect(res.status).toBe(400);
  });
});
