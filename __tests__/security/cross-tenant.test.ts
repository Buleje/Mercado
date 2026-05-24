/**
 * Suite de seguridad: Cross-Tenant Isolation
 *
 * Historia: Bug "Polleria El Dorado / Buleje" — admin del tenant A podía leer
 * y mutar datos del tenant B en endpoints críticos (IDOR clásico). Ley 29733 PE.
 *
 * Patrón general:
 *   - Dos tenants seed: TENANT_A ("tenant-polleria") y TENANT_B ("tenant-buleje")
 *   - Todos los recursos pertenecen a TENANT_B.
 *   - El atacante está autenticado como admin de TENANT_A.
 *   - Los tests validan que el endpoint retorna 4xx (nunca 200 con datos del B).
 *   - Los mocks simulan el filtro correcto: findFirst({where:{id, tenantId}})
 *     retorna null cuando el tenantId no coincide.
 *
 * Si algún test falla => el handler NO está filtrando por tenantId => IDOR abierto.
 *
 * Estado 2026-05-24: 12/12 suites activas, 0 .skip. Los antiguos CT-06 y CT-12
 * (que estaban .skip) fueron reescritos: sus routes migraron de `prisma.*`
 * directo a clases DB con scope tenant (DeliveryAssignmentsDB / CustomerDataDB),
 * y los tests ahora verifican que el handler pasa auth.tenantId a la clase.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Infraestructura compartida ────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(() => null),
  rateLimit: vi.fn(() => ({ allowed: true, remaining: 100 })),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn(async () => undefined),
}));

vi.mock("@/lib/api-error", () => ({
  newTraceId: () => "trace-sec-test",
  toErrorPayload: (err: unknown) => ({
    payload: { error: String(err) },
    status: 500,
  }),
  ApiError: class ApiError extends Error {
    httpStatus = 500;
    toPayload() {
      return { error: this.message };
    }
  },
}));

// ── Dos tenants seed ──────────────────────────────────────────────────────────

const TENANT_A = "tenant-polleria"; // atacante autenticado aquí
const TENANT_B = "tenant-buleje";   // víctima — todos los recursos pertenecen aquí

// requireAdmin mockeado para devolver siempre TENANT_A (el atacante)
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () => ({
    tenantId: TENANT_A,
    username: "attacker-admin",
    role: "admin",
  })),
}));

// ── Mocks de Prisma ───────────────────────────────────────────────────────────
//
// Cada mock simula el comportamiento CORRECTO de un sistema con tenantId.
// `findFirst({where:{id, tenantId: TENANT_A}})` retorna null porque el
// recurso pertenece a TENANT_B. Si el handler omite el tenantId, el mock
// devuelve el recurso (simulando el leak) y el test fallará con 200.

const prismaMocks = {
  saleFindFirst: vi.fn(),
  saleFindMany: vi.fn(),
  orderFindFirst: vi.fn(),
  deliveryPartnerFindFirst: vi.fn(),
  deliveryAssignmentFindFirst: vi.fn(),
  deliveryAssignmentFindMany: vi.fn(),
  deliveryAssignmentFindUnique: vi.fn(),
  deliveryPartnerFindMany: vi.fn(),
  customerFindFirst: vi.fn(),
  customerDeleteMany: vi.fn(),
  reviewUpdateMany: vi.fn(),
  sunatInvoiceFindFirst: vi.fn(),
  tenantSunatConfigFindUnique: vi.fn(),
  orderFindMany: vi.fn(),
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sale: {
      findFirst: (...a: unknown[]) => prismaMocks.saleFindFirst(...a),
      findMany: (...a: unknown[]) => prismaMocks.saleFindMany(...a),
    },
    order: {
      findFirst: (...a: unknown[]) => prismaMocks.orderFindFirst(...a),
      findMany: (...a: unknown[]) => prismaMocks.orderFindMany(...a),
      findUnique: vi.fn(async () => null),
      count: vi.fn(async () => 0),
    },
    deliveryPartner: {
      findFirst: (...a: unknown[]) => prismaMocks.deliveryPartnerFindFirst(...a),
      findMany: (...a: unknown[]) => prismaMocks.deliveryPartnerFindMany(...a),
    },
    deliveryAssignment: {
      findFirst: (...a: unknown[]) => prismaMocks.deliveryAssignmentFindFirst(...a),
      findMany: (...a: unknown[]) => prismaMocks.deliveryAssignmentFindMany(...a),
      findUnique: (...a: unknown[]) => prismaMocks.deliveryAssignmentFindUnique(...a),
      create: vi.fn(async () => ({ id: "asgn-new", orderId: "order-B", partnerId: "partner-B" })),
      update: vi.fn(async () => ({})),
    },
    customer: {
      findUnique: vi.fn(async () => null),
      findFirst: (...a: unknown[]) => prismaMocks.customerFindFirst(...a),
      deleteMany: (...a: unknown[]) => prismaMocks.customerDeleteMany(...a),
    },
    review: {
      updateMany: (...a: unknown[]) => prismaMocks.reviewUpdateMany(...a),
      findMany: vi.fn(async () => []),
    },
    sunatInvoice: {
      findFirst: (...a: unknown[]) => prismaMocks.sunatInvoiceFindFirst(...a),
      create: vi.fn(async () => ({ id: "inv-new" })),
      update: vi.fn(async () => ({})),
    },
    tenantSunatConfig: {
      findUnique: (...a: unknown[]) => prismaMocks.tenantSunatConfigFindUnique(...a),
      update: vi.fn(async () => ({ lastBoletaNum: 1, lastFacturaNum: 1 })),
    },
  },
}));

// Nota CT-06/CT-12: los routes usan las clases DeliveryAssignmentsDB /
// CustomerDataDB, que NO mockeamos — corren reales y delegan a `prisma`
// (mockeado arriba) con el tenantId como 1er argumento. Así el test verifica el
// aislamiento en el punto real: el `where` que llega a prisma lleva tenantId.

// Mocks de servicios externos (evitan llamadas reales)
vi.mock("@/lib/whatsapp", () => ({
  sendWhatsAppQueued: vi.fn(async () => undefined),
  sendWhatsAppNotification: vi.fn(async () => true),
}));

vi.mock("@/lib/mailer", () => ({
  sendOrderNotification: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db-retry", () => ({
  withDbRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

// SalesDB mockeado: getById filtra por tenantId
vi.mock("@/lib/jsondb", () => ({
  SalesDB: {
    getById: vi.fn(async (tenantId: string, _id: string) => {
      // Simula: el recurso existe solo en TENANT_B
      if (tenantId === TENANT_B) return { id: "sale-B", total: 999 };
      return null; // TENANT_A no ve recursos de TENANT_B
    }),
    getAll: vi.fn(async (tenantId: string) => {
      if (tenantId === TENANT_B) return [{ id: "sale-B" }];
      return [];
    }),
  },
}));

// SUNAT libs mockeados
vi.mock("@/lib/integrations/sunat", () => ({
  emitirBoleta: vi.fn(async () => ({ success: false })),
}));

vi.mock("@/lib/sunat/nubefact-client", () => ({
  sendInvoice: vi.fn(async () => ({ sunat_accepted: true, nubefact_id: "NF-1" })),
}));

vi.mock("@/lib/sunat/invoice-builder", () => ({
  buildBoleta: vi.fn(() => ({ tipo: "03" })),
  buildFactura: vi.fn(() => ({ tipo: "01" })),
}));

vi.mock("@/lib/sunat", () => ({
  calculateIGV: vi.fn(() => ({ gravado: 84.75, igv: 15.25, total: 100 })),
}));

vi.mock("@/lib/domain-events", () => ({
  DomainEvents: {
    facturaEmitida: vi.fn(async () => undefined),
  },
}));

vi.mock("@/lib/billing/wire-up/metering-bus", () => ({
  emitMeteringEvent: vi.fn(),
}));

vi.mock("@/lib/decimal-utils", () => ({
  toNumOrZero: vi.fn((v: unknown) => Number(v) || 0),
}));

// ── Helper ────────────────────────────────────────────────────────────────────

function buildReq(
  url: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  // NextRequest (no Request plano) para que `req.nextUrl.searchParams` exista
  // en handlers como /api/customer/data GET. Compatible con los que usan req.url.
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ── Reset entre tests ─────────────────────────────────────────────────────────

beforeEach(async () => {
  Object.values(prismaMocks).forEach((m) => m.mockReset());

  // Resetear requireAdmin al estado atacante (TENANT_A)
  const mod = await import("@/lib/require-admin");
  const fn = mod.requireAdmin as ReturnType<typeof vi.fn>;
  fn.mockReset();
  fn.mockResolvedValue({ tenantId: TENANT_A, username: "attacker-admin", role: "admin" });
});

// ═════════════════════════════════════════════════════════════════════════════
// TEST 1: GET /api/sales/[id] — solo retorna sale del tenant correcto
// ═════════════════════════════════════════════════════════════════════════════

describe("CT-01 — GET /api/sales/[id]: no permite cross-tenant", () => {
  it("atacante en TENANT_A no puede leer una sale que pertenece a TENANT_B", async () => {
    // Arrange: SalesDB.getById retorna null para TENANT_A (el atacante)
    // El mock de SalesDB ya implementa este comportamiento.

    // Act
    const { GET } = await import("@/app/api/sales/[id]/route");
    const req = buildReq("http://localhost/api/sales/sale-B-id");
    const res = await GET(req, { params: Promise.resolve({ id: "sale-B-id" }) });

    // Assert: debe ser 404, no 200 con datos de TENANT_B
    expect(res.status).toBe(404);
  });

  it("dueño legítimo de TENANT_B sí puede leer su propia sale", async () => {
    // Arrange: cambiar auth a TENANT_B
    const mod = await import("@/lib/require-admin");
    (mod.requireAdmin as ReturnType<typeof vi.fn>).mockResolvedValue({
      tenantId: TENANT_B,
      username: "owner-b",
      role: "admin",
    });

    const { GET } = await import("@/app/api/sales/[id]/route");
    const req = buildReq("http://localhost/api/sales/sale-B-id");
    const res = await GET(req, { params: Promise.resolve({ id: "sale-B-id" }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe("sale-B");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TEST 2: POST /api/delivery/notify — partner ajeno = 404
// ═════════════════════════════════════════════════════════════════════════════

describe("CT-02 — POST /api/delivery/notify: no permite notificar partner ajeno", () => {
  it("atacante TENANT_A no puede notificar a un partner de TENANT_B", async () => {
    // Arrange: partner no existe en TENANT_A
    prismaMocks.deliveryPartnerFindFirst.mockResolvedValue(null);

    // Act
    const { POST } = await import("@/app/api/delivery/notify/route");
    const req = buildReq("http://localhost/api/delivery/notify", "POST", {
      partnerId: "partner-B-id",
      orderId: "order-B-id",
    });
    const res = await POST(req);

    // Assert
    expect(res.status).toBe(404);

    // CRÍTICO: la query DEBE haber incluido tenantId del atacante (TENANT_A)
    // Si el handler omitiera tenantId, habría recuperado al partner de TENANT_B.
    expect(prismaMocks.deliveryPartnerFindFirst).toHaveBeenCalledWith({
      where: { id: "partner-B-id", tenantId: TENANT_A },
    });
  });

  it("mismo tenant puede notificar a su propio partner", async () => {
    prismaMocks.deliveryPartnerFindFirst.mockResolvedValue({
      id: "partner-A",
      name: "Repartidor A",
      phone: "999000111",
      email: null,
      notes: null,
      tenantId: TENANT_A,
    });
    prismaMocks.orderFindFirst.mockResolvedValue({
      id: "order-A",
      tenantId: TENANT_A,
      customerName: "Cliente A",
      customerLocation: "Av. 1",
      total: { toFixed: () => "50.00" },
      items: [],
    });

    const { POST } = await import("@/app/api/delivery/notify/route");
    const req = buildReq("http://localhost/api/delivery/notify", "POST", {
      partnerId: "partner-A",
      orderId: "order-A",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TEST 3: POST /api/delivery/confirm — orderId ajeno = 404
// ═════════════════════════════════════════════════════════════════════════════

describe("CT-03 — POST /api/delivery/confirm: no confirma entrega de orden ajena", () => {
  it("atacante TENANT_A no puede confirmar entrega de una orden de TENANT_B", async () => {
    // Arrange: deliveryAssignment no existe en TENANT_A
    prismaMocks.deliveryAssignmentFindFirst.mockResolvedValue(null);

    // Act
    const { POST } = await import("@/app/api/delivery/confirm/route");
    const req = buildReq("http://localhost/api/delivery/confirm", "POST", {
      orderId: "order-B-id",
    });
    const res = await POST(req);

    // Assert
    expect(res.status).toBe(404);

    // CRÍTICO: el handler debe haber buscado con tenantId del atacante
    expect(prismaMocks.deliveryAssignmentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orderId: "order-B-id",
          tenantId: TENANT_A,
        }),
      }),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TEST 4: POST /api/delivery/assignments — orderId ajeno = 404
// ═════════════════════════════════════════════════════════════════════════════

describe("CT-04 — POST /api/delivery/assignments: no asigna orden ajena", () => {
  it("atacante TENANT_A no puede asignar una orden de TENANT_B a un partner", async () => {
    // Arrange: order.findFirst({id, tenantId: TENANT_A}) = null
    prismaMocks.orderFindFirst.mockResolvedValue(null);

    // Act
    const { POST } = await import("@/app/api/delivery/assignments/route");
    const req = buildReq("http://localhost/api/delivery/assignments", "POST", {
      orderId: "order-B-id",
      partnerId: "partner-A-id",
      fee: 5,
    });
    const res = await POST(req);

    // Assert
    expect(res.status).toBe(404);

    expect(prismaMocks.orderFindFirst).toHaveBeenCalledWith({
      where: { id: "order-B-id", tenantId: TENANT_A },
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TEST 5: PATCH /api/delivery/assignments — assignment ajeno = 404
// ═════════════════════════════════════════════════════════════════════════════

describe("CT-05 — PATCH /api/delivery/assignments: no actualiza assignment ajeno", () => {
  it("atacante TENANT_A no puede cambiar estado de un assignment de TENANT_B", async () => {
    // Arrange: assignment no existe en TENANT_A
    prismaMocks.deliveryAssignmentFindFirst.mockResolvedValue(null);

    // Act
    const { PATCH } = await import("@/app/api/delivery/assignments/route");
    const req = buildReq("http://localhost/api/delivery/assignments", "PATCH", {
      id: "asgn-B-id",
      status: "picked_up",
    });
    const res = await PATCH(req);

    // Assert
    expect(res.status).toBe(404);

    expect(prismaMocks.deliveryAssignmentFindFirst).toHaveBeenCalledWith({
      where: { id: "asgn-B-id", tenantId: TENANT_A },
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TEST 6: GET /api/delivery/assignments — listado scopeado por tenantId
//
// Fix aplicado 2026-05-05: el route migró a `DeliveryAssignmentsDB.listByTenant(
// auth.tenantId, filters)` (route.ts:40). El aislamiento vive en la clase, que
// recibe el tenantId como 1er argumento. Este test verifica que el handler pasa
// el tenantId del ATACANTE (TENANT_A) — nunca el de la víctima — de modo que la
// clase nunca puede devolver assignments de TENANT_B.
// ═════════════════════════════════════════════════════════════════════════════

describe("CT-06 — GET /api/delivery/assignments: listado scopeado por tenantId", () => {
  it("el findMany recibe el tenantId del atacante (TENANT_A) en el where, no el de la víctima", async () => {
    // Arrange: con where.tenantId = TENANT_A, prisma no encuentra nada de B.
    prismaMocks.deliveryAssignmentFindMany.mockResolvedValue([]);

    // Act
    const { GET } = await import("@/app/api/delivery/assignments/route");
    const req = buildReq("http://localhost/api/delivery/assignments");
    const res = await GET(req);
    const json = await res.json();

    // Assert: lista vacía para el atacante, nunca datos de TENANT_B.
    expect(res.status).toBe(200);
    expect(json).toEqual([]);

    // CRÍTICO: el where pasado a prisma DEBE incluir el tenantId del atacante.
    expect(prismaMocks.deliveryAssignmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A }),
      }),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TEST 7: GET /api/delivery/my-orders — no lista orders de tenant ajeno
// ═════════════════════════════════════════════════════════════════════════════

describe("CT-07 — GET /api/delivery/my-orders: filtra por tenantId", () => {
  it("atacante TENANT_A no ve assignments de TENANT_B en my-orders", async () => {
    // Arrange: deliveryPartner no existe en TENANT_A (attacker username no matchea)
    prismaMocks.deliveryPartnerFindFirst.mockResolvedValue(null);
    // El findMany filtra por tenantId: TENANT_A → devuelve array vacío
    prismaMocks.deliveryAssignmentFindMany.mockResolvedValue([]);

    // Act
    const { GET } = await import("@/app/api/delivery/my-orders/route");
    const req = buildReq("http://localhost/api/delivery/my-orders");
    const res = await GET(req);
    const json = await res.json();

    // Assert: lista vacía, no datos de TENANT_B
    expect(res.status).toBe(200);
    expect(json).toEqual([]);

    // CRÍTICO: el findMany debe incluir tenantId en el where
    expect(prismaMocks.deliveryAssignmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A }),
      }),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TEST 8: POST /api/invoices/boleta — orderId ajeno = 404
// ═════════════════════════════════════════════════════════════════════════════

describe("CT-08 — POST /api/invoices/boleta: no emite boleta con orden ajena", () => {
  it("atacante TENANT_A no puede generar boleta de una orden de TENANT_B", async () => {
    // Arrange: order.findFirst({id, tenantId: TENANT_A}) = null
    prismaMocks.orderFindFirst.mockResolvedValue(null);

    // Act
    const { POST } = await import("@/app/api/invoices/boleta/route");
    const req = buildReq("http://localhost/api/invoices/boleta", "POST", {
      orderId: "order-B-id",
      clienteNombre: "Cliente Atacante",
    });
    const res = await POST(req);

    // Assert
    expect(res.status).toBe(404);

    expect(prismaMocks.orderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "order-B-id",
          tenantId: TENANT_A,
        }),
      }),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TEST 9: GET /api/sales/export — solo del tenant autenticado
// ═════════════════════════════════════════════════════════════════════════════

describe("CT-09 — GET /api/sales/export: scope por tenantId en CSV", () => {
  it("el export filtra ventas exclusivamente del tenant autenticado", async () => {
    // Arrange: sale.findMany devuelve datos
    prismaMocks.saleFindMany.mockResolvedValue([
      {
        id: "sale-A",
        tenantId: TENANT_A,
        createdAt: new Date("2026-05-05"),
        total: 100,
        totalCogs: 60,
        items: [],
        payment: "efectivo",
        amountPaid: 100,
        change: 0,
        comprobanteTipo: "ticket",
        comprobanteRuc: null,
        descuentoMonto: null,
        cashierId: "cajero1",
        customerPhone: null,
      },
    ]);

    // Act
    const { GET } = await import("@/app/api/sales/export/route");
    const req = buildReq("http://localhost/api/sales/export");
    const res = await GET(req);

    // Assert: la respuesta es CSV (200)
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");

    // CRÍTICO: findMany DEBE haberse llamado con tenantId del atacante
    // (solo ve su propio tenant, no el de la víctima)
    expect(prismaMocks.saleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A }),
      }),
    );
  });

  it("el CSV no contiene datos de TENANT_B cuando el atacante es de TENANT_A", async () => {
    // Arrange: el handler filtra correctamente → devuelve solo ventas de TENANT_A
    prismaMocks.saleFindMany.mockResolvedValue([]); // TENANT_A no tiene ventas del B

    const { GET } = await import("@/app/api/sales/export/route");
    const req = buildReq("http://localhost/api/sales/export");
    const res = await GET(req);
    const csvText = await res.text();

    // Solo debe existir el header CSV, sin filas de datos ajenos
    const lines = csvText.trim().split("\n");
    expect(lines).toHaveLength(1); // solo header
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TEST 10: POST /api/sunat/emit — orderId ajeno = 404
// ═════════════════════════════════════════════════════════════════════════════

describe("CT-10 — POST /api/sunat/emit: no emite comprobante con orden ajena", () => {
  it("atacante TENANT_A no puede emitir comprobante SUNAT de orden de TENANT_B", async () => {
    // Arrange: order.findFirst({id, tenantId: TENANT_A}) = null
    prismaMocks.orderFindFirst.mockResolvedValue(null);

    // Act
    const { POST } = await import("@/app/api/sunat/emit/route");
    const req = buildReq("http://localhost/api/sunat/emit", "POST", {
      orderId: "order-B-id",
      type: "boleta",
    });
    const res = await POST(req);

    // Assert
    expect(res.status).toBe(404);

    expect(prismaMocks.orderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "order-B-id",
          tenantId: TENANT_A,
        }),
      }),
    );
  });

  it("atacante no puede emitir factura con RUC ajeno", async () => {
    prismaMocks.orderFindFirst.mockResolvedValue(null);

    const { POST } = await import("@/app/api/sunat/emit/route");
    const req = buildReq("http://localhost/api/sunat/emit", "POST", {
      orderId: "order-B-id",
      type: "factura",
      customerRuc: "20100000001",
    });
    const res = await POST(req);

    expect(res.status).toBe(404);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TEST 11: DELETE /api/customer/data — phone+tenantId scope
// ═════════════════════════════════════════════════════════════════════════════

describe("CT-11 — DELETE /api/customer/data: scope por phone + tenantId", () => {
  it("atacante TENANT_A no puede borrar customer de TENANT_B con mismo phone", async () => {
    // Arrange: customer no existe en TENANT_A con ese phone (findFirst de la clase).
    prismaMocks.customerFindFirst.mockResolvedValue(null);

    // Act
    const { DELETE } = await import("@/app/api/customer/data/route");
    const req = buildReq("http://localhost/api/customer/data", "DELETE", {
      phone: "51999000111",
      confirm: true,
    });
    const res = await DELETE(req);

    // Assert: 404, no borra nada
    expect(res.status).toBe(404);

    // CRÍTICO: la búsqueda de guard usa tenantId del atacante.
    expect(prismaMocks.customerFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { phone: "51999000111", tenantId: TENANT_A },
      }),
    );

    // deleteMany NO debe haberse llamado
    expect(prismaMocks.customerDeleteMany).not.toHaveBeenCalled();
  });

  it("deleteMany usa tenantId cuando el customer sí existe en el tenant", async () => {
    // Arrange: customer existe en TENANT_A
    prismaMocks.customerFindFirst.mockResolvedValue({
      phone: "51999000111",
      tenantId: TENANT_A,
      savedCarts: [],
    });
    prismaMocks.customerDeleteMany.mockResolvedValue({ count: 1 });
    prismaMocks.reviewUpdateMany.mockResolvedValue({ count: 0 });

    const { DELETE } = await import("@/app/api/customer/data/route");
    const req = buildReq("http://localhost/api/customer/data", "DELETE", {
      phone: "51999000111",
      confirm: true,
    });
    const res = await DELETE(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.deleted).toBe(true);

    // CRÍTICO: deleteMany también debe usar tenantId
    expect(prismaMocks.customerDeleteMany).toHaveBeenCalledWith({
      where: { phone: "51999000111", tenantId: TENANT_A },
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TEST 12: GET /api/customer/data — export de PII scopeado por tenantId
//
// Fix aplicado 2026-05-05: el route migró a `CustomerDataDB.findCustomerWithCarts(
// auth.tenantId, phone)` (route.ts:40). El tenantId es el 1er argumento, así que
// un admin de TENANT_A nunca puede exportar la PII de un customer de TENANT_B
// aunque conozca su teléfono. Ley 29733 PE.
// ═════════════════════════════════════════════════════════════════════════════

describe("CT-12 — GET /api/customer/data: export PII scopeado por tenantId", () => {
  it("atacante TENANT_A no puede exportar PII de un customer de TENANT_B con su phone", async () => {
    // Arrange: con where.tenantId = TENANT_A, prisma no encuentra al customer de B.
    prismaMocks.customerFindFirst.mockResolvedValue(null);

    // Act
    const { GET } = await import("@/app/api/customer/data/route");
    const req = buildReq("http://localhost/api/customer/data?phone=51999000111");
    const res = await GET(req);

    // Assert: 404, sin filtrar PII ajena.
    expect(res.status).toBe(404);

    // CRÍTICO: el findFirst DEBE filtrar por phone + tenantId del atacante.
    expect(prismaMocks.customerFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { phone: "51999000111", tenantId: TENANT_A },
      }),
    );
  });

  it("dueño legítimo de TENANT_A sí exporta la PII de su propio customer", async () => {
    // Arrange: el customer existe en TENANT_A.
    prismaMocks.customerFindFirst.mockResolvedValue({
      phone: "51999000111",
      name: "Cliente A",
      location: "Av. 1",
      reference: null,
      birthday: null,
      aiNotes: null,
      privateNotes: null,
      createdAt: new Date("2026-05-05"),
      updatedAt: new Date("2026-05-05"),
      loyaltyPoints: 0,
      loyaltyTier: "bronze",
      totalSpent: 0,
      creditBalance: 0,
      referralCode: null,
      referredBy: null,
      savedCarts: [],
    });
    prismaMocks.orderFindMany.mockResolvedValue([]);
    // review.findMany ya retorna [] por el mock base.

    const { GET } = await import("@/app/api/customer/data/route");
    const req = buildReq("http://localhost/api/customer/data?phone=51999000111");
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.personal.phone).toBe("51999000111");
    // El guard del export filtra por tenantId del solicitante.
    expect(prismaMocks.customerFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { phone: "51999000111", tenantId: TENANT_A },
      }),
    );
  });
});
