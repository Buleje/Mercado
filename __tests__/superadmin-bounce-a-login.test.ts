/**
 * Tests del rebote al login del superadmin — los dos bugs que hacían que el
 * dueño terminara en /superadmin/login con la sesión intacta (2026-09-06).
 *
 *  1. `fetchSuperadmin` trataba 404 como "sesión expirada" y expulsaba.
 *     MEDIDO ese día: sin cookie, todos los `/api/superadmin/*` devuelven
 *     401 — un 404 sólo significa "esa ruta no existe" (endpoint renombrado
 *     o caché stale de `.next/dev`). Expulsar por 404 = logout fantasma.
 *  2. El `?from=` que arma el rebote se ignoraba: los tres caminos del login
 *     mandaban al dashboard, perdiendo la pantalla donde estaba el usuario.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { safeSuperadminNext } from "@/lib/superadmin/safe-next";

// ── 1. fetchSuperadmin: qué status expulsa y qué status no ─────────────────
describe("fetchSuperadmin — sólo 401/403 mandan al login", () => {
  const hrefSet: string[] = [];

  beforeEach(() => {
    hrefSet.length = 0;
    vi.stubGlobal("window", {
      location: {
        pathname: "/superadmin/dashboard",
        set href(v: string) { hrefSet.push(v); },
        get href() { return hrefSet[hrefSet.length - 1] ?? ""; },
      },
    });
    vi.stubGlobal("document", { cookie: "" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function llamarCon(status: number) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
    const { fetchSuperadmin } = await import("@/lib/superadmin/fetch-auth");
    return fetchSuperadmin("/api/superadmin/dashboard/widgets");
  }

  it("404 NO expulsa — devuelve la respuesta al llamador", async () => {
    const res = await llamarCon(404);
    expect(hrefSet).toHaveLength(0);
    expect(res.status).toBe(404);
  });

  it("401 sí expulsa al login conservando el origen", async () => {
    await llamarCon(401);
    expect(hrefSet).toHaveLength(1);
    expect(hrefSet[0]).toBe("/superadmin/login?from=%2Fsuperadmin%2Fdashboard");
  });

  it("403 sí expulsa (CSRF rotado / sin permisos)", async () => {
    await llamarCon(403);
    expect(hrefSet).toHaveLength(1);
  });

  it("200 pasa derecho", async () => {
    const res = await llamarCon(200);
    expect(hrefSet).toHaveLength(0);
    expect(res.status).toBe(200);
  });

  it("500 no se confunde con sesión caída", async () => {
    const res = await llamarCon(500);
    expect(hrefSet).toHaveLength(0);
    expect(res.status).toBe(500);
  });
});

// ── 2. safeSuperadminNext: el destino post-login ───────────────────────────
describe("safeSuperadminNext — destino post-login validado", () => {
  const FALLBACK = "/superadmin/dashboard";

  it("acepta una ruta superadmin real (el caso que estaba muerto)", () => {
    expect(safeSuperadminNext("/superadmin/tenants/growth", FALLBACK))
      .toBe("/superadmin/tenants/growth");
  });

  it("acepta la ruta URL-encodeada que arma fetchSuperadmin", () => {
    expect(safeSuperadminNext("%2Fsuperadmin%2Ftenants%2Fusage", FALLBACK))
      .toBe("/superadmin/tenants/usage");
  });

  it("sin `from` cae al dashboard", () => {
    expect(safeSuperadminNext(null, FALLBACK)).toBe(FALLBACK);
    expect(safeSuperadminNext("", FALLBACK)).toBe(FALLBACK);
  });

  it("rechaza destinos fuera de /superadmin", () => {
    expect(safeSuperadminNext("/admin", FALLBACK)).toBe(FALLBACK);
    expect(safeSuperadminNext("/", FALLBACK)).toBe(FALLBACK);
  });

  it("rechaza open-redirect (phishing por WhatsApp)", () => {
    for (const malo of [
      "https://evil.com",
      "//evil.com",
      "/superadmin/../../evil",           // sigue empezando con /superadmin
      "javascript:alert(1)",
      "data:text/html,x",
      "\\\\evil.com",
      "/superadmin\\evil",
    ]) {
      expect(safeSuperadminNext(malo, FALLBACK)).toBe(FALLBACK);
    }
  });

  it("no vuelve al propio login (evita el loop)", () => {
    expect(safeSuperadminNext("/superadmin/login", FALLBACK)).toBe(FALLBACK);
    expect(safeSuperadminNext("/superadmin/login/2fa", FALLBACK)).toBe(FALLBACK);
  });

  it("un `from` mal encodeado no explota", () => {
    expect(safeSuperadminNext("%E0%A4%A", FALLBACK)).toBe(FALLBACK);
  });
});
