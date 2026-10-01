"use client";

/**
 * use-trozas-disponibles — todo lo que la pestaña «Trozas disponibles» necesita
 * (Brandon 2026-09-27).
 *
 * Lee el MISMO patio que Consumos (`/trozas/patio`, con `?contratoId=` si
 * «Solo este permiso» está prendido, deduplicado por `ctpGet`) y lo parte con
 * las funciones puras de `lib/forestal/trozas-disponibles`.
 *
 * Filtro CRUZADO: elegir un permiso acota especies, trozas, indicadores y
 * gráficos; elegir una especie acota permisos, trozas… Cada tabla se cuenta sin
 * SU propio filtro (`excepto`), para poder cambiar de permiso desde la tabla de
 * permisos sin tener que soltar el anterior.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useContratoActivo } from "@/contexts/contrato-activo-context";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { exportSheetsToExcel } from "@/lib/export-excel";
import { hojasDelPatioPorPermiso, nombreArchivoPatio } from "@/lib/forestal/patio-excel";
import {
  ETIQUETA_TRAMO_DIAS,
  facetasDePatio,
  resumenPorPermiso,
  type TramoDias,
} from "@/lib/forestal/patio-resumen";
import {
  ESTADOS_DISPONIBLE,
  ETIQUETA_ESTADO_DISPONIBLE,
  FILTRO_DISPONIBLES_VACIO,
  HOJA_POR_ESPECIE,
  antiguedadDisponible,
  estadoDisponible,
  filtrarDisponibles,
  hojaPorEspecie,
  pilaPermisoEspecie,
  porEspecieDisponible,
  resumenDisponibles,
  trozasDisponibles,
  type EstadoDisponible,
  type FiltroDisponibles,
} from "@/lib/forestal/trozas-disponibles";
import { urlDelPatio } from "./use-lotes-aserrio";

type Lista = readonly string[];

const rangoEscrito = (
  r: { min?: number; max?: number } | undefined,
  unidad: string,
): string | null =>
  r == null || (r.min == null && r.max == null)
    ? null
    : r.min != null && r.max != null
      ? `${r.min}–${r.max} ${unidad}`
      : r.min != null
        ? `≥ ${r.min} ${unidad}`
        : `≤ ${r.max} ${unidad}`;

/** Los filtros puestos, escritos como se leen (chips y hoja «Qué se exportó»). */
export function filtrosEnTexto(
  f: FiltroDisponibles,
): { id: keyof FiltroDisponibles; label: string; texto: string }[] {
  const out: { id: keyof FiltroDisponibles; label: string; texto: string }[] = [];
  if (f.texto.trim()) out.push({ id: "texto", label: "Búsqueda", texto: `«${f.texto.trim()}»` });
  if (f.permiso.length) out.push({ id: "permiso", label: "Permiso", texto: f.permiso.join(" o ") });
  if (f.especie.length) out.push({ id: "especie", label: "Especie", texto: f.especie.join(" o ") });
  if (f.guia.length) out.push({ id: "guia", label: "Guía", texto: f.guia.join(" o ") });
  if (f.estado.length)
    out.push({
      id: "estado",
      label: "Estado",
      texto: f.estado.map((e) => ETIQUETA_ESTADO_DISPONIBLE[e]).join(" o "),
    });
  if (f.tramos.length)
    out.push({
      id: "tramos",
      label: "Días en el patio",
      texto: f.tramos.map((t) => ETIQUETA_TRAMO_DIAS[t]).join(" o "),
    });
  const largo = rangoEscrito(f.largo, "m");
  if (largo) out.push({ id: "largo", label: "Largo", texto: largo });
  const diametro = rangoEscrito(f.diametro, "cm");
  if (diametro) out.push({ id: "diametro", label: "Diámetro", texto: diametro });
  return out;
}

