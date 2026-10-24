"use client";

/**
 * La lista de cotizaciones y las acciones sobre varias a la vez (las vencidas).
 *
 * Se pide UNA vez la lista entera (`GET /api/cotizaciones`, que ya la devolvía
 * así sin filtros) y se filtra acá: antes cada letra del buscador y cada chip
 * de estado volvían a pedirla, y los indicadores se calculaban sobre la lista
 * filtrada — con «Borrador» elegido, «Convertidas» daba 0.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { fechaEnDias, vencioSinRespuesta, type Cotizacion } from "./tipos";

export function useCotizaciones() {
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  /** `false` = todavía no llegó la primera respuesta (los indicadores no dicen «0» de mentira). */
  const [cargada, setCargada] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [procesandoVencidas, setProcesandoVencidas] = useState(false);

  const recargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cotizaciones");
      if (!res.ok) throw new Error("No se pudieron cargar las cotizaciones");
      const data: unknown = await res.json();
      setCotizaciones(Array.isArray(data) ? (data as Cotizacion[]) : []);
      setCargada(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  // Mejora 20: enviadas cuya vigencia ya pasó sin respuesta.
  const vencidas = useMemo(() => cotizaciones.filter((c) => vencioSinRespuesta(c)), [cotizaciones]);

  /** Las pasa a «Vencida»: salen de «En curso» y dejan de pedir seguimiento. */
  const marcarVencidas = useCallback(async () => {
    setProcesandoVencidas(true);
    try {
      await Promise.all(
        vencidas.map((c) =>
          fetch(`/api/cotizaciones/${c.id}`, {
            method: "PATCH",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ status: "VENCIDA" }),
          }),
        ),
      );
    } catch (err) {
      logger.warn("[cotizaciones] marcar vencidas falló", { error: String(err) });
    } finally {
      setProcesandoVencidas(false);
      void recargar();
    }
  }, [vencidas, recargar]);

  /** Una cotización nueva por cada vencida, igual pero con 15 días más de vigencia. */
  const renovarVencidas = useCallback(async () => {
    setProcesandoVencidas(true);
    try {
      for (const c of vencidas) {
        /* 15 días desde HOY (en Lima): contados desde la vigencia vieja, una vencida
           hace un mes nacía ya vencida y el aviso volvía a pedirla. Va el DÍA: el
           servidor lo guarda hasta el final de ese día. */
        const res = await fetch("/api/cotizaciones", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            clienteNombre: c.clienteNombre,
            clienteRuc: c.clienteRuc,
            customerId: c.customerId,
            validoHasta: fechaEnDias(15),
            items: c.items.map((it) => ({ descripcion: it.descripcion, cantidad: it.cantidad, precioUnit: it.precioUnit, descuento: it.descuento, ...(it.productoId ? { productoId: it.productoId } : {}) })),
            notas: c.notas,
          }),
        });
        /* La original queda «Vencida» (la reemplaza la copia): si no, seguía en el
           aviso y un segundo «Renovar» la duplicaba otra vez. */
        if (res.ok) {
          await fetch(`/api/cotizaciones/${c.id}`, {
            method: "PATCH",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ status: "VENCIDA" }),
          });
        }
      }
    } catch (err) {
      logger.warn("[cotizaciones] renovar vencidas falló", { error: String(err) });
    } finally {
      setProcesandoVencidas(false);
      void recargar();
    }
  }, [vencidas, recargar]);

  return { cotizaciones, cargada, loading, error, recargar, vencidas, marcarVencidas, renovarVencidas, procesandoVencidas };
}
