"use client";

/**
 * Datos de Crecimiento › Campañas: la lista, el alta, cancelar/eliminar y
 * cuántos clientes hay en cada audiencia (lo que antes contaba la pestaña
 * Segmentos, que se fundió acá el 11-10).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { AUDIENCIAS, type Campaign, type Segment, type Status } from "./tipos";

export interface AltaCampana {
  name: string;
  message: string;
  segment: Segment;
  channel: Campaign["channel"];
  status: "programada" | "borrador";
  scheduledAt: string | null;
}

export function useCampanas() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [conteos, setConteos] = useState<Partial<Record<Segment, number | null>>>({});

  // Con el doble montaje salen dos GET; si el primero vuelve después de Eliminar,
  // la campaña borrada reaparece (el mismo bug medido en Tareas el 2026-09-14).
  // Sólo aplica su lista la carga más nueva. Eliminar NO recarga después a
  // propósito: el GET sale de "use cache" con revalidateTag(tag, "max"), que
  // sirve la lista vieja una vez más y traería la fila de vuelta.
  //
  // Lo mismo vale para Crear y Cancelar (medido 11-10 en main: tras Cancelar el
  // GET devolvía la fila todavía en «Borrador», y tras Crear la lista vieja
  // SIN la campaña nueva, que desaparecía de la pantalla). Cada cambio se
  // aplica acá y deja sin efecto la carga que estuviera en vuelo.
  const cargasRef = useRef({ ultima: 0 });
  const olvidarCargaEnVuelo = () => {
    cargasRef.current.ultima++;
    setLoading(false);
  };
  const load = useCallback(async () => {
    const esta = ++cargasRef.current.ultima;
    setLoading(true);
    try {
      const res = await fetch("/api/campaigns");
      if (res.ok) {
        const lista = (await res.json()) as Campaign[];
        if (esta === cargasRef.current.ultima) {
          setCampaigns(lista);
          setError(false);
        }
      } else if (esta === cargasRef.current.ultima) {
        setError(true);
      }
    } catch {
      if (esta === cargasRef.current.ultima) setError(true);
    } finally {
      if (esta === cargasRef.current.ultima) setLoading(false);
    }
  }, []);

  /** Cuántos hay en cada audiencia (el mismo conteo que usa el modal). */
  const contar = useCallback(() => {
    let vivo = true;
    void Promise.all(
      AUDIENCIAS.map((a) =>
        fetch(`/api/campaigns/audience-count?segment=${a.id}`)
          .then((r) => (r.ok ? r.json() : { count: null }))
          .then((d: { count?: number | null }) => [a.id, d.count ?? null] as const)
          .catch(() => [a.id, null] as const),
      ),
    ).then((pares) => {
      if (vivo) setConteos(Object.fromEntries(pares));
    });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    void load();
    return contar();
  }, [load, contar]);

  /** Devuelve el mensaje de error, o null si salió bien. */
  const crear = async (alta: AltaCampana): Promise<string | null> => {
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(alta),
      });
      if (!res.ok) return "No se pudo crear la campaña.";
      // El POST devuelve la campaña creada: se muestra sin volver a pedir la lista.
      const creada = (await res.json()) as Campaign;
      olvidarCargaEnVuelo();
      setCampaigns((prev) => [creada, ...prev.filter((c) => c.id !== creada.id)]);
      return null;
    } catch {
      return "Error de red al crear la campaña.";
    }
  };

  const cambiarEstado = async (id: string, status: Status) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/campaigns?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        olvidarCargaEnVuelo();
        setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
      }
    } finally {
      setBusyId(null);
    }
  };

  const eliminar = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/campaigns?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: csrfHeaders({}),
      });
      if (res.ok) {
        olvidarCargaEnVuelo();
        setCampaigns((prev) => prev.filter((c) => c.id !== id));
      }
    } finally {
      setBusyId(null);
    }
  };

  const recargar = () => {
    void load();
    contar();
  };

  return { campaigns, loading, error, busyId, conteos, crear, cambiarEstado, eliminar, recargar };
}

export type Campanas = ReturnType<typeof useCampanas>;
