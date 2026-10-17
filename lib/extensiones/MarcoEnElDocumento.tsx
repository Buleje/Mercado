"use client";

/**
 * ADR-460 · marca `<html data-marco="<pieza>">` mientras la tienda lleva el
 * marco de una página propia. El layout ya envuelve el contenido en un
 * `[data-marco]` (llega en el HTML, sin parpadeo); esto alcanza además a lo
 * que se monta en un portal fuera de ese envoltorio (checkout, modales), para
 * que las utilidades `*-primary` usen el color de la marca (globals.css).
 * Mismo patrón que `TenantStoreChrome`, sin sus bordes rectos.
 */
import { useEffect } from "react";

export function MarcoEnElDocumento({ piezaId }: { piezaId: string }) {
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute("data-marco", piezaId);
    return () => html.removeAttribute("data-marco");
  }, [piezaId]);
  return null;
}
