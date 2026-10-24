"use client";

/**
 * El expediente se abre por la URL (`?tab=facturacion&expediente=<id>`): así
 * se comparte, sobrevive a un F5 y cualquier pantalla lo enlaza sin importar
 * el componente. Mientras está abierto el parámetro queda; al cerrar se borra.
 */
import { useCallback, useEffect, useState } from "react";
import { hrefDeDestino } from "@/lib/admin/enlaces-panel";

export const PARAM_EXPEDIENTE = "expediente";

/** Enlace desde cualquier pestaña del panel (pedidos, ventas, avisos). */
export const hrefDeExpediente = (ref: string) => hrefDeDestino({ tab: "facturacion", params: { [PARAM_EXPEDIENTE]: ref } });

/** Abre el expediente sin salir de Comprobantes (Atrás lo cierra). */
export function abrirExpediente(ref: string) {
  const url = new URL(window.location.href);
  url.searchParams.set(PARAM_EXPEDIENTE, ref);
  window.history.pushState(window.history.state, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

const leer = () => (typeof window === "undefined" ? null : new URL(window.location.href).searchParams.get(PARAM_EXPEDIENTE));

export function useExpedienteDeLaUrl() {
  const [ref, setRef] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setRef(leer());
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const cerrar = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete(PARAM_EXPEDIENTE);
    window.history.replaceState(window.history.state, "", url);
    setRef(null);
  }, []);
  return { ref, cerrar };
}
