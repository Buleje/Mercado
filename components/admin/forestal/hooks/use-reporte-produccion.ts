"use client";

/**
 * use-reporte-produccion — lo que eligió el dueño y el reporte que le toca.
 *
 * Todo lo elegido se RECUERDA por dispositivo (`localStorage`): quien mira las
 * últimas 8 semanas de WASACO los lunes no tiene que volver a armarlo. Lo
 * guardado se sanea al leerlo: una clave vieja o rota cae en el default en vez
 * de dejar la pantalla en blanco.
 *
 * Los totales llegan hechos del servidor (`/ctp/reportes`); acá no se suma
 * nada. Carga vieja: gana la ÚLTIMA pedida — cambiar el período dos veces
 * rápido no puede terminar mostrando el primero.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { ctpGet, invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { esIsoValido, hoyEnLima, sumarDias } from "@/lib/forestal/semana-de-registro";
import {
  SEMANAS_MAX,
  SEMANAS_POR_DEFECTO,
  type AgrupacionReporte,
  type DimensionReporte,
  type ReporteDeProduccion,
} from "@/lib/forestal/reportes-produccion";

export type TipoDePeriodo = "semanas" | "mes" | "rango";

/** Lo elegido de los tres tipos a la vez: cambiar de tipo no borra lo del otro. */
export interface EleccionDePeriodo {
  tipo: TipoDePeriodo;
  semanas: number;
  /** `AAAA-MM`. */
  mes: string;
  desde: string;
  hasta: string;
}

export interface FiltrosElegidos {
  especies: string[];
  duenos: string[];
  permisos: string[];
}

export type LineaDeProgreso = "acumulado" | "promedio";

const RUTA = "/api/admin/forestal/ctp/reportes";
const SIN_FILTROS: FiltrosElegidos = { especies: [], duenos: [], permisos: [] };

function periodoPorDefecto(): EleccionDePeriodo {
  const hoy = hoyEnLima();
  return { tipo: "semanas", semanas: SEMANAS_POR_DEFECTO, mes: hoy.slice(0, 7), desde: sumarDias(hoy, -29), hasta: hoy };
}

/** Lo guardado, saneado campo por campo. */
function sanearPeriodo(v: Partial<EleccionDePeriodo> | null | undefined): EleccionDePeriodo {
  const d = periodoPorDefecto();
  const semanas = Math.trunc(Number(v?.semanas));
  return {
    tipo: v?.tipo === "mes" || v?.tipo === "rango" || v?.tipo === "semanas" ? v.tipo : d.tipo,
    semanas: semanas >= 1 && semanas <= SEMANAS_MAX ? semanas : d.semanas,
    mes: typeof v?.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v.mes) ? v.mes : d.mes,
    desde: esIsoValido(v?.desde) ? v!.desde! : d.desde,
    hasta: esIsoValido(v?.hasta) ? v!.hasta! : d.hasta,
  };
}

const lista = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, 60) : [];

function sanearFiltros(v: Partial<FiltrosElegidos> | null | undefined): FiltrosElegidos {
  return { especies: lista(v?.especies), duenos: lista(v?.duenos), permisos: lista(v?.permisos) };
}

/** La URL del pedido: la misma elección da la misma URL (y el mismo caché). */
export function urlDelReporte(p: EleccionDePeriodo, agrupacion: AgrupacionReporte, f: FiltrosElegidos): string {
  const q = new URLSearchParams({ periodo: p.tipo, agrupacion });
  if (p.tipo === "semanas") q.set("semanas", String(p.semanas));
  if (p.tipo === "mes") q.set("mes", p.mes);
  if (p.tipo === "rango") {
    q.set("desde", p.desde);
    q.set("hasta", p.hasta);
  }
  for (const v of [...f.especies].sort()) q.append("especie", v);
  for (const v of [...f.duenos].sort()) q.append("dueno", v);
  for (const v of [...f.permisos].sort()) q.append("permiso", v);
  return `${RUTA}?${q.toString()}`;
}

export function useReporteProduccion() {
  const [periodoGuardado, setPeriodoGuardado] = useLocalStorage<Partial<EleccionDePeriodo>>(
    "ctp-reportes:periodo",
    periodoPorDefecto(),
  );
  const [agrupacionGuardada, setAgrupacion] = useLocalStorage<AgrupacionReporte>("ctp-reportes:agrupacion", "semana");
  const [filtrosGuardados, setFiltrosGuardados] = useLocalStorage<Partial<FiltrosElegidos>>(
    "ctp-reportes:filtros",
    SIN_FILTROS,
  );
  const [dimensionGuardada, setDimension] = useLocalStorage<DimensionReporte>("ctp-reportes:dimension", "dueno");
  const [lineaGuardada, setLinea] = useLocalStorage<LineaDeProgreso>("ctp-reportes:linea", "acumulado");

  const periodo = useMemo(() => sanearPeriodo(periodoGuardado), [periodoGuardado]);
  const filtros = useMemo(() => sanearFiltros(filtrosGuardados), [filtrosGuardados]);
  const agrupacion: AgrupacionReporte = ["dia", "semana", "mes"].includes(agrupacionGuardada)
    ? agrupacionGuardada
    : "semana";
  const dimension: DimensionReporte = ["dueno", "permiso", "especie"].includes(dimensionGuardada)
    ? dimensionGuardada
    : "dueno";
  const linea: LineaDeProgreso = lineaGuardada === "promedio" ? "promedio" : "acumulado";

  const cambiarPeriodo = useCallback(
    (parcial: Partial<EleccionDePeriodo>) => setPeriodoGuardado((prev) => ({ ...sanearPeriodo(prev), ...parcial })),
    [setPeriodoGuardado],
  );
  const cambiarFiltro = useCallback(
    (campo: keyof FiltrosElegidos, valores: string[]) =>
      setFiltrosGuardados((prev) => ({ ...sanearFiltros(prev), [campo]: valores })),
    [setFiltrosGuardados],
  );
  const limpiarFiltros = useCallback(() => setFiltrosGuardados(SIN_FILTROS), [setFiltrosGuardados]);

  const url = urlDelReporte(periodo, agrupacion, filtros);
  const [reporte, setReporte] = useState<ReporteDeProduccion | null>(null);
  /** De qué URL es `reporte`: si no coincide con la pedida, lo que se ve es viejo. */
  const [urlDelDato, setUrlDelDato] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ultima = useRef(0);

  const cargar = useCallback(async (destino: string) => {
    const n = ++ultima.current;
    setError(null);
    try {
      const r = await ctpGet<{ reporte: ReporteDeProduccion }>(destino);
      if (n !== ultima.current) return;
      setReporte(r.reporte);
      setUrlDelDato(destino);
    } catch (e) {
      if (n !== ultima.current) return;
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void cargar(url);
  }, [url, cargar]);

  const recargar = useCallback(() => {
    invalidarCtp(RUTA);
    setUrlDelDato(null);
    void cargar(url);
  }, [cargar, url]);

  return {
    periodo,
    agrupacion,
    filtros,
    dimension,
    linea,
    cambiarPeriodo,
    setAgrupacion,
    cambiarFiltro,
    limpiarFiltros,
    setDimension,
    setLinea,
    reporte,
    /** Hay un pedido en curso (primera carga o cambio de filtro). */
    cargando: urlDelDato !== url && !error,
    error,
    recargar,
  };
}

export type EstadoDelReporte = ReturnType<typeof useReporteProduccion>;
