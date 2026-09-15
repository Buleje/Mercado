"use client";

/**
 * use-forest-plantaciones — el Registro de Plantación Forestal, desde el cliente.
 *
 * `listado` es liviano (para "Mis Registros"); `cargarDetalle` trae el árbol
 * completo (bloques → vértices + especies) recién cuando se abre uno — no
 * hace falta bajar todo para pintar la tabla.
 */

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { PlantacionInput, PlantacionListItem, PlantacionRegistro } from "@/lib/forestal/plantacion-tramite";

const URL_PLANTACIONES = "/api/admin/forestal/plantaciones";

const errorDe = async (res: Response): Promise<string> => {
  const j = await res.json().catch(() => ({}));
  return j.message ?? j.error ?? `HTTP ${res.status}`;
};

export function useForestPlantaciones() {
  const [listado, setListado] = useState<PlantacionListItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(URL_PLANTACIONES, { credentials: "include" });
      if (!res.ok) throw new Error(await errorDe(res));
      const data: { plantaciones: PlantacionListItem[] } = await res.json();
      setListado(data.plantaciones ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const cargarDetalle = useCallback(async (id: string): Promise<PlantacionRegistro | null> => {
    setError(null);
    try {
      const res = await fetch(`${URL_PLANTACIONES}/${encodeURIComponent(id)}`, { credentials: "include" });
      if (!res.ok) throw new Error(await errorDe(res));
      const data: { plantacion: PlantacionRegistro } = await res.json();
      return data.plantacion;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, []);

  const guardar = useCallback(async (input: PlantacionInput): Promise<PlantacionRegistro | null> => {
    setError(null);
    try {
      const res = await fetch(URL_PLANTACIONES, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await errorDe(res));
      const { plantacion }: { plantacion: PlantacionRegistro } = await res.json();
      void recargar();
      return plantacion;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, [recargar]);

  const duplicar = useCallback(async (id: string): Promise<PlantacionRegistro | null> => {
    setError(null);
    try {
      const res = await fetch(`${URL_PLANTACIONES}/${encodeURIComponent(id)}/duplicar`, {
        method: "POST",
        headers: csrfHeaders({}),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await errorDe(res));
      const { plantacion }: { plantacion: PlantacionRegistro } = await res.json();
      void recargar();
      return plantacion;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, [recargar]);

  const borrar = useCallback(async (id: string): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch(`${URL_PLANTACIONES}?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: csrfHeaders({}),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await errorDe(res));
      setListado((prev) => prev.filter((p) => p.id !== id));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }, []);

  return { listado, cargando, error, setError, recargar, cargarDetalle, guardar, duplicar, borrar };
}
