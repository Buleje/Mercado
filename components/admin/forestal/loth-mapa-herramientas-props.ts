/**
 * loth-mapa-herramientas-props — el cableado de `LothMapaHerramientas` (los
 * paneles bajo la barra) desde el estado del mapa. Vive aparte para que
 * `LothMapaMarco` no pase de 300 líneas al sumar las imágenes recientes.
 */

import type { ComponentProps } from "react";
import { arbolesEnFaja } from "@/lib/forestal/loth-faja";
import type { LothVia } from "@/lib/forestal/loth-cartografia";
import { fechaCorta } from "@/lib/forestal/loth-imagenes";
import type LothMapaHerramientas from "./LothMapaHerramientas";
import type { BasemapId } from "./loth-mapa-canvas-ctx";
import type { LothMapaHerramientasEstado } from "./hooks/use-loth-mapa-herramientas";
import type { LothMapaDerivados } from "./hooks/use-loth-mapa-derivados";
import type { LothMapaImagenes } from "./hooks/use-loth-mapa-imagenes";

/** Cómo se llama lo que está de fondo, con su fecha si es una foto («Sentinel-2 del 21 set 2026»). */
export function nombreDeLaBase(basemap: BasemapId, img: Pick<LothMapaImagenes, "escena" | "esri">): string {
  if (basemap === "s2") return img.escena ? `Sentinel-2 del ${fechaCorta(img.escena.fecha)}` : "foto de Esri";
  if (basemap === "sat") return img.esri ? `foto de Esri del ${fechaCorta(img.esri.fecha)}` : "foto de Esri";
  return basemap === "topo" ? "mapa topográfico" : "calles";
}

export function propsHerramientas(herr: LothMapaHerramientasEstado, der: LothMapaDerivados, rios: readonly LothVia[], img: LothMapaImagenes): ComponentProps<typeof LothMapaHerramientas> {
  return {
    medicion: herr.medicion,
    medicionModo: herr.medicionModo,
    onMedicion: herr.setMedicion,
    onMedicionModo: herr.setMedicionModo,
    releases: herr.releases,
    wayback: herr.wayback,
    onWayback: herr.setWayback,
    waybackSplit: herr.waybackSplit,
    onWaybackSplit: herr.setWaybackSplit,
    irOpen: herr.irOpen,
    onIrA: herr.centrar,
    onCerrarIr: () => herr.setIrOpen(false),
    zonaDefault: der.zonaSugerida,
    fajaAnchoM: herr.fajaAnchoM,
    onFajaAncho: herr.setFajaAnchoM,
    arbolesEnFaja: herr.fajaAnchoM > 0 ? rios.reduce((total, v) => total + arbolesEnFaja(der.censoAll, v.puntos, herr.fajaAnchoM).length, 0) : 0,
    perfil: herr.perfil,
    onCerrarPerfil: herr.cerrarPerfil,
    derecha: nombreDeLaBase(herr.basemap, img),
  };
}
