"use client";

/**
 * lib/supabase/cliente-perezoso.ts — Supabase en el navegador SIN pagarlo al cargar.
 *
 * `@supabase/ssr` + `supabase-js` pesan ~90 KB comprimidos y viajaban en la
 * primera carga de TODA página pública (la navbar trae el modal de cuenta y la
 * tienda el «Entrar con Google»), aunque sólo se usan al tocar «Entrar con
 * Google/Facebook». Acá el chequeo de configuración (sólo variables) es
 * síncrono y el cliente se baja recién en el clic (16-10, carril velocidad).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export function isSupabaseAuthConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  );
}

/** El mismo singleton de `getSupabaseBrowser`, bajado al primer uso. */
export async function getSupabaseBrowserPerezoso(): Promise<SupabaseClient> {
  const { getSupabaseBrowser } = await import("./client");
  return getSupabaseBrowser();
}
