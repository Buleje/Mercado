"use client";

/**
 * useTrasladoGuiaLoth — la parte del estado de «Despachar con guía» que se
 * llena sola mientras nadie la toque (29-09-2026):
 *
 *   · el N° de la lista de trozas (35): sigue a las listas del titular y a
 *     cuántas hojas salen las trozas elegidas (`listasDelTalonario`);
 *   · el punto de llegada: ES el destinatario (Brandon 15-10-2026: «el bloque
 *     de destinatario es el mismo que punto de llegada»; el formato 2024 no
 *     tiene bloque de llegada, el (24a) es «dirección hacia donde se dirige la
 *     carga»). Sigue a su dirección y ubigeo siempre; el servidor lo fuerza.
 *
 * La partida se cambia con `conPunto`, que deja el texto impreso al día. Separado de `useDespachoGuiaLoth` sólo por tamaño: el estado es el
 * mismo `datos`.
 */

import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import type { GtfDatos, PartidaTraslado, UbicacionTraslado } from "@/lib/forestal/ctp-gtf-datos";
import { conPunto, listasDelTalonario, llegadaDelDestinatario, mismaUbicacion, type TalonarioDelPlan } from "@/lib/forestal/loth-guia-despacho";
import { hojasDeLista, listasEfectivas } from "@/lib/forestal/loth-lista-numero";

/** Un punto con algo escrito (dirección o ubigeo). */
function conAlgo(u: Partial<UbicacionTraslado> | null | undefined): boolean {
  return Boolean(u && [u.direccion, u.departamento, u.provincia, u.distrito].some((x) => (x ?? "").trim()));
}

export function useTrasladoGuiaLoth(x: {
  datos: GtfDatos;
  setDatos: Dispatch<SetStateAction<GtfDatos>>;
  talonario: TalonarioDelPlan | null;
  trozas: number;
}) {
  const { datos, setDatos, talonario, trozas } = x;
  /** El N° de lista lo escribió la persona: ya no se recalcula al cambiar las trozas. */
  const listaTocada = useRef(false);

  const propuestaListas = useMemo(() => (talonario ? listasDelTalonario(talonario, trozas) : null), [talonario, trozas]);
  useEffect(() => {
    if (listaTocada.current || !propuestaListas) return;
    const v = propuestaListas.texto ?? "";
    setDatos((p) => (p.guia.listaTrozasNro === v ? p : { ...p, guia: { ...p.guia, listaTrozasNro: v } }));
  }, [propuestaListas, setDatos]);
  const hojas = hojasDeLista(trozas);
  const listas = useMemo(() => listasEfectivas(datos.guia.listaTrozasNro, hojas), [datos.guia.listaTrozasNro, hojas]);
  const setListaTexto = useCallback(
    (texto: string) => {
      listaTocada.current = texto.trim() !== "";
      setDatos((p) => ({ ...p, guia: { ...p.guia, listaTrozasNro: texto } }));
    },
    [setDatos],
  );

  /* El estado más reciente, para decidir DENTRO del efecto y no dentro del
     updater: el updater corre dos veces en desarrollo (StrictMode). */
  const ultimo = useRef(datos);
  ultimo.current = datos;

  const claveDestino = JSON.stringify(llegadaDelDestinatario(datos));
  useEffect(() => {
    const dest = JSON.parse(claveDestino) as UbicacionTraslado;
    if (!conAlgo(dest) || mismaUbicacion(ultimo.current.traslado.llegada, dest)) return;
    setDatos((p) => ({ ...p, traslado: conPunto(p.traslado, "llegada", dest) }));
  }, [claveDestino, setDatos]);

  /** La partida (ubicación + casilleros del formato 2024 + internos). La llegada no se escribe: es el destinatario. */
  const setPartida = useCallback(
    (cambio: Partial<PartidaTraslado>) => {
      setDatos((p) => ({ ...p, traslado: conPunto(p.traslado, "partida", cambio) }));
    },
    [setDatos],
  );

  /** Al sembrar la guía de un plan: la lista vuelve a ser automática. */
  const alSembrar = useCallback(() => {
    listaTocada.current = false;
  }, []);

  return { hojas, listas, propuestaListas, setListaTexto, setPartida, alSembrar };
}
