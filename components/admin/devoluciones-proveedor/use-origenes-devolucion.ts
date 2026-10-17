"use client";

import { useEffect, useState } from "react";
import type { OrigenDevolucion, RetornableProducto } from "./origen-devolucion";

const VACIO = { ordenes: [] as OrigenDevolucion[], porProducto: {} as Record<string, RetornableProducto> };

/**
 * De qué órdenes recibidas de un proveedor puede salir una devolución y cuánto
 * queda por devolver de cada producto (C49/C51). Se pide sólo con proveedor y
 * `activo`; una respuesta vieja (cambiaste de proveedor) no pisa a la nueva.
 */
export function useOrigenesDevolucion(proveedorId: string | null | undefined, activo = true) {
  const [datos, setDatos] = useState(VACIO);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!proveedorId || !activo) {
      setDatos(VACIO);
      setError(null);
      return;
    }
    let vigente = true;
    setCargando(true);
    setError(null);
    fetch(`/api/supplier-returns/origenes?proveedorId=${encodeURIComponent(proveedorId)}`)
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as Partial<typeof VACIO> & { error?: unknown } | null;
        if (!vigente) return;
        if (!r.ok) {
          setError(typeof j?.error === "string" ? j.error : `No se pudieron traer las compras del proveedor (${r.status}).`);
          setDatos(VACIO);
          return;
        }
        setDatos({ ordenes: Array.isArray(j?.ordenes) ? j.ordenes : [], porProducto: j?.porProducto ?? {} });
      })
      .catch(() => {
        if (vigente) setError("Sin conexión: no se pudieron traer las compras del proveedor.");
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [proveedorId, activo]);

  return { ...datos, cargando, error };
}
