"use client";

/**
 * El filtro de la pila, vivo en la VISTA y no dentro de la tabla (ADR-345).
 *
 * Estaba adentro de `CtpTrozasIngresadas`, y eso dejaba los controles del patio
 * —buscar, especie, guía, permiso— en un lugar distinto del selector de lote,
 * que vive arriba con los filtros de la pestaña. Dos barras de filtros para una
 * sola tabla.
 *
 * Acá el estado sube: la vista dibuja UNA barra con todo, los KPI del patio se
 * calculan al mismo nivel que los del cuadro —así los dos apartados muestran sus
 * cifras en el mismo lugar— y la tabla queda con lo suyo, que es dibujar filas.
 */

import { useCallback, useMemo, useState } from "react";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import {
  estaLibreEnPatio,
  filtrarPatio,
  opcionesDePatio,
  resumenPatio,
  type OpcionesPatio,
  type ResumenPatio,
} from "@/lib/forestal/patio-resumen";

export interface EstadoFiltroPatio {
  texto: string;
  especie: string;
  /** Una o más guías a la vez (Brandon, 2026-09-01). */
  guia: string[];
  permiso: string;
  resolucion: string;
  proveedor: string;
  /** Esconde lo que no se puede elegir hoy. Ayudante, no filtro de contenido. */
  soloLibres: boolean;
  set: {
    texto: (v: string) => void;
    especie: (v: string) => void;
    guia: (v: string[]) => void;
    permiso: (v: string) => void;
    resolucion: (v: string) => void;
    proveedor: (v: string) => void;
    soloLibres: (v: boolean) => void;
  };
  limpiar: () => void;
  hayFiltro: boolean;
  opciones: OpcionesPatio;
  /** Piezas de guías recibidas que todavía no se aserraron (la pila entera). */
  delPatio: TrozaConsumible[];
  /** Tras los filtros de contenido — la base de los KPI. */
  filtradas: TrozaConsumible[];
  /** Lo que se dibuja: `filtradas` menos las bloqueadas si «sólo las libres». */
  visibles: TrozaConsumible[];
  /** Las que se pueden tildar dentro de lo visible. */
  libres: TrozaConsumible[];
  resumen: ResumenPatio;
}

/**
 * @param opts.loteId El lote que se está cargando. Sus piezas apartadas cuentan
 *   como disponibles PARA ÉL: sin esto, elegir un lote con piezas ya apartadas
 *   dejaba la tabla vacía diciendo «ninguna troza coincide con el filtro»
 *   mientras el encabezado prometía seis.
 */
export function useFiltroPatio(
  trozas: readonly TrozaConsumible[],
  opts: { loteId?: string } = {},
): EstadoFiltroPatio {
  const [texto, setTexto] = useState("");
  const [especie, setEspecie] = useState("");
  const [guia, setGuia] = useState<string[]>([]);
  const [permiso, setPermiso] = useState("");
  const [resolucion, setResolucion] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [soloLibres, setSoloLibres] = useState(true);

  const delPatio = useMemo(
    () => trozas.filter((t) => t.guiaRecepcionada !== false && !t.consumidaEnId),
    [trozas],
  );
  const opciones = useMemo(() => opcionesDePatio(delPatio), [delPatio]);
  const filtradas = useMemo(
    () => filtrarPatio(delPatio, { texto, especie, guia, permiso, resolucion, proveedor }),
    [delPatio, texto, especie, guia, permiso, resolucion, proveedor],
  );
  const loteId = opts.loteId;
  /* Lo que se DIBUJA incluye las piezas ya apartadas en el lote que se está
     cargando: son las que van a la sierra y tienen que verse. */
  const visibles = useMemo(
    () => (soloLibres ? filtradas.filter((t) => estaLibreEnPatio(t, { loteId })) : filtradas),
    [filtradas, soloLibres, loteId],
  );
  /* `libres` = lo que se puede TILDAR, y las piezas del lote también se tildan:
     el operador elige cuáles de las apartadas entran a la sierra HOY (las otras
     siguen en el lote). Por eso las dos listas usan el mismo criterio; el total
     sale de la selección y no de `yaEnElLote + elegidas`, que las duplicaba. */
  const libres = useMemo(
    () => visibles.filter((t) => estaLibreEnPatio(t, { loteId })),
    [visibles, loteId],
  );
  /* La fecha se toma una vez por render de la lista: los días de espera no
     cambian mientras el operador mira la pantalla. */
  const resumen = useMemo(() => resumenPatio(filtradas, new Date()), [filtradas]);

  const limpiar = useCallback(() => {
    setTexto("");
    setEspecie("");
    setGuia([]);
    setPermiso("");
    setResolucion("");
    setProveedor("");
  }, []);

  const set = useMemo(
    () => ({
      texto: setTexto,
      especie: setEspecie,
      guia: setGuia,
      permiso: setPermiso,
      resolucion: setResolucion,
      proveedor: setProveedor,
      soloLibres: setSoloLibres,
    }),
    [],
  );

  return {
    texto, especie, guia, permiso, resolucion, proveedor, soloLibres,
    set,
    limpiar,
    hayFiltro: Boolean(texto || especie || guia.length > 0 || permiso || resolucion || proveedor),
    opciones,
    delPatio,
    filtradas,
    visibles,
    libres,
    resumen,
  };
}
