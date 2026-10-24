"use client";

/**
 * useLothMapaArboles — el censo en el mapa del Libro TH, del lado de quien lo
 * usa en el monte:
 *
 *   · en qué etapa está cada uno según el LIBRO (en pie, talado, trozado,
 *     despachado, en el CTP — `use-loth-mapa-etapas`): el `estado` que se
 *     pinta y se filtra es el del libro; el del censo queda en `estadoCenso`,
 *   · qué árboles se ven (filtro por especie, condición, estado y etapa),
 *   · qué dice la etiqueta sobre cada punto (código y etapa, sólo el código o
 *     nada; se recuerda en este navegador),
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
import { useLocalStorage } from "@/hooks/use-local-storage";
import {
  AVISO_TOKEN,
  CON_AVISO_LABEL,
  contarEtapas,
  ETAPA_LABEL,
  ETAPA_TOKEN,
  ETAPAS,
  etapaEnElMapa,
  estadoVisualDeEtapa,
  opcionesDeEtapa,
} from "@/lib/forestal/loth-etapa-arbol";
import {
  arbolesCercanos,
  claseDelArbol,
  CLASES_ARBOL,
  filtrarArboles,
  FILTRO_ARBOLES_VACIO,
  opcionesDeFiltro,
  type ArbolCercano,
  type FiltroArboles,
} from "@/lib/forestal/loth-mapa-arboles";
import { bearingDeg, distanceM } from "@/lib/forestal/loth-utm";
import type { CensoTree } from "../loth-mapa-shared";
import type { PosicionCampo } from "../LothCampoBar";
import type { LegendItem } from "../LothMapaChrome";
import { CLAVE_MODO_ETIQUETAS, esModoEtiquetas, type ModoEtiquetas } from "../loth-mapa-etiquetas";
import type { EtapasDelMapa } from "./use-loth-mapa-etapas";

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

/** Las etapas que se explican en la leyenda del mapa (en pie y semillero ya los dice la forma). */
const ETAPAS_EN_LEYENDA = ETAPAS.filter((e) => e !== "en_pie" && e !== "semillero");

export function useLothMapaArboles(
  censoBase: CensoTree[],
  { centrar, etapas }: { centrar: (p: LatLng) => void; etapas?: EtapasDelMapa },
) {
  const porId = etapas?.porId ?? null;
  /**
   * El censo con su etapa: manda el libro. Un árbol talado en el libro se
   * pinta hueco y tachado aunque el censo lo siga diciendo en pie (y lleva el
   * aviso); sin lo del servidor todavía, se pinta como dice el censo.
   */
  const censoAll = useMemo<CensoTree[]>(
    () =>
      censoBase.map((t) => {
        const cadena = porId?.get(t.id) ?? null;
        const etapa = etapaEnElMapa(cadena, { estado: t.estado, clase: claseDelArbol(t) });
        return { ...t, estado: estadoVisualDeEtapa(etapa), estadoCenso: t.estado, etapa, conAviso: (cadena?.avisos.length ?? 0) > 0, cadena };
      }),
    [censoBase, porId],
  );
  const [modoGuardado, setEtiquetas] = useLocalStorage<string>(CLAVE_MODO_ETIQUETAS, "etapa");
  const etiquetas: ModoEtiquetas = esModoEtiquetas(modoGuardado) ? modoGuardado : "etapa";
  const [filtro, setFiltro] = useState<FiltroArboles>(FILTRO_ARBOLES_VACIO);
  const [elegidoId, setElegidoId] = useState<string | null>(null);
  const [cercaActivo, setCercaActivo] = useState(false);
  const [posicion, setPosicion] = useState<PosicionCampo | null>(null);
  const [errorGps, setErrorGps] = useState<string | null>(null);
  /** Cambia `intento` para volver a pedir el GPS tras un error. */
  const [intento, setIntento] = useState(0);
  const [encuadrarEn, setEncuadrarEn] = useState<{ pts: LatLng[]; n: number; derecha?: number } | null>(null);
  /** Ya se encuadró tu posición con el árbol más cercano: después manda el usuario. */
  const encuadrado = useRef(false);

  const opciones = useMemo(() => ({ ...opcionesDeFiltro(censoAll), etapas: opcionesDeEtapa(censoAll) }), [censoAll]);
  /**
   * La leyenda de las etapas, con el MISMO símbolo que el mapa (la forma de
   * la condición más común, hueca y tachada, con su insignia): sólo las que hay.
   */
  const leyendaEtapas = useMemo<LegendItem[]>(() => {
    const n = contarEtapas(censoAll);
    const clases = new Set(censoAll.map((t) => claseDelArbol(t)));
    const base = CLASES_ARBOL.find((c) => clases.has(c)) ?? "aprovechable";
    return [
      ...ETAPAS_EN_LEYENDA.filter((e) => n[e] > 0).map((e) => ({
        label: ETAPA_LABEL[e],
        color: ETAPA_TOKEN[e],
        shape: "arbol" as const,
        clase: base,
        estado: estadoVisualDeEtapa(e),
        etapa: e,
      })),
      ...(n.con_aviso > 0
        ? [{ label: CON_AVISO_LABEL, color: AVISO_TOKEN, shape: "arbol" as const, clase: base, estado: "en_pie", aviso: true }]
        : []),
    ];
  }, [censoAll]);
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

  /** Encuadrar varios puntos a pedido («Ver dónde están los árboles», la propuesta del planificador). */
  const encuadrar = useCallback(
    // `derecha`: px que tapa un panel sobre el borde derecho del mapa (el del planificador).
    (pts: LatLng[], derecha = 0) => setEncuadrarEn((e) => ({ pts, n: (e?.n ?? 0) + 1, derecha })),
    [],
  );

  return {
    /** El censo con su etapa (lo que se pinta y se filtra). */
    censoAll,
    etapas,
    etiquetas,
    setEtiquetas: setEtiquetas as (m: ModoEtiquetas) => void,
    leyendaEtapas,
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
    encuadrar,
  };
}

export type LothMapaArboles = ReturnType<typeof useLothMapaArboles>;
