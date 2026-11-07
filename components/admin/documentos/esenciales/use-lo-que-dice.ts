import { useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";

export interface LoQueDice {
  /** El comienzo del texto leído (hasta 2.000 caracteres); `null` = no se leyó texto. */
  texto: string | null;
  /** Cuántos caracteres tiene el texto entero. */
  largo: number;
  /** Los datos clave que sacó la IA («Titular: …»). */
  datos: string[];
}

type Estado = { id: string; listo: LoQueDice | null; fallo: boolean };

/** Lo ya traído en esta pestaña: volver a elegir un papel no lo pide de nuevo (la clave lleva la última edición). */
const traidos = new Map<string, LoQueDice>();

/**
 * Lo que el sistema leyó del papel elegido (`/api/admin/documents/[id]/leido`):
 * la lista del drive no trae el texto (pesa), así que se pide al elegirlo.
 * Elegir no es abrir: este pedido no suma aperturas.
 */
export function useLoQueDice(id: string, editado: string): { leido: LoQueDice | null; cargando: boolean; fallo: boolean } {
  const clave = `${id}:${editado}`;
  const [estado, setEstado] = useState<Estado>(() => ({ id: clave, listo: traidos.get(clave) ?? null, fallo: false }));

  useEffect(() => {
    const ya = traidos.get(clave);
    if (ya) { setEstado({ id: clave, listo: ya, fallo: false }); return undefined; }
    setEstado({ id: clave, listo: null, fallo: false });
    const corte = new AbortController();
    fetch(`/api/admin/documents/${encodeURIComponent(id)}/leido`, { credentials: "include", headers: csrfHeaders(), signal: corte.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const cuerpo = (await r.json()) as Partial<LoQueDice>;
        const leido: LoQueDice = {
          texto: typeof cuerpo.texto === "string" ? cuerpo.texto : null,
          largo: typeof cuerpo.largo === "number" ? cuerpo.largo : 0,
          datos: Array.isArray(cuerpo.datos) ? cuerpo.datos.filter((d): d is string => typeof d === "string") : [],
        };
        traidos.set(clave, leido);
        setEstado({ id: clave, listo: leido, fallo: false });
      })
      .catch((err: unknown) => {
        if (corte.signal.aborted) return;
        logger.warn("[documentos.esenciales] no trajo lo que dice el papel", { error: String(err) });
        setEstado({ id: clave, listo: null, fallo: true });
      });
    return () => corte.abort();
  }, [id, clave]);

  // Mientras cambia de papel, el estado viejo no se muestra como del nuevo.
  const vigente = estado.id === clave;
  return { leido: vigente ? estado.listo : null, cargando: !vigente || (!estado.listo && !estado.fallo), fallo: vigente && estado.fallo };
}
