"use client";

import { useEffect, useState } from "react";
import { cachedJson } from "@/lib/client-cache-fetch";

/**
 * El ID de soporte del negocio en sesión (ADR-500, «482917»): lo que el dueño
 * le dicta a soporte. Sale de `/api/auth/me` —el servidor lo toma del
 * `tenantId` de la sesión, nunca de un parámetro—, que el panel ya pide al
 * cargar: `cachedJson` comparte esa misma respuesta (60 s), no suma pedidos.
 */
export function useCodigoNegocio(): string | null {
  const [codigo, setCodigo] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    // cachedJson no rechaza nunca: si falla devuelve null y el ID no se muestra.
    void cachedJson<{ tenantCodigo?: string | null }>("/api/auth/me", 60_000).then((d) => {
      if (vivo) setCodigo(d?.tenantCodigo ?? null);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return codigo;
}
