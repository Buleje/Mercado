"use client";

/**
 * useLothMapaImagenes — las imágenes recientes de la zona de trabajo, del
 * lado de la pantalla: pide `/loth/imagenes` una vez por plan (el servidor
 * guarda 6 h), y lleva qué fecha de Sentinel-2 se mira, cuál se compara bajo
 * la cortina y si están prendidas las capas de hoy (nubes y humo, focos).
 *
 *   · La fecha elegida arranca en la sugerida (la más nueva con ≤ 30 % de
 *     nubes sobre el área). Cambiarla sólo cambia las teselas.
 *   · Comparar dos fechas y el comparador EUDR (Wayback) usan la MISMA cortina:
 *     prender uno apaga el otro.
 *   · Nubes/humo y focos se recuerdan en este navegador, como la base.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { leerJson } from "@/lib/errores/sin-dato";
import {
  ATRIBUCION_S2,
  etiquetaEscena,
  fechaCorta,
  itemQueMasCubre,
  urlColorReal,
  urlRecorteS2,
  ZONA_AMPLIA_GRADOS,
  type EscenaS2,
  type ImagenesDelArea,
} from "@/lib/forestal/loth-imagenes";
import type { LatLng } from "@/lib/forestal/loth-geo";
import type { EscenaEnMapa, VivasEnMapa } from "../loth-mapa-canvas-ctx";
import type { VistaMapa } from "./use-loth-mapa-herramientas";

type Respuesta = Partial<ImagenesDelArea> & { avisos?: string[]; message?: string };
export type EstadoImagenes = "nada" | "cargando" | "listo" | "error";

interface Deps {
  planId: string | null;
  /** El mapa terminó de cargar (antes no se sabe si hay área ni árboles). */
  listo: boolean;
  /** El comparador EUDR está prendido: la cortina es de él. */
  waybackActivo: boolean;
  apagarWayback: () => void;
}

const mensaje = (status: number, c: Respuesta | null) =>
  status === 429 ? "Demasiados pedidos seguidos: espera un minuto." : typeof c?.message === "string" && c.message ? c.message : `No se pudieron buscar las imágenes (HTTP ${status}).`;

