"use client";

/**
 * El filtro de la pila, vivo en la VISTA y no dentro de la tabla (ADR-345).
 *
 * La vista dibuja UNA barra, los KPI del patio se calculan al mismo nivel que
 * los del cuadro y la tabla queda con lo suyo, que es dibujar filas.
 *
 * ADR-431 le suma: tramos de días en el patio (la escala única 0-14 / 15-29 /
 * 30-59 / 60+), rango de largo y de diámetro, «sin código» y «guía CITES». Y
 * cuenta TODOS los filtros puestos (`cuantosFiltros`), el texto incluido: antes
 * la guía filtrada desde la cabecera cambiaba los KPI con el contador en 0.
 *
 * `delPatio` NO cambia de criterio (guía recibida y sin consumir): de él
 * dependen qué se tilda y qué entra al acta del consumo.
 */

import { useCallback, useMemo, useState } from "react";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import type { Rango } from "@/lib/admin/filtros-columna";
import {
  estaLibreEnPatio,
  facetasDePatio,
  filtrarPatio,
  opcionesDePatio,
  resumenPatio,
  type FacetasDePatio,
  type OpcionesPatio,
  type RangoPatio,
  type ResumenPatio,
  type TramoDias,
} from "@/lib/forestal/patio-resumen";

export type RangoFiltro = Rango<number>;
const SIN_RANGO: RangoFiltro = { min: null, max: null };

export interface EstadoFiltroPatio {
  texto: string;
  /** Cada uno admite VARIOS valores a la vez. OR adentro, AND entre campos. */
  especie: string[];
  guia: string[];
  permiso: string[];
  resolucion: string[];
  proveedor: string[];
  /** Tramos de días en el patio (OR entre tramos). */
  tramos: TramoDias[];
  /** Largo en m y diámetro en cm, bordes incluidos. Sin dato → fuera. */
  largo: RangoFiltro;
  diametro: RangoFiltro;
  sinCodigo: boolean;
  /** Guía CITES: un derivado de la GUÍA, no de la troza. */
  cites: boolean;
  /** Esconde lo que no se puede elegir hoy. Ayudante, no filtro de contenido. */
  soloLibres: boolean;
  set: {
    texto: (v: string) => void;
    especie: (v: string[]) => void;
    guia: (v: string[]) => void;
    permiso: (v: string[]) => void;
    resolucion: (v: string[]) => void;
    proveedor: (v: string[]) => void;
    tramos: (v: TramoDias[]) => void;
    largo: (v: RangoFiltro) => void;
    diametro: (v: RangoFiltro) => void;
    sinCodigo: (v: boolean) => void;
    cites: (v: boolean) => void;
    soloLibres: (v: boolean) => void;
  };
  limpiar: () => void;
  hayFiltro: boolean;
  /** Cuántos CAMPOS acotan la pila (el texto cuenta como uno). */
  cuantosFiltros: number;
  opciones: OpcionesPatio;
  /** De toda la pila: el peso de cada valor y si un control nuevo tiene datos. */
  facetas: FacetasDePatio;
  /** Piezas de guías recibidas que todavía no se aserraron (la pila entera). */
  delPatio: TrozaConsumible[];
  /**
   * Cuántas filas tendría la tabla SIN filtros de contenido, con el mismo
   * «solo libres»: el «de Y» de «Mostrando X de Y». Con `delPatio` a secas se
   * leía «5 de 48» al lado de una pestaña que decía 44 (las 4 bloqueadas).
   */
  totalSinFiltrar: number;
  /** Tras los filtros de contenido — la base de los KPI. */
  filtradas: TrozaConsumible[];
  /** Lo que se dibuja: `filtradas` menos las bloqueadas si «solo libres». */
  visibles: TrozaConsumible[];
  /** Las que se pueden tildar dentro de lo visible. */
  libres: TrozaConsumible[];
  resumen: ResumenPatio;
  /** La fecha con la que se contaron los días (una por render de la pila). */
  ahora: Date;
}

const aRangoPatio = (r: RangoFiltro): RangoPatio | undefined =>
  r.min == null && r.max == null ? undefined : { min: r.min ?? undefined, max: r.max ?? undefined };
const rangoPuesto = (r: RangoFiltro) => r.min != null || r.max != null;

/**
 * @param opts.loteId El lote que se está cargando. Sus piezas apartadas cuentan
 *   como disponibles PARA ÉL: sin esto, elegir un lote con piezas ya apartadas
 *   dejaba la tabla vacía mientras el encabezado prometía seis.
 */
