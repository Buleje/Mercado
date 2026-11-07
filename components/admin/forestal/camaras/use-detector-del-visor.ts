"use client";

/**
 * El detector de personas pegado a un visor de la nube (cuadro del mosaico o
 * visor de una cámara sola, 08-10): lee el lienzo de EZUIKit mientras hay
 * video, con las zonas que esa cámara ignora. Mira sólo con `activo` y el
 * video «viendo»; las fotos van a la carpeta «Personas» (`use-detector-personas`).
 */

import { useCallback } from "react";
import { fuenteDelVideo } from "./reproductor-nube";
import { useDetectorPersonas, type UltimaFotoPersona } from "./use-detector-personas";
import type { VisorNubeEstado } from "./use-visor-nube";
import { useZonasIgnorar } from "./zonas-detector";

interface Opciones {
  camaraId: string;
  nombre: string;
  v: VisorNubeEstado;
  /** «Detectar personas» prendido (y no es el Modo TV). */
  activo: boolean;
  onFoto?: (foto: UltimaFotoPersona) => void;
}

export function useDetectorDelVisor({ camaraId, nombre, v, activo, onFoto }: Opciones) {
  const { contenedorId, tomarCuadroQuieto } = v;
  const leerFuente = useCallback(
    () => fuenteDelVideo(document.getElementById(contenedorId)),
    [contenedorId],
  );
  const zonas = useZonasIgnorar(camaraId);
  const personas = useDetectorPersonas({
    camaraId,
    nombre,
    activo: activo && v.estado === "viendo",
    leerFuente,
    tomarCuadro: tomarCuadroQuieto,
    onFoto,
    zonasIgnorar: zonas,
  });
  return { personas, zonas };
}
