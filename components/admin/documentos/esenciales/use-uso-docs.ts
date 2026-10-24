import { useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import type { UsoDoc } from "@/lib/documentos/esenciales";

/**
 * Cuántas veces se abrió cada papel en los últimos 90 días (sólo los que el
 * rol ve). Sin esto la pestaña igual funciona: ordena por lo más reciente.
 */
export function useUsoDocs(): { uso: Record<string, UsoDoc>; cargando: boolean } {
  const [uso, setUso] = useState<Record<string, UsoDoc>>({});
  const [cargando, setCargando] = useState(true);
  useEffect(() => {
    let vivo = true;
    fetch("/api/admin/documents/uso", { credentials: "include", headers: csrfHeaders() })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const cuerpo = (await r.json()) as { uso?: Record<string, UsoDoc> };
        if (vivo) setUso(cuerpo.uso ?? {});
      })
      .catch((err: unknown) => logger.warn("[documentos.esenciales] no cargó el uso", { error: String(err) }))
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, []);
  return { uso, cargando };
}
