"use client";

/**
 * useLothMapaHerramientas — el estado de la barra del mapa del Libro TH: qué
 * capas se ven y qué herramienta está prendida.
 *
 *   · Capas: base (topográfica / satelital / calles), cuadrícula UTM, censo,
 *     capas oficiales (ANP, ordenamiento) y las secciones del libro.
 *   · Herramientas: cinta métrica, comparador EUDR (Esri Wayback), faja de
 *     protección de cauces, perfil de terreno, modo campo (GPS) e «ir a
 *     coordenada».
 *   · Vista: lectura del cursor, escala, encuadre visible y pantalla completa.
 *
 * Las herramientas no se estorban entre ellas salvo en el clic del mapa, y de
 * eso se ocupa el canvas (cada una escucha sólo mientras está prendida).
 */

import { useCallback, useEffect, useState } from "react";
import type { LatLng } from "@/lib/forestal/loth-geo";
import type { ModoMedicion } from "@/lib/forestal/loth-medicion";
import { cargarWaybackReleases, EUDR_CUTOFF, releaseParaFecha, type WaybackRelease } from "@/lib/forestal/loth-wayback";
import { cargarElevaciones, construirPerfil, muestrearTraza, type PerfilElevacion } from "@/lib/forestal/loth-elevacion";
import type { BasemapId } from "../LothMapaCanvas";
import type { OverlayId } from "../loth-mapa-overlays";
import type { PosicionCampo } from "../LothCampoBar";

export interface VistaMapa {
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
}

export function useLothMapaHerramientas({ onError }: { onError: (msg: string | null) => void }) {
  // ── Capas ────────────────────────────────────────────────────────────────
  const [basemap, setBasemap] = useState<BasemapId>("topo");
  const [showGrid, setShowGrid] = useState(true);
  const [showCenso, setShowCenso] = useState(true);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [overlays, setOverlays] = useState<OverlayId[]>([]);

  const toggleSection = useCallback(
    (s: string) =>
      setHidden((h) => {
        const n = new Set(h);
        if (n.has(s)) n.delete(s);
        else n.add(s);
        return n;
      }),
    [],
  );
  const toggleOverlay = useCallback(
    (id: OverlayId) => setOverlays((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id])),
    [],
  );

  // ── Vista ────────────────────────────────────────────────────────────────
  const [cursor, setCursor] = useState<LatLng | null>(null);
  const [metersPerPixel, setMetersPerPixel] = useState(30);
  /** bbox visible del mapa — lo necesita la descarga en PNG. */
  const [vista, setVista] = useState<VistaMapa | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  /** Pedido de centrado: el canvas lo consume cuando cambia `n`. */
  const [centrarEn, setCentrarEn] = useState<{ p: LatLng; n: number } | null>(null);

  const onCursor = useCallback((p: LatLng | null) => setCursor(p), []);
  const onView = useCallback((v: { metersPerPixel: number; bounds?: VistaMapa }) => {
    setMetersPerPixel(v.metersPerPixel);
    if (v.bounds) setVista(v.bounds);
  }, []);
  const centrar = useCallback((p: LatLng) => setCentrarEn((c) => ({ p, n: (c?.n ?? 0) + 1 })), []);

  // ── Herramientas ─────────────────────────────────────────────────────────
  const [medicion, setMedicion] = useState<LatLng[] | null>(null);
  const [medicionModo, setMedicionModo] = useState<ModoMedicion>("distancia");
  const [releases, setReleases] = useState<WaybackRelease[]>([]);
  const [cargandoReleases, setCargandoReleases] = useState(true);
  const [wayback, setWayback] = useState<WaybackRelease | null>(null);
  const [waybackSplit, setWaybackSplit] = useState(50);
  const [fajaAnchoM, setFajaAnchoM] = useState(0);
  const [perfil, setPerfil] = useState<PerfilElevacion | null>(null);
  const [perfilCargando, setPerfilCargando] = useState(false);
  const [campoActivo, setCampoActivo] = useState(false);
  const [posicion, setPosicion] = useState<PosicionCampo | null>(null);
  const [irOpen, setIrOpen] = useState(false);

  // Catálogo de imágenes históricas (Esri Wayback). Si el servicio no responde,
  // la herramienta queda deshabilitada y el mapa sigue funcionando igual.
  useEffect(() => {
    const ac = new AbortController();
    cargarWaybackReleases(ac.signal)
      .then(setReleases)
      .finally(() => setCargandoReleases(false));
    return () => ac.abort();
  }, []);

  const addMedicionPunto = useCallback((v: LatLng) => setMedicion((m) => [...(m ?? []), v]), []);

  /** Salta a la última imagen anterior al corte EUDR (31-dic-2020). */
  const verCorteEudr = () => {
    const r = releaseParaFecha(releases, EUDR_CUTOFF);
    if (r) setWayback(r);
  };

  /** Perfil de terreno de la traza que se esté midiendo. */
  const verPerfil = async () => {
    const traza = medicion ?? [];
    if (traza.length < 2) return;
    setPerfilCargando(true);
    onError(null);
    try {
      const muestras = muestrearTraza(traza, 60);
      const elevaciones = await cargarElevaciones(muestras);
      if (elevaciones.length === 0) {
        onError("El servicio de altitudes no respondió. Prueba de nuevo en un momento.");
        return;
      }
      setPerfil(construirPerfil(muestras, elevaciones));
    } finally {
      setPerfilCargando(false);
    }
  };

  return {
    basemap,
    setBasemap,
    showGrid,
    setShowGrid,
    showCenso,
    setShowCenso,
    hidden,
    toggleSection,
    overlays,
    toggleOverlay,
    cursor,
    onCursor,
    metersPerPixel,
    vista,
    onView,
    fullscreen,
    setFullscreen,
    centrarEn,
    centrar,
    medicion,
    setMedicion,
    medicionModo,
    setMedicionModo,
    addMedicionPunto,
    releases,
    cargandoReleases,
    wayback,
    setWayback,
    waybackSplit,
    setWaybackSplit,
    verCorteEudr,
    fajaAnchoM,
    setFajaAnchoM,
    perfil,
    perfilCargando,
    verPerfil,
    cerrarPerfil: () => setPerfil(null),
    campoActivo,
    setCampoActivo,
    posicion,
    setPosicion,
    irOpen,
    setIrOpen,
  };
}

export type LothMapaHerramientasEstado = ReturnType<typeof useLothMapaHerramientas>;
