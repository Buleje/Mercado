"use client";
/**
 * ADR-511 · ¿La tienda de este negocio usa su página propia prendida? Lo lee
 * el servidor (`GET /api/admin/store-customizer/pagina-propia`, misma regla
 * que la tienda) para que «Formato de tu tienda» no prometa un cambio que no
 * se ve. `null` mientras carga, si no tiene o si falla: sin aviso, como antes.
 */
import { useEffect, useState } from "react";
import { logger } from "@/lib/logger";

export interface PaginaPropiaTienda {
  id: string;
  nombre: string;
}

function leer(json: unknown): PaginaPropiaTienda | null {
  if (!json || typeof json !== "object") return null;
  const p = (json as { paginaPropia?: unknown }).paginaPropia;
  if (!p || typeof p !== "object") return null;
  const { id, nombre } = p as { id?: unknown; nombre?: unknown };
  return typeof id === "string" && typeof nombre === "string" && nombre ? { id, nombre } : null;
}

export function usePaginaPropiaTienda(): PaginaPropiaTienda | null {
  const [propia, setPropia] = useState<PaginaPropiaTienda | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/admin/store-customizer/pagina-propia", { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: unknown) => setPropia(leer(json)))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        logger.warn("[formato-tienda] no se pudo leer la página propia", { error: String(err) });
      });
    return () => ctrl.abort();
  }, []);
  return propia;
}
