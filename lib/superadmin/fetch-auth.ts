/**
 * fetchSuperadmin — helper para llamar endpoints `/api/superadmin/*`
 * con manejo unificado de auth.
 *
 * Qué hace (Feynman): cuando la sesión de superadmin expira o no existe,
 * los endpoints devuelven 401 (y el middleware puede devolver 404 por
 * security-through-obscurity). El resultado: errores rojos en consola del
 * browser que confunden al dueño. Este helper detecta 401/403 y redirige
 * SILENCIOSAMENTE a `/superadmin/login`, sin loguear el error.
 *
 * También normaliza:
 *   - cache: "no-store" (datos siempre frescos en admin)
 *   - credentials: "include" (cookie platform session)
 *
 * Uso:
 *   const res = await fetchSuperadmin("/api/superadmin/roadmap/items");
 *   if (!res.ok) { setError(`HTTP ${res.status}`); return; }
 *   const data = await res.json();
 *
 * Si 401/403, este helper NUNCA retorna — redirige la página.
 */

export async function fetchSuperadmin(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, {
    ...init,
    credentials: "include",
    cache: "no-store",
  });

  // 401 / 403 → sesión expirada o sin permisos. Redirigir silencioso.
  // 404 en un endpoint superadmin usualmente significa "ruta protegida
  // sin auth" (security-through-obscurity). Lo tratamos igual que 401.
  if (typeof window !== "undefined" && (res.status === 401 || res.status === 403 || res.status === 404)) {
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
