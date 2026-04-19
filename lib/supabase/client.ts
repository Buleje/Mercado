"use client";

/**
 * lib/supabase/client.ts
 *
 * Supabase client para browser — ADR Ola 7 (OAuth Supabase Google + Facebook).
 *
 * Uso:
 *   import { getSupabaseBrowser } from "@/lib/supabase/client";
 *   const supabase = getSupabaseBrowser();
 *   await supabase.auth.signInWithOAuth({ provider: "google", ... });
 *
 * Este client es PARALELO al flujo OAuth custom existente en /api/auth/google
 * y /api/auth/facebook. No los reemplaza — se usa para nuevos flows basados
 * en Supabase Auth (cookie `sb-<project>-auth-token`).
 *
 * El singleton se cachea por render para evitar re-crear el cliente en cada
 * invocación (recomendación de @supabase/ssr).
 */

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let _browserClient: SupabaseClient | null = null;

/**
 * Retorna (y memoiza) el cliente Supabase para browser.
 * Seguro para Client Components y hooks.
 *
 * Si las env vars no están configuradas, se lanza un error — usar
 * `isSupabaseAuthConfigured()` antes si el flow es opcional (p. ej. botones
 * OAuth que muestran "Próximamente" cuando no hay creds).
 */
export function getSupabaseBrowser(): SupabaseClient {
  if (_browserClient) return _browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase browser client: falta NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Configurá .env.local según docs/guides/OAUTH-SETUP.md.",
    );
  }

  return (_browserClient = createBrowserClient(url, key));
}

/**
 * Feature flag barato para UI: retorna true si las env vars necesarias para
 * Supabase Auth browser están seteadas. Permite ocultar o deshabilitar
 * botones OAuth cuando el dueño aún no configuró las credenciales en Supabase
 * Dashboard.
 */
export function isSupabaseAuthConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  );
}
