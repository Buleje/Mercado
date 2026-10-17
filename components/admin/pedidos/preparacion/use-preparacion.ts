"use client";

/**
 * Datos de la vista Preparación (N02): los pedidos por preparar con lo ya
 * juntado, y la agenda de entregas pedidas (N01). Se refresca sola cada
 * minuto con la pestaña a la vista: dos celulares del almacén ven lo mismo.
 *
 * Lo juntado se anota en `/api/admin/pedidos/preparacion` (no toca el pedido).
 * Pasar a «preparando» usa la transición de siempre (`PATCH /api/orders/[id]`).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { tenantFetch } from "@/lib/tenant-fetch";
import { logger } from "@/lib/logger";
import { intervaloVisible } from "@/lib/client-cache-fetch";
import type { AvancePrep, CambioPrep, PedidoPrep } from "@/lib/pedidos/preparacion";
import type { EntregaAgendada } from "@/lib/pedidos/franja-entrega";

const RUTA = "/api/admin/pedidos/preparacion";

interface Respuesta {
  pedidos: PedidoPrep[];
  truncado: boolean;
  agenda: EntregaAgendada[];
}

async function errorDe(res: Response, porDefecto: string): Promise<string> {
  const j: unknown = await res.json().catch(() => null);
  return j && typeof j === "object" && typeof (j as { error?: unknown }).error === "string" ? (j as { error: string }).error : porDefecto;
}

export function usePreparacion() {
  const [pedidos, setPedidos] = useState<PedidoPrep[]>([]);
  const [agenda, setAgenda] = useState<EntregaAgendada[]>([]);
  const [truncado, setTruncado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  /** Pedido con un cambio en vuelo: sus controles esperan (no se pisan dos toques). */
  const [ocupado, setOcupado] = useState<string | null>(null);
  /** La carga vieja no pisa a la nueva (un refresco lento que vuelve tarde). */
  const turno = useRef(0);

  const cargar = useCallback(async (silencioso = false) => {
    const mio = ++turno.current;
    if (!silencioso) setCargando(true);
    try {
      const res = await tenantFetch(RUTA);
      if (!res.ok) throw new Error(`preparacion ${res.status}`);
      const datos = (await res.json()) as Respuesta;
      if (mio !== turno.current) return;
      setPedidos(datos.pedidos ?? []);
      setAgenda(datos.agenda ?? []);
      setTruncado(Boolean(datos.truncado));
      setError(false);
    } catch (err) {
      logger.warn("[Preparacion] no se pudo cargar", { error: String(err) });
      if (mio === turno.current && !silencioso) setError(true);
    } finally {
      if (!silencioso) setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
    return intervaloVisible(() => void cargar(true), 60_000);
  }, [cargar]);

  const ponerAvance = (id: string, avance: AvancePrep | null) =>
    setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, avance } : p)));

  /** Anota lo juntado. Devuelve si se guardó. */
  const cambiar = useCallback(async (pedidoId: string, cambio: CambioPrep): Promise<boolean> => {
    setOcupado(pedidoId);
    try {
      const res = await tenantFetch(RUTA, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedidoId, cambio }),
      });
      if (!res.ok) {
        toast.error(await errorDe(res, "No se guardó lo juntado: intenta de nuevo."));
        if (res.status === 409) void cargar(true);
        return false;
      }
      const { avance } = (await res.json()) as { avance: AvancePrep | null };
      turno.current++; // un refresco que salió antes de este cambio traería lo viejo
      ponerAvance(pedidoId, avance);
      return true;
    } catch (err) {
      logger.warn("[Preparacion] no se guardó el avance", { error: String(err) });
      toast.error("Sin conexión: lo juntado no se guardó.");
      return false;
    } finally {
      setOcupado(null);
    }
  }, [cargar]);

  /** «Empezar a preparar»: la transición de siempre, confirmado → preparando. */
  const empezar = useCallback(async (pedidoId: string): Promise<boolean> => {
    setOcupado(pedidoId);
    try {
      const res = await tenantFetch(`/api/orders/${pedidoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "preparando" }),
      });
      if (!res.ok) {
        toast.error(await errorDe(res, "No se pudo pasar a «Preparando»."));
        return false;
      }
      turno.current++;
      setPedidos((prev) => prev.map((p) => (p.id === pedidoId ? { ...p, estado: "preparando", enEstadoDesde: new Date().toISOString() } : p)));
      const datos = (await res.json().catch(() => null)) as { whatsappLink?: string; whatsappSent?: boolean } | null;
      // Lo mismo que el Tablero: si el aviso al cliente no salió solo, se abre WhatsApp para mandarlo.
      if (datos?.whatsappLink && !datos.whatsappSent) window.open(datos.whatsappLink, "_blank", "noopener,noreferrer");
      return true;
    } catch (err) {
      logger.warn("[Preparacion] no se pudo empezar", { error: String(err) });
      toast.error("Sin conexión: el pedido sigue como estaba.");
      return false;
    } finally {
      setOcupado(null);
    }
  }, []);

  return { pedidos, agenda, truncado, cargando, error, ocupado, recargar: () => cargar(), cambiar, empezar };
}

export type Preparacion = ReturnType<typeof usePreparacion>;
