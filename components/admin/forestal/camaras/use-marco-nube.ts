"use client";

/**
 * «Teatro» y pantalla completa del visor de la nube (ADR-471), aparte de
 * `use-visor-nube.ts`. Pantalla completa del MARCO (video + controles), no la
 * de EZUIKit: así el joystick y la alarma siguen a mano. Si el navegador no
 * deja (iPhone), la de EZUIKit.
 */

import { useCallback, useEffect, useState, type RefObject } from "react";
import type { EZUIKitPlayer } from "ezuikit-js";
import { logger } from "@/lib/logger";

export function useMarcoNube(
  marcoId: string,
  player: RefObject<EZUIKitPlayer | null>,
  actividad: () => void,
) {
  const [teatro, setTeatro] = useState(false);
  const [enPantallaCompleta, setEnPantallaCompleta] = useState(false);

  useEffect(() => {
    const cambio = () => setEnPantallaCompleta(document.fullscreenElement?.id === marcoId);
    document.addEventListener("fullscreenchange", cambio);
    return () => document.removeEventListener("fullscreenchange", cambio);
  }, [marcoId]);

  const pantallaCompleta = useCallback(() => {
    actividad();
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
      return;
    }
    const marco = document.getElementById(marcoId);
    const p = player.current;
    if (marco?.requestFullscreen) {
      marco.requestFullscreen().catch(() => p?.fullScreen?.());
    } else if (p?.fullScreen) {
      Promise.resolve(p.fullScreen()).catch((err: unknown) =>
        logger.warn("[camaras] pantalla completa no disponible", { error: String(err) }),
      );
    }
  }, [actividad, marcoId, player]);

  const alternarTeatro = useCallback(() => {
    actividad();
    setTeatro((t) => !t);
  }, [actividad]);

  return { teatro, alternarTeatro, enPantallaCompleta, pantallaCompleta };
}
