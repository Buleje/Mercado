"use client";

/**
 * La GTF de salida que ⌘K pide ubicar en «Guías emitidas»: `?gtfSalida=<N°>`.
 *
 * La lista es del período del libro y la guía buscada puede ser de otro mes:
 * si no está en lo cargado, se pide UNA vez el histórico y se suman sólo las
 * líneas de ese N° (no se cambia el período de nadie). Después es el patrón de
 * siempre, `useFilaEnUrl`: fila resaltada con scroll, o «ya no existe».
 */

import { useEffect, useState } from "react";
import { useFichaEnUrl } from "@/hooks/use-ficha-en-url";
import { useFilaEnUrl, type FilaEnUrl } from "@/hooks/use-fila-en-url";
import type { GuiaEmitida } from "@/lib/forestal/guias-emitidas";

export const PARAM_GTF_SALIDA = "gtfSalida";

export function useGuiaSalidaBuscada(
  guias: readonly GuiaEmitida[],
  cargando: boolean,
  sumar: (extra: GuiaEmitida[]) => void,
): FilaEnUrl {
  const { id } = useFichaEnUrl(PARAM_GTF_SALIDA);
  const [revisado, setRevisado] = useState<string | null>(null);
  const estaEnLista = !!id && guias.some((g) => g.gtfNumber === id);

  useEffect(() => {
    if (!id || cargando || revisado === id) return;
    if (estaEnLista) {
      setRevisado(id);
      return;
    }
    let vivo = true;
    fetch("/api/admin/forestal/ctp/guias-emitidas", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ guias?: GuiaEmitida[] }>) : { guias: [] }))
      .then((j) => {
        if (!vivo) return;
        const extra = (j.guias ?? []).filter((g) => g.gtfNumber === id);
        if (extra.length > 0) sumar(extra);
        setRevisado(id);
      })
      .catch(() => { if (vivo) setRevisado(id); });
    return () => { vivo = false; };
  }, [id, cargando, revisado, estaEnLista, sumar]);

  return useFilaEnUrl(PARAM_GTF_SALIDA, {
    listo: !cargando && (!id || revisado === id),
    existe: (n) => guias.some((g) => g.gtfNumber === n),
  });
}
