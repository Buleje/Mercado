"use client";

/**
 * use-pt-de-guia — el PT de una guía para cobrar un flete por pie tablar
 * (ADR-440 §6).
 *
 * Es la vista previa del MISMO número que usa el servidor al guardar
 * (`GET /api/admin/forestal/fletes?ptGuia=`): Oxapampa si la guía está
 * cubicada entera, si no ≈ estimado. El servidor vuelve a calcularlo y, si
 * alguien midió en el medio, responde 409 en vez de cobrar otra cosa.
 *
 * Espera 400 ms desde la última tecla del N° de guía: un fetch por letra
 * tipeada sólo trae guías a medio escribir.
 */

import { useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import type { PtParaPagar } from "@/lib/forestal/plata-de-guia";

export interface PtDeGuiaEstado {
  pt: PtParaPagar | null;
  cargando: boolean;
  /** La guía no está entre los ingresos de este negocio. */
  noExiste: boolean;
  error: string | null;
}

const INICIAL: PtDeGuiaEstado = { pt: null, cargando: false, noExiste: false, error: null };

export function usePtDeGuia(gtf: string | null | undefined): PtDeGuiaEstado {
  /* `para` = de qué guía es la respuesta: la de la guía anterior no se muestra
     como si fuera de la que se está tipeando. */
  const [estado, setEstado] = useState<PtDeGuiaEstado & { para: string }>({ ...INICIAL, para: "" });
  const guia = (gtf ?? "").trim();

  useEffect(() => {
    if (!guia) return;
    let vivo = true;
    const t = setTimeout(async () => {
      setEstado((e) => ({ ...e, cargando: true, error: null }));
      try {
        const r = await fetch(`/api/admin/forestal/fletes?ptGuia=${encodeURIComponent(guia)}`, {
          credentials: "include",
          cache: "no-store",
        });
        const j = (await r.json().catch(() => ({}))) as { pt?: PtParaPagar | null; message?: string };
        if (!vivo) return;
        if (!r.ok) {
          setEstado({ para: guia, pt: null, cargando: false, noExiste: false, error: j.message ?? `No se pudo leer el pie tablar de la guía (${r.status}).` });
          return;
        }
        setEstado({ para: guia, pt: j.pt ?? null, cargando: false, noExiste: j.pt == null, error: null });
      } catch (e) {
        logger.warn("[pt-de-guia] no se pudo leer el PT de la guía", { error: String(e) });
        if (vivo) setEstado({ para: guia, pt: null, cargando: false, noExiste: false, error: "Sin conexión: no se pudo leer el pie tablar de la guía." });
      }
    }, 400);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [guia]);

  if (!guia) return INICIAL;
  if (estado.para !== guia) return { ...INICIAL, cargando: true };
  return { pt: estado.pt, cargando: estado.cargando, noExiste: estado.noExiste, error: estado.error };
}
