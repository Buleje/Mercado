/**
 * Security 2026-10-08.
 *  1. POST /api/marketplace/orders canjeaba los puntos del teléfono del CUERPO
 *     sin sesión: cualquiera gastaba los puntos de otro. Ahora el canje exige
 *     una sesión que PROBÓ ese teléfono; sin puntos, el invitado sigue igual.
 *  2. `CustomersDB.getByPhone("google_<id>")` comparaba también los últimos 9
 *     dígitos y devolvía la ficha del teléfono de otra persona.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/cache", () => ({
  revalidateTenantTag: vi.fn(),
  cacheStore: { get: vi.fn(() => null), set: vi.fn() },
}));
vi.mock("@/lib/whatsapp", () => ({
  sendWhatsAppNotificationWithRetry: vi.fn(),
  sendWhatsAppQueued: vi.fn(),
}));
vi.mock("@/lib/push-sender", () => ({ sendPushToPhone: vi.fn() }));
vi.mock("@/lib/create-notification", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/caja/invalidar-ventas-overview", () => ({ invalidarVentasOverview: vi.fn() }));
vi.mock("@/lib/db/loyalty.db", () => ({ LoyaltyDB: { earn: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const mockFindFirst = vi.fn();
vi.mock("@/lib/prisma-rls", () => ({
  withRlsTx: vi.fn((_tenantId: string, fn: (tx: unknown) => unknown) =>
    fn({ customer: { findFirst: mockFindFirst } }),
  ),
}));

const mockGetStore = vi.fn();
const mockCreateFromCart = vi.fn();
vi.mock("@/lib/db/marketplace.db", () => ({
  MarketplaceOrdersDB: {
    getPublishedStoreBySlug: mockGetStore,
    createFromCart: mockCreateFromCart,
  },
}));

const { POST } = await import("@/app/api/marketplace/orders/route");
const { createCustomerToken, CUSTOMER_SESSION } = await import("@/lib/auth/customer-session");
const { CustomersDB } = await import("@/lib/db/customers.db");

const TEL = "987654321";
const MSG_PUNTOS = "Para usar tus puntos inicia sesión con tu número";

function cuerpo(extra: Record<string, unknown> = {}) {
  return {
    storeSlug: "bodega-qa",
    customerName: "Cliente QA",
    customerPhone: TEL,
    customerAddress: "Jr. Prueba 123",
    items: [{ storeProductId: "sp1", productId: 1, name: "Arroz", quantity: 1, retailPrice: 5 }],
    ...extra,
  };
}

async function token(customerId: string, provider: string) {
  return createCustomerToken({
    customerId,
    email: `${customerId}@x.pe`,
    name: "QA",
    tenantId: "tenant-a",
    provider,
  });
}

async function pedir(body: Record<string, unknown>, cookieToken?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookieToken) headers.cookie = `${CUSTOMER_SESSION.COOKIE_NAME}=${encodeURIComponent(cookieToken)}`;
  return POST(
    new NextRequest("http://localhost/api/marketplace/orders", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/marketplace/orders — canje de puntos con sesión del teléfono", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Tienda inexistente: el pedido termina en 404 DESPUÉS de la guardia de
    // puntos. Un 404 prueba que la guardia dejó pasar; un 401, que frenó.
    mockGetStore.mockResolvedValue(null);
  });

  it("sin sesión → 401 y no se toca la tienda ni los puntos", async () => {
    const res = await pedir(cuerpo({ loyaltyRedeemPoints: 500 }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe(MSG_PUNTOS);
    expect(mockGetStore).not.toHaveBeenCalled();
    expect(mockCreateFromCart).not.toHaveBeenCalled();
  });

  it("sesión de OTRO teléfono → 401", async () => {
    const res = await pedir(cuerpo({ loyaltyRedeemPoints: 500 }), await token("912345678", "phone"));
    expect(res.status).toBe(401);
    expect(mockCreateFromCart).not.toHaveBeenCalled();
  });

  it("Google con un id que termina en ese teléfono → 401 (no prueba un número)", async () => {
    const res = await pedir(
      cuerpo({ loyaltyRedeemPoints: 500 }),
      await token(`google_1177000${TEL}`, "google"),
    );
    expect(res.status).toBe(401);
  });

  it("token de seguimiento de invitado (checkout) → 401", async () => {
    const res = await pedir(cuerpo({ loyaltyRedeemPoints: 500 }), await token(TEL, "checkout"));
    expect(res.status).toBe(401);
  });

  it("«1987654321» con sesión del 987654321 → 401 (el canje busca la ficha tal cual)", async () => {
    const res = await pedir(
      cuerpo({ loyaltyRedeemPoints: 500, customerPhone: `1${TEL}` }),
      await token(TEL, "phone"),
    );
    expect(res.status).toBe(401);
  });

  it("sesión del MISMO teléfono (aunque escriba +51) → pasa la guardia", async () => {
    const res = await pedir(
      cuerpo({ loyaltyRedeemPoints: 500, customerPhone: "+51 987 654 321" }),
      await token(TEL, "phone"),
    );
    expect(res.status).toBe(404);
    expect(mockGetStore).toHaveBeenCalledOnce();
  });

  it("invitado SIN puntos → sigue igual (pasa la guardia sin sesión)", async () => {
    const res = await pedir(cuerpo());
    expect(res.status).toBe(404);
    expect(mockGetStore).toHaveBeenCalledOnce();
  });
});

describe("CustomersDB.getByPhone — ficha social exacta", () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
    mockFindFirst.mockResolvedValue(null);
  });

  it("google_<id> se busca EXACTO, sin los últimos 9 dígitos", async () => {
    await CustomersDB.getByPhone(`google_1177000${TEL}`, "tenant-a");
    const { where } = mockFindFirst.mock.calls[0][0];
    expect(where).toEqual({ phone: { in: [`google_1177000${TEL}`] }, tenantId: "tenant-a" });
  });

  it("facebook_<id> también", async () => {
    await CustomersDB.getByPhone(`facebook_55${TEL}`, "tenant-a");
    expect(mockFindFirst.mock.calls[0][0].where.phone).toEqual({ in: [`facebook_55${TEL}`] });
  });

  it("un teléfono sigue tolerando los formatos viejos (999 / 51999 / +51999)", async () => {
    await CustomersDB.getByPhone(TEL, "tenant-a");
    expect(mockFindFirst.mock.calls[0][0].where.phone.in).toEqual(
      expect.arrayContaining([TEL, `51${TEL}`, `+51${TEL}`]),
    );
  });
});
