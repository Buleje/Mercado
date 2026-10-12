/**
 * POST /api/auth/customer/logout — «Salir» del cliente de la tienda (2026-10-11).
 *
 * Antes «Salir» sólo borraba lo que el navegador recordaba (localStorage): la
 * cookie httpOnly `buleje-customer-sess` seguía viva y, al recargar, el layout
 * de la tienda la leía y el cliente volvía a entrar.
 *
 * Qué hace, en un solo pedido:
 *  1. Anula en el servidor el token que trae la cookie (verificado o de
 *     seguimiento de invitado: es la misma cookie) — `revocarTokenCliente`.
 *  2. Vence la cookie con las MISMAS opciones con que se firma (path "/", sin
 *     dominio, lax, httpOnly; secure en producción).
 *  3. Cierra la sesión de Google de Supabase de este navegador.
 *
 * Qué NO toca: la sesión del panel (`buleje-sess`/`buleje-refresh`), el token
 * CSRF ni el negocio activo. Para eso está `/api/auth/logout`.
 *
 * CSRF: no está en la lista de exentas de `lib/csrf.ts` → el proxy exige el
 * double-submit como en toda mutación (el navegador manda `csrfHeaders()`).
 * Sin cookie responde igual `{ ok: true }`: salir dos veces no es un error.
 */
import { NextRequest, NextResponse } from "next/server";
import { CUSTOMER_SESSION, revocarTokenCliente } from "@/lib/auth/customer-session";
import { cerrarSesionGoogle } from "@/lib/tienda-cliente/sesion-google";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const SIN_CACHE = { "Cache-Control": "private, no-store" };

export async function POST(req: NextRequest) {
  // GENEROUS: salir no expone nada y un 429 dejaría la cookie viva (el cliente
  // recargaría y volvería a entrar); muchos clientes comparten IP (CGNAT).
  const limitado = await applyRateLimit(req, "GENEROUS", "customer-logout");
  if (limitado) return limitado;

  const token = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
  if (token) {
    await revocarTokenCliente(token).catch((err: unknown) =>
      logger.warn("[auth/customer/logout] no se pudo anular el token", { error: String(err) }),
    );
  }

  const res = NextResponse.json({ ok: true }, { headers: SIN_CACHE });
  res.cookies.set(CUSTOMER_SESSION.COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  await cerrarSesionGoogle(req, res);
  return res;
}
