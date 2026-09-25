"use client";

/**
 * use-saldo-permisos — la rolliza de cada permiso y lo ya declarado sin lote.
 *
 * Un solo pedido (`?saldoPermisos=1`) alimenta las dos pantallas que lo usan:
 * el apartado «Saldo por permiso» y la simulación del modal «Producir sin
 * lote». Van por `ctpGet`, así que abrir los dos seguidos no paga dos viajes.
 *
 * Es una lectura CARA (el patio entero agregado en el servidor): se pide sólo
 * cuando `activo` se pone en `true` —al abrir el apartado— y nunca al montar
 * la pestaña. El saldo por permiso es un apartado, no una cifra de cabecera.
 */

import { useCallback, useEffect, useState } from "react";
import { ctpGet, invalidarCtp } from "@/lib/forestal/ctp-fetch";
import type { CorridaSinOrigen, RollizaDePermiso } from "@/lib/forestal/saldo-por-permiso";

const URL_SALDO = "/api/admin/forestal/ctp?saldoPermisos=1";

export interface PatioLeido {
  total: number;
  leidas: number;
  truncado: boolean;
}

export interface DatosSaldoPermisos {
  rolliza: RollizaDePermiso[];
  corridas: CorridaSinOrigen[];
  patio: PatioLeido;
}

const VACIO: DatosSaldoPermisos = {
  rolliza: [],
  corridas: [],
  patio: { total: 0, leidas: 0, truncado: false },
};

export function useSaldoPermisos(activo: boolean) {
  const [datos, setDatos] = useState<DatosSaldoPermisos | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (forzar = false) => {
    if (forzar) invalidarCtp("saldoPermisos");
    setCargando(true);
    setError(null);
    try {
      /* TTL largo: es la lectura más cara del libro y el patio no cambia entre
         dos aperturas seguidas del apartado. «Recargar» la salta. */
      const r = await ctpGet<Partial<DatosSaldoPermisos>>(URL_SALDO, { ttlMs: 60_000 });
      setDatos({ ...VACIO, ...r });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!activo || datos || cargando || error) return;
    void cargar();
  }, [activo, datos, cargando, error, cargar]);

  return { datos, cargando, error, recargar: () => cargar(true) };
}
