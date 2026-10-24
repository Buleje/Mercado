"use client";

/**
 * «Transmitir al TV» del visor de video (Modo TV, 2026-10-07).
 *
 * El navegador manda el `<video>` a un Chromecast o a una Smart TV con
 * Chromecast integrado por la Remote Playback API (`video.remote`), o a un
 * Apple TV / TV con AirPlay en Safari (`webkitShowPlaybackTargetPicker`). El
 * botón sólo aparece si el navegador dice que HAY un aparato en la red: un
 * botón que siempre falla enseña a ignorarlo.
 *
 * Con hls.js (MSE) Chrome no puede mandar el video y `watchAvailability`
 * rechaza con `NotSupportedError`: el botón no aparece y queda el Modo TV.
 */

import { useEffect, useState, type RefObject } from "react";
import { logger } from "@/lib/logger";

interface RemotePlaybackLike {
  watchAvailability(cb: (disponible: boolean) => void): Promise<number>;
  cancelWatchAvailability(id?: number): Promise<void>;
  prompt(): Promise<void>;
}
type VideoConRemoto = HTMLVideoElement & {
  remote?: RemotePlaybackLike;
  webkitShowPlaybackTargetPicker?: () => void;
};
type EventoAirPlay = Event & { availability?: string };

export type ViaTransmitir = "remote" | "airplay" | null;

/** Qué vía hay para transmitir este `<video>` ahora. `null` = ninguna (sin botón). */
export function useTransmitir(videoRef: RefObject<HTMLVideoElement | null>, activo: boolean) {
  const [via, setVia] = useState<ViaTransmitir>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    const v = videoRef.current as VideoConRemoto | null;
    setVia(null);
    if (!activo || !v) return;
    let vigente = true;
    let idVigilancia: number | null = null;

    if (v.remote && typeof v.remote.watchAvailability === "function") {
      v.remote
        .watchAvailability((hay) => vigente && setVia(hay ? "remote" : null))
        .then((id) => {
          idVigilancia = id;
        })
        .catch((err: unknown) =>
          logger.info("[camaras.transmitir] el navegador no puede transmitir este video", { error: String(err) }),
        );
    }
    const alCambiarAirPlay = (e: Event) =>
      vigente && setVia((e as EventoAirPlay).availability === "available" ? "airplay" : null);
    if (typeof v.webkitShowPlaybackTargetPicker === "function") {
      v.addEventListener("webkitplaybacktargetavailabilitychanged", alCambiarAirPlay);
    }

    return () => {
      vigente = false;
      v.removeEventListener("webkitplaybacktargetavailabilitychanged", alCambiarAirPlay);
      if (idVigilancia !== null) {
        v.remote
          ?.cancelWatchAvailability(idVigilancia)
          .catch((err: unknown) => logger.info("[camaras.transmitir] no se soltó la vigilancia", { error: String(err) }));
      }
    };
  }, [videoRef, activo]);

  const transmitir = () => {
    const v = videoRef.current as VideoConRemoto | null;
    setAviso(null);
    if (!v) return;
    if (via === "airplay") {
      v.webkitShowPlaybackTargetPicker?.();
      return;
    }
    v.remote?.prompt().catch((err: unknown) => {
      const nombre = (err as { name?: string } | null)?.name;
      /* Cerrar el selector sin elegir no es un error para mostrar. */
      if (nombre === "NotAllowedError" || nombre === "AbortError") return;
      setAviso("No se pudo mandar el video al televisor. Prueba con el Modo TV.");
      logger.warn("[camaras.transmitir] prompt falló", { error: String(err) });
    });
  };

  return { via, transmitir, aviso };
}
