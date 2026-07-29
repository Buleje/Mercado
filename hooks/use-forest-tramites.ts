"use client";

/**
 * use-forest-tramites — el expediente de trámites del CTP, desde el cliente.
 *
 * Trae la lista, guarda y borra. El servidor normaliza estado y fechas, así que
 * lo que vuelve del POST es la verdad — se reemplaza en la lista con eso, no con
 * lo que se mandó.
 */

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { TramiteRegistro } from "@/lib/forestal/tramites-registro";

const URL_TRAMITES = "/api/admin/forestal/tramites";

const errorDe = async (res: Response): Promise<string> => {
  const j = await res.json().catch(() => ({}));
  return j.message ?? j.error ?? `HTTP ${res.status}`;
};

export interface GuardarTramiteInput {
  id?: string;
  formatoId: string;
  formatoNombre: string;
  autoridad: string;
  asunto: string;
  datos: Record<string, string>;
  estado?: string;
  expedienteAutoridad?: string | null;
  fechaPresentacion?: string | null;
  fechaRespuesta?: string | null;
  notas?: string | null;
}

export function useForestTramites() {
  const [tramites, setTramites] = useState<TramiteRegistro[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(URL_TRAMITES, { credentials: "include" });
      if (!res.ok) throw new Error(await errorDe(res));
      const data: { tramites: TramiteRegistro[] } = await res.json();
      setTramites(data.tramites ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const guardar = useCallback(async (input: GuardarTramiteInput): Promise<TramiteRegistro | null> => {
    setError(null);
    try {
      const res = await fetch(URL_TRAMITES, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await errorDe(res));
      const { tramite }: { tramite: TramiteRegistro } = await res.json();
      // Se inserta/reemplaza con lo que devolvió el server (él fija las fechas).
      setTramites((prev) => {
        const sinEste = prev.filter((t) => t.id !== tramite.id);
        return [tramite, ...sinEste];
      });
      return tramite;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, []);

  const borrar = useCallback(async (id: string): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch(`${URL_TRAMITES}?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: csrfHeaders({}),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await errorDe(res));
      setTramites((prev) => prev.filter((t) => t.id !== id));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }, []);

  return { tramites, cargando, error, setError, recargar, guardar, borrar };
}
