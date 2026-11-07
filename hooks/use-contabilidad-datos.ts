"use client";

/**
 * Los datos de la Contabilidad (ADR-529): un GET a `/api/admin/contabilidad/<ruta>`
 * con cancelación (cambiar de mes o desmontar aborta el pedido anterior). La
 * respuesta es el objeto pelado del contrato (`lib/contabilidad/tipos.ts`); un
 * error viene como `{ error: "texto para la persona" }`.
 */
import { useCallback, useEffect, useState } from "react";
import { BASE_CONTABILIDAD } from "@/lib/contabilidad/tipos";

interface Respuesta<T> {
  clave: string;
  datos: T | null;
  error: string | null;
}

/** El texto de error de una respuesta `{ error }`, o el de siempre. */
export function textoDeError(json: unknown, porDefecto: string): string {
  if (typeof json === "object" && json !== null && "error" in json) {
    const e = (json as { error: unknown }).error;
    if (typeof e === "string" && e.trim()) return e;
  }
  return porDefecto;
}

export interface EstadoContabilidad<T> {
  datos: T | null;
  cargando: boolean;
  error: string | null;
  recargar: () => void;
}

/** `ruta` es lo que va después de la base: `diario?mes=2026-11`. `null` = no pedir. */
export function useContabilidad<T>(ruta: string | null): EstadoContabilidad<T> {
  const [tick, setTick] = useState(0);
  const [res, setRes] = useState<Respuesta<T> | null>(null);
  const clave = `${ruta ?? ""}:${tick}`;

  useEffect(() => {
    if (ruta === null) return;
    const ac = new AbortController();
    fetch(`${BASE_CONTABILIDAD}/${ruta}`, { cache: "no-store", signal: ac.signal })
      .then(async (r) => {
        const json: unknown = await r.json().catch(() => null);
        if (ac.signal.aborted) return;
        if (!r.ok || json === null) {
          setRes({ clave, datos: null, error: textoDeError(json, "No se pudo cargar la contabilidad.") });
          return;
        }
        setRes({ clave, datos: json as T, error: null });
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
        setRes({ clave, datos: null, error: "No se pudo conectar. Revisa tu internet e inténtalo otra vez." });
      });
    return () => ac.abort();
  }, [ruta, clave]);

  const recargar = useCallback(() => setTick((t) => t + 1), []);
  const cargando = ruta !== null && res?.clave !== clave;
  return {
    datos: cargando ? null : (res?.datos ?? null),
    cargando,
    error: cargando ? null : (res?.error ?? null),
    recargar,
  };
}
