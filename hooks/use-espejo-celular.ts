"use client";

/**
 * El stream del «Espejo del celular» (Cámaras › Espejo del celular, 24-10).
 *
 * Pide la ventana de scrcpy con `getDisplayMedia`, la pone en el `<video>`,
 * mide cuántos cuadros llegan de verdad (`requestVideoFrameCallback`: scrcpy
 * sólo manda cuadros cuando la pantalla cambia, así que 2/s con el celular
 * quieto es normal) y avisa cuando el track se corta (se cerró scrcpy o se
 * tocó «Dejar de compartir»). Al desmontarse suelta la captura: salir de la
 * vista apaga el aviso rojo de Chrome.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { logger } from "@/lib/logger";

export type EstadoEspejo = "listo" | "pidiendo" | "mostrando" | "cortado" | "error";

/** Lo que Chrome entiende además del estándar (TS no los tipa todos). */
type OpcionesCaptura = DisplayMediaStreamOptions & {
  preferCurrentTab?: boolean;
  selfBrowserSurface?: "include" | "exclude";
  surfaceSwitching?: "include" | "exclude";
  monitorTypeSurfaces?: "include" | "exclude";
};

const OPCIONES: OpcionesCaptura = {
  video: { frameRate: { ideal: 30, max: 30 }, displaySurface: "window" },
  audio: false,
  preferCurrentTab: false,
  selfBrowserSurface: "exclude",
  surfaceSwitching: "include",
  monitorTypeSurfaces: "exclude",
};

/** ¿Este navegador puede capturar una ventana? (No: celulares, navegadores viejos, http sin candado.) */
export function hayCapturaDePantalla(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function";
}

const sinSuscripcion = () => () => {};

export interface EspejoCelular {
  /** `null` mientras no se sabe (render del servidor). */
  soporte: boolean | null;
  estado: EstadoEspejo;
  error: string | null;
  /** Cuadros que llegaron en el último segundo. */
  fps: number | null;
  /** «window» = se eligió una ventana; «monitor»/«browser» = otra cosa (avisar). */
  superficie: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  mostrar: () => Promise<void>;
  detener: () => void;
  /** El cuadro que se ve ahora, en PNG a su tamaño real. */
  foto: () => Promise<Blob | null>;
}

export function useEspejoCelular(): EspejoCelular {
  const soporte = useSyncExternalStore(sinSuscripcion, hayCapturaDePantalla, () => null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [estado, setEstado] = useState<EstadoEspejo>("listo");
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [superficie, setSuperficie] = useState<string | null>(null);

  const soltar = useCallback(() => {
    for (const t of streamRef.current?.getTracks() ?? []) t.stop();
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setFps(null);
  }, []);

  const detener = useCallback(() => {
    soltar();
    setError(null);
    setEstado("listo");
  }, [soltar]);

  const mostrar = useCallback(async () => {
    if (!hayCapturaDePantalla()) return;
    setError(null);
    setEstado("pidiendo");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia(OPCIONES);
    } catch (e) {
      const nombre = e instanceof DOMException ? e.name : "";
      // Cerró el selector sin elegir: si ya se veía algo, sigue viéndose.
      const cancelo = nombre === "NotAllowedError" || nombre === "AbortError";
      setEstado(streamRef.current ? "mostrando" : cancelo ? "listo" : "error");
      setError(cancelo ? "No elegiste ninguna ventana." : "El navegador no dejó capturar la ventana. Vuelve a intentarlo.");
      return;
    }
    soltar();
    streamRef.current = stream;
    const [pista] = stream.getVideoTracks();
    setSuperficie((pista?.getSettings() as MediaTrackSettings & { displaySurface?: string }).displaySurface ?? null);
    pista?.addEventListener("ended", () => {
      if (streamRef.current !== stream) return;
      soltar();
      setEstado("cortado");
    });
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      // muted + playsInline: el autoplay no se bloquea; si igual falla, el cuadro llega al tocar el video.
      await video.play().catch((err: unknown) => logger.warn("[espejo-celular] el video no arrancó", { error: String(err) }));
    }
    setEstado("mostrando");
  }, [soltar]);

  /* Cuántos cuadros llegan de verdad, una vez por segundo. */
  useEffect(() => {
    const video = videoRef.current;
    if (estado !== "mostrando" || !video) return;
    let cuadros = 0;
    let desde = performance.now();
    let pedido = 0;
    const conRvfc = typeof video.requestVideoFrameCallback === "function";
    const contar = () => {
      cuadros++;
      pedido = video.requestVideoFrameCallback(contar);
    };
    if (conRvfc) pedido = video.requestVideoFrameCallback(contar);
    const reloj = window.setInterval(() => {
      const ahora = performance.now();
      const medido = conRvfc
        ? (cuadros * 1000) / (ahora - desde)
        : (streamRef.current?.getVideoTracks()[0]?.getSettings().frameRate ?? 0);
      setFps(Math.round(medido));
      cuadros = 0;
      desde = ahora;
    }, 1000);
    return () => {
      if (conRvfc) video.cancelVideoFrameCallback(pedido);
      window.clearInterval(reloj);
    };
  }, [estado]);

  /* Salir de la vista suelta la captura. */
  useEffect(() => soltar, [soltar]);

  const foto = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const lienzo = document.createElement("canvas");
    lienzo.width = video.videoWidth;
    lienzo.height = video.videoHeight;
    lienzo.getContext("2d")?.drawImage(video, 0, 0);
    return new Promise((resolver) => lienzo.toBlob((b) => resolver(b), "image/png"));
  }, []);

  return { soporte, estado, error, fps, superficie, videoRef, mostrar, detener, foto };
}
