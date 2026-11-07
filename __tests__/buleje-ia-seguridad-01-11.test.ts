/**
 * Buleje IA (ADR-528) — arreglos de la ronda de seguridad del 01-11:
 *  - rutas de memoria: manager MIRA (GET) pero no escribe (requireAdmin lo deja pasar).
 *  - SSRF: 100.64.0.0/10 (CGNAT) bloqueado, también detrás de un nombre (nip.io).
 *  - Sentry/analítica: `/api/mcp/t/<clave>` sale tapado.
 *  - MCP: cuerpo sin content-length se corta en streaming al pasar el tope.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const m = vi.hoisted(() => ({
  auth: null as null | { role: string; username: string; tenantId: string },
  listar: vi.fn(async () => []),
  buscar: vi.fn(async () => []),
  recordar: vi.fn(),
  actualizar: vi.fn(),
  obtener: vi.fn(),
  olvidar: vi.fn(),
  lookup: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () =>
    m.auth ? m.auth : NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  ),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/audit-logger", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/db/asistente-memoria.db", () => ({
  TopeMemoriasError: class extends Error {},
  MemoriaDuplicadaError: class extends Error {},
  AsistenteMemoriaDB: {
    listar: m.listar,
    buscar: m.buscar,
    recordar: m.recordar,
    actualizar: m.actualizar,
    obtener: m.obtener,
    olvidar: m.olvidar,
  },
}));
vi.mock("node:dns/promises", () => ({ lookup: m.lookup, default: { lookup: m.lookup } }));

import { GET, POST } from "@/app/api/admin/ia/memoria/route";
import { DELETE, PATCH } from "@/app/api/admin/ia/memoria/[id]/route";
import { safeFetch, SsrfBlockedError } from "@/lib/safe-fetch";
import { tacharSecretosDeRuta } from "@/lib/telemetry/secretos-en-url";
import { leerCuerpoConTope } from "@/lib/mcp-servidor/servidor";

const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/admin/ia/memoria", {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  m.auth = { role: "owner", username: "dueno", tenantId: "t-a" };
});

describe("/api/admin/ia/memoria: solo dueño/admin escriben", () => {
  it("manager → GET 200, POST/PATCH/DELETE 403 sin tocar la base", async () => {
    m.auth = { role: "manager", username: "ger", tenantId: "t-a" };
    expect((await GET(req("GET"))).status).toBe(200);
    const alta = await POST(req("POST", { tipo: "dato", titulo: "N12", texto: "camión blanco" }));
    expect(alta.status).toBe(403);
    expect(((await alta.json()) as { message: string }).message).toContain("Solo el administrador o el dueño");
    expect((await PATCH(req("PATCH", { texto: "x" }), ctx("m1"))).status).toBe(403);
    expect((await DELETE(req("DELETE"), ctx("m1"))).status).toBe(403);
    expect(m.recordar).not.toHaveBeenCalled();
    expect(m.actualizar).not.toHaveBeenCalled();
    expect(m.olvidar).not.toHaveBeenCalled();
  });

  it("sin sesión → 401; owner sí guarda", async () => {
    m.auth = null;
    expect((await POST(req("POST", { tipo: "dato", titulo: "a", texto: "b" }))).status).toBe(401);
    m.auth = { role: "owner", username: "dueno", tenantId: "t-a" };
    m.recordar.mockResolvedValue({ item: { id: "m1", titulo: "a" }, actualizada: false });
    expect((await POST(req("POST", { tipo: "dato", titulo: "a", texto: "b" }))).status).toBe(201);
    expect(m.recordar).toHaveBeenCalledWith("t-a", expect.objectContaining({ creadoPor: "dueno" }));
  });
});

describe("safeFetch: CGNAT 100.64.0.0/10", () => {
  it("IP literal 100.64.0.1 y 100.127.255.254 → bloqueadas; 100.63 y 100.128 no son CGNAT", async () => {
    await expect(safeFetch("https://100.64.0.1/x")).rejects.toBeInstanceOf(SsrfBlockedError);
    await expect(safeFetch("https://100.127.255.254/x")).rejects.toBeInstanceOf(SsrfBlockedError);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
    await expect(safeFetch("https://100.63.0.1/x")).resolves.toBeInstanceOf(Response);
    await expect(safeFetch("https://100.128.0.1/x")).resolves.toBeInstanceOf(Response);
    fetchSpy.mockRestore();
  });

  it("un nombre que resuelve a CGNAT (100.64.0.1.nip.io) → bloqueado antes de conectar", async () => {
    m.lookup.mockResolvedValue([{ address: "100.64.0.1", family: 4 }]);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(safeFetch("https://100.64.0.1.nip.io/x")).rejects.toThrow(/private IP/);
    m.lookup.mockResolvedValue([{ address: "::ffff:100.100.1.1", family: 6 }]);
    await expect(safeFetch("https://raro.example/x")).rejects.toThrow(/private IP/);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("Sentry/analítica: la clave MCP en la ruta sale tapada", () => {
  it("/api/mcp/t/bul_mcp_xxx → /api/mcp/t/[token]", () => {
    expect(tacharSecretosDeRuta("https://app.buleje.pe/api/mcp/t/bul_mcp_abc123XYZ")).toBe(
      "https://app.buleje.pe/api/mcp/t/[token]",
    );
    expect(tacharSecretosDeRuta('{"url":"/api/mcp/t/bul_mcp_s3cr3t?x=1"}')).toBe('{"url":"/api/mcp/t/[token]?x=1"}');
    expect(tacharSecretosDeRuta("/api/mcp")).toBe("/api/mcp");
  });
});

describe("MCP: cuerpo con tope en streaming", () => {
  function chorro(trozos: number, tam: number) {
    let leidos = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (leidos >= trozos) return c.close();
        leidos++;
        c.enqueue(new Uint8Array(tam).fill(97));
      },
    });
    return { stream, leidos: () => leidos };
  }

  it("sin content-length: corta apenas pasa el tope (no lee todo)", async () => {
    const { stream, leidos } = chorro(1000, 64 * 1024); // 64 MB si se leyera entero
    const r = new Request("http://localhost/api/mcp", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    expect(r.headers.get("content-length")).toBeNull();
    expect(await leerCuerpoConTope(r, 256 * 1024)).toBeNull();
    expect(leidos()).toBeLessThan(10);
  });

  it("debajo del tope devuelve el texto entero (multibyte intacto)", async () => {
    const r = new Request("http://localhost/api/mcp", { method: "POST", body: '{"a":"camión ñ"}' });
    expect(await leerCuerpoConTope(r, 256 * 1024)).toBe('{"a":"camión ñ"}');
  });
});
