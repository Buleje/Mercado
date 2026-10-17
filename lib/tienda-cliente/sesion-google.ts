/**
 * Sesión de Google (Supabase Auth) de las tiendas, del lado del servidor.
 *
 * La usan `DELETE /api/tienda-cliente/yo` y la salida del cliente
 * (`POST /api/auth/customer/logout`): un solo lugar para saber si el navegador
 * trae la cookie `sb-<proyecto>-auth-token` y para cerrarla.
 */
import type { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer, isSupabaseAuthConfiguredServer } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/** Cookie de sesión de Supabase (y sus trozos `.0`, `.1`…); no el code-verifier del PKCE. */
const COOKIE_SESION_SUPABASE = /^sb-.+-auth-token(\.\d+)?$/;

/** ¿Trae la cookie de sesión de Supabase? */
export function traeSesionSupabase(req: NextRequest): boolean {
  return req.cookies.getAll().some((c) => COOKIE_SESION_SUPABASE.test(c.name) && c.value.length > 0);
}

/**
 * Cierra la sesión de Google SÓLO en este navegador (`scope: "local"`) y vence
 * sus cookies en `res`, por si el SDK no alcanzó. Sin Supabase o sin cookie no
 * llama a nadie. Nunca tira.
 */
export async function cerrarSesionGoogle(req: NextRequest, res: NextResponse): Promise<void> {
  if (!isSupabaseAuthConfiguredServer() || !traeSesionSupabase(req)) return;
  try {
    const supabase = await getSupabaseServer();
    await supabase.auth.signOut({ scope: "local" });
  } catch (err) {
    logger.warn("[tienda-cliente] signOut de Google falló", { error: String(err) });
  }
  for (const c of req.cookies.getAll()) {
    if (COOKIE_SESION_SUPABASE.test(c.name)) res.cookies.set(c.name, "", { maxAge: 0, path: "/" });
  }
}
