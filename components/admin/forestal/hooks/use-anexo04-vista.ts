"use client";

/**
 * Filtro (tipo × especie) y formato de la cantidad del ANEXO N° 04 mientras el
 * modal está abierto (lógica pura en `lib/forestal/anexo04-vista.ts`).
 *
 * Vive en el estado del modal, a propósito NO en localStorage: al reabrir
 * arranca sin filtro y «Como se cargó». Un filtro olvidado de la vez anterior
 * emitiría un anexo incompleto sin que nadie lo note.
 *
 * El filtro se aplica DESPUÉS de «Editar medidas»: si una corrección cambia
 * el tipo de una pieza (6" → 5" de ancho: de Comercial a Larga angosta), con
 * el filtro «Comercial» esa pieza sale del papel — «todo comercial» quiere
 * decir lo que imprime la hoja, no lo que era antes de corregir.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import {
  FILTRO_ANEXO_VACIO,
  filtrarFilasAnexo,
  formatoCantidad,
  hayFiltroAnexo,
  opcionesFiltroAnexo,
  pasaFiltroAnexo,
  rotuloFiltroAnexo,
  type FiltroAnexo,
  type FormatoCantidad,
  type OpcionesFiltroAnexo,
} from "@/lib/forestal/anexo04-vista";

export interface VistaAnexo04 {
  filtro: FiltroAnexo;
  setFiltro: (f: FiltroAnexo) => void;
  formato: FormatoCantidad;
  setFormato: (f: FormatoCantidad) => void;
  opciones: OpcionesFiltroAnexo;
  /** Lo que va al papel: filtrado y en el formato elegido. */
  filasPapel: PiezaCubicada[];
  /** ¿La pieza pasa el filtro? (la trasera y el resumen de la comparación). */
  pasa: (r: PiezaCubicada) => boolean;
  filtrado: boolean;
  /** «Comercial · Tornillo» — vacío sin filtro. */
  rotulo: string;
  /** Σ piezas antes del filtro (las del dueño elegido, ya corregidas). */
  piezasTotal: number;
  /** Las filas tienen los ids de la fuente: sólo ahí se puede editar en la hoja. */
  editable: boolean;
}

export function useAnexo04Vista(filas: PiezaCubicada[], especieGlobal: string | undefined, origen: string): VistaAnexo04 {
  const [filtro, setFiltro] = useState<FiltroAnexo>(FILTRO_ANEXO_VACIO);
  const [formato, setFormato] = useState<FormatoCantidad>("cargada");
  /* Otro origen = otras piezas: una especie elegida de aquel conjunto puede
     no existir en este (mismo motivo que el filtro por dueño). Y el formato
     vuelve a «Como se cargó»: un emitido cargado desde la bandeja tiene que
     verse tal como se emitió, no re-sumado. */
  useEffect(() => { setFiltro(FILTRO_ANEXO_VACIO); setFormato("cargada"); }, [origen]);

  const filtradas = useMemo(() => filtrarFilasAnexo(filas, filtro, especieGlobal), [filas, filtro, especieGlobal]);
  const filasPapel = useMemo(() => formatoCantidad(filtradas, formato, especieGlobal), [filtradas, formato, especieGlobal]);
  const opciones = useMemo(() => opcionesFiltroAnexo(filas, filtro, especieGlobal), [filas, filtro, especieGlobal]);
  const pasa = useCallback((r: PiezaCubicada) => pasaFiltroAnexo(r, filtro, especieGlobal), [filtro, especieGlobal]);
  const piezasTotal = useMemo(() => filas.reduce((a, r) => a + r.cantidad, 0), [filas]);

  return {
    filtro, setFiltro, formato, setFormato, opciones, filasPapel, pasa,
    filtrado: hayFiltroAnexo(filtro),
    rotulo: rotuloFiltroAnexo(filtro),
    piezasTotal,
    editable: formato === "cargada",
  };
}
