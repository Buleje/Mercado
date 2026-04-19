/**
 * Tests para AuthModal.resolvePostLoginRedirect — politica de redirect post-login.
 *
 * Cubre los casos definidos en la spec Ola 7 (A3 — post-login redirect):
 *   1. Landing -> push a /marketplace/explorar
 *   2. Marketplace/cuenta -> refresh (no navigation)
 *   3. ?from=<ruta> valido -> push a esa ruta
 *   4. isNew=true (registro nuevo) -> siempre /marketplace/explorar
 *   5. Override manual via `redirectAfterLogin`
 *   6. Safety: rechaza ?from=// (open-redirect)
 */

import { describe, it, expect } from "vitest";
import { resolvePostLoginRedirect } from "@/lib/auth/post-login-redirect";

describe("resolvePostLoginRedirect — politica post-login", () => {
  it("landing `/` -> push a /marketplace/explorar", () => {
    const result = resolvePostLoginRedirect({
      pathname: "/",
      fromParam: null,
    });
    expect(result).toEqual({ action: "push", url: "/marketplace/explorar" });
  });

  it("landing `/about` -> push a /marketplace/explorar", () => {
    const result = resolvePostLoginRedirect({
      pathname: "/about",
      fromParam: null,
    });
    expect(result.action).toBe("push");
    expect(result.url).toBe("/marketplace/explorar");
  });

  it("landing `/planes` -> push a /marketplace/explorar", () => {
    const result = resolvePostLoginRedirect({
      pathname: "/planes",
      fromParam: null,
    });
    expect(result.url).toBe("/marketplace/explorar");
  });

  it("landing `/negocios` -> push a /marketplace/explorar", () => {
    const result = resolvePostLoginRedirect({
      pathname: "/negocios",
      fromParam: null,
    });
    expect(result.url).toBe("/marketplace/explorar");
  });

  it("ruta marketplace `/marketplace` -> refresh (no push)", () => {
    const result = resolvePostLoginRedirect({
      pathname: "/marketplace",
      fromParam: null,
    });
    expect(result).toEqual({ action: "refresh" });
  });

  it("ruta marketplace `/marketplace/explorar` -> refresh", () => {
    const result = resolvePostLoginRedirect({
      pathname: "/marketplace/explorar",
      fromParam: null,
    });
    expect(result.action).toBe("refresh");
  });

  it("ruta `/cuenta/pedidos` -> refresh", () => {
    const result = resolvePostLoginRedirect({
      pathname: "/cuenta/pedidos",
      fromParam: null,
    });
    expect(result.action).toBe("refresh");
  });

  it("ruta tienda `/tienda/bodega-1` -> refresh", () => {
    const result = resolvePostLoginRedirect({
      pathname: "/tienda/bodega-1",
      fromParam: null,
    });
    expect(result.action).toBe("refresh");
  });

  it("?from=/cuenta/pedidos -> respeta el from (precedencia maxima)", () => {
    const result = resolvePostLoginRedirect({
      pathname: "/",
      fromParam: "/cuenta/pedidos",
    });
    expect(result).toEqual({ action: "push", url: "/cuenta/pedidos" });
  });

  it("?from=/cuenta/pedidos tiene prioridad sobre isNew", () => {
    const result = resolvePostLoginRedirect({
      pathname: "/",
      fromParam: "/cuenta/pedidos",
      isNew: true,
    });
    // ?from= gana a isNew — el user explicitamente quiso volver a esa ruta
    expect(result).toEqual({ action: "push", url: "/cuenta/pedidos" });
  });

  it("isNew=true en marketplace -> fuerza /marketplace/explorar (onboarding)", () => {
    const result = resolvePostLoginRedirect({
      pathname: "/marketplace",
      fromParam: null,
      isNew: true,
    });
    expect(result).toEqual({ action: "push", url: "/marketplace/explorar" });
  });

  it("isNew=true en /cuenta -> fuerza /marketplace/explorar", () => {
    const result = resolvePostLoginRedirect({
      pathname: "/cuenta",
      fromParam: null,
      isNew: true,
    });
    expect(result.url).toBe("/marketplace/explorar");
  });

  it("redirectAfterLogin manual override (checkout) -> respeta el prop", () => {
    const result = resolvePostLoginRedirect({
      pathname: "/",
      fromParam: null,
      redirectAfterLogin: "/checkout",
    });
    expect(result).toEqual({ action: "push", url: "/checkout" });
  });

  it("redirectAfterLogin override funciona con isNew", () => {
    const result = resolvePostLoginRedirect({
      pathname: "/",
      fromParam: null,
      redirectAfterLogin: "/welcome",
      isNew: true,
    });
    expect(result.url).toBe("/welcome");
  });

  it("safety: rechaza ?from=//evil.com (open-redirect) y cae a la logica normal", () => {
    const result = resolvePostLoginRedirect({
      pathname: "/",
      fromParam: "//evil.com/steal",
    });
    // `//...` no pasa la validacion "/" && !startsWith("//") -> fallback a landing rule
    expect(result.url).toBe("/marketplace/explorar");
  });

  it("safety: rechaza ?from=https://evil.com (URL absoluta) y cae a logica normal", () => {
    const result = resolvePostLoginRedirect({
      pathname: "/",
      fromParam: "https://evil.com",
    });
    expect(result.url).toBe("/marketplace/explorar");
  });

  it("safety: ?from vacio se ignora", () => {
    const result = resolvePostLoginRedirect({
      pathname: "/",
      fromParam: "",
    });
    expect(result.url).toBe("/marketplace/explorar");
  });

  it("safety: ruta sin slash inicial se ignora", () => {
    const result = resolvePostLoginRedirect({
      pathname: "/",
      fromParam: "cuenta/pedidos",
    });
    expect(result.url).toBe("/marketplace/explorar");
  });
});
