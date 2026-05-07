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

// F3 — SECURITY 2026-05-07: mapear errores OAuth a códigos enum para evitar
// XSS reflejado vía error_description/message raw de Supabase.
const OAUTH_ERROR_MAP: Record<string, string> = {
  access_denied: "oauth_denied",
  invalid_request: "oauth_invalid",
  server_error: "oauth_failed",
  temporarily_unavailable: "oauth_failed",
};

function safeOAuthErrorCode(raw: string | null | undefined): string {
  if (!raw) return "oauth_failed";
  // Buscar por valor exacto (error param de OAuth) o por substring normalizado
  const normalized = raw.toLowerCase().replace(/\s+/g, "_");
  return OAUTH_ERROR_MAP[normalized] ?? OAUTH_ERROR_MAP[raw] ?? "oauth_failed";
}

/**
 * Valida que la ruta `next` sea estrictamente interna.
 *
 * Ataques conocidos que este check cierra:
 * - `//evil.com`      → doble slash, host externo
 * - `/\evil.com`      → backslash bypass (Firefox/IE resuelven como host externo)
 * - `/\/evil.com`     → variante encoded
 * - `http://evil.com` → scheme absoluto
 *
 * Estrategia: además de los prefix-checks rápidos, parsea con `new URL`
 * usando un base ficticio y verifica que el host resultante siga siendo
 * el base. Si el path "escapa" del base, es externo → false.
 */
function isSafeInternalPath(path: string | null): path is string {
  if (!path) return false;
  if (!path.startsWith("/")) return false;
  // Rechaza doble slash y backslash después del primer slash
  if (/^\/[/\\]/.test(path)) return false;
  // Rechaza schemes absolutos (http://, https://, javascript:, etc.)
  if (path.includes("://")) return false;

  // Validación estructural: el host normalizado por el parser debe
  // coincidir con el base ficticio. Si path contiene un host real
  // (p.ej. `/\evil.com`) el parser lo resuelve a un host distinto.
  try {
    const base = "http://internal.invalid";
    const u = new URL(path, base);
    if (u.host !== "internal.invalid") return false;
    // El pathname debe corresponder solo a la parte de ruta del path
    const expectedPathname = path.split("?")[0].split("#")[0];
    if (u.pathname !== expectedPathname) return false;
  } catch {
    // URL no parseable → no es un path válido
    return false;
  }

  return true;
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");
  const errorParam = searchParams.get("error");
  // F3: error_description NO se usa — se descarta intencionalmente para evitar XSS reflejado.
  // searchParams.get("error_description") se ignora a propósito.

  const safeNext = isSafeInternalPath(nextParam) ? nextParam : DEFAULT_NEXT;

  // Provider retornó un error — user canceló o rechazó permisos.
  if (errorParam) {
    // F3: usar código enum seguro, nunca reflejar errorDescription raw (XSS)
    const safeCode = safeOAuthErrorCode(errorParam);
    return NextResponse.redirect(
      `${origin}/login?error=${safeCode}`,
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
      // F3: código enum seguro, nunca reflejar error.message raw de Supabase
      const safeCode = safeOAuthErrorCode(error.message);
      return NextResponse.redirect(
        `${origin}/login?error=${safeCode}`,
      );
    }

    // Éxito — la cookie `sb-...-auth-token` quedó seteada por el client.
    // Antes de redirigir, leemos el user de Supabase y, si NO tiene un
    // Customer asociado por email, mandamos a `/marketplace?oauth=complete`
    // con el name pre-llenado para que el modal pida solo el celular.
    try {
      const { data: userData } = await supabase.auth.getUser();
      const u = userData?.user;
      if (u) {
        const email = u.email ?? null;
        const oauthName =
          (u.user_metadata?.full_name as string | undefined) ??
          (u.user_metadata?.name as string | undefined) ??
          (u.user_metadata?.given_name as string | undefined) ??
          email?.split("@")[0] ??
          "";

        // Buscamos si ya existe un Customer linkeado a este email
        // (los Customers se identifican por phone — no podemos buscar por
        // email directamente sin un join). Por simplicidad: siempre
        // mandamos al flujo de completar perfil con name pre-llenado.
        // Si el usuario YA tiene customer (sabe su phone), el modal lo
        // detectará al tipearlo y mostrará "Autollenado".
        const params = new URLSearchParams({
          oauth: "complete",
          name: oauthName,
          ...(email ? { email } : {}),
        });
        return NextResponse.redirect(`${origin}/marketplace?${params}`);
      }
    } catch {
      // si falla la lectura del user, seguimos con el redirect normal
    }
    return NextResponse.redirect(`${origin}${safeNext}`);
  } catch {
    // F3: nunca reflejar mensajes de error internos al cliente (info leak + XSS)
    return NextResponse.redirect(
      `${origin}/login?error=oauth_failed`,
    );
  }
}
