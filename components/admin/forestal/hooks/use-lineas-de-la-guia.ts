"use client";

/**
 * useLineasDeLaGuia — cuántas líneas de despacho anula anular ESTA guía, según
 * el servidor (`ForestLothDB.lineasDeLaGuia`, 29-09-2026). Dos titulares
 * pueden tener el mismo N°: contar por N° en la pantalla sumaba las líneas del
 * otro. Mientras llega (o si falla), el conteo que ya tenía la pantalla.
 */

import { useEffect, useState } from "react";

export function useLineasDeLaGuia(gtfId: string | null | undefined, previo: number): number {
  const [delServidor, setDelServidor] = useState<{ id: string; n: number } | null>(null);
  useEffect(() => {
    if (!gtfId) return;
    let vivo = true;
    fetch(`/api/admin/forestal/loth/despacho-guia?lineasDeGuia=${encodeURIComponent(gtfId)}`, { credentials: "include", cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { lineas?: number };
        if (vivo && r.ok && typeof j.lineas === "number") setDelServidor({ id: gtfId, n: j.lineas });
      })
      .catch((err) => console.warn("[loth-gtf] no se pudo contar las líneas de la guía", err));
    return () => {
      vivo = false;
    };
  }, [gtfId]);
  return delServidor && delServidor.id === gtfId ? delServidor.n : previo;
}
