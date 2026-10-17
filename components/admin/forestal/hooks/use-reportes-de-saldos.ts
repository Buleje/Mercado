"use client";

/**
 * useReportesDeSaldos — PDF, Excel y CSV de las existencias, con UN estado de error.
 *
 * El Excel es UN archivo (el navegador bloquea la segunda descarga automática):
 * las cuatro hojas de siempre —materia prima, productos, lotes y capacidad— más
 * las del patio por permiso (ADR-431), que arma `hojasDelPatioPorPermiso` con el
 * mismo criterio que Consumos. Así el dueño que baja el balance lleva el mismo
 * número del patio que ve el operador.
 */

import { useCallback, useMemo, useState } from "react";
import type { Concil, SaldosData } from "@/hooks/use-ctp-saldos";
import type { BalanceCapacidad, FiltrosCapacidad } from "@/lib/forestal/capacidad-de-planta";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { printExistencias } from "@/lib/forestal/ctp-existencias-print";
import { nombreArchivoSaldos, saldosACsv } from "@/lib/forestal/ctp-saldos-csv";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import type { ResumenOrigen } from "@/lib/forestal/origen-incompleto";
import { hojasDelPatioPorPermiso } from "@/lib/forestal/patio-excel";
import type { ResumenPorPermiso } from "@/lib/forestal/patio-resumen";
import { hojasDeSaldos, type LoteDeReporte } from "@/lib/forestal/saldos-reporte";
import { textoDeFiltros } from "../saldos/DetalleDeFuente";
import { logger } from "@/lib/logger";

export interface EntradaReportes {
  data: SaldosData | null;
  concil: Concil | null;
  period: CtpPeriod;
  /** Todos los lotes (del permiso activo, si hay). */
  lotesTodos: readonly LoteDeReporte[];
  /** Los tildados para el reporte. Vacío = TODOS: tildar nada no es «sin lotes». */
  lotesElegidos: ReadonlySet<string>;
  balance: BalanceCapacidad;
  origen: ResumenOrigen;
  filtros: FiltrosCapacidad;
  /** El patio pieza por pieza (ya acotado al permiso activo, si hay). */
  patio: readonly TrozaConsumible[];
  porPermiso: ResumenPorPermiso;
  /** Código del permiso de «Solo este permiso»; `null` = toda la planta. */
  alcance: string | null;
  patioTruncado: { devueltas: number; total: number } | null;
}

export interface ReportesDeSaldos {
  error: string | null;
  limpiarError: () => void;
  descargarPdf: () => Promise<void>;
  descargarExcel: () => Promise<void>;
  descargarCsv: () => void;
}

export function useReportesDeSaldos(e: EntradaReportes): ReportesDeSaldos {
  const [error, setError] = useState<string | null>(null);
  const {
    data,
    concil,
    period,
    lotesTodos,
    lotesElegidos,
    balance,
    origen,
    filtros,
    patio,
    porPermiso,
    alcance,
    patioTruncado,
  } = e;
  /* Tildar lotes acota SÓLO la hoja/tabla de lotes del reporte: el balance
     sigue hablando de toda la planta (un techo que se achica al tildar dos
     filas es un techo que miente). */
  const lotes = useMemo(
    () => (lotesElegidos.size > 0 ? lotesTodos.filter((l) => lotesElegidos.has(l.id)) : lotesTodos),
    [lotesTodos, lotesElegidos],
  );

  /* Reporte imprimible para fiscalización: la misma data del panel + la
     identidad del CTP (best-effort desde la Ficha). */
  const descargarPdf = useCallback(async () => {
    if (!data) return;
    setError(null);
    const ficha = await fetch("/api/admin/forestal/ctp-ficha", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => body?.ficha ?? null)
      .catch((err) => {
        logger.warn("[ctp-existencias] ficha no cargó", { error: String(err) });
        return null;
      });
    try {
      printExistencias({
        periodLabel: period.label,
        materiaPrima: data.materiaPrima,
        porEspecie: data.porEspecie,
        productos: data.productos,
        concil,
        ficha,
        lotes,
        balance,
        origen,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [data, concil, period.label, lotes, balance, origen]);

  const descargarExcel = useCallback(async () => {
    if (!data) return;
    setError(null);
    try {
      const { exportSheetsToExcel } = await import("@/lib/export-excel");
      const fijas = hojasDeSaldos({
        porEspecie: data.porEspecie,
        productos: data.productos,
        lotes,
        balance,
        textoFiltros: textoDeFiltros(filtros),
      });
      const delPatio = hojasDelPatioPorPermiso({
        porPermiso,
        trozas: patio,
        ahora: new Date(),
        /* El patio de Saldos no tiene filtros propios: va entero (del permiso
           activo, si lo hay). El recorte de la capacidad no lo acota. */
        filtros: [],
        alcance,
        hojasExistentes: fijas.map((h) => h.nombre),
        truncado: patioTruncado,
      });
      await exportSheetsToExcel(
        [...fijas, ...delPatio],
        nombreArchivoSaldos(period.label).replace(/\.csv$/, ""),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [data, lotes, balance, filtros, porPermiso, patio, alcance, patioTruncado, period.label]);

  const descargarCsv = useCallback(() => {
    if (!data) return;
    const csv = saldosACsv(data.porEspecie, data.productos, period.label, lotes, balance, origen);
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivoSaldos(period.label);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }, [data, period.label, lotes, balance, origen]);

  const limpiarError = useCallback(() => setError(null), []);

  return { error, limpiarError, descargarPdf, descargarExcel, descargarCsv };
}
