import "server-only";

/**
 * lib/auth/sync-supabase-to-customer.ts
 *
 * Helper de LECTURA (no mutativo) para puentear la sesión Supabase
 * al customer-context existente — ADR Ola 7.
 *
 * Contexto:
 * - El OAuth custom (/api/auth/google/callback + /api/auth/facebook/callback)
 *   crea su propia cookie `customer_session` (lib/auth/customer-session).
 * - El nuevo OAuth Supabase (/api/auth/oauth/callback) crea la cookie
 *   `sb-<project>-auth-token` propia de Supabase.
 * - Este helper permite al customer-context leer la sesión Supabase SIN
 *   modificar el flujo existente — útil para cuando se migre el context.
 *
 * IMPORTANTE: este archivo NO está cableado todavía al customer-context
 * (contexts/cart-context.tsx está en zona peligrosa). Queda disponible para
 * la próxima ola que decida unificar ambos flows.
 */

import { getSupabaseServer } from "@/lib/supabase/server";

export interface SupabaseCustomerSnapshot {
  /** UUID del user en Supabase Auth (no es el phone del Customer). */
  id: string;
  email: string | null;
  /** `full_name` del provider (Google) o nombre de pila (Facebook). */
  name: string | null;
  /** URL del avatar del provider, si se concedió permiso. */
  avatar: string | null;
  /** Provider que autenticó al user ("google", "facebook", "email"...). */
  provider: string | null;
}

/**
 * Retorna un snapshot del customer basado en la sesión Supabase actual, o
 * `null` si el user no está logueado.
 *
 * Nota: `user_metadata` varía por provider. Los campos se intentan en este
 * orden:
 *  - name: `full_name` > `name` > `user_name` > email local-part
 *  - avatar: `avatar_url` > `picture`
 */
export async function getCustomerFromSupabase():
  Promise<SupabaseCustomerSnapshot | null> {
  try {
    const supabase = await getSupabaseServer();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) return null;

    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
    const fullName =
      (metadata.full_name as string | undefined) ??
      (metadata.name as string | undefined) ??
      (metadata.user_name as string | undefined) ??
      null;
    const avatar =
      (metadata.avatar_url as string | undefined) ??
      (metadata.picture as string | undefined) ??
      null;

    const fallbackName = user.email ? user.email.split("@")[0] : null;

    return {
      id: user.id,
      email: user.email ?? null,
      name: fullName ?? fallbackName,
      avatar: avatar ?? null,
      provider: user.app_metadata?.provider ?? null,
    };
  } catch {
    // Si las env vars no están configuradas o el SDK falla, tratamos como
    // "no hay sesión" en vez de romper el render.
    return null;
  }
}

/**
 * Variante stricta para API routes que quieren fallar fuerte si no hay user.
 * Lanza un `Response` 401 como `throw` — usar solo dentro de route handlers.
 */
export async function requireSupabaseCustomer(): Promise<SupabaseCustomerSnapshot> {
  const customer = await getCustomerFromSupabase();
  if (!customer) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return customer;
}
