import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/**
 * Supabase client — para Storage, Auth y funciones edge de Supabase.
 * Para queries de base de datos usa Prisma (lib/prisma.ts).
 * Lazy-initialized to avoid crashes when env vars are missing at build time.
 */
export function getSupabase(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("Supabase env vars not configured");
    _client = createClient(url, key);
  }
  return _client;
}
