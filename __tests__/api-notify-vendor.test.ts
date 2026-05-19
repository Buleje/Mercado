/**
 * Tests unitarios — POST /api/marketplace/notify-vendor
 *
 * El endpoint usa queue.enqueue (fire-and-forget) y retorna 202 inmediatamente.
 * Schema usa z.record(z.string(), z.unknown()) (forma válida en Zod v4).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── requireAdmin ──────────────────────────────────────────────────────────────
const { mockRequireAdmin } = vi.hoisted(() => ({ mockRequireAdmin: vi.fn() }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));

// ── queue — mock del objeto que el endpoint intenta importar ──────────────────
const { mockEnqueue } = vi.hoisted(() => ({ mockEnqueue: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/queue", () => ({
  queue: { enqueue: mockEnqueue },
  enqueueNotification: mockEnqueue,
  isQueueEnabled: vi.fn(() => true),
}));

// ── verifyOwnerPhone — el endpoint exige que el phone pertenezca al tenant ──
const { mockVerifyOwnerPhone } = vi.hoisted(() => ({
  mockVerifyOwnerPhone: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/db/tenant-billing.db", () => ({
  TenantBillingDB: { verifyOwnerPhone: mockVerifyOwnerPhone },
}));

// ── runWithAuditContext — passthrough ────────────────────────────────────────
vi.mock("@/lib/audit/audit-context", () => ({
  runWithAuditContext: (_req: unknown, _user: unknown, fn: () => unknown) => fn(),
}));

import { POST } from "@/app/api/marketplace/notify-vendor/route";

const AUTH = { tenantId: "tenant-a", role: "admin", username: "tester" };
const UNAUTH = NextResponse.json({ error: "unauthorized" }, { status: 401 });

function makeReq(body: unknown) {
  return new NextRequest("https://host/api/marketplace/notify-vendor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/marketplace/notify-vendor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockVerifyOwnerPhone.mockResolvedValue(true);
  });

  // 1. Tipo new_order con context válido → 202
  it("new_order con context válido → 202 { ok: true }", async () => {
    const res = await POST(makeReq({
      vendorPhone: "+51999000111",
      type: "new_order",
      context: { vendorName: "Pedro", orderId: "ord-1", total: "120.00" },
    }));
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  // 2. Tipo low_stock → template correcto
  it("low_stock encola mensaje con stock info", async () => {
    await POST(makeReq({
      vendorPhone: "+51999000111",
      type: "low_stock",
      context: { productName: "Arroz 5kg", stock: 3 },
    }));
    expect(mockEnqueue).toHaveBeenCalledWith(
      "send-whatsapp",
      expect.objectContaining({
        phone: "+51999000111",
        message: expect.stringContaining("Arroz 5kg"),
      }),
    );
    expect(mockEnqueue.mock.calls[0][1].message).toContain("3 unidades");
  });

  // 3. Type inválido → 400
  it("type inválido → 400", async () => {
    const res = await POST(makeReq({
      vendorPhone: "+51999000111",
      type: "desconocido",
      context: {},
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues).toBeDefined();
  });

  // 4. Sin vendorPhone → 400 (usar context:{} para evitar BUG #2 z.record(z.any()) con valores)
  it("sin vendorPhone → 400", async () => {
    const res = await POST(makeReq({
      type: "new_order",
      context: {},
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues).toBeDefined();
  });

  // 5. Sin context → 400
  it("sin context → 400", async () => {
    const res = await POST(makeReq({
      vendorPhone: "+51999000111",
      type: "new_order",
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues).toBeDefined();
  });

  // 6. Encola el job en BullMQ (verifica mock.calls)
  it("encola un job send-whatsapp en la queue", async () => {
    await POST(makeReq({
      vendorPhone: "+51999000111",
      type: "new_review",
      context: { rating: 5, customer: "Ana", productName: "Café 250g" },
    }));
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith(
      "send-whatsapp",
      expect.objectContaining({
        tenantId: AUTH.tenantId,
        phone: "+51999000111",
      }),
    );
  });

  // 7. Retorna inmediato (202) sin esperar al worker
  it("responde 202 inmediatamente (no espera resolución del job)", async () => {
    mockEnqueue.mockImplementationOnce(
      () => new Promise((r) => setTimeout(() => r(null), 100)),
    );
    const start = Date.now();
    const res = await POST(makeReq({
      vendorPhone: "+51999000111",
      type: "price_alert",
      context: { productName: "Aceite 1L" },
    }));
    const elapsed = Date.now() - start;
    expect(res.status).toBe(202);
    expect(elapsed).toBeLessThan(50);
  });

  // 8. Sin auth → 401
  it("retorna 401 si requireAdmin falla", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await POST(makeReq({
      vendorPhone: "+51999000111",
      type: "new_order",
      context: {},
    }));
    expect(res.status).toBe(401);
  });
});
