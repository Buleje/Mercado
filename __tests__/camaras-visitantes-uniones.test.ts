/**
 * «Es el mismo que…» (ADR-479): las correcciones a mano del agrupado de
 * visitantes se guardan por día y por negocio, y la ruta sólo escribe en el
 * negocio de la sesión.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  auth: null as null | { tenantId: string; username: string; role: string },
  guardado: new Map<string, unknown>(),
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () => (H.auth ? H.auth : NextResponse.json({ error: "No autorizado" }, { status: 401 }))),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/db/platform-settings.db", () => ({
  PlatformSettingsDB: {
    get: vi.fn(async (k: string) => H.guardado.get(k) ?? null),
    actualizar: vi.fn(async (k: string, cambio: (v: unknown) => { valor?: unknown; resultado: unknown }) => {
      const r = cambio(H.guardado.get(k) ?? null);
      if (r.valor !== undefined) H.guardado.set(k, r.valor);
      return r.resultado;
    }),
  },
}));

import { DELETE, POST } from "@/app/api/admin/camaras/personas/uniones/route";
import { leerUniones, quitarUniones, sumarUnion } from "@/lib/camaras/visitantes-uniones.server";

const pedir = (metodo: "POST" | "DELETE", cuerpo: unknown) =>
  new NextRequest("http://localhost/api/admin/camaras/personas/uniones", { method: metodo, body: JSON.stringify(cuerpo) });

beforeEach(() => {
  H.auth = { tenantId: "t-blas", username: "dueno", role: "owner" };
  H.guardado.clear();
});

describe("sumarUnion / quitarUniones (puras)", () => {
  it("no repite la misma unión ni la de ida y vuelta, y poda los días vencidos (60 d)", () => {
    const base = { "2026-07-01": [{ a: "x#0", b: "y#0" }] };
    const uno = sumarUnion(base, "2026-10-10", { a: "f1#0", b: "f2#1" }, "2026-10-10");
    expect(uno).toEqual({ "2026-10-10": [{ a: "f1#0", b: "f2#1" }] });
    expect(sumarUnion(uno!, "2026-10-10", { a: "f2#1", b: "f1#0" }, "2026-10-10")).toBeNull();
    expect(sumarUnion(uno!, "2026-10-10", { a: "f1#0", b: "f1#0" }, "2026-10-10")).toBeNull();
  });

  it("separar saca toda unión que nombre a la clave y borra el día si queda vacío", () => {
    const g = { "2026-10-10": [{ a: "f1#0", b: "f2#0" }, { a: "f2#0", b: "f3#0" }], "2026-10-09": [{ a: "z#0", b: "w#0" }] };
    expect(quitarUniones(g, "2026-10-10", "f2#0")).toEqual({ "2026-10-09": [{ a: "z#0", b: "w#0" }] });
    expect(quitarUniones(g, "2026-10-10", "nada#0")).toBeNull();
  });
});

describe("ruta personas/uniones", () => {
  it("sin sesión → 401 y no escribe", async () => {
    H.auth = null;
    const r = await POST(pedir("POST", { dia: "2026-10-10", a: "f1#0", b: "f2#0" }));
    expect(r.status).toBe(401);
    expect(H.guardado.size).toBe(0);
  });

  it("guarda en el negocio de la SESIÓN, nunca en otro, y el resumen de ese día la lee", async () => {
    const r = await POST(pedir("POST", { dia: "2026-10-10", a: "f1#0", b: "f2#0" }));
    expect(await r.json()).toEqual({ ok: true, cambio: true });
    expect([...H.guardado.keys()]).toEqual(["camaras-visitantes-uniones:t-blas"]);
    expect(await leerUniones("t-blas", "2026-10-10")).toEqual([{ a: "f1#0", b: "f2#0" }]);
    expect(await leerUniones("t-otro", "2026-10-10")).toEqual([]);
    // Otro negocio con la misma clave de grupo no ve ni pisa la del primero.
    H.auth = { tenantId: "t-otro", username: "x", role: "admin" };
    await DELETE(pedir("DELETE", { dia: "2026-10-10", clave: "f2#0" }));
    expect(await leerUniones("t-blas", "2026-10-10")).toEqual([{ a: "f1#0", b: "f2#0" }]);
  });

  it("valida: clave rara o el mismo grupo → 400", async () => {
    expect((await POST(pedir("POST", { dia: "2026-10-10", a: "../x", b: "f2#0" }))).status).toBe(400);
    expect((await POST(pedir("POST", { dia: "2026-10-10", a: "f2#0", b: "f2#0" }))).status).toBe(400);
    expect((await DELETE(pedir("DELETE", { dia: "10-10-2026", clave: "f2#0" }))).status).toBe(400);
  });

  it("separar: DELETE quita la unión", async () => {
    await POST(pedir("POST", { dia: "2026-10-10", a: "f1#0", b: "f2#0" }));
    const r = await DELETE(pedir("DELETE", { dia: "2026-10-10", clave: "f2#0" }));
    expect(await r.json()).toEqual({ ok: true, cambio: true });
    expect(await leerUniones("t-blas", "2026-10-10")).toEqual([]);
  });
});
