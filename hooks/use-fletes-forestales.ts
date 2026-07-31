"use client";

/**
 * use-fletes-forestales — los viajes del CTP desde el cliente (ADR-318).
 *
 * Single source del fetch: la vista de Fletes y cualquier panel que quiera
 * mostrar "cuánto costó traerla" leen de acá.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { resumirFletes, type EstadoPago, type Flete, type FleteInput } from "@/lib/forestal/fletes";

const json = { "Content-Type": "application/json" };

export function useFletesForestales(period: { from: string | null; to: string | null }) {
  const [fletes, setFletes] = useState<Flete[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const desde = period.from;
  const hasta = period.to;

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (desde) qs.set("desde", desde);
      if (hasta) qs.set("hasta", hasta);
      const r = await fetch(`/api/admin/forestal/fletes?${qs}`, { credentials: "include", cache: "no-store" });
      if (!r.ok) throw new Error(`No se pudieron leer los fletes (${r.status})`);
      const j = (await r.json()) as { fletes?: Flete[] };
      setFletes(j.fletes ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, [desde, hasta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = useCallback(async (input: FleteInput & { id?: string }): Promise<Flete> => {
    const r = await fetch("/api/admin/forestal/fletes", {
      method: "POST",
      credentials: "include",
      headers: json,
      body: JSON.stringify(input),
    });
    const j = (await r.json().catch(() => ({}))) as { flete?: Flete; message?: string };
    if (!r.ok || !j.flete) throw new Error(j.message ?? "No se pudo guardar el flete.");
    const flete = j.flete;
    // Se re-inserta ordenado por fecha: un viaje viejo cargado hoy va a su lugar.
    setFletes((prev) =>
      [flete, ...prev.filter((f) => f.id !== flete.id)].sort((a, b) => b.fecha.localeCompare(a.fecha)),
    );
    return flete;
  }, []);

  const marcarPago = useCallback(async (id: string, estadoPago: EstadoPago): Promise<void> => {
    const r = await fetch("/api/admin/forestal/fletes", {
      method: "PATCH",
      credentials: "include",
      headers: json,
      body: JSON.stringify({ id, estadoPago }),
    });
    const j = (await r.json().catch(() => ({}))) as { flete?: Flete };
    if (!r.ok || !j.flete) throw new Error("No se pudo cambiar el estado de pago.");
    const flete = j.flete;
    setFletes((prev) => prev.map((f) => (f.id === flete.id ? flete : f)));
  }, []);

  const eliminar = useCallback(async (id: string): Promise<void> => {
    const r = await fetch(`/api/admin/forestal/fletes?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!r.ok) throw new Error("No se pudo borrar el flete.");
    setFletes((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const resumen = useMemo(() => resumirFletes(fletes), [fletes]);

  return { fletes, resumen, cargando, error, cargar, guardar, marcarPago, eliminar };
}
