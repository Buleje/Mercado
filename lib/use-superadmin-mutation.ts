"use client";

/**
 * lib/use-superadmin-mutation.ts
 *
 * Hook unificado para mutations (`POST`/`PATCH`/`PUT`/`DELETE`) desde
 * páginas `/superadmin/*`. Aplica de una sola vez:
 *
 *   1. `credentials: "include"` (cookie superadmin)
 *   2. `csrfHeaders({ "Content-Type": "application/json" })` (CSRF estricto)
 *   3. `try/catch` con normalización de error a string corto
 *   4. estado `pending` boolean para deshabilitar botones
 *   5. callback `onError` opcional (toast del caller) y `onSuccess<T>`
 *
 * Reemplaza el bloque copy-pasted 8+ veces en components/superadmin/**.
 *
 * Ejemplo:
 *   const { mutate, pending } = useSuperadminMutation<{ ok: true }>({
 *     onSuccess: () => pushToast("Aprobado", "success"),
 *     onError: (err) => pushToast(err, "error"),
 *   });
 *   await mutate(SA_API.PAYMENT_PROOFS.approve(id), { method: "POST" });
 */

import { useCallback, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";

export interface SuperadminMutationOptions<T = unknown> {
  onSuccess?: (data: T) => void;
  onError?: (errorMessage: string, status?: number) => void;
}

export interface MutateOptions {
  method?: "POST" | "PATCH" | "PUT" | "DELETE";
  /** body se serializa con JSON.stringify. Para FormData usar bodyRaw. */
  body?: unknown;
  /** Si pasás FormData manual; en ese caso NO se setea Content-Type JSON. */
  bodyRaw?: FormData | null;
}

export interface SuperadminMutationResult<T = unknown> {
  /** Dispara la mutation. Retorna { ok, data?, error? }. */
  mutate: (
    url: string,
    opts?: MutateOptions,
  ) => Promise<{ ok: boolean; data?: T; error?: string; status?: number }>;
  /** True mientras hay una llamada en vuelo. */
  pending: boolean;
}

export function useSuperadminMutation<T = unknown>(
  hookOpts: SuperadminMutationOptions<T> = {},
): SuperadminMutationResult<T> {
  const [pending, setPending] = useState(false);

  const mutate = useCallback(
    async (url: string, opts: MutateOptions = {}) => {
      const { method = "POST", body, bodyRaw } = opts;
      setPending(true);
      try {
        const isFormData = !!bodyRaw;
        const headers = isFormData
          ? csrfHeaders({})
          : csrfHeaders({ "Content-Type": "application/json" });

        const res = await fetch(url, {
          method,
          credentials: "include",
          headers,
          body: isFormData
            ? bodyRaw
            : body !== undefined
              ? JSON.stringify(body)
              : undefined,
        });

        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          const errorMsg = json.error ?? `Error HTTP ${res.status}`;
          hookOpts.onError?.(errorMsg, res.status);
          return { ok: false, error: errorMsg, status: res.status };
        }

        const data = (await res.json().catch(() => ({}))) as T;
        hookOpts.onSuccess?.(data);
        return { ok: true, data };
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : "Error de red";
        hookOpts.onError?.(errorMsg);
        return { ok: false, error: errorMsg };
      } finally {
        setPending(false);
      }
    },
    [hookOpts],
  );

  return { mutate, pending };
}
