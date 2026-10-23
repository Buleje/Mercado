"use client";

/**
 * La cámara del escáner de huella (23-10): la trasera, con linterna si el
 * teléfono la tiene, y la nitidez de la yema medida ~6 veces por segundo
 * dentro del marco guía. Cuando la yema queda nítida y quieta se toma sola
 * (`debeTomar`); el botón «Tomar ahora» sirve siempre.
 *
 * Lo que entrega: el recorte del marco tal cual y el mismo realzado tipo
 * «huella» (`realzarHuella`), los dos en JPEG. Sin cámara (PC, permiso
 * negado) el componente ofrece elegir una foto y pasa por lo mismo.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { aGris, cajaGuia, debeTomar, nitidez, realzarHuella } from "@/lib/adelantos/huella-imagen";
import { logger } from "@/lib/logger";

/** `bloqueada` = la cabecera Permissions-Policy de la página no deja usar la cámara (hoy `camera=()` en /admin). */
export type EstadoCamara = "pidiendo" | "viva" | "sin-camara" | "denegada" | "bloqueada";

type ConPolitica = Document & { featurePolicy?: { allowsFeature: (f: string) => boolean } };

/** Antes de pedirla: sin `getUserMedia` no hay cámara; con la política en contra, el navegador la niega sin preguntar. */
function estadoInicial(): EstadoCamara {
  if (typeof navigator === "undefined" || typeof navigator.mediaDevices?.getUserMedia !== "function") return "sin-camara";
  return (document as ConPolitica).featurePolicy?.allowsFeature("camera") === false ? "bloqueada" : "pidiendo";
}
export interface HuellaTomada {
  original: Blob;
  realzada: Blob;
}

/** Lado largo del recorte que se guarda: la yema entera con crestas, en ~150 KB. */
const LADO_GUARDADO = 900;
/** Lado largo de la miniatura donde se mide la nitidez (barato a 6 por segundo). */
const LADO_MEDIDA = 200;
const CADA_MS = 160;

type Caja = { x: number; y: number; ancho: number; alto: number };
/** `torch` no está en los tipos del DOM: Chrome en Android lo da cuando el teléfono tiene linterna. */
type ConLinterna = MediaTrackCapabilities & { torch?: boolean };

const aJpeg = (lienzo: HTMLCanvasElement) =>
  new Promise<Blob>((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error("sin imagen"))), "image/jpeg", 0.9));

/** El recorte `caja` de `fuente`, achicado a `LADO_GUARDADO`, original y realzado. */
export async function procesarHuella(fuente: CanvasImageSource, caja: Caja): Promise<HuellaTomada> {
  const esc = Math.min(1, LADO_GUARDADO / Math.max(caja.ancho, caja.alto));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.max(1, Math.round(caja.ancho * esc));
  lienzo.height = Math.max(1, Math.round(caja.alto * esc));
  const ctx = lienzo.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("sin lienzo");
  ctx.drawImage(fuente, caja.x, caja.y, caja.ancho, caja.alto, 0, 0, lienzo.width, lienzo.height);
  const original = await aJpeg(lienzo);
  const img = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
  realzarHuella(img.data, img.width, img.height);
  ctx.putImageData(img, 0, 0);
  return { original, realzada: await aJpeg(lienzo) };
}

export function useCamaraHuella({ activa, auto, onTomada }: { activa: boolean; auto: boolean; onTomada: (h: HuellaTomada) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const flujo = useRef<MediaStream | null>(null);
  const historial = useRef<number[]>([]);
  const alTomar = useRef(onTomada);
  const [estado, setEstado] = useState<EstadoCamara>(estadoInicial);
  const [medida, setMedida] = useState(0);
  const [hayLinterna, setHayLinterna] = useState(false);
  const [linterna, setLinterna] = useState(false);
  const [tomando, setTomando] = useState(false);
  /** Ancho ÷ alto del video, para que el marco dibujado caiga donde se recorta. */
  const [relacion, setRelacion] = useState<number | null>(null);

  useEffect(() => {
    alTomar.current = onTomada;
  }, [onTomada]);

  useEffect(() => {
    if (!activa || estadoInicial() !== "pidiendo") return;
    let vivo = true;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then(async (s) => {
        if (!vivo) return s.getTracks().forEach((t) => t.stop());
        flujo.current = s;
        const v = videoRef.current;
        if (v) {
          v.srcObject = s;
          await v.play().catch((err: unknown) => logger.warn("[huella] el video no arrancó solo", { error: String(err) }));
          if (v.videoWidth && v.videoHeight) setRelacion(v.videoWidth / v.videoHeight);
        }
        const pista = s.getVideoTracks()[0];
        setHayLinterna(!!(pista?.getCapabilities?.() as ConLinterna | undefined)?.torch);
        setEstado("viva");
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        logger.warn("[huella] sin cámara", { error: String(e) });
        setEstado(e instanceof DOMException && e.name === "NotAllowedError" ? "denegada" : "sin-camara");
      });
    return () => {
      vivo = false;
      flujo.current?.getTracks().forEach((t) => t.stop());
      flujo.current = null;
      historial.current = [];
    };
  }, [activa]);

  const tomar = useCallback(async () => {
    const v = videoRef.current;
    if (!v?.videoWidth) return;
    setTomando(true);
    try {
      alTomar.current(await procesarHuella(v, cajaGuia(v.videoWidth, v.videoHeight)));
    } catch (e) {
      logger.error("[huella] no se pudo tomar", { error: String(e) });
    } finally {
      historial.current = [];
      setTomando(false);
    }
  }, []);

  /* La nitidez dentro del marco, mientras la cámara está viva y la ventana abierta. */
  useEffect(() => {
    if (!activa || estado !== "viva" || tomando) return;
    const lienzo = document.createElement("canvas");
    const id = window.setInterval(() => {
      const v = videoRef.current;
      if (!v?.videoWidth) return;
      if (!relacion) setRelacion(v.videoWidth / v.videoHeight);
      const c = cajaGuia(v.videoWidth, v.videoHeight);
      const esc = LADO_MEDIDA / Math.max(c.ancho, c.alto);
      lienzo.width = Math.max(3, Math.round(c.ancho * esc));
      lienzo.height = Math.max(3, Math.round(c.alto * esc));
      const ctx = lienzo.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(v, c.x, c.y, c.ancho, c.alto, 0, 0, lienzo.width, lienzo.height);
      const img = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
      const n = nitidez(aGris(img.data, img.width, img.height), img.width, img.height);
      historial.current = [...historial.current.slice(-5), n];
      setMedida(n);
      if (auto && debeTomar(historial.current)) void tomar();
    }, CADA_MS);
    return () => window.clearInterval(id);
  }, [activa, estado, tomando, auto, relacion, tomar]);

  const alternarLinterna = async () => {
    const pista = flujo.current?.getVideoTracks()[0];
    if (!pista) return;
    try {
      await pista.applyConstraints({ advanced: [{ torch: !linterna } as unknown as MediaTrackConstraintSet] });
      setLinterna(!linterna);
    } catch (e) {
      logger.warn("[huella] la linterna no respondió", { error: String(e) });
      setHayLinterna(false);
    }
  };

  return { videoRef, estado, medida, hayLinterna, linterna, alternarLinterna, tomar, tomando, relacion };
}
