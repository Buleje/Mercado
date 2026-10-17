"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { aNegocioBuscable, coincideNegocio, type NegocioBuscable } from "@/lib/superadmin/buscar-negocio";

export type NegocioPalette = NegocioBuscable & { id: string };

/** Cuántos negocios muestra el Ctrl+K a la vez (cada uno trae ficha + chat). */
const MAX_NEGOCIOS = 5;

/**
 * Negocios para el Ctrl+K del superadmin (SUPMKT-4): se piden UNA vez, la
 * primera vez que se abre, y se filtran en el navegador por nombre, código,
 * correo, teléfono o RUC (la misma regla que la lista de Tiendas).
 */
export function usePaletteNegocios(abierto: boolean, consulta: string) {
  const [negocios, setNegocios] = useState<NegocioPalette[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);

  // Ref y no estado: con `cargando` en las dependencias el cleanup soltaba la respuesta.
  const pedidoRef = useRef(false);
  useEffect(() => {
    if (!abierto || pedidoRef.current) return;
    pedidoRef.current = true;
    setCargando(true);
    fetch("/api/superadmin/tenants", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { tenants?: Record<string, unknown>[] }) => {
        setNegocios((d.tenants ?? []).map(aNegocioBuscable).filter((n) => n.id));
        setError(false);
      })
      .catch((err: unknown) => {
        console.error("[sa-palette] negocios no cargaron", err);
        setError(true);
        pedidoRef.current = false; // la próxima vez que abras, reintenta
      })
      .finally(() => setCargando(false));
  }, [abierto]);

  const encontrados = useMemo(() => {
    const q = consulta.trim();
    if (q.length < 2 || !negocios) return [];
    return negocios.filter((n) => coincideNegocio(n, q)).slice(0, MAX_NEGOCIOS);
  }, [negocios, consulta]);

  return { encontrados, cargando, error };
}
