/**
 * T4 — delivery-double-assignment.test.ts
 *
 * POST /api/delivery/assignments rechaza si la orden ya tiene assignment activo.
 * La lógica está en route.ts linea ~120: findUnique({where:{orderId}}) → 422.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/whatsapp", () => ({
  sendWhatsAppQueued: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () => ({
    tenantId: "tenant-a",
    username: "qa",
    role: "admin",
  })),
}));

const mockOrderFindFirst = vi.fn();
const mockPartnerFindFirst = vi.fn();
const mockAssignmentFindUnique = vi.fn();
const mockAssignmentCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: { findFirst: mockOrderFindFirst },
    deliveryPartner: { findFirst: mockPartnerFindFirst },
    deliveryAssignment: {
      findUnique: mockAssignmentFindUnique,
      create: mockAssignmentCreate,
    },
  },
}));

const { POST } = await import("@/app/api/delivery/assignments/route");

function makePostReq(body: object) {
  return new NextRequest("http://localhost/api/delivery/assignments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/delivery/assignments — doble asignación rechazada", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Order y partner existen y pertenecen al tenant
    mockOrderFindFirst.mockResolvedValue({ id: "order-1", tenantId: "tenant-a" });
    mockPartnerFindFirst.mockResolvedValue({ id: "partner-1" });
  });

  it("retorna 422 si la orden ya tiene un delivery asignado", async () => {
    // Simular que ya existe un assignment para esta orden
    mockAssignmentFindUnique.mockResolvedValueOnce({
      id: "existing-asgn",
      orderId: "order-1",
      status: "assigned",
    });

    const res = await POST(
      makePostReq({ orderId: "order-1", partnerId: "partner-1", fee: 5.0 })
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/ya tiene un delivery asignado/i);
  });

  it("crea assignment cuando la orden no tiene asignación previa (201)", async () => {
    mockAssignmentFindUnique.mockResolvedValueOnce(null); // Sin assignment previo
    mockAssignmentCreate.mockResolvedValueOnce({
      id: "new-asgn",
      orderId: "order-1",
      partnerId: "partner-1",
      fee: 5.0,
      tenantId: "tenant-a",
      order: { id: "order-1", customerName: "Ana", total: 50, customerLocation: "Av. Principal" },
      partner: { id: "partner-1", name: "Carlos", phone: "987654321" },
    });

    const res = await POST(
      makePostReq({ orderId: "order-1", partnerId: "partner-1", fee: 5.0 })
    );

    expect(res.status).toBe(201);
    expect(mockAssignmentCreate).toHaveBeenCalledOnce();
  });
});
