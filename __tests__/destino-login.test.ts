/**
 * `destinoSeguroLogin` — el `?from=` del login del panel sólo devuelve a una
 * ruta de este sitio (revisión de security 31-10: `/%09/evil.com` saltaba el
 * filtro viejo porque el navegador borra el tabulador y queda `//evil.com`).
 */
import { describe, expect, it } from "vitest";
import { destinoSeguroLogin } from "@/lib/auth/destino-login";

const F = "/admin";

describe("destinoSeguroLogin", () => {
  it("vuelve al papel del QR con su ?… y #…", () => {
    expect(destinoSeguroLogin("/admin?tab=documentos&doc=cmabc123", F)).toBe("/admin?tab=documentos&doc=cmabc123");
    expect(destinoSeguroLogin("/t/blas/admin?tab=documentos#x", F)).toBe("/t/blas/admin?tab=documentos#x");
    expect(destinoSeguroLogin("/admin?q=100%", F)).toBe("/admin?q=100%");
  });

  it("sin destino → el de siempre", () => {
    expect(destinoSeguroLogin(null, F)).toBe(F);
    expect(destinoSeguroLogin("", F)).toBe(F);
  });

  it.each([
    ["tabulador", "/\t/evil.com"],
    ["salto de línea", "/\n/evil.com"],
    ["retorno", "/\r/evil.com"],
    ["protocolo relativo", "//evil.com"],
    ["absoluta", "https://evil.com"],
    ["absoluta escondida", "/x?y=https://evil.com"],
    ["javascript", "javascript:alert(1)"],
    ["barra invertida", "/\\evil.com"],
    ["sin barra", "admin"],
  ])("%s → fallback", (_n, raw) => {
    expect(destinoSeguroLogin(raw, F)).toBe(F);
  });
});
