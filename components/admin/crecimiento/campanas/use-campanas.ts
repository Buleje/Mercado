"use client";

/**
 * Datos de Crecimiento › Mandar mensaje: lo que ya mandaste, el alta del modo
 * «Automático», el registro de «Uno por uno» (canal `manual`), cancelar /
 * eliminar y cuántos clientes arma el servidor en cada grupo (lo que antes
 * contaba la pestaña Segmentos, fundida el 11-10).
 *
 * `activo = false` (quien no ve «Automático»: GET/POST /api/campaigns es de
 * gestión) no pide nada.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { GRUPOS_MENSAJE, type AudienciaServidor } from "@/lib/admin/grupos-mensaje";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import type { Campaign, ChannelAutomatico, Segment, Status } from "./tipos";

export interface AltaCampana {
  name: string;
  message: string;
  segment: Segment;
  channel: ChannelAutomatico;
  status: "programada" | "borrador";
  scheduledAt: string | null;
}

/** Un envío «Uno por uno»: queda como campaña ya enviada, canal `manual`. */
export interface AltaManual {
  name: string;
  message: string;
  segment: string;
  /** Los del grupo con número cuando abriste el primero. */
  totalAudience: number;
  /** A cuántos les abriste el chat. */
  delivered: number;
}

const AUDIENCIAS_DEL_SERVIDOR = GRUPOS_MENSAJE.flatMap((g) => (g.auto ? [g.auto] : []));

export function useCampanas(activo = true) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(activo);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [conteos, setConteos] = useState<Partial<Record<AudienciaServidor, number | null>>>({});

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

  /** Cuántos arma el servidor en cada grupo (el mismo conteo que guarda el alta). */
  const contar = useCallback(() => {
    let vivo = true;
    void Promise.all(
      AUDIENCIAS_DEL_SERVIDOR.map((id) =>
        fetch(`/api/campaigns/audience-count?segment=${id}`)
          .then((r) => (r.ok ? r.json() : { count: null }))
          .then((d: { count?: number | null }) => [id, d.count ?? null] as const)
          .catch(() => [id, null] as const),
      ),
    ).then((pares) => {
      if (vivo) setConteos(Object.fromEntries(pares));
    });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (!activo) return;
    void load();
    return contar();
  }, [activo, load, contar]);

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

  /** Devuelve el id del envío anotado, o null si no se pudo (se reintenta al abrir el siguiente). */
  const anotarManual = async (alta: AltaManual): Promise<string | null> => {
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ...alta, channel: "manual" }),
      });
      if (!res.ok) return null;
      const creada = (await res.json()) as Campaign;
      olvidarCargaEnVuelo();
      setCampaigns((prev) => [creada, ...prev.filter((c) => c.id !== creada.id)]);
      return creada.id;
    } catch (err) {
      logger.warn("[MandarMensaje] no se pudo anotar el envío uno por uno", { error: String(err) });
      return null;
    }
  };

  /** A cuántos les abriste el chat. `keepalive`: sale aunque cierres la pestaña. */
  /** `true` sólo si el servidor lo guardó (un 429 o un corte no cuentan). */
  const actualizarAbiertos = async (id: string, delivered: number, keepalive = false): Promise<boolean> => {
    try {
      const res = await fetch(`/api/campaigns?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ delivered }),
        keepalive,
      });
      if (res.ok) {
        olvidarCargaEnVuelo();
        setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, delivered } : c)));
      }
      return res.ok;
    } catch (err) {
      logger.warn("[MandarMensaje] no se pudo anotar a cuántos les abriste el chat", { error: String(err) });
      return false;
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
    if (!activo) return;
    void load();
    contar();
  };

  return { campaigns, loading, error, busyId, conteos, crear, anotarManual, actualizarAbiertos, cambiarEstado, eliminar, recargar };
}

export type Campanas = ReturnType<typeof useCampanas>;
