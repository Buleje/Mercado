import "server-only";

/**
 * app/api/auth/oauth/callback/route.ts
 *
 * Callback OAuth PKCE de Supabase Auth — ADR Ola 7 (OAuth Supabase
 * Google + Facebook).
 *
 * Este endpoint recibe el `?code=...` que Supabase devuelve después de que
 * el user acepta los permisos en Google/Facebook. Intercambia el code por
 * una sesión y setea la cookie `sb-<project>-auth-token` automáticamente
 * (via el client de @supabase/ssr).
 *
 * Es PARALELO a los callbacks custom `/api/auth/google/callback` y
 * `/api/auth/facebook/callback` (que hacen el flow manual contra Google/FB
 * directamente y crean sesión de customer-context). No los reemplaza —
 * convive para permitir ambos paths mientras se migra.
 *
 * Flow:
 * 1. User → `/api/auth/oauth/callback?code=XYZ&next=/marketplace/explorar`
 * 2. Se intercambia el code por sesión vía Supabase
 * 3. Redirect a `next` (solo rutas internas son aceptadas — protección
 *    contra open-redirect).
 *
 * Errores conocidos se redirigen a `/login?error=...` con mensajes
 * amistosos.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

// Destino por defecto si no se envió `next` o si la ruta no es segura.
const DEFAULT_NEXT = "/marketplace/explorar";

/**
 * Valida que la ruta `next` sea interna: empieza con "/" pero no con "//".
 * Rechaza URLs absolutas y schemes extraños.
 */
function isSafeInternalPath(path: string | null): path is string {
  return Boolean(
    path && path.startsWith("/") && !path.startsWith("//") &&
      !path.includes("://"),
  );
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");
  const errorParam = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const safeNext = isSafeInternalPath(nextParam) ? nextParam : DEFAULT_NEXT;

  // Provider retornó un error — user canceló o rechazó permisos.
  if (errorParam) {
    const reason = encodeURIComponent(errorDescription ?? errorParam);
    return NextResponse.redirect(
      `${origin}/login?error=oauth_denied&reason=${reason}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=oauth_no_code`,
    );
  }

  try {
    const supabase = await getSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const reason = encodeURIComponent(error.message);
      return NextResponse.redirect(
        `${origin}/login?error=oauth_exchange_failed&reason=${reason}`,
      );
    }

    // Éxito — la cookie `sb-...-auth-token` quedó seteada por el client.
    return NextResponse.redirect(`${origin}${safeNext}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const reason = encodeURIComponent(msg);
    return NextResponse.redirect(
      `${origin}/login?error=oauth_failed&reason=${reason}`,
    );
  }
}
