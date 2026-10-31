"use client";

/**
 * use-deshacer-importacion — «Deshacer la importación» de una guía del Libro TH
 * (ADR-461 §12). Pide al servidor qué se deshace (`GET …/deshacer?gtfId=`) al
 * abrir y lo deshace con el motivo (`POST`). La regla y los totales son del
 * servidor; acá sólo se muestra y se confirma.
 */

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { logger } from "@/lib/logger";
import type { DeshacerImportacion, RespuestaDeshacer } from "@/lib/forestal/loth-importar-guia-tipos";

const URL_DESHACER = "/api/admin/forestal/loth/importar-guia/deshacer";

async function mensajeDe(r: Response, porDefecto: string): Promise<string> {
  const j = await leerJson<{ message?: string; error?: string }>(r);
  const frase = j?.error && /\s/.test(j.error) ? j.error : null;
  return j?.message ?? frase ?? porDefecto;
}

export function useDeshacerImportacion(gtfId: string | null) {
  const [revision, setRevision] = useState<{ cargando: boolean; error: string | null; datos: DeshacerImportacion | null }>({
    cargando: false,
    error: null,
    datos: null,
  });
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  useEffect(() => {
    if (!gtfId) return;
    let vigente = true;
    setRevision({ cargando: true, error: null, datos: null });
    setErrorEnvio(null);
    void (async () => {
      try {
        const r = await fetch(`${URL_DESHACER}?gtfId=${encodeURIComponent(gtfId)}`, { credentials: "include", cache: "no-store" });
        if (!r.ok) throw new Error(await mensajeDe(r, "No se pudo revisar qué se deshace."));
        const j = await leerJson<RespuestaDeshacer>(r);
        if (vigente) setRevision({ cargando: false, error: null, datos: j?.deshacer ?? null });
      } catch (err) {
        logger.warn("[deshacer-importacion] revisar", { error: String(err) });
        if (vigente) setRevision({ cargando: false, error: err instanceof Error ? err.message : String(err), datos: null });
      }
    })();
    return () => {
      vigente = false;
    };
  }, [gtfId]);

  /** Deshace. Devuelve lo deshecho, o `null` (el motivo del «no» queda en `errorEnvio`). */
  const deshacer = useCallback(
    async (motivo: string): Promise<DeshacerImportacion | null> => {
      if (!gtfId || enviando) return null;
      setEnviando(true);
      setErrorEnvio(null);
      try {
        const r = await fetch(URL_DESHACER, {
          method: "POST",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ gtfId, motivo }),
        });
        if (!r.ok) {
          setErrorEnvio(await mensajeDe(r, `No se pudo deshacer la importación (${r.status}).`));
          return null;
        }
        const j = await leerJson<RespuestaDeshacer>(r);
        return j?.deshacer ?? null;
      } catch (err) {
        logger.warn("[deshacer-importacion] deshacer", { error: String(err) });
        setErrorEnvio("No se pudo mandar el pedido. Revisa la conexión y prueba de nuevo: no se deshizo nada.");
        return null;
      } finally {
        setEnviando(false);
      }
    },
    [gtfId, enviando],
  );

  return { revision, enviando, errorEnvio, deshacer };
}
