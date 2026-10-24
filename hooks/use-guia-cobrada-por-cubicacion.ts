"use client";

import { useEffect, useState } from "react";
import type { PrefillOrigenDespacho } from "@/lib/forestal/cubicacion-comercial-tipos";

/**
 * ADR-484: el código de la cubicación de VENTA que ya cobró la guía de este
 * despacho, o `null`. Sale del prellenado del despacho (`cobradaPor`), que usa
 * la misma consulta que frena «Anotar la venta»: la pantalla esconde el botón
 * en vez de esperar el 409. Sin permiso para las Herramientas Forestales (403)
 * o sin red queda en `null` y el servidor sigue frenando.
 */
export function useGuiaCobradaPorCubicacion(despachoId: string | null | undefined): string | null {
  const [codigo, setCodigo] = useState<string | null>(null);
  useEffect(() => {
    if (!despachoId) return;
    const ctrl = new AbortController();
    fetch(`/api/admin/forestal/cubicaciones-trozas/origen?tipo=despacho&id=${encodeURIComponent(despachoId)}`, {
      credentials: "include",
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ prefill?: Pick<PrefillOrigenDespacho, "cobradaPor"> }>) : null))
      .then((j) => setCodigo(j?.prefill?.cobradaPor ?? null))
      .catch(() => setCodigo(null));
    return () => ctrl.abort();
  }, [despachoId]);
  return codigo;
}
