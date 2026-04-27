/**
 * Tests — GET /api/platform-brand (público, sin auth).
 *
 * Cubre:
 *  1. Devuelve la marca con headers de cache CDN (s-maxage=300, swr=3600).
 *  2. Event mode inactivo → devuelve marca base sin overrides.
 *  3. Event mode activo y dentro de ventana → aplica overrides de logos/colors.
 *  4. Event mode activo pero antes de startsAt → ignora overrides.
 *  5. Event mode activo pero después de endsAt → ignora overrides.
 *  6. Event mode sin startsAt/endsAt (siempre activo) → aplica overrides.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { mockGetPlatformBrand } = vi.hoisted(() => ({
  mockGetPlatformBrand: vi.fn(),
}));

vi.mock("@/lib/platform-brand", async () => {
  const actual = await vi.importActual<typeof import("@/lib/platform-brand")>(
    "@/lib/platform-brand",
  );
  return {
    ...actual,
    getPlatformBrand: mockGetPlatformBrand,
  };
});

import { GET } from "@/app/api/platform-brand/route";
import type { PlatformBrand } from "@/lib/platform-brand";

const baseBrand: PlatformBrand = {
  identity: {
    name: "Buleje",
    tagline: "Tu marketplace local",
    description: "Tienditas del barrio.",
    since: "2024",
    city: "Pucallpa",
    country: "Perú",
  },
  logos: { logoLight: "/x.svg", logoDark: null, logoSquare: null, favicon: null, ogImage: null },
  colors: {
    primary: "#00B4A6",
    secondary: "#0c1015",
    accent: "#f4a261",
    danger: "#b91c1c",
    success: "#047857",
  },
  typography: { fontFamily: "geist", fontDisplay: "fraunces" },
  contact: { email: "hola@buleje.pe", phone: "", whatsapp: "", address: "", supportHours: "" },
  socials: { facebook: "", instagram: "", tiktok: "", x: "", youtube: "" },
  seo: { metaTitle: "", metaDescription: "", ogTitle: "", ogDescription: "" },
  legal: { legalName: "", ruc: "", termsUrl: "", privacyUrl: "", cookiesUrl: "" },
  eventMode: {
    active: false,
    name: "",
    startsAt: null,
    endsAt: null,
    logoLight: null,
    logoDark: null,
    primaryColor: null,
    accentColor: null,
  },
};

describe("GET /api/platform-brand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("devuelve la marca y setea Cache-Control público", async () => {
    mockGetPlatformBrand.mockResolvedValue(baseBrand);

    const res = await GET();
    expect(res.status).toBe(200);

    const body = (await res.json()) as PlatformBrand;
    expect(body.identity.name).toBe("Buleje");
    expect(body.colors.primary).toBe("#00B4A6");

    const cc = res.headers.get("cache-control");
    expect(cc).toContain("s-maxage=300");
    expect(cc).toContain("stale-while-revalidate=3600");
  });

  it("event mode inactivo → no aplica overrides", async () => {
    mockGetPlatformBrand.mockResolvedValue({
      ...baseBrand,
      eventMode: {
        ...baseBrand.eventMode,
        active: false,
        primaryColor: "#000000",
        logoLight: "/black-friday.svg",
      },
    });

    const res = await GET();
    const body = (await res.json()) as PlatformBrand;
    expect(body.colors.primary).toBe("#00B4A6");
    expect(body.logos.logoLight).toBe("/x.svg");
  });

  it("event mode activo dentro de ventana → aplica overrides de logo y colors", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-29T12:00:00Z"));

    mockGetPlatformBrand.mockResolvedValue({
      ...baseBrand,
      eventMode: {
        active: true,
        name: "Black Friday",
        startsAt: "2026-11-29T00:00:00Z",
        endsAt: "2026-12-02T23:59:59Z",
        logoLight: "/bf-logo.svg",
        logoDark: null,
        primaryColor: "#000000",
        accentColor: "#ff003c",
      },
    });

    const res = await GET();
    const body = (await res.json()) as PlatformBrand;
    expect(body.colors.primary).toBe("#000000");
    expect(body.colors.accent).toBe("#ff003c");
    expect(body.logos.logoLight).toBe("/bf-logo.svg");
    // No tocados:
    expect(body.colors.secondary).toBe("#0c1015");
    expect(body.identity.name).toBe("Buleje");
  });

  it("event mode activo pero antes de startsAt → no aplica overrides", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-28T23:00:00Z"));

    mockGetPlatformBrand.mockResolvedValue({
      ...baseBrand,
      eventMode: {
        ...baseBrand.eventMode,
        active: true,
        startsAt: "2026-11-29T00:00:00Z",
        endsAt: "2026-12-02T23:59:59Z",
        primaryColor: "#000000",
      },
    });

    const res = await GET();
    const body = (await res.json()) as PlatformBrand;
    expect(body.colors.primary).toBe("#00B4A6");
  });

  it("event mode activo pero después de endsAt → no aplica overrides", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-03T00:01:00Z"));

    mockGetPlatformBrand.mockResolvedValue({
      ...baseBrand,
      eventMode: {
        ...baseBrand.eventMode,
        active: true,
        startsAt: "2026-11-29T00:00:00Z",
        endsAt: "2026-12-02T23:59:59Z",
        primaryColor: "#000000",
      },
    });

    const res = await GET();
    const body = (await res.json()) as PlatformBrand;
    expect(body.colors.primary).toBe("#00B4A6");
  });

  it("event mode sin startsAt/endsAt y active=true → aplica overrides siempre", async () => {
    mockGetPlatformBrand.mockResolvedValue({
      ...baseBrand,
      eventMode: {
        ...baseBrand.eventMode,
        active: true,
        startsAt: null,
        endsAt: null,
        primaryColor: "#abcdef",
      },
    });

    const res = await GET();
    const body = (await res.json()) as PlatformBrand;
    expect(body.colors.primary).toBe("#abcdef");
  });
});
