"use client";

/**
 * useTrasladoGuiaLoth — la parte del estado de «Despachar con guía» que se
 * llena sola mientras nadie la toque (29-09-2026):
 *
 *   · el N° de la lista de trozas (35): sigue a las listas del titular y a
 *     cuántas hojas salen las trozas elegidas (`listasDelTalonario`);
 *   · el punto de llegada: sigue al destinatario mientras esté vacío o diga lo
 *     que se sembró; escrito a mano, se respeta.
 *
 * La partida y la llegada se cambian con `conPunto`, que deja el texto impreso
 * al día. Separado de `useDespachoGuiaLoth` sólo por tamaño: el estado es el
 * mismo `datos`.
 */

import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import type { GtfDatos, UbicacionTraslado } from "@/lib/forestal/ctp-gtf-datos";
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
  /** La llegada que se sembró del destinatario (mientras siga igual, sigue al destinatario). */
  const llegadaSembrada = useRef<UbicacionTraslado | null>(null);

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

  const claveDestino = JSON.stringify(llegadaDelDestinatario(datos));
  useEffect(() => {
    const dest = JSON.parse(claveDestino) as UbicacionTraslado;
    setDatos((p) => {
      const actual = p.traslado.llegada;
      const siguiendo = !conAlgo(actual) || (llegadaSembrada.current != null && mismaUbicacion(actual, llegadaSembrada.current));
      if (!siguiendo || !conAlgo(dest) || mismaUbicacion(actual, dest)) return p;
      llegadaSembrada.current = dest;
      return { ...p, traslado: conPunto(p.traslado, "llegada", dest) };
    });
  }, [claveDestino, setDatos]);

  const setPunto = useCallback(
    (cual: "partida" | "llegada", cambio: Partial<UbicacionTraslado>) => {
      setDatos((p) => ({ ...p, traslado: conPunto(p.traslado, cual, cambio) }));
    },
    [setDatos],
  );
  const usarLlegadaDelDestinatario = useCallback(() => {
    setDatos((p) => {
      const dest = llegadaDelDestinatario(p);
      llegadaSembrada.current = dest;
      return { ...p, traslado: conPunto(p.traslado, "llegada", dest) };
    });
  }, [setDatos]);

  /** Al sembrar la guía de un plan: la lista vuelve a ser automática y la llegada sembrada es la de la guía nueva. */
  const alSembrar = useCallback((d: GtfDatos) => {
    llegadaSembrada.current = d.traslado.llegada;
    listaTocada.current = false;
  }, []);

  return { hojas, listas, propuestaListas, setListaTexto, setPunto, usarLlegadaDelDestinatario, alSembrar };
}
