"use client";

/**
 * useAdminFetch — wrapper canonico para llamadas a /api/* desde el admin.
 *
 * Reune los 3 fixes recurrentes que olvidamos uno por uno:
 *   1. CSRF token (`x-csrf-token` desde cookie csrf-token).
 *   2. `cache: "no-store"` para no servir GETs cacheados despues de mutaciones.
 *   3. Manejo de errores con toast (no silenciado en catch vacio).
 *
 * No reemplaza fetch — es un helper. Devuelve `{ data, error, status }`.
 *
 * Uso:
 * ```ts
 * const fetchAdmin = useAdminFetch();
 * const { ok, data } = await fetchAdmin("/api/products/bulk", {
 *   method: "POST",
 *   body: JSON.stringify({ ids, fields: { image: "" } }),
 * });
 * ```
 */

import { useCallback } from "react";
import { useToast } from "@/contexts/toast-context";
import { csrfHeaders } from "@/lib/csrf-client";

export type AdminFetchResult<T = unknown> = {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
};

export function useAdminFetch() {
  const toast = useToast();

  return useCallback(
    async <T = unknown>(
      url: string,
      init: RequestInit & { silentError?: boolean } = {},
    ): Promise<AdminFetchResult<T>> => {
      const { silentError, headers, method = "GET", ...rest } = init;
      const isMutation = method !== "GET" && method !== "HEAD";

      // Auto-inject CSRF + Content-Type (si hay body) + cache no-store
      const finalHeaders = csrfHeaders({
        ...(rest.body && !(rest.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        ...(headers as Record<string, string> | undefined),
      });

      try {
        const res = await fetch(url, {
          method,
          ...rest,
          headers: finalHeaders,
          cache: isMutation ? "no-store" : (rest.cache ?? "no-store"),
        });

        if (!res.ok) {
          let errMsg = `Error ${res.status}`;
          try {
            const body = await res.json();
            errMsg = body?.error || body?.message || errMsg;
          } catch {
            /* body no es JSON */
          }
          if (!silentError) {
            toast?.showToast?.(`No se pudo completar: ${errMsg}`, "");
          }
          console.error("[useAdminFetch] failed", { url, status: res.status, errMsg });
          return { ok: false, status: res.status, error: errMsg };
        }

        let data: T | undefined;
        try {
          data = (await res.json()) as T;
        } catch {
          data = undefined;
        }
        return { ok: true, status: res.status, data };
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : "Error de red";
        if (!silentError) {
          toast?.showToast?.(`Sin conexion: ${errMsg}`, "");
        }
        console.error("[useAdminFetch] network error", { url, errMsg });
        return { ok: false, status: 0, error: errMsg };
      }
    },
    [toast],
  );
}
