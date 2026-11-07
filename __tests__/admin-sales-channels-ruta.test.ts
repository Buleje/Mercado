/**
 * GET /api/admin/sales-channels — Redes y medición es el único lugar donde se
 * editan los pixels (Avanzado quedó de solo lectura, ola 2 del panel).
 *
 * Fija: un tenant que puso el Pixel en el Avanzado viejo tiene
 * `storeTheme.pixelId` lleno y el blob `salesChannels` vacío. El GET tiene que
 * devolver ese Pixel; si no, Redes muestra «Sin configurar» y el siguiente
 * PATCH (que siempre espeja `pixelId`) lo borra.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { EMPTY_SALES_CHANNELS, parseSalesChannels } from "@/lib/types/sales-channels";

const H = vi.hoisted(() => ({
  blob: null as unknown,
  theme: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: async () => ({ tenantId: "t1", username: "dueno1", role: "owner" }),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null, getClientIp: () => "127.0.0.1" }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/resolve-tenant", () => ({ resolveTenantSlugToId: async (s: string) => s }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/db/settings.db", () => ({
  SettingsDB: {
    getSalesChannels: async () => parseSalesChannels(H.blob),
    getStoreThemeJson: async () => H.theme,
    patchStoreThemeJson: vi.fn(),
  },
}));

import { GET } from "@/app/api/admin/sales-channels/route";

const leer = async () => {
  const res = await GET(new NextRequest("http://localhost/api/admin/sales-channels"));
  expect(res.status).toBe(200);
  return (await res.json()) as { channels: typeof EMPTY_SALES_CHANNELS; analyticsId: string };
};

beforeEach(() => {
  H.blob = null;
  H.theme = null;
});

describe("GET /api/admin/sales-channels", () => {
  it("blob vacío + Pixel del Avanzado viejo → devuelve ese Pixel como conectado", async () => {
    H.theme = { pixelId: "1234567890123456", tiktokPixelId: "CABCDEF123", analyticsId: "G-ABC123" };
    const d = await leer();
    expect(d.channels.meta.pixelId).toBe("1234567890123456");
    expect(d.channels.meta.connected).toBe(true);
    expect(d.channels.tiktok.pixelId).toBe("CABCDEF123");
    expect(d.channels.tiktok.connected).toBe(true);
    expect(d.analyticsId).toBe("G-ABC123");
  });

  it("el blob manda sobre el tema cuando los dos tienen Pixel", async () => {
    H.blob = { meta: { connected: true, pixelId: "999", capiToken: "tok", catalogId: "cat" } };
    H.theme = { pixelId: "111" };
    const d = await leer();
    expect(d.channels.meta.pixelId).toBe("999");
    expect(d.channels.meta.capiToken).toBe("tok");
    expect(d.channels.meta.catalogId).toBe("cat");
  });

  it("sin nada en ningún lado → vacío y desconectado", async () => {
    const d = await leer();
    expect(d.channels).toEqual(EMPTY_SALES_CHANNELS);
    expect(d.analyticsId).toBe("");
  });
});
