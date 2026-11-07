"use client";

import { useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import { claveBusqueda, type Parte } from "@/lib/forestal/directorio";

/** Lo que el libro ya sabe de este proveedor, resumido para la ficha. */
export interface HistorialDeCompras {
  guias: number;
  ingresadoM3: number;
  enPatioM3: number;
  /** Guías sin factura cargada: sin costo no hay margen que calcular (ADR-134). */
  guiasSinCosto: number;
  /** Con qué nombre lo escribieron las guías, si no es el de la ficha. */
  escritoComo: string | null;
}

interface RespuestaTrazabilidad {
  trazabilidad?: {
    balance?: { guias: number; ingresadoM3: number; enPatioM3: number; guiasSinCosto: number };
  };
  nombresEncontrados?: string[];
}

/**
 * Resumen de lo que pasó con este proveedor.
 *
 * El detalle completo ya existe (`CtpProveedorTrazaModal`, ADR-319) pero se
 * abre sólo desde la pantalla del Directorio. Acá va el RESUMEN, no otro
 * modal: esta ficha suele abrirse desde un picker que a su vez está dentro de
 * otro modal, y un cuarto nivel de ventana es justo lo que la regla de
 * modales anidados dice evitar.
 */
export function useHistorialProveedor(parte: Parte | null): HistorialDeCompras | null {
  const [historial, setHistorial] = useState<HistorialDeCompras | null>(null);
  useEffect(() => {
    const nombre = (parte?.nombre ?? "").trim();
    if (!nombre || !parte?.roles?.includes("proveedor")) return;
    let vivo = true;
    fetch(`/api/admin/forestal/directorio/trazabilidad?proveedor=${encodeURIComponent(nombre)}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: RespuestaTrazabilidad | null) => {
        // El balance viaja DENTRO de `trazabilidad`; leerlo un nivel más arriba
        // devolvía `undefined` sin error y la ficha no mostraba nada.
        const b = j?.trazabilidad?.balance;
        if (!vivo || !b) return;
        const escritos = (j?.nombresEncontrados ?? []).filter(
          (n) => claveBusqueda(n) !== claveBusqueda(nombre),
        );
        setHistorial({
          guias: b.guias,
          ingresadoM3: b.ingresadoM3,
          enPatioM3: b.enPatioM3,
          guiasSinCosto: b.guiasSinCosto,
          escritoComo: escritos[0] ?? null,
        });
      })
      .catch((err) => {
        // El historial es contexto, no el trabajo: si falla, la ficha se edita igual.
        logger.warn("[directorio] historial del proveedor no disponible", { error: String(err) });
      });
    return () => {
      vivo = false;
    };
  }, [parte?.nombre, parte?.roles]);
  return historial;
}
