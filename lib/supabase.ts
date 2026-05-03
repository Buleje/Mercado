import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;
let _adminClient: SupabaseClient | null = null;

/**
 * Supabase client público — anon key. Respeta RLS.
 * Usar para SELECT públicos (storefront, lecturas que pueden ser anónimas).
 * NO sirve para Storage uploads — los uploads necesitan bypass de RLS.
 *
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

/**
 * Supabase client admin — service_role key. Bypasea RLS.
 * Usar SOLO desde server-side (route handlers) y SOLO después de auth check
 * propio (requireAdmin / requirePlatformAPI). Nunca exponer al cliente.
 *
 * Use cases:
 *   - Storage uploads (los buckets tienen RLS por default; anon falla).
 *   - Escrituras administrativas que necesitan ignorar policies.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!_adminClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "Supabase admin env vars not configured (SUPABASE_SERVICE_ROLE_KEY required)",
      );
    }
    _adminClient = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _adminClient;
}