export function useTrozasDisponibles() {
  const { contratoFiltro, activo } = useContratoActivo();
  const [todas, setTodas] = useState<TrozaConsumible[]>([]);
  const [truncado, setTruncado] = useState<{ hay: number; leidas: number } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /* Sólo escribe el último pedido: al prender «Solo este permiso» el patio
     entero (lento) no puede pisar al acotado (rápido). */
  const pedidoRef = useRef(0);

  const recargar = useCallback(async () => {
    const pedido = ++pedidoRef.current;
    setCargando(true);
    try {
      const r = await ctpGet<{
        trozas?: TrozaConsumible[];
        total?: number;
        devueltas?: number;
        truncado?: boolean;
      }>(urlDelPatio(contratoFiltro));
      if (pedido !== pedidoRef.current) return;
      setTodas(r.trozas ?? []);
      setTruncado(
        r.truncado ? { hay: r.total ?? 0, leidas: r.devueltas ?? (r.trozas ?? []).length } : null,
      );
      setError(null);
    } catch (e) {
      if (pedido !== pedidoRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (pedido === pedidoRef.current) setCargando(false);
    }
  }, [contratoFiltro]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const vivas = useMemo(() => trozasDisponibles(todas), [todas]);
  /* Los días se cuentan con UNA fecha por lectura: no cambian mientras se mira. */
  const ahora = useMemo(() => new Date(), [vivas]); // eslint-disable-line react-hooks/exhaustive-deps

  const [filtro, setFiltro] = useState<FiltroDisponibles>(FILTRO_DISPONIBLES_VACIO);
  const poner = useCallback(
    <K extends keyof FiltroDisponibles>(campo: K, valor: FiltroDisponibles[K]) => {
      setFiltro((f) => ({ ...f, [campo]: valor }));
    },
    [],
  );
  const limpiar = useCallback(() => setFiltro(FILTRO_DISPONIBLES_VACIO), []);
  /** Suelta UN filtro (la cruz de su chip). */
  const quitar = useCallback((campo: keyof FiltroDisponibles) => {
    setFiltro((f) => ({ ...f, [campo]: FILTRO_DISPONIBLES_VACIO[campo] }));
  }, []);
  /** Clic en una fila o una barra: la elige sola; otro clic la suelta. */
  const alternar = useCallback((campo: "permiso" | "especie" | "tramos", valor: string) => {
    setFiltro((f) => {
      const actual = f[campo] as Lista;
      return {
        ...f,
        [campo]: actual.includes(valor) ? actual.filter((v) => v !== valor) : [valor],
      };
    });
  }, []);

  const filtradas = useMemo(() => filtrarDisponibles(vivas, filtro, ahora), [vivas, filtro, ahora]);
  const sinPermiso = useMemo(
    () => filtrarDisponibles(vivas, filtro, ahora, "permiso"),
    [vivas, filtro, ahora],
  );
  const sinEspecie = useMemo(
    () => filtrarDisponibles(vivas, filtro, ahora, "especie"),
    [vivas, filtro, ahora],
  );
  const sinTramo = useMemo(
    () => filtrarDisponibles(vivas, filtro, ahora, "tramos"),
    [vivas, filtro, ahora],
  );

  const resumen = useMemo(() => resumenDisponibles(filtradas, ahora), [filtradas, ahora]);
  const porPermiso = useMemo(() => resumenPorPermiso(sinPermiso, ahora), [sinPermiso, ahora]);
  const especies = useMemo(() => porEspecieDisponible(sinEspecie, ahora), [sinEspecie, ahora]);
  const antiguedad = useMemo(() => antiguedadDisponible(sinTramo, ahora), [sinTramo, ahora]);
  const pila = useMemo(() => pilaPermisoEspecie(sinPermiso, ahora), [sinPermiso, ahora]);

  /* Las opciones de cada autofiltro salen de TODO lo vivo, con su peso: si se
     achicaran con el filtro puesto, no se podría deshacer desde la cabecera. */
  const facetas = useMemo(() => {
    const f = facetasDePatio(vivas, ahora);
    const porEstado = new Map<EstadoDisponible, number>();
    for (const t of vivas)
      porEstado.set(estadoDisponible(t), (porEstado.get(estadoDisponible(t)) ?? 0) + 1);
    return {
      ...f,
      estados: ESTADOS_DISPONIBLE.filter((e) => (porEstado.get(e) ?? 0) > 0).map((e) => ({
        value: e,
        count: porEstado.get(e) ?? 0,
      })),
    };
  }, [vivas, ahora]);

  const [descargando, setDescargando] = useState(false);
  /** UN archivo: «Por permiso», «Por especie», una hoja por permiso y «Qué se exportó». */
  const descargarExcel = useCallback(async (): Promise<string | null> => {
    setDescargando(true);
    try {
      const hojas = hojasDelPatioPorPermiso({
        porPermiso,
        trozas: filtradas,
        ahora,
        filtros: filtrosEnTexto(filtro).map((c) => `${c.label}: ${c.texto}`),
        alcance: contratoFiltro ? (activo?.codigo ?? null) : null,
        hojasExistentes: [HOJA_POR_ESPECIE],
        truncado: truncado ? { total: truncado.hay, devueltas: truncado.leidas } : null,
      });
      const [primera, ...resto] = hojas;
      await exportSheetsToExcel(
        [primera, hojaPorEspecie(porEspecieDisponible(filtradas, ahora)), ...resto],
        nombreArchivoPatio(ahora),
      );
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    } finally {
      setDescargando(false);
    }
  }, [porPermiso, filtradas, ahora, filtro, contratoFiltro, activo, truncado]);

  return {
    cargando,
    error,
    recargar,
    truncado,
    ahora,
    vivas,
    filtradas,
    filtro,
    poner,
    limpiar,
    quitar,
    alternar,
    /** Lo filtrado por todo MENOS el permiso: la base de la tabla por permiso y sus especies. */
    basePermisos: sinPermiso,
    setTramos: (v: TramoDias[]) => poner("tramos", v),
    resumen,
    porPermiso,
    especies,
    antiguedad,
    pila,
    facetas,
    descargarExcel,
    descargando,
    contratoFiltro,
    codigoPermisoActivo: activo?.codigo ?? null,
  };
}

export type EstadoTrozasDisponibles = ReturnType<typeof useTrozasDisponibles>;
