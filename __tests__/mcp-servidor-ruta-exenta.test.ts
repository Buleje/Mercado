/**
 * Buleje IA (ADR-528), carril 4 — la única puerta sin sesión ni CSRF es el
 * servidor MCP, por coincidencia EXACTA. Nada vecino ni disfrazado se cuela.
 */
import { describe, expect, it, vi } from "vitest";

// vitest.setup mockea `@/lib/csrf` (siempre true): acá va el real.
vi.unmock("@/lib/csrf");
import { NextRequest } from "next/server";
import { esRutaMcp } from "@/lib/mcp-servidor/rutas";
import { validateCsrfToken } from "@/lib/csrf";

const TOKEN = `bul_mcp_${"a".repeat(43)}`;

/** POST sin cookie ni cabecera CSRF: pasa solo si la ruta está exenta. */
const exentaDeCsrf = (url: string) =>
  validateCsrfToken(new NextRequest(`http://localhost${url}`, { method: "POST", body: "{}" }));

describe("esRutaMcp", () => {
  it("acepta /api/mcp y /api/mcp/t/<clave base64url>", () => {
    expect(esRutaMcp("/api/mcp")).toBe(true);
    expect(esRutaMcp(`/api/mcp/t/${TOKEN}`)).toBe(true);
  });

  it.each([
    "/api/mcp/",
    "/api/mcpx",
    "/api/mcp-admin",
    "/API/MCP",
    "/Api/Mcp",
    "/api/MCP/t/" + TOKEN,
    "/api/mcp/t/",
    "/api/mcp/t/a/b",
    "/api/mcp/t/%2e%2e",
    "/api/mcp/t/%252e%252e",
    "/api/mcp/t/..",
    `/api/mcp/t/${TOKEN}/../../admin/users`,
    "/api/mcp/../admin/users",
    "/api/mcp/t/abc%2Fdef12345",
    "/api/admin/ia/conexiones",
  ])("rechaza %s", (p) => {
    expect(esRutaMcp(p)).toBe(false);
  });
});

describe("validateCsrfToken con la exención (URL ya normalizada como en el proxy)", () => {
  it("/api/mcp y /api/mcp/t/<clave> pasan sin cookie", () => {
    expect(exentaDeCsrf("/api/mcp")).toBe(true);
    expect(exentaDeCsrf(`/api/mcp/t/${TOKEN}`)).toBe(true);
  });

  it.each([
    "/api/mcp/../admin/users",
    "/api/mcp/%2e%2e/admin/users",
    "/api/mcp/%2E%2E/admin/users",
    "/api/mcp/t/%252e%252e/admin",
    `/api/mcp/t/${TOKEN}/../../admin/users`,
    "/api/mcp/t/../../admin/users",
    "/api/mcpx",
    "/api/mcp/t/a/b",
    "/api/admin/ia/conexiones",
  ])("%s sigue pidiendo CSRF", (url) => {
    const req = new NextRequest(`http://localhost${url}`, { method: "POST", body: "{}" });
    // documenta adónde llega de verdad tras normalizar
    expect(esRutaMcp(req.nextUrl.pathname)).toBe(false);
    expect(exentaDeCsrf(url)).toBe(false);
  });
});

// `/API/MCP` no es `/api/*` para el proxy (ya era así antes de la exención) y el
// ruteo de Next distingue mayúsculas: no llega a ningún handler. `esRutaMcp`
// también lo rechaza (arriba), así que la exención no lo cambia.

