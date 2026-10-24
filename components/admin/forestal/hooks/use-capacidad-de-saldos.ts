"use client";

/**
 * useCapacidadDeSaldos — el balance de «Qué puede salir», armado UNA vez.
 *
 * El MISMO objeto de entrada lo leen la tarjeta, el modal de detalle, el
 * cubicador, el Excel y el PDF: cuatro cálculos paralelos divergen a la primera
 * columna nueva. Vivía en el orquestador (≈100 líneas); acá queda junto con el
 * saneo de la URL y los lotes bajo el mismo recorte.
 */

import { useCallback, useEffect, useMemo } from "react";
import {
  armarBalance,
  opcionesDeCapacidad,
  sanearFiltros,
  type BalanceCapacidad,
  type EntradaCapacidad,
  type FiltrosCapacidad,
  type OpcionFiltro,
} from "@/lib/forestal/capacidad-de-planta";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import { resumenDeOrigen, type ResumenOrigen } from "@/lib/forestal/origen-incompleto";
import {
  filtrarLotesDeReporte,
  lotesParaReporte,
  type LoteDeReporte,
} from "@/lib/forestal/saldos-reporte";
import type { FuentesDeCapacidad } from "./use-fuentes-de-capacidad";

export interface CapacidadDeSaldos {
  /** Todos los lotes (bajo el permiso activo, si hay), en forma de reporte. */
  lotesTodos: LoteDeReporte[];
  /** Los mismos, bajo el recorte permiso/especie de la tarjeta. */
  lotesFiltrados: LoteDeReporte[];
  entrada: EntradaCapacidad;
  opciones: { permisos: OpcionFiltro[]; especies: OpcionFiltro[]; guias: OpcionFiltro[] };
  aplicarFiltros: (f: FiltrosCapacidad, prioridad?: keyof FiltrosCapacidad) => void;
  balance: BalanceCapacidad;
  /** Qué parte del depósito no se puede certificar. Foto, sin filtros. */
  origen: ResumenOrigen;
  /** Mientras una fuente no llegó, el reporte no se baja. */
  fuentesCargando: boolean;
}

export function useCapacidadDeSaldos({
  fuentes,
  productos,
  period,
  filtros,
  setFiltros,
}: {
  fuentes: FuentesDeCapacidad;
  /** El stock del libro para el período (la tarjeta de productos lo concilia). */
  productos: ReadonlyArray<{ stock: number }> | undefined;
  period: CtpPeriod;
  filtros: FiltrosCapacidad;
  setFiltros: (f: FiltrosCapacidad) => void;
}): CapacidadDeSaldos {
  const { patio, lotes, corridas, pendienteSinPiezasM3, estado, patioTruncado } = fuentes;

  const lotesTodos = useMemo(() => lotesParaReporte(lotes, new Date()), [lotes]);

  const stockLibroM3 = useMemo(
    () => (productos ?? []).reduce((a, p) => a + Number(p.stock ?? 0), 0),
    [productos],
  );

  const entrada = useMemo<EntradaCapacidad>(
    () => ({
      patio,
      lotes: lotesTodos,
      corridas: corridas ?? undefined,
      stockLibroM3,
      pendienteSinPiezasM3,
      estado,
      patioTruncado,
      /* El stock de ESTA pantalla es el del período elegido; se dice de dónde
         sale: dos cifras de stock sin explicar cuál es cuál es peor que una. */
      periodoLabel: period.label,
      periodo: { from: period.from, to: period.to },
    }),
    [
      patio,
      lotesTodos,
      corridas,
      stockLibroM3,
      pendienteSinPiezasM3,
      estado,
      patioTruncado,
      period.label,
      period.from,
      period.to,
    ],
  );

  /** Las opciones de los tres filtros, cada una cruzada con las otras dos. */
  const opciones = useMemo(
    () => opcionesDeCapacidad(patio, filtros, corridas ?? []),
    [patio, filtros, corridas],
  );

  /* Poner un filtro suelta los que quedaron sin madera detrás, en vez de una
     tarjeta en cero que se lee como «no hay madera». */
  const aplicarFiltros = useCallback(
    (f: FiltrosCapacidad, prioridad?: keyof FiltrosCapacidad) =>
      setFiltros(sanearFiltros(patio, corridas ?? [], f, prioridad)),
    [patio, corridas, setFiltros],
  );

  /* Lo mismo para lo que llega por la URL. Espera a que las DOS fuentes hayan
     llegado: soltar un filtro mirando un `[]` que se está cargando borraría el
     recorte que el link venía a mostrar. `sanearFiltros` devuelve el MISMO
     objeto si no hay nada que soltar: esa identidad corta el bucle. */
  useEffect(() => {
    if (estado.patio !== "ok" || estado.corridas !== "ok") return;
    const saneado = sanearFiltros(patio, corridas ?? [], filtros);
    if (saneado !== filtros) setFiltros(saneado);
  }, [estado.patio, estado.corridas, patio, corridas, filtros, setFiltros]);

  const balance = useMemo(() => armarBalance(entrada, filtros), [entrada, filtros]);
  const origen = useMemo(() => resumenDeOrigen(corridas ?? [], lotesTodos), [corridas, lotesTodos]);
  const lotesFiltrados = useMemo(
    () => filtrarLotesDeReporte(lotesTodos, filtros),
    [lotesTodos, filtros],
  );

  return {
    lotesTodos,
    lotesFiltrados,
    entrada,
    opciones,
    aplicarFiltros,
    balance,
    origen,
    fuentesCargando:
      estado.patio === "cargando" || estado.lotes === "cargando" || estado.corridas === "cargando",
  };
}
