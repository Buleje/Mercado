/**
 * safeSuperadminNext — valida el destino post-login del superadmin.
 *
 * Vive acá (módulo puro, sin imports de server) para que lo usen los TRES
 * lados del mismo flujo: el guard del edge (`lib/middleware/auth-guards.ts`),
 * el helper de fetch del cliente (`lib/superadmin/fetch-auth.ts`) y la página
 * de login (`app/superadmin/login/page.tsx`). Antes vivía dentro de
 * auth-guards, que importa `@/lib/session` — inimportable desde un client
 * component, así que el login no podía reusarla y `?from=` quedó muerto.
 *
 * Brandon 2026-05-16 (audit Info preventivo): allowlist para el destino
 * post-login. Sin esto, un `?from=https://evil.com` mandado por WhatsApp
 * convierte el login en un trampolín de phishing (open redirect).
 */
export function safeSuperadminNext(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  let dest: string;
  try {
    dest = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  if (!dest.startsWith("/superadmin")) return fallback;  // solo rutas superadmin
  if (dest.startsWith("//")) return fallback;
  if (dest.includes("://")) return fallback;
  if (/^[a-z]+:/i.test(dest)) return fallback;
  if (dest.includes("\\")) return fallback;
  if (dest.includes("..")) return fallback;      // path traversal: /superadmin/../../x
  // El login es el origen del rebote: volver ahí sería un loop.
  if (dest === "/superadmin/login" || dest.startsWith("/superadmin/login/")) return fallback;
  return dest;
}
