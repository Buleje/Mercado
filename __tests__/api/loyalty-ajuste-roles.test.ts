// @vitest-environment node
/**
 * Puntos a mano (11-10): sumar es del dueño o el encargado; el cajero ya no.
 *
 *  · `PATCH /api/loyalty/[phone]` pedía `requireAdmin(req)` sin roles: cualquier
 *    rol del panel sumaba N puntos a cualquiera y se cobraban como descuento.
 *  · `POST /api/marketplace/loyalty` (Marketplace › Fidelidad) le dejaba al
 *    cajero el `earn`. El canje (`redeem`) le sigue abierto.
 *
 * `requireAdmin` se reemplaza por uno que imita al real: sin sesión 401, el
 * management tier (admin/owner/manager) pasa siempre, el resto sólo si está en
 * la lista; sin lista pasa cualquiera (lo que dejaba el hueco).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  rol: null as string | null,
  pedidos: [] as unknown[],
  earn: vi.fn(),
  redeemPoints: vi.fn(),
  getByPhone: vi.fn(),
  mktRedeem: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: async (_req: unknown, roles?: readonly string[]) => {
    H.pedidos.push(roles);
    if (!H.rol) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const tier = ["admin", "owner", "manager"].includes(H.rol);
    if (roles && !tier && !roles.includes(H.rol)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return { role: H.rol, tenantId: "t-qa", username: `qa${H.rol}` };
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: async () => null,
  rateLimit: () => ({ allowed: true }),
  getClientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/auth/require-customer", () => ({ requireCustomer: vi.fn() }));
vi.mock("@/lib/auth/customer-session", () => ({
  CUSTOMER_SESSION: { COOKIE_NAME: "bsm-customer" },
  telefonoDeLaSesion: () => null,
}));
vi.mock("@/lib/auth/resolve-marketplace-tenant", () => ({ resolveMarketplaceTenant: vi.fn() }));
vi.mock("@/lib/jsondb", () => ({
  normalizePhone: (p: string) => p.replace(/\D/g, ""),
  LoyaltyDB: { getByPhone: H.getByPhone, redeemPoints: H.redeemPoints, TIERS: [] },
}));
vi.mock("@/lib/db/loyalty.db", () => ({
  LoyaltyDB: {
    earn: H.earn,
    redeem: H.mktRedeem,
    getBalance: async () => 0,
  },
}));
vi.mock("@/lib/db/customers.db", () => ({ CustomersDB: {} }));

import { PATCH } from "@/app/api/loyalty/[phone]/route";
import { POST } from "@/app/api/marketplace/loyalty/route";
import { ROLES_AJUSTE_PUNTOS } from "@/lib/loyalty/roles-ajuste";

const TEL = "987654321";

function patch(points: number) {
  const req = new NextRequest(`http://localhost/api/loyalty/${TEL}`, {
    method: "PATCH",
    body: JSON.stringify({ points }),
    headers: { "content-type": "application/json" },
  });
  return PATCH(req, { params: Promise.resolve({ phone: TEL }) });
}

function post(action: "earn" | "redeem", points: number) {
  const req = new NextRequest("http://localhost/api/marketplace/loyalty", {
    method: "POST",
    body: JSON.stringify({ action, phone: TEL, points }),
    headers: { "content-type": "application/json" },
  });
  return POST(req);
}

beforeEach(() => {
  H.rol = null;
  H.pedidos.length = 0;
  for (const f of [H.earn, H.redeemPoints, H.getByPhone, H.mktRedeem]) f.mockReset();
  H.getByPhone.mockResolvedValue({ phone: TEL, loyaltyPoints: 500 });
  H.redeemPoints.mockResolvedValue(true);
  H.earn.mockResolvedValue({ id: "tx1" });
  H.mktRedeem.mockResolvedValue({ id: "tx2" });
});

describe("PATCH /api/loyalty/[phone] — ajuste a mano", () => {
  it("pide roles explícitos a requireAdmin (antes, ninguno)", async () => {
    H.rol = "admin";
    await patch(5);
    expect(H.pedidos).toEqual([ROLES_AJUSTE_PUNTOS]);
  });

  it.each(["cajero", "almacenero", "analista"])("%s: 403 al sumar y al canjear, sin escribir", async (rol) => {
    H.rol = rol;
    expect((await patch(50)).status).toBe(403);
    expect((await patch(-50)).status).toBe(403);
    expect(H.earn).not.toHaveBeenCalled();
    expect(H.redeemPoints).not.toHaveBeenCalled();
  });

  it("sin sesión: 401", async () => {
    expect((await patch(5)).status).toBe(401);
  });

  it.each(["admin", "owner", "manager"])("%s suma EXACTAMENTE N (asiento manual) y canjea N", async (rol) => {
    H.rol = rol;
    expect((await patch(5)).status).toBe(200);
    expect(H.earn).toHaveBeenCalledWith("t-qa", TEL, 5, "manual", { por: `qa${rol}` });
    expect((await patch(-7)).status).toBe(200);
    expect(H.redeemPoints).toHaveBeenCalledWith("t-qa", TEL, 7);
  });
});

describe("POST /api/marketplace/loyalty — Fidelidad", () => {
  it("cajero: earn 403 sin escribir; redeem sigue", async () => {
    H.rol = "cajero";
    const r = await post("earn", 100);
    expect(r.status).toBe(403);
    expect(H.earn).not.toHaveBeenCalled();
    expect((await post("redeem", 100)).status).toBe(200);
    expect(H.mktRedeem).toHaveBeenCalledTimes(1);
  });

  it.each(["admin", "manager"])("%s suma a mano", async (rol) => {
    H.rol = rol;
    expect((await post("earn", 100)).status).toBe(200);
    expect(H.earn).toHaveBeenCalledTimes(1);
  });
});
