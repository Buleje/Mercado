/**
 * fetchSuperadmin — helper para llamar endpoints `/api/superadmin/*`
 * con manejo unificado de auth.
 *
 * Qué hace (Feynman): cuando la sesión de superadmin expira o no existe,
 * los endpoints devuelven 401. El resultado: errores rojos en consola del
 * browser que confunden al dueño. Este helper detecta 401/403 y redirige
 * SILENCIOSAMENTE a `/superadmin/login`, sin loguear el error.
 *
 * ⛔ 404 NO es "sesión expirada" — Brandon 2026-09-06.
 * Este helper trataba 404 igual que 401 asumiendo que el middleware ocultaba
 * rutas protegidas (security-through-obscurity). MEDIDO: sin cookie, TODOS
 * los `/api/superadmin/*` devuelven 401 (requirePlatformAPI), nunca 404.
 * O sea: un 404 sólo significa "esa ruta no existe" — endpoint renombrado,
 * typo, o el caché stale de `.next/dev` que hace 404 a rutas que SÍ existen
 * (memoria `next-dev-manifest-stale-404-api`). Con la regla vieja eso
 * expulsaba al superadmin al login con la sesión intacta y sin ningún
 * mensaje: parecía "me deslogueó solo". Ahora el 404 vuelve al llamador,
 * que muestra su error visible.
 *
 * También normaliza:
 *   - cache: "no-store" (datos siempre frescos en admin)
 *   - credentials: "include" (cookie platform session)
 *   - header `x-csrf-token` desde la cookie (los endpoints superadmin con
 *     assertCsrf devuelven 403 sin él — y este helper redirigía a login)
 *
 * Uso:
 *   const res = await fetchSuperadmin("/api/superadmin/roadmap/items");
 *   if (!res.ok) { setError(`HTTP ${res.status}`); return; }
 *   const data = await res.json();
 *
 * Si 401/403, este helper NUNCA retorna — redirige la página.
 */
import { csrfHeaders } from "@/lib/csrf-client";

export async function fetchSuperadmin(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, {
    ...init,
    headers: csrfHeaders(init?.headers ?? {}),
    credentials: "include",
    cache: "no-store",
  });

  // 401 / 403 → sesión expirada o sin permisos (403 también cubre el CSRF
  // rotado, y re-loguear regenera el token). 404 NO entra acá: es "la ruta
  // no existe", un bug de código o de caché, no una sesión caída.
  if (typeof window !== "undefined" && (res.status === 401 || res.status === 403)) {
    // Si ya estamos en /superadmin/login no redirigir (evita loop).
    if (!window.location.pathname.startsWith("/superadmin/login")) {
      const from = encodeURIComponent(window.location.pathname);
      window.location.href = `/superadmin/login?from=${from}`;
      // Devolvemos una Response nueva para que TS no se queje, pero nunca
      // llega al llamador porque window.location cambió.
      return new Response(null, { status: res.status });
    }
  }

  return res;
}
