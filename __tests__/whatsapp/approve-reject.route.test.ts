/**
 * __tests__/whatsapp/approve-reject.route.test.ts
 *
 * Unit tests para:
 *  - POST /api/superadmin/payment-approvals/[id]/approve
 *  - POST /api/superadmin/payment-approvals/[id]/reject
 *
 * Mockea: superadmin-auth, payment-approval.db, order-payment-link.db,
 *         orders.db, notify-yape-result.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Superadmin auth
const mockRequirePlatformAPI = vi.fn();
vi.mock("@/lib/superadmin-auth", () => ({
  requirePlatformAPI: (...args: unknown[]) => mockRequirePlatformAPI(...args),
}));

// PaymentApprovalDb
const mockGetById = vi.fn();
const mockApprove = vi.fn();
const mockReject = vi.fn();
vi.mock("@/lib/db/payment-approval.db", () => ({
  PaymentApprovalDb: {
    getById: (...args: unknown[]) => mockGetById(...args),
    approve: (...args: unknown[]) => mockApprove(...args),
    reject: (...args: unknown[]) => mockReject(...args),
  },
}));

// OrderPaymentLinkDb
const mockFindByApprovalId = vi.fn();
vi.mock("@/lib/db/order-payment-link.db", () => ({
  OrderPaymentLinkDb: {
    findByApprovalId: (...args: unknown[]) => mockFindByApprovalId(...args),
  },
}));

// OrdersDB
const mockOrdersUpdate = vi.fn();
vi.mock("@/lib/db/orders.db", () => ({
  OrdersDB: {
    update: (...args: unknown[]) => mockOrdersUpdate(...args),
  },
}));

// Notify
const mockNotifyApproved = vi.fn();
const mockNotifyRejected = vi.fn();
vi.mock("@/lib/whatsapp/notify-yape-result", () => ({
  notifyYapeApproved: (...args: unknown[]) => mockNotifyApproved(...args),
  notifyYapeRejected: (...args: unknown[]) => mockNotifyRejected(...args),
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { POST as approveHandler } from "@/app/api/superadmin/payment-approvals/[id]/approve/route";
import { POST as rejectHandler } from "@/app/api/superadmin/payment-approvals/[id]/reject/route";

// ─── Factories ────────────────────────────────────────────────────────────────

function makeApproval(overrides: Record<string, unknown> = {}) {
  return {
    id: "pap_test_001",
    customerPhone: "51987654321",
    expectedAmount: 100.0,
    detectedAmount: 100.0,
    status: "pending",
    conversationId: "conv-001",
    imageUrl: "https://cdn.example.com/yape.jpg",
    visionResponse: null,
    yapeOpCode: "123456",
    yapeLast4: "5678",
    yapeDate: null,
    rejectionReason: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeLinkedOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-001",
    tenantId: "test-tenant-1",
    status: "pendiente",
    total: 100.0,
    customerPhone: "51987654321",
    customerName: "Juan Pérez",
    storeName: "Bodega San Martín",
    ...overrides,
  };
}

function makeApproveRequest(body: Record<string, unknown> = {}) {
  return new NextRequest(
    "http://localhost:3000/api/superadmin/payment-approvals/pap_test_001/approve",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function makeRejectRequest(body: Record<string, unknown> = { reason: "Imagen incorrecta, no es Yape" }) {
  return new NextRequest(
    "http://localhost:3000/api/superadmin/payment-approvals/pap_test_001/reject",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

const PARAMS = Promise.resolve({ id: "pap_test_001" });
const AUTH_OK = { ok: true as const, username: "superadmin_juan" };

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("POST /api/superadmin/payment-approvals/[id]/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePlatformAPI.mockResolvedValue(AUTH_OK);
    mockApprove.mockResolvedValue(undefined);
    mockOrdersUpdate.mockResolvedValue({ id: "order-001", status: "confirmado" });
    mockNotifyApproved.mockResolvedValue(true);
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it("approval pending → status approved + Orders confirmado + notificación", async () => {
    // Arrange
    mockGetById.mockResolvedValue(makeApproval({ status: "pending" }));
    mockFindByApprovalId.mockResolvedValue([makeLinkedOrder()]);

    // Act
    const res = await approveHandler(makeApproveRequest(), { params: PARAMS });
    const data = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.ordersUpdated).toBe(1);
    expect(mockApprove).toHaveBeenCalledWith("pap_test_001", "superadmin_juan");
    expect(mockOrdersUpdate).toHaveBeenCalledWith(
      "test-tenant-1",
      "order-001",
      { status: "confirmado" },
    );
    expect(mockNotifyApproved).toHaveBeenCalledOnce();
  });

  it("approval review_required → también se puede aprobar", async () => {
    // Arrange
    mockGetById.mockResolvedValue(makeApproval({ status: "review_required" }));
    mockFindByApprovalId.mockResolvedValue([makeLinkedOrder()]);

    // Act
    const res = await approveHandler(makeApproveRequest(), { params: PARAMS });
    const data = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockApprove).toHaveBeenCalledOnce();
  });

  it("múltiples orders linkeados → todos pasan a confirmado", async () => {
    // Arrange — multi-vendor checkout con 2 orders
    mockGetById.mockResolvedValue(makeApproval({ status: "pending" }));
    mockFindByApprovalId.mockResolvedValue([
      makeLinkedOrder({ id: "order-001", tenantId: "tenant-a" }),
      makeLinkedOrder({ id: "order-002", tenantId: "tenant-b", storeName: "Tienda Norte" }),
    ]);

    // Act
    const res = await approveHandler(makeApproveRequest(), { params: PARAMS });
    const data = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(data.ordersUpdated).toBe(2);
    expect(mockOrdersUpdate).toHaveBeenCalledTimes(2);
  });

  it("order ya confirmado → se cuenta como updated sin llamar OrdersDB.update", async () => {
    // Arrange — order ya está en confirmado (doble-tap de aprobación)
    mockGetById.mockResolvedValue(makeApproval({ status: "review_required" }));
    mockFindByApprovalId.mockResolvedValue([
      makeLinkedOrder({ status: "confirmado" }),
    ]);

    // Act
    const res = await approveHandler(makeApproveRequest(), { params: PARAMS });
    const data = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(data.ordersUpdated).toBe(1); // se cuenta igual
    expect(mockOrdersUpdate).not.toHaveBeenCalled(); // skip — ya confirmado
  });

  // ── 409 ya procesado ─────────────────────────────────────────────────────────

  it("approval ya approved → 409 con mensaje de estado", async () => {
    // Arrange
    mockGetById.mockResolvedValue(makeApproval({ status: "approved" }));

    // Act
    const res = await approveHandler(makeApproveRequest(), { params: PARAMS });
    const data = await res.json();

    // Assert
    expect(res.status).toBe(409);
    expect(data.error).toContain("approved");
    expect(mockApprove).not.toHaveBeenCalled();
  });

  it("approval ya rejected → 409", async () => {
    // Arrange
    mockGetById.mockResolvedValue(makeApproval({ status: "rejected" }));

    // Act
    const res = await approveHandler(makeApproveRequest(), { params: PARAMS });
    const data = await res.json();

    // Assert
    expect(res.status).toBe(409);
    expect(data.error).toContain("rejected");
  });

  // ── 404 ──────────────────────────────────────────────────────────────────────

  it("approval no existe → 404", async () => {
    // Arrange
    mockGetById.mockResolvedValue(null);

    // Act
    const res = await approveHandler(makeApproveRequest(), { params: PARAMS });

    // Assert
    expect(res.status).toBe(404);
  });

  // ── 401 sin auth ──────────────────────────────────────────────────────────────

  it("sin auth → 401 (requirePlatformAPI retorna NextResponse 401)", async () => {
    // Arrange
    mockRequirePlatformAPI.mockResolvedValue(
      NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    );

    // Act
    const res = await approveHandler(makeApproveRequest(), { params: PARAMS });

    // Assert
    expect(res.status).toBe(401);
    expect(mockGetById).not.toHaveBeenCalled();
  });

  // ── Notificación falla pero no bloquea ────────────────────────────────────────

  it("notificación falla → 200 igual con customerNotified=false", async () => {
    // Arrange
    mockGetById.mockResolvedValue(makeApproval({ status: "pending" }));
    mockFindByApprovalId.mockResolvedValue([makeLinkedOrder()]);
    mockNotifyApproved.mockResolvedValue(false); // falla la notificación

    // Act
    const res = await approveHandler(makeApproveRequest(), { params: PARAMS });
    const data = await res.json();

    // Assert — respuesta sigue siendo 200 OK, solo customerNotified=false
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.customerNotified).toBe(false);
  });

  // ── Sin orders linkeados ───────────────────────────────────────────────────────

  it("sin orders linkeados → 200 con ordersUpdated=0 y customerNotified=false", async () => {
    // Arrange — puede pasar si el link DB todavía no fue creado
    mockGetById.mockResolvedValue(makeApproval({ status: "pending" }));
    mockFindByApprovalId.mockResolvedValue([]);

    // Act
    const res = await approveHandler(makeApproveRequest(), { params: PARAMS });
    const data = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(data.ordersUpdated).toBe(0);
    expect(data.customerNotified).toBe(false); // linked.length === 0
    expect(mockNotifyApproved).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/superadmin/payment-approvals/[id]/reject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePlatformAPI.mockResolvedValue(AUTH_OK);
    mockReject.mockResolvedValue(undefined);
    mockOrdersUpdate.mockResolvedValue({ id: "order-001", status: "cancelado" });
    mockNotifyRejected.mockResolvedValue(true);
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it("approval pending + reason válida → status rejected + Orders cancelado + notificación", async () => {
    // Arrange
    mockGetById.mockResolvedValue(makeApproval({ status: "pending" }));
    mockFindByApprovalId.mockResolvedValue([makeLinkedOrder()]);

    // Act
    const res = await rejectHandler(
      makeRejectRequest({ reason: "El monto detectado no coincide con el esperado" }),
      { params: PARAMS },
    );
    const data = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.ordersUpdated).toBe(1);
    expect(mockReject).toHaveBeenCalledWith(
      "pap_test_001",
      "superadmin_juan",
      "El monto detectado no coincide con el esperado",
    );
    expect(mockOrdersUpdate).toHaveBeenCalledWith(
      "test-tenant-1",
      "order-001",
      { status: "cancelado" },
    );
    expect(mockNotifyRejected).toHaveBeenCalledOnce();
  });

  // ── Validación de reason ─────────────────────────────────────────────────────

  it("reason muy corto (<5 chars) → 400 con mensaje de validación", async () => {
    // Act
    const res = await rejectHandler(
      makeRejectRequest({ reason: "abc" }), // solo 3 chars
      { params: PARAMS },
    );
    const data = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(data.error).toContain("mínimo 5 caracteres");
    expect(mockReject).not.toHaveBeenCalled();
  });

  it("reason exactamente 5 chars → válido", async () => {
    // Arrange
    mockGetById.mockResolvedValue(makeApproval({ status: "pending" }));
    mockFindByApprovalId.mockResolvedValue([]);

    // Act
    const res = await rejectHandler(
      makeRejectRequest({ reason: "Fraude" }), // 6 chars — válido
      { params: PARAMS },
    );
    const data = await res.json();

    // Assert — "Fraude" tiene 6 chars, cumple mínimo 5
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
  });

  it("reason ausente (body vacío) → 400", async () => {
    // Act
    const res = await rejectHandler(
      makeRejectRequest({}), // sin reason
      { params: PARAMS },
    );
    const data = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(mockReject).not.toHaveBeenCalled();
  });

  it("reason demasiado largo (>500 chars) → 400", async () => {
    // Act
    const res = await rejectHandler(
      makeRejectRequest({ reason: "x".repeat(501) }),
      { params: PARAMS },
    );
    const data = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(mockReject).not.toHaveBeenCalled();
  });

  // ── 409 ya procesado ─────────────────────────────────────────────────────────

  it("approval ya rejected → 409", async () => {
    // Arrange
    mockGetById.mockResolvedValue(makeApproval({ status: "rejected" }));

    // Act
    const res = await rejectHandler(makeRejectRequest(), { params: PARAMS });
    const data = await res.json();

    // Assert
    expect(res.status).toBe(409);
    expect(mockReject).not.toHaveBeenCalled();
  });

  it("approval ya approved → 409", async () => {
    // Arrange
    mockGetById.mockResolvedValue(makeApproval({ status: "approved" }));

    // Act
    const res = await rejectHandler(makeRejectRequest(), { params: PARAMS });
    const data = await res.json();

    // Assert
    expect(res.status).toBe(409);
    expect(data.error).toContain("approved");
  });

  // ── 404 ──────────────────────────────────────────────────────────────────────

  it("approval no existe → 404", async () => {
    // Arrange
    mockGetById.mockResolvedValue(null);

    // Act
    const res = await rejectHandler(makeRejectRequest(), { params: PARAMS });

    // Assert
    expect(res.status).toBe(404);
  });

  // ── 401 sin auth ──────────────────────────────────────────────────────────────

  it("sin auth → 401, no llega a validar reason ni leer approval", async () => {
    // Arrange
    mockRequirePlatformAPI.mockResolvedValue(
      NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    );

    // Act
    const res = await rejectHandler(makeRejectRequest(), { params: PARAMS });

    // Assert
    expect(res.status).toBe(401);
    expect(mockGetById).not.toHaveBeenCalled();
    expect(mockReject).not.toHaveBeenCalled();
  });

  // ── Notificación y cancelación de orders ─────────────────────────────────────

  it("notificación falla → 200 igual con customerNotified=false", async () => {
    // Arrange
    mockGetById.mockResolvedValue(makeApproval({ status: "pending" }));
    mockFindByApprovalId.mockResolvedValue([makeLinkedOrder()]);
    mockNotifyRejected.mockResolvedValue(false);

    // Act
    const res = await rejectHandler(makeRejectRequest(), { params: PARAMS });
    const data = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.customerNotified).toBe(false);
  });

  it("order ya cancelado → se cuenta pero no llama OrdersDB.update", async () => {
    // Arrange
    mockGetById.mockResolvedValue(makeApproval({ status: "pending" }));
    mockFindByApprovalId.mockResolvedValue([
      makeLinkedOrder({ status: "cancelado" }),
    ]);

    // Act
    const res = await rejectHandler(makeRejectRequest(), { params: PARAMS });
    const data = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(data.ordersUpdated).toBe(1);
    expect(mockOrdersUpdate).not.toHaveBeenCalled();
  });

  it("notifyRejected recibe el reason del body exactamente", async () => {
    // Arrange
    mockGetById.mockResolvedValue(makeApproval({ status: "pending", customerPhone: "51987654321" }));
    mockFindByApprovalId.mockResolvedValue([]);
    const reason = "La captura está borrosa y no se puede verificar";

    // Act
    await rejectHandler(makeRejectRequest({ reason }), { params: PARAMS });

    // Assert
    expect(mockNotifyRejected).toHaveBeenCalledWith(
      expect.objectContaining({ reason }),
    );
  });
});
