/**
 * csrf-client.ts — helper client-side para leer el CSRF token de la cookie
 * `csrf-token` (double-submit protection) y mergearlo en headers de fetch.
 *
 * Uso:
 * ```ts
 * import { csrfHeaders } from "@/lib/csrf-client";
 *
 * await fetch("/api/products/bulk", {
 *   method: "POST",
 *   headers: csrfHeaders({ "Content-Type": "application/json" }),
 *   body: JSON.stringify(...),
 * });
 * ```
 *
 * El servidor valida que el header `x-csrf-token` coincida con la cookie
 * en lib/csrf.ts. Sin este header, las mutaciones devuelven 403.
 */

/** Lee la cookie `csrf-token`. Retorna null si no esta seteada o en SSR. */
export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Merge el header `x-csrf-token` en un objeto de headers existente.
 * Si no hay token disponible (no monto la cookie), retorna los headers
 * sin modificar — el server respondera 403 y el caller debe manejarlo.
 */
export function csrfHeaders(extra: HeadersInit = {}): HeadersInit {
  const token = getCsrfToken();
  if (!token) return extra;
  if (extra instanceof Headers) {
    const h = new Headers(extra);
    h.set("x-csrf-token", token);
    return h;
  }
  if (Array.isArray(extra)) {
    return [...extra, ["x-csrf-token", token]];
  }
  return { ...(extra as Record<string, string>), "x-csrf-token": token };
}
