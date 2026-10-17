/**
 * API /api/purchases — tests de integración
 * Cubre: POST crea OC con paymentMethod/deliveryDate/discount, validación, payable auto-generado
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mock: require-admin ──────────────────────────────────────────────────────
const { mockRequireAdmin } = vi.hoisted(() => ({ mockRequireAdmin: vi.fn() }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));

// ── Mock: prisma ─────────────────────────────────────────────────────────────
// Type the mocks loosely so .mockResolvedValueOnce({...}) and .mock.calls[0][0]
// don't get pinned to the narrow inferred return type from the default impl.
const { mockProductUpdate, mockPayableFindFirst } = vi.hoisted(() => ({
  mockProductUpdate: vi.fn<(args: { where: { id: number | string }; data: Record<string, unknown> }) => Promise<unknown>>(async () => ({})),
  mockPayableFindFirst: vi.fn<(args?: unknown) => Promise<{ id: string; purchaseOrderId: string } | null>>(async () => null),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: { update: mockProductUpdate },
    payable: { findFirst: mockPayableFindFirst },
  },
}));

// ── Mock: PurchasesDB (via @/lib/jsondb) ─────────────────────────────────────
const { mockPurchasesAdd, mockPurchasesGetAll, mockDatosDeSeguimiento } = vi.hoisted(() => ({
  mockPurchasesAdd: vi.fn(),
  mockPurchasesGetAll: vi.fn<() => Promise<Array<Record<string, unknown>>>>(async () => []),
  mockDatosDeSeguimiento: vi.fn(async (_t: string, _ids: string[]) => ({ recepciones: [] as unknown[], cuentas: [] as unknown[] })),
}));
vi.mock("@/lib/jsondb", () => ({
  PurchasesDB: {
    add: mockPurchasesAdd,
    getAll: mockPurchasesGetAll,
    datosDeSeguimiento: mockDatosDeSeguimiento,
  },
}));

// ── Mock: PayablesDB ─────────────────────────────────────────────────────────
const { mockPayablesAdd } = vi.hoisted(() => ({
  mockPayablesAdd: vi.fn(async () => ({})),
}));
vi.mock("@/lib/db/finance.db", () => ({
  PayablesDB: { add: mockPayablesAdd },
}));

// ── Mock: audit-logger ───────────────────────────────────────────────────────
vi.mock("@/lib/audit-logger", () => ({ logAudit: vi.fn() }));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/purchases", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ADMIN_SESSION = {
  role: "admin" as const,
  username: "testadmin",
  tenantId: "main",
};

const BASE_ITEMS = [
  { productId: 1, quantity: 10, unitCost: 5, unit: "kg", name: "Arroz" },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/purchases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockPurchasesAdd.mockImplementation(async (po) => po);
  });

  it("crea OC básica con paymentMethod contado", async () => {
    const { POST } = await import("@/app/api/purchases/route");

    const req = makeRequest({
      supplierId: "sup-1",
      supplierName: "Proveedor Test",
      items: BASE_ITEMS,
      paymentMethod: "contado",
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.supplierId).toBe("sup-1");
    expect(body.paymentMethod).toBe("contado");
    expect(body.total).toBe(50); // 10 * 5 = 50, sin descuento
    expect(body.status).toBe("pendiente");
  });

  it("aplica descuento correctamente al total", async () => {
    const { POST } = await import("@/app/api/purchases/route");

    const req = makeRequest({
      supplierId: "sup-1",
      items: BASE_ITEMS, // subtotal = 50
      paymentMethod: "contado",
      discount: 20, // 20% de descuento → total = 40
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.discount).toBe(20);
    expect(body.total).toBeCloseTo(40); // 50 * (1 - 0.2)
  });

  it("incluye deliveryDate en la OC", async () => {
    const { POST } = await import("@/app/api/purchases/route");
    const deliveryDate = "2026-04-15";

    const req = makeRequest({
      items: BASE_ITEMS,
      paymentMethod: "contado",
      deliveryDate,
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.deliveryDate).toBe(deliveryDate);
  });

  // Brandon 2026-05-17: el handler ahora crea Payable dentro de `prisma.$transaction`
  // con `tx.payable.create()` (atomic con la PO), no via `PayablesDB.add()`. El test
  // verificaba el path viejo. TODO: re-escribir con mock de $transaction + tx.payable.
  // El nuevo path está cubierto por tests de integración E2E del flujo de compras.
  it.skip("crea Payable automático para crédito a 30 días (path refactorizado a tx.payable.create)", async () => {
    const { POST } = await import("@/app/api/purchases/route");

    const req = makeRequest({
      supplierId: "sup-2",
      supplierName: "Proveedor Crédito",
      items: BASE_ITEMS,
      paymentMethod: "credito_30",
    });

    await POST(req);

    expect(mockPayablesAdd).toHaveBeenCalledOnce();
    const payableArg = (mockPayablesAdd.mock.calls as unknown as unknown[][])[0][1] as Record<string, unknown>;
    expect(payableArg.supplierId).toBe("sup-2");
    expect(payableArg.amount).toBe(50);
    expect(payableArg.status).toBe("pendiente");
    const dueDate = new Date(payableArg.dueDate as string);
    const diffDays = Math.round((dueDate.getTime() - Date.now()) / 86400000);
    expect(diffDays).toBeGreaterThanOrEqual(29);
    expect(diffDays).toBeLessThanOrEqual(31);
  });

  it("NO crea Payable para pago contado", async () => {
    const { POST } = await import("@/app/api/purchases/route");

    const req = makeRequest({
      items: BASE_ITEMS,
      paymentMethod: "contado",
    });

    await POST(req);
    expect(mockPayablesAdd).not.toHaveBeenCalled();
  });

  it("NO crea Payable duplicado si ya existe uno para la OC", async () => {
    mockPayableFindFirst.mockResolvedValueOnce({ id: "existing-pay", purchaseOrderId: "po-123" });

    const { POST } = await import("@/app/api/purchases/route");

    const req = makeRequest({
      items: BASE_ITEMS,
      paymentMethod: "credito_7",
    });

    await POST(req);
    expect(mockPayablesAdd).not.toHaveBeenCalled();
  });

  // Brandon 2026-05-17 (F5 refactor): costPrice ya NO se actualiza en POST
  // /api/purchases (PO emitida ≠ recibida). El weighted-avg ahora se aplica
  // en PATCH cuando status → "recibido". Test movido a api-purchases-receive.
  it.skip("actualiza costPrice de cada producto (fire-and-forget) — movido a PATCH /api/purchases/[id]", async () => {
    const { POST } = await import("@/app/api/purchases/route");

    const req = makeRequest({
      items: [
        { productId: 10, quantity: 5, unitCost: 8, name: "Aceite" },
        { productId: 20, quantity: 3, unitCost: 12, name: "Leche" },
      ],
      paymentMethod: "contado",
    });

    await POST(req);

    await vi.waitFor(() => expect(mockProductUpdate).toHaveBeenCalledTimes(2));
    expect(mockProductUpdate.mock.calls[0][0]).toMatchObject({ where: { id: 10 }, data: { costPrice: 8 } });
    expect(mockProductUpdate.mock.calls[1][0]).toMatchObject({ where: { id: 20 }, data: { costPrice: 12 } });
  });

  it("proveedor o producto de otro negocio → 404 sin cuenta por pagar (10-10)", async () => {
    const { DatosAjenosEnOrdenError } = await import("@/lib/compras/datos-ajenos");
    mockPurchasesAdd.mockRejectedValueOnce(new DatosAjenosEnOrdenError(false, [1252621]));
    const { POST } = await import("@/app/api/purchases/route");

    const res = await POST(makeRequest({ supplierId: "sup-demo-4", items: [{ ...BASE_ITEMS[0], productId: 1252621 }], paymentMethod: "credito_30" }));
    expect(res.status).toBe(404);
    expect((await res.json()).productosAjenos).toEqual([1252621]);
    expect(mockPayablesAdd).not.toHaveBeenCalled();
  });

  it("rechaza body vacío con 400", async () => {
    const { POST } = await import("@/app/api/purchases/route");

    const req = new NextRequest("http://localhost/api/purchases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: [] }), // sin items mínimos
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rechaza paymentMethod inválido con 400", async () => {
    const { POST } = await import("@/app/api/purchases/route");

    const req = makeRequest({
      items: BASE_ITEMS,
      paymentMethod: "bitcoin", // inválido
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rechaza descuento > 100 con 400", async () => {
    const { POST } = await import("@/app/api/purchases/route");

    const req = makeRequest({
      items: BASE_ITEMS,
      paymentMethod: "contado",
      discount: 150, // inválido
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("retorna 401 si no está autenticado", async () => {
    const { NextResponse } = await import("next/server");
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: "No autorizado" }, { status: 401 }),
    );

    const { POST } = await import("@/app/api/purchases/route");
    const req = makeRequest({ items: BASE_ITEMS });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/purchases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
  });

  it("retorna lista de OCs", async () => {
    const fakeOrders = [{ id: "po-1", total: 100, status: "pendiente" }];
    mockPurchasesGetAll.mockResolvedValueOnce(fakeOrders);

    const { GET } = await import("@/app/api/purchases/route");
    const req = new NextRequest("http://localhost/api/purchases");

    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(fakeOrders);
    expect(mockDatosDeSeguimiento).not.toHaveBeenCalled();
  });

  it("?seguimiento=1 adjunta a cada OC lo recibido y su cuenta, sólo de sus ids (C10)", async () => {
    mockPurchasesGetAll.mockResolvedValueOnce([
      { id: "po-1", status: "parcial", items: [{ productId: 7, name: "Arroz", quantity: 10 }] },
      { id: "po-2", status: "pendiente", items: [{ productId: 7, name: "Arroz", quantity: 3 }] },
    ]);
    mockDatosDeSeguimiento.mockResolvedValueOnce({
      recepciones: [{ id: "r1", ref: "REC-1", purchaseOrderId: "po-1", status: "parcial", receivedDate: null, createdAt: "2026-10-15T15:00:00.000Z", itemsJson: [{ productId: 7, receivedQty: 4 }] }],
      cuentas: [{ purchaseOrderId: "po-1", amount: "200", paidAmount: "50", status: "parcial", dueDate: "2026-10-20T15:00:00.000Z" }],
    });

    const { GET } = await import("@/app/api/purchases/route");
    const res = await GET(new NextRequest("http://localhost/api/purchases?seguimiento=1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(mockDatosDeSeguimiento).toHaveBeenCalledWith(ADMIN_SESSION.tenantId, ["po-1", "po-2"], true); // admin ve la deuda (revisión 17-10)
    expect(body[0].seguimiento).toMatchObject({ recibido: { 7: 4 }, cuenta: { monto: 200, pagado: 50, saldo: 150, vence: "2026-10-20" } });
    expect(body[1].seguimiento).toMatchObject({ recibido: {}, recepciones: [], cuenta: null });
  });
});
