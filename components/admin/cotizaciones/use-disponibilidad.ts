"use client";

/**
 * Cuánto hay HOY de los productos de una cotización (F26). Sólo lee: cotizar
 * no aparta stock, y al convertir el servidor lo revisa otra vez. Las líneas
 * escritas a mano (sin `productoId`) no se revisan.
 */
import { useEffect, useMemo, useState } from "react";
import { logger } from "@/lib/logger";
import { estadoDeLinea, idDeProducto, type DisponibilidadProducto, type EstadoLinea } from "@/lib/cotizaciones/disponibilidad";

type Linea = { productoId?: string | null; cantidad: number | string };

export function useDisponibilidad(lineas: readonly Linea[], activo = true) {
  const ids = useMemo(() => {
    const s = new Set<number>();
    for (const l of lineas) {
      const id = idDeProducto(l.productoId);
      if (id) s.add(id);
    }
    return [...s].sort((a, b) => a - b);
  }, [lineas]);
  const clave = ids.join(",");
  const [porId, setPorId] = useState<ReadonlyMap<number, DisponibilidadProducto>>(new Map());
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!activo || !clave) {
      setPorId(new Map());
      setCargando(false);
      return;
    }
    const ctrl = new AbortController();
    setCargando(true);
    const t = setTimeout(() => {
      fetch(`/api/cotizaciones/disponibilidad?ids=${clave}`, { signal: ctrl.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json()) as { productos?: DisponibilidadProducto[] };
          setPorId(new Map((data.productos ?? []).map((p) => [p.id, p])));
          setError(false);
        })
        .catch((err) => {
          if (ctrl.signal.aborted) return;
          logger.warn("[cotizaciones] revisar stock falló", { error: String(err) });
          setError(true);
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setCargando(false);
        });
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [clave, activo]);

  /** Lo pedido de cada producto sumando todas sus líneas (dos líneas del mismo producto comparten stock). */
  const pedidoPorId = useMemo(() => {
    const m = new Map<number, number>();
    for (const l of lineas) {
      const id = idDeProducto(l.productoId);
      if (!id) continue;
      const n = typeof l.cantidad === "number" ? l.cantidad : parseFloat(l.cantidad) || 0;
      m.set(id, (m.get(id) ?? 0) + n);
    }
    return m;
  }, [lineas]);

  /** El estado de una línea, o null si es a mano o todavía no llegó. */
  const estadoDe = (productoId: string | null | undefined): EstadoLinea | null => {
    const id = idDeProducto(productoId);
    const p = id ? porId.get(id) : undefined;
    return id && p ? estadoDeLinea(p, pedidoPorId.get(id) ?? 0) : null;
  };

  return { estadoDe, cargando, error, hayProductos: ids.length > 0, productos: porId };
}
