/**
 * Buleje IA (ADR-528), carril 4 — /api/admin/ia/conexiones: solo dueño o
 * admin (manager NO, aunque requireAdmin lo deje pasar), el token vuelve una
 * vez, urlMcp sale de NEXT_PUBLIC_BASE_URL y otro negocio = 404.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const m = vi.hoisted(() => ({
  auth: { role: "owner", username: "dueno", tenantId: "t-a" } as Record<string, string> | null,
  listar: vi.fn(async () => []),
  contarVivas: vi.fn(async () => 0),
  crear: vi.fn(),
  actualizar: vi.fn(),
  revocar: vi.fn(),
}));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () =>
    m.auth ? m.auth : NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  ),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/db/asistente-conexiones.db", () => ({
  MAX_CONEXIONES_POR_NEGOCIO: 20,
  AsistenteConexionesDB: {
    listar: m.listar,
    contarVivas: m.contarVivas,
    crear: m.crear,
    actualizar: m.actualizar,
    revocar: m.revocar,
  },
}));

import { GET, POST } from "@/app/api/admin/ia/conexiones/route";
import { DELETE, PATCH } from "@/app/api/admin/ia/conexiones/[id]/route";

const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/admin/ia/conexiones", {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  m.auth = { role: "owner", username: "dueno", tenantId: "t-a" };
});

describe("/api/admin/ia/conexiones", () => {
  it("sin sesión → 401; manager → 403 (requireAdmin lo deja pasar, soloAdminODueno no)", async () => {
    m.auth = null;
    expect((await GET(req("GET"))).status).toBe(401);
    m.auth = { role: "manager", username: "ger", tenantId: "t-a" };
    expect((await GET(req("GET"))).status).toBe(403);
    expect((await POST(req("POST", { nombre: "x" }))).status).toBe(403);
    expect((await DELETE(req("DELETE"), ctx("cmabcdefgh1234"))).status).toBe(403);
    expect(m.crear).not.toHaveBeenCalled();
  });

  it("GET → items del negocio de la sesión + urlMcp desde NEXT_PUBLIC_BASE_URL", async () => {
    const r = await GET(req("GET"));
    const j = (await r.json()) as { items: unknown[]; urlMcp: string };
    expect(m.listar).toHaveBeenCalledWith("t-a");
    expect(j.urlMcp).toBe(`${(process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/\/+$/, "")}/api/mcp`);
  });

  it("POST crea con el usuario y rol de la sesión, devuelve el token una vez; Zod estricto", async () => {
    m.crear.mockResolvedValue({ conexion: { id: "cx1", nombre: "ChatGPT", tokenPrefijo: "bul_mcp_abcd", permiteEscribir: false }, token: "bul_mcp_X" });
    const r = await POST(req("POST", { nombre: " ChatGPT ", permiteEscribir: false }));
    expect(r.status).toBe(201);
    expect(((await r.json()) as { token: string }).token).toBe("bul_mcp_X");
    expect(m.crear).toHaveBeenCalledWith("t-a", expect.objectContaining({ nombre: "ChatGPT", usuario: "dueno", rol: "owner" }));
    expect((await POST(req("POST", { nombre: "x", rol: "superadmin" }))).status).toBe(400);
    expect((await POST(req("POST", { nombre: "" }))).status).toBe(400);
    m.contarVivas.mockResolvedValue(20);
    expect((await POST(req("POST", { nombre: "otra" }))).status).toBe(409);
  });

  it("PATCH/DELETE de una conexión de otro negocio → 404 (tenantId de la sesión en la DB class)", async () => {
    m.actualizar.mockResolvedValue(null);
    m.revocar.mockResolvedValue(false);
    expect((await PATCH(req("PATCH", { activo: false }), ctx("cmotronegocio1"))).status).toBe(404);
    expect(m.actualizar).toHaveBeenCalledWith("t-a", "cmotronegocio1", { activo: false });
    expect((await DELETE(req("DELETE"), ctx("cmotronegocio1"))).status).toBe(404);
    expect(m.revocar).toHaveBeenCalledWith("t-a", "cmotronegocio1");
    expect((await PATCH(req("PATCH", {}), ctx("cmotronegocio1"))).status).toBe(400);
  });
});
