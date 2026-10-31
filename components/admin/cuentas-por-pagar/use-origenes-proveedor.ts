"use client";

import { useEffect, useState } from "react";
import type { OrdenSinCuenta } from "@/lib/compras/referencia-documento";

/**
 * Las órdenes del proveedor que todavía no tienen su cuenta (C41): se piden
 * sólo cuando hay proveedor y se va a elegir una orden (`activo`). Una
 * respuesta vieja (cambiaste de proveedor a mitad de la carga) no pisa a la nueva.
 */
export function useOrdenesSinCuenta(proveedorId: string, activo: boolean) {
  const [ordenes, setOrdenes] = useState<OrdenSinCuenta[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!proveedorId || !activo) {
      setOrdenes([]);
      setError(null);
      return;
    }
    let vigente = true;
    setCargando(true);
    setError(null);
    fetch(`/api/payables/origenes?proveedor=${encodeURIComponent(proveedorId)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!vigente) return;
        if (!r.ok) {
          setError(typeof j?.error === "string" ? j.error : `No se pudieron traer las órdenes (${r.status}).`);
          setOrdenes([]);
          return;
        }
        setOrdenes(Array.isArray(j?.ordenes) ? j.ordenes : []);
      })
      .catch(() => {
        if (vigente) setError("Sin conexión: no se pudieron traer las órdenes.");
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [proveedorId, activo]);

  return { ordenes, cargando, error };
}
