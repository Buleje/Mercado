"use client";

/**
 * La cotización abierta en el panel lateral: traerla entera, cambiarle el
 * estado y convertirla en pedido. También los datos del emisor para el PDF.
 */
import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import type { EmpresaEmisor } from "@/lib/documentos/cotizacion-print";
import type { Cotizacion, CotizacionStatus } from "./tipos";

export function useDetalleCotizacion(alCambiar: () => void) {
  const [selected, setSelected] = useState<Cotizacion | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  /** El pedido que nació al convertir (la API lo devuelve; la cotización no lo guarda). */
  const [pedidoCreado, setPedidoCreado] = useState<{ cotizacionId: string; orderId: string } | null>(null);
  const [convertirError, setConvertirError] = useState<string | null>(null);
  const [estadoError, setEstadoError] = useState<string | null>(null);

  // Datos del emisor (para el header del PDF); best-effort desde la config SUNAT.
  const [empresa, setEmpresa] = useState<EmpresaEmisor | null>(null);
  useEffect(() => {
    fetch("/api/admin/sunat/config", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.data?.razonSocial) setEmpresa({ razonSocial: j.data.razonSocial, ruc: j.data.ruc, direccionFiscal: j.data.direccionFiscal ?? null });
      })
      // Sin datos de empresa el PDF sale con un encabezado neutro.
      .catch((err) => logger.warn("[cotizaciones] config SUNAT no disponible", { error: String(err) }));
  }, []);

  const cerrar = useCallback(() => setSelected(null), []);

  const abrir = useCallback(async (c: Cotizacion) => {
    // El error de «Convertir en venta» es de UNA cotización: no se arrastra a la siguiente.
    setConvertirError(null);
    setEstadoError(null);
    setSelected(c);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/cotizaciones/${c.id}`);
      if (res.ok) setSelected((await res.json()) as Cotizacion);
    } catch (err) {
      // Queda lo que ya traía la lista.
      logger.warn("[cotizaciones] detalle no disponible", { error: String(err) });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const cambiarEstado = useCallback(
    async (status: CotizacionStatus) => {
      if (!selected) return;
      setActionLoading(true);
      setEstadoError(null);
      try {
        const res = await fetch(`/api/cotizaciones/${selected.id}`, {
          method: "PATCH",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ status }),
        });
        if (!res.ok) throw new Error("No se pudo cambiar el estado");
        setSelected((await res.json()) as Cotizacion);
        alCambiar();
      } catch (e) {
        setEstadoError(e instanceof Error ? e.message : "No se pudo cambiar el estado");
      } finally {
        setActionLoading(false);
      }
    },
    [selected, alCambiar],
  );

  const convertir = useCallback(async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/cotizaciones/${selected.id}/convertir`, { method: "POST", headers: csrfHeaders() });
      let data: { orderId?: string; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        /* sin cuerpo: queda el mensaje genérico */
      }
      if (!res.ok) throw new Error(data.error ?? "No se pudo convertir la cotización");
      // El pedido que nació de esta cotización: el detalle lo enlaza.
      if (data.orderId) setPedidoCreado({ cotizacionId: selected.id, orderId: data.orderId });
      setConvertirError(null);
      setSelected({ ...selected, status: "CONVERTIDA" });
      alCambiar();
    } catch (e) {
      setConvertirError(e instanceof Error ? e.message : "No se pudo convertir la cotización");
    } finally {
      setActionLoading(false);
    }
  }, [selected, alCambiar]);

  return { selected, abrir, cerrar, detailLoading, actionLoading, cambiarEstado, convertir, pedidoCreado, convertirError, estadoError, empresa };
}

export type DetalleCotizacion = ReturnType<typeof useDetalleCotizacion>;
