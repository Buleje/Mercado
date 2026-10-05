import { describe, expect, it } from "vitest";
import { buildCSP } from "@/lib/middleware-utils";

/**
 * CSP del visor de Hik-Connect (ADR-471): los dominios de EZVIZ y `blob:` en
 * media/worker se abren SÓLO en el panel; la tienda queda como estaba.
 */
const directiva = (csp: string, nombre: string) =>
  csp.split("; ").find((d) => d.startsWith(`${nombre} `)) ?? "";

describe("CSP para EZUIKit", () => {
  it("/admin: nube de video de la región, medios por wss y blob:", () => {
    const csp = buildCSP("/admin", "n0nce");
    expect(directiva(csp, "connect-src")).toContain("https://isaopen.ezvizlife.com");
    expect(directiva(csp, "connect-src")).toContain("wss://*.ezvizlife.com:*");
    /* Los decodificadores van desde el propio sitio: ningún host de EZVIZ en script-src. */
    expect(directiva(csp, "script-src")).not.toMatch(/ys7|ezviz/);
    expect(directiva(csp, "media-src")).toBe("media-src 'self' blob:");
    expect(directiva(csp, "worker-src")).toBe("worker-src 'self' blob:");
  });

  it("sin comodines amplios: nada de `https:` suelto, `*` ni `*.ys7.com` en connect-src", () => {
    const connect = directiva(buildCSP("/admin", "n0nce"), "connect-src").split(" ");
    expect(connect).not.toContain("https:");
    expect(connect).not.toContain("*");
    expect(connect.some((d) => d.includes("*.ys7.com"))).toBe(false);
  });

  it("/superadmin no abre EZVIZ: no usa el visor (security 05-10)", () => {
    expect(buildCSP("/superadmin", "n0nce")).not.toContain("ezvizlife.com");
  });

  it("la tienda no abre nada de EZVIZ ni blob: en media/worker", () => {
    const csp = buildCSP("/t/bodega", "n0nce");
    expect(csp).not.toContain("ezvizlife");
    expect(csp).not.toContain("ys7.com");
    expect(directiva(csp, "media-src")).toBe("media-src 'self'");
    expect(directiva(csp, "worker-src")).toBe("worker-src 'self'");
  });
});
