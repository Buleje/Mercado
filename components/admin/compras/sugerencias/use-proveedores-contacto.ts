"use client";

import { useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import type { ProveedorContacto } from "@/lib/compras/pedir-precio";

/**
 * Los proveedores del negocio con su teléfono, para «Pedir precio». Usa el
 * mismo `GET /api/suppliers` que ya lee Compras; se pide una sola vez, al abrir
 * la ventana (`activo`), y se queda en memoria mientras la barra siga a la vista.
 * Los proveedores marcados «inactivo» no salen: no se les pide precio.
 */
export function useProveedoresContacto(activo: boolean) {
  const [proveedores, setProveedores] = useState<ProveedorContacto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (!activo || proveedores) return;
    const ctrl = new AbortController();
    setError(null);
    fetch("/api/suppliers", { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: unknown = await res.json();
        const crudos: unknown[] = Array.isArray(json)
          ? json
          : Array.isArray((json as { suppliers?: unknown }).suppliers)
            ? ((json as { suppliers: unknown[] }).suppliers)
            : [];
        setProveedores(
          crudos.flatMap((c): ProveedorContacto[] => {
            const s = c as Record<string, unknown>;
            if (typeof s.id !== "string" && typeof s.id !== "number") return [];
            if (typeof s.name !== "string" || s.estado === "inactivo") return [];
            return [{
              id: String(s.id),
              name: s.name,
              phone: typeof s.phone === "string" ? s.phone : null,
              whatsappSecundario: typeof s.whatsappSecundario === "string" ? s.whatsappSecundario : null,
            }];
          }),
        );
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        logger.warn("[compras/pedir-precio] no se pudieron leer los proveedores", { error: String(err) });
        setError("No se pudieron traer tus proveedores. Revisa tu conexión.");
      });
    return () => ctrl.abort();
  }, [activo, proveedores, intento]);

  return { proveedores, error, cargando: activo && !proveedores && !error, reintentar: () => setIntento((n) => n + 1) };
}
