"use client";

/**
 * Carga de Interesados: el embudo (`/api/admin/leads/funnel`, cifras del
 * servidor) y la lista (`/api/admin/leads`, hasta 200, ya sin repetidos por
 * cambio de estado). El canal se filtra acá, sobre la lista entera, para que
 * cambiarlo no vuelva a pedir nada y las cuentas de los chips no se muevan.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { EstadoLead, FunnelStats, LeadRow } from "./tipos";

export function useLeads() {
  const [stats, setStats] = useState<FunnelStats | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** El interesado que se está moviendo: su botón espera, los demás no. */
  const [moviendo, setMoviendo] = useState<string | null>(null);
  /* Una carga vieja que llega tarde no pisa a la nueva. */
  const pedido = useRef(0);

  const cargar = useCallback(async () => {
    const n = ++pedido.current;
    setActualizando(true);
    try {
      const [rStats, rLista] = await Promise.all([
        fetch("/api/admin/leads/funnel", { credentials: "include" }),
        fetch("/api/admin/leads?limit=200", { credentials: "include" }),
      ]);
      if (!rStats.ok || !rLista.ok) throw new Error(`HTTP ${rStats.status}/${rLista.status}`);
      const [jStats, jLista] = await Promise.all([rStats.json(), rLista.json()]);
      if (n !== pedido.current) return;
      setStats(jStats as FunnelStats);
      setLeads(((jLista as { leads?: LeadRow[] }).leads) ?? []);
      setError(null);
    } catch (err) {
      if (n !== pedido.current) return;
      setError(`No se pudieron cargar los interesados (${String(err).slice(0, 80)}).`);
    } finally {
      if (n === pedido.current) {
        setCargando(false);
        setActualizando(false);
      }
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const cambiarEstado = useCallback(
    async (entityId: string, estado: EstadoLead) => {
      setMoviendo(entityId);
      try {
        const res = await fetch("/api/admin/leads", {
          method: "PATCH",
          headers: csrfHeaders({ "content-type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({ entityId, status: estado }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await cargar();
      } catch (err) {
        setError(`No se pudo cambiar el estado (${String(err).slice(0, 80)}).`);
      } finally {
        setMoviendo(null);
      }
    },
    [cargar],
  );

  return { stats, leads, cargando, actualizando, error, moviendo, cargar, cambiarEstado };
}
