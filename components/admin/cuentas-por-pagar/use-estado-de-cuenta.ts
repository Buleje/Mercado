"use client";

import { useEffect, useState } from "react";
import type { EstadoDeCuenta } from "@/lib/compras/estado-de-cuenta";

export type EstadoConProveedor = EstadoDeCuenta & { proveedor: { id: string; nombre: string; ruc: string | null } };

/**
 * El estado de cuenta con un proveedor al corte (C48). Lo arma el servidor:
 * acá sólo se pide y se muestra. Cambiar de proveedor o de fecha a mitad de la
 * carga no deja que la respuesta vieja pise a la nueva.
 */
export function useEstadoDeCuenta(proveedorId: string, corte: string) {
  const [estado, setEstado] = useState<EstadoConProveedor | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!proveedorId || !/^\d{4}-\d{2}-\d{2}$/.test(corte)) {
      setEstado(null);
      setError(null);
      return;
    }
    let vigente = true;
    setCargando(true);
    setError(null);
    fetch(`/api/payables/estado-cuenta?proveedor=${encodeURIComponent(proveedorId)}&corte=${corte}`)
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!vigente) return;
        if (!r.ok || !j || !Array.isArray(j.movimientos)) {
          setEstado(null);
          setError(typeof j?.error === "string" ? j.error : `No se pudo armar el estado de cuenta (${r.status}).`);
          return;
        }
        setEstado(j as EstadoConProveedor);
      })
      .catch(() => {
        if (vigente) setError("Sin conexión: no se pudo armar el estado de cuenta.");
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [proveedorId, corte]);

  return { estado, cargando, error };
}
