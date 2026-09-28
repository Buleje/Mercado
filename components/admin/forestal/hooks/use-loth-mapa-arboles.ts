"use client";

/**
 * useLothMapaArboles — el censo en el mapa del Libro TH, del lado de quien lo
 * usa en el monte:
 *
 *   · qué árboles se ven (filtro por especie, condición y estado),
 *   · cuál está elegido (su ficha abierta),
 *   · «¿Qué árbol tengo cerca?»: sigue el GPS del celular y ordena los árboles
 *     EN PIE por distancia (respeta la especie y la condición del filtro: con
 *     «Catahua» elegida, te dice qué catahua tienes más cerca).
 *
 * El GPS es propio (no el del modo campo): se prende al tocar el botón y se
 * apaga al cerrar la búsqueda, para no gastar batería en el monte.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LatLng } from "@/lib/forestal/loth-geo";
import {
  arbolesCercanos,
  filtrarArboles,
  FILTRO_ARBOLES_VACIO,
  opcionesDeFiltro,
  type ArbolCercano,
  type FiltroArboles,
} from "@/lib/forestal/loth-mapa-arboles";
import { bearingDeg, distanceM } from "@/lib/forestal/loth-utm";
import type { CensoTree } from "../loth-mapa-shared";
import type { PosicionCampo } from "../LothCampoBar";

/** Cuántos árboles lista «¿Qué árbol tengo cerca?». */
export const CERCANOS_N = 5;

/** El error del GPS dicho como se arregla, no como lo dice el navegador. */
function mensajeGps(err: GeolocationPositionError): string {
  if (err.code === err.PERMISSION_DENIED) {
    if (typeof window !== "undefined" && !window.isSecureContext) {
      return "El GPS sólo funciona si entras por la dirección segura (https).";
    }
    return "No diste permiso para usar tu ubicación. Toca el candado junto a la dirección, elige «Permitir» y vuelve a intentar.";
  }
  if (err.code === err.POSITION_UNAVAILABLE) return "El celular no encuentra tu ubicación. Prende el GPS o sal a un claro y vuelve a intentar.";
  return "El GPS tardó demasiado en responder. Vuelve a intentar a cielo abierto.";
}

export function useLothMapaArboles(censoAll: CensoTree[], { centrar }: { centrar: (p: LatLng) => void }) {
  const [filtro, setFiltro] = useState<FiltroArboles>(FILTRO_ARBOLES_VACIO);
  const [elegidoId, setElegidoId] = useState<string | null>(null);
  const [cercaActivo, setCercaActivo] = useState(false);
  const [posicion, setPosicion] = useState<PosicionCampo | null>(null);
  const [errorGps, setErrorGps] = useState<string | null>(null);
  /** Cambia `intento` para volver a pedir el GPS tras un error. */
  const [intento, setIntento] = useState(0);
  const [encuadrarEn, setEncuadrarEn] = useState<{ pts: LatLng[]; n: number } | null>(null);
  /** Ya se encuadró tu posición con el árbol más cercano: después manda el usuario. */
  const encuadrado = useRef(false);

  const opciones = useMemo(() => opcionesDeFiltro(censoAll), [censoAll]);
  const filtrados = useMemo(() => filtrarArboles(censoAll, filtro), [censoAll, filtro]);
  /** Dónde buscar el más cercano: la especie y la condición del filtro, pero en pie siempre. */
  const { especie, clase } = filtro;
  const candidatos = useMemo(() => filtrarArboles(censoAll, { especie, clase, estado: null }), [censoAll, especie, clase]);
  const cercanos = useMemo(
    () => (cercaActivo && posicion ? arbolesCercanos([posicion.lat, posicion.lng], candidatos, CERCANOS_N) : []),
    [cercaActivo, posicion, candidatos],
  );
  const elegido = useMemo(() => censoAll.find((t) => t.id === elegidoId) ?? null, [censoAll, elegidoId]);
  const cercanoId = cercanos[0]?.arbol.id ?? null;
  /** A cuánto y hacia dónde queda el árbol elegido desde tu GPS (también si está talado). */
  const desdeTi = useMemo<ArbolCercano<CensoTree> | null>(() => {
    if (!cercaActivo || !posicion || !elegido) return null;
    const yo: LatLng = [posicion.lat, posicion.lng];
    const alla: LatLng = [elegido.lat, elegido.lng];
    return { arbol: elegido, distanciaM: distanceM(yo, alla), rumboDeg: bearingDeg(yo, alla) };
  }, [cercaActivo, posicion, elegido]);

  /**
   * Lo que se pinta: lo filtrado, más el elegido y el más cercano aunque el
   * filtro de estado los esconda — una ficha abierta de un árbol que no se ve
   * en el mapa no se entiende.
   */
  const visibles = useMemo(() => {
    const extra = [elegido, cercanos[0]?.arbol].filter((t): t is CensoTree => !!t && !filtrados.includes(t));
    return extra.length === 0 ? filtrados : [...filtrados, ...new Set(extra)];
  }, [filtrados, elegido, cercanos]);

  // ── GPS de la búsqueda ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!cercaActivo) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setErrorGps("Este celular o navegador no tiene GPS.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setPosicion({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? 0 });
        setErrorGps(null);
      },
      (err) => setErrorGps(mensajeGps(err)),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 5_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [cercaActivo, intento]);

  // Primera lectura: tú y el árbol más cercano, los dos a la vista.
  useEffect(() => {
    if (!cercaActivo || !posicion || encuadrado.current) return;
    encuadrado.current = true;
    const yo: LatLng = [posicion.lat, posicion.lng];
    const arbol = cercanos[0]?.arbol;
    setEncuadrarEn((e) => ({ pts: arbol ? [yo, [arbol.lat, arbol.lng]] : [yo], n: (e?.n ?? 0) + 1 }));
  }, [cercaActivo, posicion, cercanos]);

  const buscarCerca = useCallback(() => {
    encuadrado.current = false;
    setErrorGps(null);
    setCercaActivo(true);
    setIntento((n) => n + 1);
  }, []);
  const dejarDeBuscar = useCallback(() => {
    setCercaActivo(false);
    setPosicion(null);
    setErrorGps(null);
    encuadrado.current = false;
  }, []);

  /** Tocar un árbol en el mapa (id) o tocar el mapa vacío (null). Estable: el canvas va en `memo`. */
  const elegir = useCallback((id: string | null) => setElegidoId(id), []);

  /** Elegir desde una lista (los más cercanos, «Por árbol»): además lo lleva al centro. */
  const elegirYMostrar = useCallback(
    (t: CensoTree) => {
      setElegidoId(t.id);
      centrar([t.lat, t.lng]);
    },
    [centrar],
  );

  return {
    filtro,
    setFiltro,
    opciones,
    filtrados,
    visibles,
    elegido,
    desdeTi,
    elegir,
    elegirYMostrar,
    cercaActivo,
    posicion,
    errorGps,
    cercanos,
    cercanoId,
    /** Hay árboles en pie donde buscar (con el filtro de especie y condición). */
    hayCandidatos: candidatos.some((t) => t.estado === "en_pie"),
    buscarCerca,
    dejarDeBuscar,
    encuadrarEn,
  };
}

export type LothMapaArboles = ReturnType<typeof useLothMapaArboles>;
