"use client";

/**
 * La tabla de Facturas y boletas con su alcance (F34/F36/F38): la búsqueda y
 * los filtros van a la BASE, y el resumen (los indicadores) sale del mismo
 * filtro. Antes se filtraban en el navegador los 100 últimos y las cifras
 * sumaban sólo esos. La búsqueda espera a que dejes de escribir; una respuesta
 * vieja se cancela y nunca pisa a la nueva.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import type { ResumenComprobantes } from "@/lib/comprobantes/resumen";
import { aParams, type FiltrosComprobantes } from "./filtros-comprobantes";
import type { EDocument } from "./tipos";
import { pedirComprobantes } from "./use-comprobantes";

/** Filas que muestra la tabla; el Excel pide hasta el tope de la ruta. */
export const FILAS_TABLA = 200;
export const FILAS_EXCEL = 2000;
const ESPERA_BUSQUEDA_MS = 300;

export interface ListaComprobantes {
  docs: EDocument[];
  total: number;
  resumen: ResumenComprobantes | null;
  cargando: boolean;
  error: string | null;
}

export function useListaComprobantes(filtros: FiltrosComprobantes) {
  const [estado, setEstado] = useState<ListaComprobantes>({ docs: [], total: 0, resumen: null, cargando: true, error: null });
  const control = useRef<AbortController | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const clave = aParams(filtros, FILAS_TABLA).toString();
  const primera = useRef(true);

  useEffect(() => {
    const ctrl = new AbortController();
    control.current?.abort();
    control.current = ctrl;
    /* La primera carga y los cambios de filtro van ya; sólo el tecleo espera. */
    const espera = primera.current ? 0 : ESPERA_BUSQUEDA_MS;
    primera.current = false;
    setEstado((e) => ({ ...e, cargando: true }));
    const t = setTimeout(() => {
      pedirComprobantes(new URLSearchParams(clave), ctrl.signal)
        .then((r) => {
          if (ctrl.signal.aborted) return;
          setEstado(
            r.ok
              ? { docs: r.docs, total: r.total, resumen: r.resumen, cargando: false, error: null }
              : (e) => ({ ...e, cargando: false, error: r.error ?? "No se pudo traer los comprobantes." }),
          );
        })
        .catch((err: unknown) => {
          if (ctrl.signal.aborted) return;
          logger.warn("[comprobantes] lista", { error: String(err) });
          setEstado((e) => ({ ...e, cargando: false, error: "Sin conexión: no se pudo traer los comprobantes." }));
        });
    }, espera);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [clave, vuelta]);

  const recargar = useCallback(() => setVuelta((v) => v + 1), []);

  /** Las filas del Excel: el MISMO alcance, hasta 2000. */
  const paraExcel = useCallback(async (): Promise<EDocument[] | null> => {
    try {
      const r = await pedirComprobantes(aParams(filtros, FILAS_EXCEL));
      return r.ok ? r.docs : null;
    } catch (err) {
      logger.warn("[comprobantes] excel", { error: String(err) });
      return null;
    }
  }, [filtros]);

  return { ...estado, recargar, paraExcel };
}

/**
 * Cuántos hay de cada tipo y estado para los filtros Tipo y Estado: del mismo
 * período, búsqueda y origen, SIN el tipo ni el estado elegidos (si no, al
 * marcar «Rechazado» los demás estados dirían 0). Sin tipo ni estado puestos,
 * es el mismo resumen de la tabla y no se pide nada más.
 */
export function useFacetasComprobantes(filtros: FiltrosComprobantes, resumenTabla: ResumenComprobantes | null): ResumenComprobantes | null {
  const sinFacetas = filtros.tipos.length === 0 && filtros.estados.length === 0;
  const clave = sinFacetas ? "" : aParams({ ...filtros, tipos: [], estados: [] }, 1).toString();
  const [propio, setPropio] = useState<{ clave: string; resumen: ResumenComprobantes | null }>({ clave: "", resumen: null });

  useEffect(() => {
    if (!clave) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      pedirComprobantes(new URLSearchParams(clave), ctrl.signal)
        .then((r) => {
          if (!ctrl.signal.aborted && r.ok) setPropio({ clave, resumen: r.resumen });
        })
        .catch((err: unknown) => {
          if (!ctrl.signal.aborted) logger.warn("[comprobantes] facetas", { error: String(err) });
        });
    }, ESPERA_BUSQUEDA_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [clave]);

  if (sinFacetas) return resumenTabla;
  /* Mientras llega la cuenta nueva queda la anterior: mejor que un parpadeo a «—». */
  return propio.resumen ?? resumenTabla;
}