export function useFiltroPatio(
  trozas: readonly TrozaConsumible[],
  opts: { loteId?: string } = {},
): EstadoFiltroPatio {
  const [texto, setTexto] = useState("");
  const [especie, setEspecie] = useState<string[]>([]);
  const [guia, setGuia] = useState<string[]>([]);
  const [permiso, setPermiso] = useState<string[]>([]);
  const [resolucion, setResolucion] = useState<string[]>([]);
  const [proveedor, setProveedor] = useState<string[]>([]);
  const [tramos, setTramos] = useState<TramoDias[]>([]);
  const [largo, setLargo] = useState<RangoFiltro>(SIN_RANGO);
  const [diametro, setDiametro] = useState<RangoFiltro>(SIN_RANGO);
  const [sinCodigo, setSinCodigo] = useState(false);
  const [cites, setCites] = useState(false);
  const [soloLibres, setSoloLibres] = useState(true);

  const delPatio = useMemo(
    () => trozas.filter((t) => t.guiaRecepcionada !== false && !t.consumidaEnId),
    [trozas],
  );
  /* La fecha se toma una vez por pila: los días no cambian mientras se mira. */
  const ahora = useMemo(() => new Date(), [delPatio]); // eslint-disable-line react-hooks/exhaustive-deps
  const opciones = useMemo(() => opcionesDePatio(delPatio), [delPatio]);
  const facetas = useMemo(() => facetasDePatio(delPatio, ahora), [delPatio, ahora]);
  const filtradas = useMemo(
    () =>
      filtrarPatio(
        delPatio,
        {
          texto, especie, guia, permiso, resolucion, proveedor, tramos,
          largoM: aRangoPatio(largo),
          diametroCm: aRangoPatio(diametro),
          sinCodigo,
          cites,
        },
        ahora,
      ),
    [delPatio, texto, especie, guia, permiso, resolucion, proveedor, tramos, largo, diametro, sinCodigo, cites, ahora],
  );
  const loteId = opts.loteId;
  /* Lo que se DIBUJA incluye las piezas ya apartadas en el lote que se está
     cargando: son las que van a la sierra y tienen que verse. */
  const visibles = useMemo(
    () => (soloLibres ? filtradas.filter((t) => estaLibreEnPatio(t, { loteId })) : filtradas),
    [filtradas, soloLibres, loteId],
  );
  /* `libres` = lo que se puede TILDAR, las piezas del lote incluidas (el
     operador elige cuáles de las apartadas entran HOY). */
  const libres = useMemo(() => visibles.filter((t) => estaLibreEnPatio(t, { loteId })), [visibles, loteId]);
  const resumen = useMemo(() => resumenPatio(filtradas, ahora), [filtradas, ahora]);
  const totalSinFiltrar = useMemo(
    () => (soloLibres ? delPatio.filter((t) => estaLibreEnPatio(t, { loteId })).length : delPatio.length),
    [delPatio, soloLibres, loteId],
  );

  const limpiar = useCallback(() => {
    setTexto("");
    setEspecie([]);
    setGuia([]);
    setPermiso([]);
    setResolucion([]);
    setProveedor([]);
    setTramos([]);
    setLargo(SIN_RANGO);
    setDiametro(SIN_RANGO);
    setSinCodigo(false);
    setCites(false);
  }, []);

  const set = useMemo(
    () => ({
      texto: setTexto,
      especie: setEspecie,
      guia: setGuia,
      permiso: setPermiso,
      resolucion: setResolucion,
      proveedor: setProveedor,
      tramos: setTramos,
      largo: setLargo,
      diametro: setDiametro,
      sinCodigo: setSinCodigo,
      cites: setCites,
      soloLibres: setSoloLibres,
    }),
    [],
  );

  const cuantosFiltros =
    (texto.trim() ? 1 : 0) +
    [especie, guia, permiso, resolucion, proveedor, tramos].filter((v) => v.length > 0).length +
    (rangoPuesto(largo) ? 1 : 0) +
    (rangoPuesto(diametro) ? 1 : 0) +
    (sinCodigo ? 1 : 0) +
    (cites ? 1 : 0);

  return {
    texto, especie, guia, permiso, resolucion, proveedor, tramos, largo, diametro, sinCodigo, cites, soloLibres,
    set,
    limpiar,
    hayFiltro: cuantosFiltros > 0,
    cuantosFiltros,
    opciones,
    facetas,
    delPatio,
    totalSinFiltrar,
    filtradas,
    visibles,
    libres,
    resumen,
    ahora,
  };
}
