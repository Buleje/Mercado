"use client";

/**
 * «Hoy» del POS: las cifras del día vienen sumadas del servidor
 * (`GET /api/sales/resumen-hoy`) y la lista del historial se pide por páginas
 * para ESE mismo día de Lima. Antes la tira y el historial bajaban hasta 1.000
 * ventas con sus ítems sólo para sumarlas (2026-10-09).
 */
import { useCallback, useEffect, useState } from "react";
import type { ResumenDelDiaPos } from "@/lib/db/sales.db";
import type { SaleRecord } from "@/components/admin/pos/pos-shared";

export type { ResumenDelDiaPos };

export type EstadoResumenHoy =
  | { estado: "cargando" }
  | { estado: "error" }
  | { estado: "ok"; resumen: ResumenDelDiaPos };

const ETIQUETAS: Record<string, string> = {
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  tarjeta: "Tarjeta",
  fiado: "Fiado",
  trueque: "Trueque",
  transferencia: "Transferencia",
  mixto: "Mixto sin detalle",
};

/** «yape» → «Yape»; un medio que no conocemos sale con mayúscula inicial. */
export function etiquetaMedio(medio: string): string {
  return ETIQUETAS[medio] ?? (medio ? medio.charAt(0).toUpperCase() + medio.slice(1) : "Sin medio");
}

/**
 * `refreshKey` sube con cada venta (la tira se actualiza sola); `activo=false`
 * no pide nada (el historial sólo carga cuando está abierto).
 */
export function useResumenHoy(refreshKey = 0, activo = true): EstadoResumenHoy {
  const [estado, setEstado] = useState<EstadoResumenHoy>({ estado: "cargando" });

  useEffect(() => {
    if (!activo) return;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/sales/resumen-hoy", { signal: controller.signal, cache: "no-store" });
        if (!res.ok) {
          setEstado({ estado: "error" });
          return;
        }
        const resumen = (await res.json()) as ResumenDelDiaPos;
        setEstado({ estado: "ok", resumen });
      } catch (err) {
        if ((err as { name?: string }).name !== "AbortError") setEstado({ estado: "error" });
      }
    })();
    return () => controller.abort();
  }, [refreshKey, activo]);

  return estado;
}

export const VENTAS_POR_PAGINA = 50;

/**
 * Lista del historial: las ventas del día `dia` (Lima), de 50 en 50. Usa
 * `from=to=dia`, que el servidor lee como el día completo de Lima — la misma
 * ventana del resumen, así la lista y el total hablan del mismo día.
 */
export function useVentasDelDia(dia: string | null) {
  const [ventas, setVentas] = useState<SaleRecord[]>([]);
  const [totalFilas, setTotalFilas] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(false);
  // Para qué día está la lista que tenemos: evita el «Sin ventas hoy» de un
  // instante entre que llega el resumen y arranca el pedido de la lista.
  const [cargadoPara, setCargadoPara] = useState<string | null>(null);

  const pedir = useCallback(async (d: string, p: number, signal?: AbortSignal) => {
    setCargando(true);
    try {
      const qs = new URLSearchParams({ from: d, to: d, limit: String(VENTAS_POR_PAGINA), page: String(p) });
      const res = await fetch(`/api/sales?${qs}`, { signal, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: unknown = await res.json();
      const filas = Array.isArray(data) ? (data as SaleRecord[]) : [];
      setVentas((prev) => (p === 1 ? filas : [...prev, ...filas]));
      setTotalFilas(Number(res.headers.get("X-Total-Count")) || filas.length);
      setPagina(p);
    } catch (err) {
      if ((err as { name?: string }).name !== "AbortError" && p === 1) setVentas([]);
    } finally {
      if (!signal?.aborted && p === 1) setCargadoPara(d);
      if (!signal?.aborted) setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!dia) return;
    const controller = new AbortController();
    void pedir(dia, 1, controller.signal);
    return () => controller.abort();
  }, [dia, pedir]);

  const cargarMas = useCallback(() => {
    if (dia && !cargando) void pedir(dia, pagina + 1);
  }, [dia, cargando, pagina, pedir]);

  return { ventas, totalFilas, cargando, cargarMas, hayMas: ventas.length < totalFilas, lista: dia !== null && cargadoPara === dia };
}
