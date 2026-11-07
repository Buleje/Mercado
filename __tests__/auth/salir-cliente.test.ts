// @vitest-environment node
/**
 * «Salir» del cliente de la tienda (2026-10-11).
 *
 * Antes «Salir» sólo borraba el localStorage: la cookie httpOnly
 * `buleje-customer-sess` seguía viva y al recargar el cliente volvía a entrar.
 * `POST /api/auth/customer/logout` vence la cookie, anula el token en el
 * servidor (una copia tampoco abre nada) y cierra Google; la sesión del panel
 * no se toca.
 *
 * Firma HMAC real (AUTH_SECRET de vitest.setup.ts).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const signOut = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/server", () => ({
  isSupabaseAuthConfiguredServer: () => true,
  getSupabaseServer: async () => ({ auth: { signOut } }),
}));
// La exportación de datos lee la base sólo DESPUÉS de validar la sesión.
vi.mock("@/lib/db/customers.db", () => ({
  CustomersDB: { getByPhone: vi.fn(async () => null) },
  esFichaSocial: () => false,
}));
vi.mock("@/lib/db/orders.db", () => ({ OrdersDB: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { POST: salir } = await import("@/app/api/auth/customer/logout/route");
const { GET: exportarMisDatos } = await import("@/app/api/customer/me/export/route");
const { GET: quienSoy } = await import("@/app/api/auth/customer/me/route");
const { requireCustomer } = await import("@/lib/auth/require-customer");
const {
  CUSTOMER_SESSION,
  createCustomerToken,
  getCustomerPayload,
  getSeguimientoPedidos,
  revocarTokenCliente,
  tokenTrasPedido,
} = await import("@/lib/auth/customer-session");

const COOKIE = CUSTOMER_SESSION.COOKIE_NAME;

function pedido(url: string, cookies: Record<string, string>, method = "GET"): NextRequest {
  const cookie = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: { cookie, "x-forwarded-for": `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
  });
}

async function sesionVerificada(telefono = "987654321"): Promise<string> {
  return createCustomerToken({
    customerId: telefono,
    email: `${telefono}@phone.local`,
    name: "Ana",
    tenantId: "t1",
    provider: "phone",
  });
}

/** Set-Cookie de la respuesta, por nombre. */
function setCookieDe(res: Response, nombre: string): string | undefined {
  return res.headers.getSetCookie().find((c) => c.startsWith(`${nombre}=`));
}

beforeEach(() => signOut.mockClear());

describe("POST /api/auth/customer/logout", () => {
  it("tras salir, el mismo token ya no es sesión: getCustomerPayload null y las rutas de cliente 401", async () => {
    const token = await sesionVerificada();
    expect(await getCustomerPayload(token)).not.toBeNull();

    const res = await salir(pedido("/api/auth/customer/logout", { [COOKIE]: token }, "POST"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    // La cookie se vence con las mismas opciones con que se firma.
    const vencida = setCookieDe(res, COOKIE) ?? "";
    expect(vencida).toMatch(/Max-Age=0/i);
    expect(vencida).toMatch(/Path=\//i);
    expect(vencida).toMatch(/HttpOnly/i);
    expect(vencida).toMatch(/SameSite=lax/i);
    expect(vencida).not.toMatch(/Domain=/i);

    // Una copia del token (otra pestaña, una cookie robada) tampoco entra.
    expect(await getCustomerPayload(token)).toBeNull();
    const exportar = await exportarMisDatos(pedido("/api/customer/me/export", { [COOKIE]: token }));
    expect(exportar.status).toBe(401);
    const guard = await requireCustomer(pedido("/api/subscriptions", { [COOKIE]: token }));
    expect(guard).toBeInstanceOf(NextResponse);
    expect((guard as NextResponse).status).toBe(401);
    const yo = await quienSoy(pedido("/api/auth/customer/me", { [COOKIE]: token }));
    expect(await yo.json()).toEqual({ authenticated: false });
  });

  it("no toca la sesión del panel ni el token CSRF del mismo navegador", async () => {
    const res = await salir(
      pedido(
        "/api/auth/customer/logout",
        { [COOKIE]: await sesionVerificada(), "buleje-sess": "x", "buleje-refresh": "y", "csrf-token": "z" },
        "POST",
      ),
    );
    expect(setCookieDe(res, "buleje-sess")).toBeUndefined();
    expect(setCookieDe(res, "buleje-refresh")).toBeUndefined();
    expect(setCookieDe(res, "csrf-token")).toBeUndefined();
    expect(setCookieDe(res, "active-tenant")).toBeUndefined();
  });

  it("cierra también la sesión de Google de Supabase de este navegador", async () => {
    const res = await salir(
      pedido("/api/auth/customer/logout", { [COOKIE]: await sesionVerificada(), "sb-abc-auth-token": "base64-xyz" }, "POST"),
    );
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(setCookieDe(res, "sb-abc-auth-token")).toMatch(/Max-Age=0/i);
  });

  it("anula también el token de seguimiento de un invitado (es la misma cookie)", async () => {
    const seguimiento = await tokenTrasPedido(undefined, {
      telefono: "911222333",
      nombre: "Luis",
      tenantId: "t1",
      pedidoId: "ord-1",
    });
    expect(await getSeguimientoPedidos(seguimiento!)).not.toBeNull();
    await salir(pedido("/api/auth/customer/logout", { [COOKIE]: seguimiento! }, "POST"));
    expect(await getSeguimientoPedidos(seguimiento!)).toBeNull();
  });

  it("sin cookie responde ok y no llama a Google", async () => {
    const res = await salir(pedido("/api/auth/customer/logout", {}, "POST"));
    expect(res.status).toBe(200);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("sólo anula ESTE navegador: la sesión del mismo cliente en otro equipo sigue", async () => {
    const aqui = await sesionVerificada("955111222");
    await new Promise((r) => setTimeout(r, 2)); // otro `exp` → otro token
    const otroEquipo = await sesionVerificada("955111222");
    await salir(pedido("/api/auth/customer/logout", { [COOKIE]: aqui }, "POST"));
    expect(await getCustomerPayload(aqui)).toBeNull();
    expect(await getCustomerPayload(otroEquipo)).not.toBeNull();
  });

  it("un token inventado no ocupa lugar en la lista de anulados", async () => {
    expect(await revocarTokenCliente("e30.firma-falsa")).toBe(false);
  });
});
