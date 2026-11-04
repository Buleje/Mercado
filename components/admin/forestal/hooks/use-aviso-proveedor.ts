"use client";

/**
 * Pide el aviso de proveedor sancionado SOLO, sin que nadie toque nada: espera
 * a que dejen de escribir (700 ms), cancela la consulta vieja si cambian el
 * titular o el permiso, y guarda la respuesta en el navegador 10 min (abrir
 * otra vez la misma guía no vuelve a preguntar). Si falla, lo dice; nunca frena
 * el formulario.
 */

import { useEffect, useMemo, useState } from "react";
import { logger } from "@/lib/logger";
import { consultaDeProveedor, type AvisoProveedor } from "@/lib/forestal/aviso-proveedor";

const ESPERA_MS = 700;
const VIGENCIA_MS = 10 * 60 * 1000;
const MAX_GUARDADOS = 60;

/** Respuestas por clave de consulta (null = no había con qué buscar). Vive mientras la pestaña esté abierta. */
const guardados = new Map<string, { aviso: AvisoProveedor | null; en: number }>();

function guardar(clave: string, aviso: AvisoProveedor | null) {
  if (guardados.size >= MAX_GUARDADOS) {
    const vieja = guardados.keys().next().value;
    if (vieja !== undefined) guardados.delete(vieja);
  }
  guardados.set(clave, { aviso, en: Date.now() });
}

export type EstadoAviso =
  | { fase: "nada" }
  | { fase: "revisando" }
  | { fase: "listo"; aviso: AvisoProveedor | null }
  | { fase: "error"; mensaje: string };

export function useAvisoProveedor(
  nombre: string | null | undefined,
  documento: string | null | undefined,
  codigo: string | null | undefined,
  contratoId: string | null | undefined,
): EstadoAviso {
  const q = useMemo(
    () => consultaDeProveedor({ nombre, documento, codigo, contratoId }),
    [nombre, documento, codigo, contratoId],
  );
  const [respuesta, setRespuesta] = useState<{ clave: string; estado: EstadoAviso } | null>(null);

  useEffect(() => {
    if (!q) return;
    const hit = guardados.get(q.clave);
    if (hit && Date.now() - hit.en < VIGENCIA_MS) return;
    if (hit) guardados.delete(q.clave);

    const ctrl = new AbortController();
    const temporizador = setTimeout(() => {
      const p = new URLSearchParams();
      if (q.nombre) p.set("nombre", q.nombre);
      if (q.documento) p.set("doc", q.documento);
      if (q.codigo) p.set("codigo", q.codigo);
      if (q.contratoId) p.set("contratoId", q.contratoId);
      fetch(`/api/admin/forestal/serfor-infractores/proveedor?${p.toString()}`, {
        credentials: "include",
        signal: ctrl.signal,
      })
        .then(async (r) => {
          const cuerpo = (await r.json().catch((err: unknown) => {
            logger.warn("[aviso-proveedor] respuesta sin JSON", { status: r.status, error: String(err) });
            return null;
          })) as { data?: { aviso: AvisoProveedor } | null; error?: string } | null;
          if (!r.ok) {
            setRespuesta({
              clave: q.clave,
              estado: {
                fase: "error",
                mensaje:
                  r.status === 429
                    ? "Muchas revisiones seguidas: se vuelve a revisar en unos minutos."
                    : (cuerpo?.error ?? `No se pudo revisar en SERFOR y OSINFOR (error ${r.status}).`),
              },
            });
            return;
          }
          const aviso = cuerpo?.data?.aviso ?? null;
          guardar(q.clave, aviso);
          setRespuesta({ clave: q.clave, estado: { fase: "listo", aviso } });
        })
        .catch((err: unknown) => {
          if (ctrl.signal.aborted) return;
          logger.warn("[aviso-proveedor] sin conexión", { error: String(err) });
          setRespuesta({
            clave: q.clave,
            estado: { fase: "error", mensaje: "Sin conexión: no se pudo revisar en SERFOR y OSINFOR." },
          });
        });
    }, ESPERA_MS);
    return () => {
      clearTimeout(temporizador);
      ctrl.abort();
    };
  }, [q]);

  if (!q) return { fase: "nada" };
  const hit = guardados.get(q.clave);
  if (hit) return { fase: "listo", aviso: hit.aviso };
  return respuesta?.clave === q.clave ? respuesta.estado : { fase: "revisando" };
}
