/**
 * /api/superadmin/tenants/[slug]/avisos-correo (21-10):
 *   GET 401 sin sesión · 404 tienda ajena/inexistente · 200 con el detalle
 *   PATCH 401 sin sesión · 400 body malo · 200 guarda, audita y responde el detalle nuevo
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const m = vi.hoisted(() => ({
  requirePlatformAPI: vi.fn(),
  tienda: vi.fn(),
  detalle: vi.fn(),
  guardar: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: vi.fn(() => null) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/superadmin-auth", () => ({ requirePlatformAPI: m.requirePlatformAPI }));
vi.mock("@/lib/audit/superadmin-audit", () => ({ logSuperadminAction: m.audit }));
vi.mock("@/lib/db/avisos-correo.db", () => ({ AvisosCorreoDB: { tienda: m.tienda } }));
vi.mock("@/lib/avisos-correo", async () => {
  const { z } = await import("zod");
  const tipos = ["pedidos", "stock", "reportes", "forestal", "cuenta"] as const;
  return {
    AvisosCorreoPatchSchema: z.union([
      z.object({ pausado: z.boolean() }).strict(),
      z.object({ tipo: z.enum(tipos), activo: z.boolean() }).strict(),
    ]),
    detalleDeTienda: m.detalle,
    guardarAvisosCorreo: m.guardar,
  };
});

import { GET, PATCH } from "@/app/api/superadmin/tenants/[slug]/avisos-correo/route";

const MUSA = { id: "c-musa", slug: "musa", name: "Musa", ownerEmail: "duena@gmail.com" };
const params = (slug = "musa") => ({ params: Promise.resolve({ slug }) });
const pedido = (method: "GET" | "PATCH", body?: unknown) =>
  new NextRequest("http://localhost:3000/api/superadmin/tenants/musa/avisos-correo", {
    method,
    headers: { "content-type": "application/json", cookie: "buleje-platform-sess=x" },
    ...(body !== undefined ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  });

beforeEach(() => {
  vi.clearAllMocks();
  m.requirePlatformAPI.mockResolvedValue({ ok: true, username: "brandon" });
  m.tienda.mockResolvedValue(MUSA);
  m.detalle.mockResolvedValue({ correo: MUSA.ownerEmail, pausado: false, activos: 4, total: 4, tipos: [] });
  m.guardar.mockResolvedValue({ pausado: true, apagados: [] });
});

describe("GET avisos-correo", () => {
  it("401 sin sesión de plataforma", async () => {
    m.requirePlatformAPI.mockResolvedValue(NextResponse.json({ error: "No autenticado" }, { status: 401 }));
    const res = await GET(pedido("GET"), params());
    expect(res.status).toBe(401);
    expect(m.tienda).not.toHaveBeenCalled();
  });

  it("404 si la tienda no existe", async () => {
    m.tienda.mockResolvedValue(null);
    const res = await GET(pedido("GET"), params("no-existe"));
    expect(res.status).toBe(404);
  });

  it("200 con el detalle de la tienda resuelta", async () => {
    const res = await GET(pedido("GET"), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, avisos: { activos: 4 } });
    expect(m.detalle).toHaveBeenCalledWith(MUSA);
  });
});

describe("PATCH avisos-correo", () => {
  it("401 sin sesión: no guarda", async () => {
    m.requirePlatformAPI.mockResolvedValue(NextResponse.json({ error: "No autenticado" }, { status: 401 }));
    const res = await PATCH(pedido("PATCH", { pausado: true }), params());
    expect(res.status).toBe(401);
    expect(m.guardar).not.toHaveBeenCalled();
  });

  it.each([
    ["tipo inexistente", { tipo: "spam", activo: false }],
    ["mezcla de las dos formas", { pausado: true, tipo: "stock", activo: true }],
    ["valor no booleano", { pausado: "sí" }],
    ["json roto", "{"],
  ])("400 con body malo (%s)", async (_n, body) => {
    const res = await PATCH(pedido("PATCH", body), params());
    expect(res.status).toBe(400);
    expect(m.guardar).not.toHaveBeenCalled();
  });

  it("404 si la tienda no existe", async () => {
    m.tienda.mockResolvedValue(null);
    const res = await PATCH(pedido("PATCH", { pausado: true }), params("no-existe"));
    expect(res.status).toBe(404);
    expect(m.guardar).not.toHaveBeenCalled();
  });

  it("200: guarda con el cuid (no el slug), audita y devuelve el detalle nuevo", async () => {
    const res = await PATCH(pedido("PATCH", { tipo: "stock", activo: false }), params());
    expect(res.status).toBe(200);
    expect(m.guardar).toHaveBeenCalledWith("c-musa", { tipo: "stock", activo: false }, "brandon");
    expect(m.audit).toHaveBeenCalledWith(
      "avisos_correo_cambio",
      expect.stringContaining("APAGADO"),
      expect.objectContaining({ targetTenantId: "c-musa" }),
      "brandon",
    );
    expect(await res.json()).toMatchObject({ ok: true, avisos: { correo: "duena@gmail.com" } });
  });
});
