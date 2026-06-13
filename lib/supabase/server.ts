import "server-only";

/**
 * lib/supabase/server.ts
 *
 * Supabase client para Server Components, Route Handlers y Server Actions —
 * ADR Ola 7 (OAuth Supabase Google + Facebook).
 *
 * Uso:
 *   import { getSupabaseServer } from "@/lib/supabase/server";
 *   const supabase = await getSupabaseServer();
 *   const { data: { user } } = await supabase.auth.getUser();
 *
 * Importante:
 * - Este helper lee/escribe cookies vía `next/headers`, por eso devuelve
 *   `Promise<SupabaseClient>` (cookies() es async en Next 15+).
 * - El callback `setAll` puede fallar silenciosamente cuando se llama desde
 *   un Server Component puro (sin acceso a res). Ese caso está protegido con
 *   try/catch — el SDK reintenta en middleware / route handlers.
 * - No reemplaza al `getSupabase()` legacy de `lib/supabase.ts`, que se usa
 *   para Storage / servicio público.
 */

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function getSupabaseServer(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase server client: falta NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Configurá .env.local según docs/guides/OAUTH-SETUP.md.",
    );
  }

  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (
        cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>,
      ) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            // [SECURITY 2026-06-13] Forzamos httpOnly + secure + sameSite en el
            // token de Supabase (`sb-<project>-auth-token`). El SDK por defecto
            // lo deja legible por JS para que el browser-client lo lea, pero en
            // esta app la sesión real es la cookie httpOnly propia
            // (`buleje-customer-sess`): el token de Supabase solo se usa server-
            // side durante el handoff OAuth (callback → exchangeCodeForSession →
            // getUser). Hacerlo httpOnly cierra el robo de sesión vía XSS sin
            // romper nada client-side (nadie lee `sb-...` desde el browser).
            cookieStore.set(name, value, {
              ...options,
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "lax",
            });
          });
        } catch {
          // Server Components no pueden mutar cookies — se ignora y el SDK
          // reintenta desde middleware o route handler.
        }
      },
    },
  });
}

/**
 * Helper equivalente a `isSupabaseAuthConfigured()` del client — útil en
 * Server Components que renderizan condicionalmente CTAs de OAuth.
 */
export function isSupabaseAuthConfiguredServer(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  );
}