export function useLothMapaImagenes({ planId, listo, waybackActivo, apagarWayback }: Deps) {
  const [datos, setDatos] = useState<ImagenesDelArea | null>(null);
  const [estado, setEstado] = useState<EstadoImagenes>("nada");
  const [avisos, setAvisos] = useState<string[]>([]);
  const [fechaElegida, setFechaElegida] = useState<string | null>(null);
  const [fechaComparar, setFechaComparar] = useState<string | null>(null);
  /** Cada «Buscar imágenes nuevas» suma uno; el ref dice si el próximo pedido es con `refrescar`. */
  const [pedido, setPedido] = useState(0);
  const refrescarRef = useRef(false);
  const [nubesHoy, setNubesHoy] = useLocalStorage<boolean>("loth:mapa:nubes-hoy", false);
  const [focos, setFocos] = useLocalStorage<boolean>("loth:mapa:focos", false);

  // Otro plan = otra zona: lo elegido del anterior no sirve.
  useEffect(() => {
    setDatos(null);
    setFechaElegida(null);
    setFechaComparar(null);
    setAvisos([]);
    setEstado("nada");
  }, [planId]);

  useEffect(() => {
    if (!planId || !listo) return;
    const ac = new AbortController();
    const refrescar = refrescarRef.current;
    refrescarRef.current = false;
    let terminado = false;
    setEstado("cargando");
    fetch(`/api/admin/forestal/loth/imagenes?planId=${encodeURIComponent(planId)}${refrescar ? "&refrescar=1" : ""}`, { credentials: "include", signal: ac.signal })
      .then(async (r) => {
        const c = await leerJson<Respuesta>(r);
        if (ac.signal.aborted) return;
        terminado = true;
        if (!r.ok) throw new Error(mensaje(r.status, c));
        setAvisos(Array.isArray(c?.avisos) ? c.avisos : []);
        if (c && Array.isArray(c.escenas) && c.bbox && c.vivas) {
          setDatos({ bbox: c.bbox, consultadoAt: c.consultadoAt ?? "", escenas: c.escenas, sugerida: c.sugerida ?? null, esri: c.esri ?? null, vivas: c.vivas });
        }
        setEstado("listo");
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        setAvisos([err instanceof Error ? err.message : String(err)]);
        setEstado("error");
      });
    return () => {
      ac.abort();
      // Cortado a mitad de vuelo (StrictMode monta dos veces): el «buscar de nuevo» no se pierde.
      if (refrescar && !terminado) refrescarRef.current = true;
    };
  }, [planId, listo, pedido]);

  // El comparador EUDR tomó la cortina: la otra fecha se suelta.
  useEffect(() => {
    if (waybackActivo) setFechaComparar(null);
  }, [waybackActivo]);

  const escenas = useMemo(() => datos?.escenas ?? [], [datos]);
  const escena: EscenaS2 | null = escenas.find((e) => e.fecha === fechaElegida) ?? escenas.find((e) => e.fecha === datos?.sugerida) ?? escenas[0] ?? null;
  const comparada: EscenaS2 | null = fechaComparar ? (escenas.find((e) => e.fecha === fechaComparar && e.fecha !== escena?.fecha) ?? null) : null;

  /** Lo que el canvas pinta: objetos estables mientras no cambie la escena (el canvas va en `memo`). */
  const s2 = useMemo<EscenaEnMapa | null>(() => (escena ? { items: escena.items } : null), [escena]);
  const s2Comparar = useMemo<EscenaEnMapa | null>(() => (comparada ? { items: comparada.items } : null), [comparada]);
  const colorReal = datos?.vivas.colorReal ?? null;
  const fechasFocos = datos?.vivas.focos.fechas.join(",") ?? "";
  const vivas = useMemo<VivasEnMapa>(
    () => ({
      colorReal: nubesHoy && colorReal ? urlColorReal(colorReal.capa, colorReal.fecha) : null,
      focos: focos && fechasFocos ? fechasFocos.split(",") : [],
    }),
    [nubesHoy, colorReal, focos, fechasFocos],
  );

  /** Comparar la escena en pantalla con otra fecha (la más nueva ANTERIOR, si no se dice cuál). */
  const comparar = useCallback(
    (fecha?: string | null) => {
      if (fecha === null) return setFechaComparar(null);
      const otra = fecha ?? escenas.find((e) => escena && e.fecha < escena.fecha)?.fecha ?? escenas.find((e) => e.fecha !== escena?.fecha)?.fecha ?? null;
      if (!otra) return;
      apagarWayback();
      setFechaComparar(otra);
    },
    [escenas, escena, apagarWayback],
  );

  /** «Ver la zona»: el recuadro de trabajo agrandado ~13 km (las nubes de hoy se leen de lejos). */
  const zonaAmplia = useMemo<LatLng[]>(() => {
    const b = datos?.bbox;
    if (!b) return [];
    const g = ZONA_AMPLIA_GRADOS;
    return [
      [b.sur - g, b.oeste - g],
      [b.norte + g, b.este + g],
    ];
  }, [datos?.bbox]);

  /** Para «Imagen PNG de lo que ves» con Sentinel-2 en pantalla. */
  const fondoPng = useMemo(() => {
    if (!escena) return undefined;
    return { url: (b: VistaMapa, ancho: number, alto: number) => urlRecorteS2(itemQueMasCubre(escena.items, b).id, b, ancho, alto), fuente: `Sentinel-2 del ${fechaCorta(escena.fecha)} · ${ATRIBUCION_S2}` };
  }, [escena]);

  return {
    estado,
    avisos,
    escenas,
    escena,
    etiqueta: escena ? etiquetaEscena(escena) : null,
    sugerida: datos?.sugerida ?? null,
    elegirFecha: setFechaElegida,
    comparada,
    comparar,
    esri: datos?.esri ?? null,
    colorReal,
    fechasFocos: datos?.vivas.focos.fechas ?? [],
    nubesHoy,
    setNubesHoy,
    focos,
    setFocos,
    s2,
    s2Comparar,
    vivas,
    fondoPng,
    zonaAmplia,
    /** «Buscar imágenes nuevas»: vuelve a preguntar a los catálogos (6 por hora). */
    refrescar: () => {
      refrescarRef.current = true;
      setPedido((n) => n + 1);
    },
  };
}

export type LothMapaImagenes = ReturnType<typeof useLothMapaImagenes>;
