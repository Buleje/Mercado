import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";

const URL_ORDEN = "/api/admin/preferences/esenciales-orden";

/**
 * «Mi orden» de Esenciales (del negocio, lo guarda el dueño o un admin). Se
 * aplica al instante y vuelve atrás si el servidor no lo acepta.
 */
export function useOrdenEsenciales(): { orden: string[]; guardado: boolean; guardar: (ids: string[]) => void } {
  const [orden, setOrden] = useState<string[]>([]);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(URL_ORDEN, { credentials: "include", headers: csrfHeaders() })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const cuerpo = (await r.json()) as { orden?: string[] | null };
        if (!vivo || !Array.isArray(cuerpo.orden)) return;
        setOrden(cuerpo.orden);
        setGuardado(true);
      })
      .catch((err: unknown) => logger.warn("[documentos.esenciales] no cargó el orden", { error: String(err) }));
    return () => { vivo = false; };
  }, []);

  const guardar = useCallback((ids: string[]) => {
    const antes = orden;
    setOrden(ids);
    setGuardado(true);
    fetch(URL_ORDEN, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: JSON.stringify({ orden: ids }),
    })
      .then((r) => {
        if (r.ok) return;
        setOrden(antes);
        toast.error(r.status === 403 ? "Sólo el dueño o un administrador pueden ordenar Esenciales." : "No se pudo guardar el orden. Prueba de nuevo.");
      })
      .catch((err: unknown) => {
        setOrden(antes);
        logger.warn("[documentos.esenciales] no se guardó el orden", { error: String(err) });
        toast.error("No se pudo guardar el orden. Revisa tu conexión.");
      });
  }, [orden]);

  return { orden, guardado, guardar };
}
