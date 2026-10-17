"use client";

/**
 * use-consumos-seccion2 — el cuadro oficial «Sección 2 · Consumos» y sus filtros.
 *
 * Las filas las arma `filasConsumo()`, la MISMA que la hoja «2. Consumos» del
 * Excel: pantalla y libro presentado no pueden declarar consumos distintos.
 *
 * Refresco NO bloqueante (ADR-431): la primera carga dice «cargando»; las
 * siguientes —tras consumir, o al cambiar el período— dejan el cuadro a la vista
 * y sólo marcan `refrescando`. Antes cada consumo desmontaba la pestaña entera y
 * el operador perdía el scroll, la página y los grupos abiertos.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import { filasConsumo, type FilaConsumo, type GrafoConsumos } from "@/lib/forestal/loctp-consumos";
import { consumosACsv, nombreArchivoSeccion } from "@/lib/forestal/ctp-secciones-csv";
import { loteAserrioPorCorrida, type LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import {
  agruparConsumos,
  juzgarRendimientoConsumo,
  resumenConsumos,
  type AgrupacionConsumo,
} from "@/lib/forestal/loctp-consumos-analisis";
import { usePaginacion } from "../ctp-tabla";

/** Sin tildes ni mayúsculas: se busca como se tipea, no como se escribió. */
const norm = (v: string | null | undefined) =>
  (v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** ¿La fila entra en lo elegido? Sin nada elegido entra todo (OR adentro). */
const entraEn = (elegidos: readonly string[], valor: string | null | undefined) =>
  elegidos.length === 0 || elegidos.some((e) => norm(e) === norm(valor));

const unicos = (xs: (string | null | undefined)[]) =>
  [...new Set(xs.filter((x): x is string => Boolean(x) && x !== "—"))].sort();

export function useConsumosSeccion2(period: CtpPeriod) {
  const [filas, setFilas] = useState<FilaConsumo[]>([]);
  /** El grafo se guarda entero: el rendimiento y los huecos salen de él. */
  const [grafo, setGrafo] = useState<GrafoConsumos | null>(null);
  /** `true` sólo hasta la primera respuesta: después se refresca sin desmontar. */
  const [cargandoInicial, setCargandoInicial] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [especie, setEspecie] = useState<string[]>([]);
  const [gtf, setGtf] = useState<string[]>([]);
  /* El título habilitante que ampara la madera consumida (ADR-400). */
  const [permiso, setPermiso] = useState<string[]>([]);
  const [agrupar, setAgruparState] = useState<AgrupacionConsumo>("ninguna");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  /** El último pedido: una respuesta vieja (otro período) no pisa a la vigente. */
  const pedidoRef = useRef(0);
  const yaCargoRef = useRef(false);

  const recargar = useCallback(async () => {
    const pedido = ++pedidoRef.current;
    if (yaCargoRef.current) setRefrescando(true);
    setError(null);
    try {
      const u = new URL("/api/admin/forestal/ctp", window.location.origin);
      u.searchParams.set("grafo", "1");
      applyCtpPeriodParams(u.searchParams, period);
      /* Deduplicado (ADR-347): el grafo lo piden también la cabina y el semáforo
         de pendientes en el mismo montaje. Los lotes llenan el casillero (10) y
         NO se acotan al período (un lote de junio se aserró en julio); van con
         su propio catch: sin ellos falta la columna (10), no la Sección 2. */
      const [gra, lot] = await Promise.all([
        ctpGet<{ grafo?: GrafoConsumos }>(u.toString()),
        ctpGet<{ lotes?: LoteAserrio[] }>("/api/admin/forestal/lotes-aserrio?limite=500").catch(() => ({
          lotes: [] as LoteAserrio[],
        })),
      ]);
      if (pedido !== pedidoRef.current) return;
      setGrafo(gra.grafo ?? null);
      /* Los ingresos salen del propio grafo (ADR-347): ya trae sus casilleros. */
      setFilas(filasConsumo(gra.grafo ?? null, undefined, loteAserrioPorCorrida(lot.lotes ?? [])));
      yaCargoRef.current = true;
    } catch (e) {
      if (pedido !== pedidoRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (pedido === pedidoRef.current) {
        setCargandoInicial(false);
        setRefrescando(false);
      }
    }
  }, [period]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  /** Las opciones salen de TODO el período, no de lo filtrado: si se achicaran
   *  con el filtro, quitar uno no se podría deshacer desde el propio selector. */
  const opcionesEspecie = useMemo(() => unicos(filas.map((f) => f.especieComun)), [filas]);
  const opcionesGtf = useMemo(() => unicos(filas.map((f) => f.gtf)), [filas]);
  /** Los permisos del período con lo que pesa cada uno: elegir deja de ser adivinar. */
  const opcionesPermiso = useMemo(() => {
    const por = new Map<string, number>();
    for (const f of filas) {
      const k = (f.codigoOrigen ?? "").trim();
      if (!k || k === "—") continue;
      por.set(k, (por.get(k) ?? 0) + f.cantidad);
    }
    return [...por.entries()]
      .map(([value, m3]) => ({ value, m3 }))
      .sort((a, b) => b.m3 - a.m3 || a.value.localeCompare(b.value));
  }, [filas]);

  const visibles = useMemo(() => {
    const t = norm(texto);
    return filas.filter((f) => {
      /* OR adentro de cada filtro, AND entre filtros: el autofiltro de Excel. */
      if (!entraEn(especie, f.especieComun)) return false;
      if (!entraEn(gtf, f.gtf)) return false;
      if (!entraEn(permiso, f.codigoOrigen)) return false;
      if (t) {
        const campos = [f.gtf, f.especieComun, f.especieCientifica, f.codigoOrigen, f.fuenteOrigen, f.observaciones];
        if (!campos.some((c) => norm(c).includes(t))) return false;
      }
      return true;
    });
  }, [filas, texto, especie, gtf, permiso]);

  const total = useMemo(() => visibles.reduce((a, f) => a + f.cantidad, 0), [visibles]);
  /* Se pagina SIN agrupar: agrupado son pocas filas de grupo (ADR-344). */
  const paginacion = usePaginacion(visibles);
  const especies = useMemo(() => new Set(visibles.map((f) => f.especieComun)).size, [visibles]);
  /** Rendimiento y huecos de la cadena — lo que la tabla sola no dice. */
  const resumen = useMemo(() => resumenConsumos(visibles, grafo), [visibles, grafo]);
  const veredicto = useMemo(() => juzgarRendimientoConsumo(resumen.rendimientoPct), [resumen.rendimientoPct]);
  const grupos = useMemo(() => agruparConsumos(visibles, agrupar), [visibles, agrupar]);

  /** Cuántos filtros gobiernan lo que se ve: el texto también cuenta. */
  const cuantosFiltros = (texto.trim() ? 1 : 0) + [especie, gtf, permiso].filter((v) => v.length > 0).length;

  /** «Limpiar» borra TODO, el permiso incluido (antes lo dejaba puesto). */
  const limpiar = useCallback(() => {
    setTexto("");
    setEspecie([]);
    setGtf([]);
    setPermiso([]);
  }, []);

  const setAgrupar = useCallback((a: AgrupacionConsumo) => {
    setAgruparState(a);
    setAbiertos(new Set());
  }, []);

  const alternarGrupo = useCallback((clave: string) => {
    setAbiertos((prev) => {
      const s = new Set(prev);
      if (s.has(clave)) s.delete(clave);
      else s.add(clave);
      return s;
    });
  }, []);

  /** Se baja lo que se está VIENDO — el filtro es parte de lo que se exporta. */
  const descargarCsv = useCallback(() => {
    const csv = consumosACsv(visibles);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivoSeccion("consumos", period.label);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, [visibles, period.label]);

  return {
    filas,
    grafo,
    cargandoInicial,
    refrescando,
    error,
    recargar,
    filtro: { texto, especie, gtf, permiso },
    set: { texto: setTexto, especie: setEspecie, gtf: setGtf, permiso: setPermiso },
    opciones: { especie: opcionesEspecie, gtf: opcionesGtf, permiso: opcionesPermiso },
    cuantosFiltros,
    limpiar,
    visibles,
    total,
    especies,
    resumen,
    veredicto,
    agrupar,
    setAgrupar,
    grupos,
    abiertos,
    alternarGrupo,
    paginacion,
    descargarCsv,
  };
}

export type EstadoConsumosSeccion2 = ReturnType<typeof useConsumosSeccion2>;
