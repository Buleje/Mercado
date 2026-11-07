"use client";

/**
 * Lo que el panel de vista previa pide aparte de la lista:
 *
 * - el documento completo (la lista viene sin la descripción de la IA, que pesa
 *   8 KB de cada 12: ver `metadataDeGrilla`), para decir QUÉ ES sin abrirlo;
 * - lo que hay dentro de una carpeta elegida (la lista sólo trae la abierta).
 *
 * Se piden con una espera corta: pasar con las flechas por 75 fotos no dispara
 * 75 pedidos, sólo el de la foto donde te detienes. Lo ya pedido queda en
 * memoria mientras la pestaña viva (por id + fecha de cambio).
 */

import { useEffect, useState } from "react";
import { getDocumentDetail } from "@/hooks/use-documents";
import type { DbDocument } from "@/lib/types/documents";
import { logger } from "@/lib/logger";

const ESPERA_MS = 220;
const detalles = new Map<string, DbDocument>();
const carpetas = new Map<string, { docs: DbDocument[]; at: number }>();
const VIGENCIA_CARPETA_MS = 60_000;

/** El documento completo (con la descripción de la IA y sus datos clave). */
export function useDetalleDoc(doc: DbDocument | null): { detalle: DbDocument | null; cargando: boolean } {
  // Por id + fecha de cambio, no por el objeto: la lista se refresca sola y trae
  // objetos nuevos del mismo archivo, que reiniciarían la espera cada vez.
  const id = doc?.id ?? null;
  const clave = doc ? `${doc.id}:${doc.updatedAt}` : null;
  const [estado, setEstado] = useState<{ clave: string | null; detalle: DbDocument | null }>({ clave: null, detalle: null });

  useEffect(() => {
    if (!clave || !id) return;
    if (detalles.has(clave)) return;
    let vivo = true;
    const t = window.setTimeout(() => {
      getDocumentDetail(id)
        .then((r) => {
          detalles.set(clave, r.document);
          if (vivo) setEstado({ clave, detalle: r.document });
        })
        .catch((err: unknown) => {
          logger.warn("[panel-vista-previa] detalle", { error: String(err) });
          if (vivo) setEstado({ clave, detalle: null });
        });
    }, ESPERA_MS);
    return () => { vivo = false; window.clearTimeout(t); };
  }, [clave, id]);

  if (!clave) return { detalle: null, cargando: false };
  const enMemoria = detalles.get(clave);
  if (enMemoria) return { detalle: enMemoria, cargando: false };
  return { detalle: estado.clave === clave ? estado.detalle : null, cargando: estado.clave !== clave };
}

/** Los archivos que están directamente dentro de una carpeta. `null` mientras llegan. */
export function useContenidoCarpeta(id: string | null): { docs: DbDocument[] | null; error: boolean } {
  const [estado, setEstado] = useState<{ id: string | null; docs: DbDocument[] | null; error: boolean }>({ id: null, docs: null, error: false });

  useEffect(() => {
    if (!id) return;
    const guardada = carpetas.get(id);
    if (guardada && Date.now() - guardada.at < VIGENCIA_CARPETA_MS) return;
    let vivo = true;
    const t = window.setTimeout(() => {
      fetch(`/api/admin/documents?folderId=${encodeURIComponent(id)}`, { credentials: "include" })
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const docs = ((await r.json()) as { documents?: DbDocument[] }).documents ?? [];
          carpetas.set(id, { docs, at: Date.now() });
          if (vivo) setEstado({ id, docs, error: false });
        })
        .catch((err: unknown) => {
          logger.warn("[panel-vista-previa] carpeta", { error: String(err) });
          if (vivo) setEstado({ id, docs: null, error: true });
        });
    }, ESPERA_MS);
    return () => { vivo = false; window.clearTimeout(t); };
  }, [id]);

  if (!id) return { docs: null, error: false };
  const guardada = carpetas.get(id);
  if (guardada) return { docs: guardada.docs, error: false };
  return estado.id === id ? { docs: estado.docs, error: estado.error } : { docs: null, error: false };
}
