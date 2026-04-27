/**
 * Tests — GET/PATCH /api/superadmin/brand.
 *
 * Cubre:
 *  GET
 *  1. Sin cookie de sesión → 401.
 *  2. Cookie con token inválido → 401.
 *  3. Sesión válida → 200 con marca completa (incluye legal).
 *  4. Excepción al leer → 500 server_error.
 *
 *  PATCH
 *  5. Sin sesión → 401.
 *  6. Body no-JSON → 400 invalid_json.
 *  7. Body con tipos inválidos (zod) → 400 con issues.
 *  8. Body válido parcial → 200, merge profundo, savePlatformBrand recibe el merged.
 *  9. Color inválido (#xyz) → 400.
 * 10. Excepción al guardar → 500 server_error.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { mockGetSession, mockGetBrand, mockSaveBrand } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetBrand: vi.fn(),
  mockSaveBrand: vi.fn(),
}));

vi.mock("@/lib/superadmin-session", () => ({
  getPlatformSession: mockGetSession,
  PLATFORM_SESSION: { COOKIE_NAME: "platform_session" },
}));

vi.mock("@/lib/platform-brand", async () => {
  const actual = await vi.importActual<typeof import("@/lib/platform-brand")>(
    "@/lib/platform-brand",
  );
  return {
    ...actual,
    getPlatformBrand: mockGetBrand,
    savePlatformBrand: mockSaveBrand,
  };
});

import { GET, PATCH } from "@/app/api/superadmin/brand/route";
import type { PlatformBrand } from "@/lib/platform-brand";

const baseBrand: PlatformBrand = {
  identity: { name: "Buleje", tagline: "x", description: "y", since: "2024", city: "Pucallpa", country: "Perú" },
  logos: { logoLight: "/a.svg", logoDark: null, logoSquare: null, favicon: null, ogImage: null },
  colors: {
    primary: "#00B4A6",
    secondary: "#0c1015",
    accent: "#f4a261",
    danger: "#b91c1c",
    success: "#047857",
  },
  typography: { fontFamily: "geist", fontDisplay: "fraunces" },
  contact: { email: "h@b.pe", phone: "", whatsapp: "", address: "", supportHours: "" },
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

function makeReq(method: "GET" | "PATCH", body?: unknown, withCookie = true): NextRequest {
  const init: { method: string; body?: string; headers?: Record<string, string> } = { method };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  // Cast: NextRequest's RequestInit shape is slightly stricter than DOM's
  // (signal cannot be null) — payload structure is identical.
  const req = new NextRequest(
    new URL("http://localhost/api/superadmin/brand"),
    init as unknown as ConstructorParameters<typeof NextRequest>[1],
  );
  if (withCookie) {
    req.cookies.set("platform_session", "valid-token");
  }
  return req;
}

describe("GET /api/superadmin/brand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sin cookie → 401", async () => {
    const res = await GET(makeReq("GET", undefined, false));
    expect(res.status).toBe(401);
    expect(mockGetBrand).not.toHaveBeenCalled();
  });

  it("token inválido → 401", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(401);
    expect(mockGetBrand).not.toHaveBeenCalled();
  });

  it("sesión válida → 200 con marca completa (incluye legal)", async () => {
    mockGetSession.mockResolvedValue({ id: "sa1", role: "superadmin" });
    mockGetBrand.mockResolvedValue(baseBrand);

    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as PlatformBrand;
    expect(body.identity.name).toBe("Buleje");
    expect(body.legal).toBeDefined();
  });

  it("excepción al leer → 500 server_error", async () => {
    mockGetSession.mockResolvedValue({ id: "sa1", role: "superadmin" });
    mockGetBrand.mockRejectedValue(new Error("disk full"));

    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("server_error");
  });
});

describe("PATCH /api/superadmin/brand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ id: "sa1", role: "superadmin" });
    mockGetBrand.mockResolvedValue(baseBrand);
    mockSaveBrand.mockResolvedValue(undefined);
  });

  it("sin sesión → 401", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await PATCH(makeReq("PATCH", { identity: { name: "Nuevo" } }));
    expect(res.status).toBe(401);
    expect(mockSaveBrand).not.toHaveBeenCalled();
  });

  it("body no-JSON → 400 invalid_json", async () => {
    const res = await PATCH(makeReq("PATCH", "not-json{"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_json");
    expect(mockSaveBrand).not.toHaveBeenCalled();
  });

  it("tipos inválidos → 400 con issues", async () => {
    const res = await PATCH(makeReq("PATCH", { identity: { name: 12345 } }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { issues: unknown[] };
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
    expect(mockSaveBrand).not.toHaveBeenCalled();
  });

  it("color inválido (no hex) → 400", async () => {
    const res = await PATCH(makeReq("PATCH", { colors: { primary: "azul" } }));
    expect(res.status).toBe(400);
    expect(mockSaveBrand).not.toHaveBeenCalled();
  });

  it("body válido parcial → 200, merge profundo, save recibe el merged", async () => {
    const res = await PATCH(makeReq("PATCH", { identity: { tagline: "Nuevo tagline" } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; brand: PlatformBrand };
    expect(body.ok).toBe(true);
    expect(body.brand.identity.tagline).toBe("Nuevo tagline");
    // Merge: el name original sigue (no se perdió)
    expect(body.brand.identity.name).toBe("Buleje");

    expect(mockSaveBrand).toHaveBeenCalledTimes(1);
    const saved = mockSaveBrand.mock.calls[0]![0] as PlatformBrand;
    expect(saved.identity.tagline).toBe("Nuevo tagline");
    expect(saved.identity.name).toBe("Buleje");
    expect(saved.colors.primary).toBe("#00B4A6"); // intacto
  });

  it("excepción al guardar → 500 server_error", async () => {
    mockSaveBrand.mockRejectedValue(new Error("EROFS"));
    const res = await PATCH(makeReq("PATCH", { identity: { tagline: "x" } }));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("server_error");
  });
});
