/**
 * Modo TV (ADR-473) en el middleware:
 *  · CSP de `/tv` con lo mismo que `/admin` necesita para EZVIZ/`blob:` (y
 *    nada para `/tvx` ni la tienda);
 *  · `/tv` y `/api/tv/**` no piden sesión del panel;
 *  · los POST del TV pasan el CSRF con la cookie que siembra `/tv`, y sin
 *    ella no (no se abrió ninguna excepción);
 *  · el sondeo de cuadros, fotos y el HLS usan el cupo de cámaras.
 */
import { describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { applySecurityHeaders } from "@/lib/middleware/security-headers";
import { buildCSP, esCamaraEnVivo, esPaginaTv } from "@/lib/middleware-utils";
import { guardAdminOnlyApi, guardAdminPages, guardWriteProtectedApi } from "@/lib/middleware/auth-guards";

const directiva = (csp: string, nombre: string) => csp.split("; ").find((d) => d.startsWith(`${nombre} `)) ?? "";

describe("CSP de /tv", () => {
  it("abre lo mismo que /admin para el visor: nube de EZVIZ, wss y blob:", () => {
    const tv = buildCSP("/tv", "n0nce");
    const admin = buildCSP("/admin", "n0nce");
    expect(directiva(tv, "connect-src")).toBe(directiva(admin, "connect-src"));
    expect(directiva(tv, "media-src")).toBe("media-src 'self' blob:");
    expect(directiva(tv, "worker-src")).toBe("worker-src 'self' blob:");
    expect(directiva(tv, "script-src")).not.toMatch(/ezviz|ys7/);
  });

  it("no se embebe en otra página: frame-ancestors 'none' y X-Frame-Options DENY, como /admin", () => {
    expect(directiva(buildCSP("/tv", "n0nce"), "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directiva(buildCSP("/tvx", "n0nce"), "frame-ancestors")).toBe("frame-ancestors 'self'");
    const res = applySecurityHeaders(NextResponse.next(), "/tv", "n0nce", "req-1");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("sólo /tv y sus subrutas: /tvx y la tienda no abren nada", () => {
    expect(esPaginaTv("/tv")).toBe(true);
    expect(esPaginaTv("/tv/ver")).toBe(true);
    expect(esPaginaTv("/tvx")).toBe(false);
    expect(esPaginaTv("/api/tv/camaras")).toBe(false);
    expect(buildCSP("/tvx", "n0nce")).not.toContain("ezvizlife");
    expect(directiva(buildCSP("/t/bodega", "n0nce"), "media-src")).toBe("media-src 'self'");
  });
});

const req = (url: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(url, { method: init.method ?? "GET", headers: init.headers });
const conTenant = { request: { headers: new Headers() } };

describe("guardias del panel no tocan el Modo TV", () => {
  it("/tv no redirige al login y /api/tv/** no pide sesión del panel", async () => {
    expect(await guardAdminPages(req("http://localhost/tv"), "/tv")).toBeNull();
    for (const p of ["/api/tv/camaras", "/api/tv/estado", "/api/tv/camaras/cam_1/cuadro"]) {
      expect(await guardAdminOnlyApi(req(`http://localhost${p}`), p)).toBeNull();
    }
    for (const p of ["/api/tv/emparejar", "/api/tv/salir", "/api/tv/camaras/cam_1/en-vivo-nube"]) {
      expect(await guardWriteProtectedApi(req(`http://localhost${p}`, { method: "POST" }), p, conTenant)).toBeNull();
    }
  });

  it("los POST del TV pasan el CSRF con la cookie de /tv y sin ella no", async () => {
    /* vitest.setup mockea `@/lib/csrf`: acá va el real. */
    const { validateCsrfToken } = await vi.importActual<typeof import("@/lib/csrf")>("@/lib/csrf");
    for (const p of ["/api/tv/emparejar", "/api/tv/salir", "/api/tv/camaras/cam_1/en-vivo-nube"]) {
      expect(validateCsrfToken(req(`http://localhost${p}`, { method: "POST" }))).toBe(false);
      expect(
        validateCsrfToken(
          req(`http://localhost${p}`, { method: "POST", headers: { cookie: "csrf-token=abc123", "x-csrf-token": "abc123" } }),
        ),
      ).toBe(true);
    }
  });
});

describe("cupo de cámaras en el middleware", () => {
  it("cuadro, foto, lista y segmentos del TV y del panel; el arranque y lo demás no", () => {
    const es = (p: string, method = "GET") => esCamaraEnVivo(req(`http://localhost${p}`, { method }));
    expect(es("/api/tv/camaras/cam_1/cuadro")).toBe(true);
    expect(es("/api/admin/camaras/cam_1/cuadro")).toBe(true);
    expect(es("/api/tv/camaras/cam_1/vivo/vivo.m3u8")).toBe(true);
    expect(es("/api/admin/camaras/cam_1/vivo/s012.ts")).toBe(true);
    expect(es("/api/tv/camaras/cam_1/snapshot")).toBe(true);
    expect(es("/api/tv/camaras/cam_1/vivo")).toBe(false);
    expect(es("/api/tv/camaras/cam_1/vivo/otro.txt")).toBe(false);
    expect(es("/api/tv/camaras")).toBe(false);
    expect(es("/api/tv/camaras/cam_1/cuadro", "POST")).toBe(false);
  });
});
