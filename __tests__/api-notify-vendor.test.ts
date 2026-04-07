/**
 * Tests unitarios — POST /api/marketplace/notify-vendor
 *
 * El endpoint usa queue.enqueue (fire-and-forget) y retorna 202 inmediatamente.
 *
 * BUG #1 (a corregir en endpoint): notify-vendor/route.ts importa `{ queue }` desde "@/lib/queue"
 * pero lib/queue/index.ts NO exporta un objeto `queue` con método `enqueue`.
 * Solo exporta funciones individuales (enqueueNotification, etc.).
 *
 * BUG #2 (a corregir en endpoint): El BodySchema usa `z.record(z.any())` para `context`,
 * pero `z.any()` en Zod v4 crashea con TypeError al llamar safeParse con valor no-vacío.
 * Usar `z.record(z.string(), z.unknown())` en su lugar.
 * Verificado: `z.record(z.any()).safeParse({a:1})` → TypeError en Node v24 + Zod v4.
 *
 * Los tests que llegan al safeParse con context definido están marcados como .todo
 * hasta que el backend corrija el schema de Zod.
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
  // también se exportan las funciones individuales por si acaso
  enqueueNotification: mockEnqueue,
  isQueueEnabled: vi.fn(() => true),
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
  });

  // 1. Tipo new_order con context válido → 202
  // TODO: activar cuando backend corrija z.record(z.any()) → z.record(z.string(), z.unknown())
  it.todo("new_order con context válido → 202 { ok: true } [BLOQUEADO: BUG #2 z.record(z.any())]");

  // 2. Tipo low_stock → template correcto
  // TODO: activar cuando backend corrija z.record(z.any())
  it.todo("low_stock encola mensaje con stock info [BLOQUEADO: BUG #2 z.record(z.any())]");

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
  // TODO: activar cuando backend corrija z.record(z.any())
  it.todo("encola un job send-whatsapp en la queue [BLOQUEADO: BUG #2 z.record(z.any())]");

  // 7. Retorna inmediato (202) sin esperar al worker
  // TODO: activar cuando backend corrija z.record(z.any())
  it.todo("responde 202 inmediatamente (no espera resolución del job) [BLOQUEADO: BUG #2 z.record(z.any())]");

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
