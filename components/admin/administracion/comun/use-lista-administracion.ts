"use client";

/**
 * useListaAdministracion — una lista de Trámites o Alquileres: carga, recarga
 * sin parpadeo, error con reintento y `poner`/`quitar` para lo que devuelve
 * guardar (sin pedir la lista otra vez). Una respuesta vieja no pisa a una más
 * nueva. 404 = la ruta todavía no está o no hay nada: lista vacía, sin error.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { RespuestaAdm } from "./pedir-administracion";

export interface ListaAdministracion<T> {
  filas: T[];
  cargando: boolean;
  recargando: boolean;
  error: string | null;
  refrescar: () => void;
  /** Pone (o agrega arriba) la fila que devolvió el servidor. */
  poner: (fila: T) => void;
  quitar: (id: string) => void;
}

/** `clave` cambia cuando cambia lo que se pide (el filtro): vuelve a cargar. */
export function useListaAdministracion<T extends { id: string }>(
  leer: () => Promise<RespuestaAdm<T[]>>,
  clave: string,
  activo = true,
): ListaAdministracion<T> {
  const [filas, setFilas] = useState<T[]>([]);
  const [cargando, setCargando] = useState(true);
  const [recargando, setRecargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pedido = useRef(0);
  const leerRef = useRef(leer);
  useEffect(() => {
    leerRef.current = leer;
  });

  const cargar = useCallback(async (primera: boolean) => {
    const n = ++pedido.current;
    if (primera) setCargando(true);
    else setRecargando(true);
    const r = await leerRef.current();
    if (n !== pedido.current) return;
    if (r.ok) setFilas(r.data);
    else if (r.status === 404) setFilas([]);
    setError(r.ok || r.status === 404 ? null : r.error);
    setCargando(false);
    setRecargando(false);
  }, []);

  useEffect(() => {
    if (activo) void cargar(true);
    else setCargando(false);
  }, [activo, clave, cargar]);

  const refrescar = useCallback(() => void cargar(false), [cargar]);
  const poner = useCallback((f: T) => setFilas((xs) => (xs.some((x) => x.id === f.id) ? xs.map((x) => (x.id === f.id ? f : x)) : [f, ...xs])), []);
  const quitar = useCallback((id: string) => setFilas((xs) => xs.filter((x) => x.id !== id)), []);

  return { filas, cargando, recargando, error, refrescar, poner, quitar };
}
