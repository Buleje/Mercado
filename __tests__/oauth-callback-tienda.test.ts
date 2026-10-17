/**
 * Callback OAuth de Supabase: las tiendas individuales vuelven a su tienda
 * (2026-10-11). Antes el callback ignoraba `next` y mandaba SIEMPRE a
 * `/marketplace?oauth=complete`; el cliente de /t/musa/tienda terminaba en el
 * marketplace. El resto de flujos sigue igual y `next` externo nunca se respeta.
 */
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn(async () => ({
  data: { user: { email: "ana@gmail.com", user_metadata: { full_name: "Ana Torres", avatar_url: "https://lh3.googleusercontent.com/a" } } },
  error: null,
}));
const signOut = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/server", () => ({
  isSupabaseAuthConfiguredServer: () => true,
  getSupabaseServer: async () => ({
    auth: { exchangeCodeForSession: async () => ({ error: null }), getUser, signOut },
  }),
}));

const { GET } = await import("@/app/api/auth/oauth/callback/route");
const yo = await import("@/app/api/tienda-cliente/yo/route");

async function destino(query: string): Promise<string> {
  const res = await GET(new NextRequest(`http://localhost:3000/api/auth/oauth/callback?code=abc&${query}`));
  return res.headers.get("location") ?? "";
}

describe("oauth callback → vuelta a la tienda", () => {
  it("/t/<negocio>/tienda vuelve a la tienda con su query", async () => {
    expect(await destino(`next=${encodeURIComponent("/t/musa/tienda?bolsa=1")}&origen=tienda`)).toBe(
      "http://localhost:3000/t/musa/tienda?bolsa=1",
    );
  });

  it("subdominio de la tienda (ruta sin /t/) vuelve si llega origen=tienda", async () => {
    expect(await destino(`next=${encodeURIComponent("/tienda?bolsa=1")}&origen=tienda`)).toBe(
      "http://localhost:3000/tienda?bolsa=1",
    );
  });

  it("un next externo nunca se respeta, ni con origen=tienda", async () => {
    for (const malo of ["//evil.com/t/x", "/\\evil.com", "https://evil.com/t/x"]) {
      const d = await destino(`next=${encodeURIComponent(malo)}&origen=tienda`);
      expect(d.startsWith("http://localhost:3000/")).toBe(true);
      expect(d).not.toContain("evil.com");
    }
  });

  it("el checkout de /t/<negocio> (sin origen=tienda) sigue pasando por el paso del celular", async () => {
    const d = await destino(`next=${encodeURIComponent("/t/musa/tienda")}`);
    expect(d).toContain("http://localhost:3000/marketplace?oauth=complete");
  });

  it("el resto de flujos sigue en /marketplace?oauth=complete", async () => {
    const d = await destino(`next=${encodeURIComponent("/marketplace/explorar")}`);
    expect(d).toContain("http://localhost:3000/marketplace?oauth=complete");
    expect(d).toContain("name=Ana+Torres");
  });
});

describe("/api/tienda-cliente/yo", () => {
  const conCookie = (metodo = "GET") =>
    new NextRequest("http://localhost:3000/api/tienda-cliente/yo", {
      method: metodo,
      headers: { cookie: "sb-abc-auth-token=base64-xyz; otra=1" },
    });

  it("sin cookie de Supabase: null y no llama a Supabase", async () => {
    getUser.mockClear();
    const res = await yo.GET(new NextRequest("http://localhost:3000/api/tienda-cliente/yo", { headers: { cookie: "sb-abc-auth-token-code-verifier=x" } }));
    expect(await res.json()).toEqual({ cliente: null });
    expect(getUser).not.toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("con cookie: sólo nombre, correo y foto", async () => {
    const res = await yo.GET(conCookie());
    expect(await res.json()).toEqual({
      cliente: { nombre: "Ana Torres", email: "ana@gmail.com", avatar: "https://lh3.googleusercontent.com/a", proveedor: "google" },
    });
  });

  it("Supabase dice que la sesión no vale → null", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "jwt expired" } } as never);
    expect(await (await yo.GET(conCookie())).json()).toEqual({ cliente: null });
  });

  it("DELETE cierra la sesión y vence la cookie", async () => {
    const res = await yo.DELETE(conCookie("DELETE"));
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(res.headers.get("set-cookie")).toMatch(/sb-abc-auth-token=;.*Max-Age=0/i);
  });
});
