"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";

/**
 * La cámara de ATRÁS del celular leyendo los stickers de los papeles, de
 * corrido: `BarcodeDetector` (Chrome de Android) cada 200 ms; el mismo texto
 * no se repite hasta 2,5 s después (la cámara lo sigue viendo mientras se
 * guarda el papel). Linterna si el celular la ofrece.
 *
 * Sin `https` el navegador no da la cámara (`sin_https`: el panel por la IP de
 * la PC); sin `BarcodeDetector` (Firefox, Safari, navegadores de marca) no hay
 * cómo leer el QR (`sin_lector`). En los dos queda escribir el número.
 */

export type EstadoCamara = "iniciando" | "lista" | "sin_https" | "sin_lector" | "sin_permiso" | "sin_camara";

interface Detector {
  detect: (fuente: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
}
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

const CADA_MS = 200;
const REPETIDO_MS = 2500;

function crearDetector(): Detector | null {
  const Ctor = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    return new Ctor({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

export function useCamaraSticker(onTexto: (texto: string) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pistaRef = useRef<MediaStreamTrack | null>(null);
  const [estado, setEstado] = useState<EstadoCamara>("iniciando");
  const [hayLinterna, setHayLinterna] = useState(false);
  const [linterna, setLinterna] = useState(false);
  const onTextoRef = useRef(onTexto);
  useEffect(() => {
    onTextoRef.current = onTexto;
  });

  useEffect(() => {
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setEstado("sin_https");
      return;
    }
    const detector = crearDetector();
    if (!detector) {
      setEstado("sin_lector");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setEstado("sin_camara");
      return;
    }
    let stream: MediaStream | null = null;
    let vivo = true;
    let espera: ReturnType<typeof setTimeout> | undefined;
    let ultimo = { texto: "", at: 0 };

    const vuelta = async () => {
      const v = videoRef.current;
      if (!vivo || !v) return;
      try {
        if (v.readyState >= 2) {
          const texto = (await detector.detect(v))[0]?.rawValue?.trim();
          const ahora = Date.now();
          if (vivo && texto && (texto !== ultimo.texto || ahora - ultimo.at > REPETIDO_MS)) {
            onTextoRef.current(texto);
          }
          if (texto) ultimo = { texto, at: ahora };
        }
      } catch {
        /* un cuadro que no se pudo leer: se sigue con el siguiente */
      }
      if (vivo) espera = setTimeout(vuelta, CADA_MS);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then(async (s) => {
        if (!vivo) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const pista = s.getVideoTracks()[0];
        pistaRef.current = pista ?? null;
        setHayLinterna(!!(pista?.getCapabilities?.() as { torch?: boolean } | undefined)?.torch);
        const v = videoRef.current;
        if (v) {
          v.srcObject = s;
          await v.play().catch((err: unknown) => logger.warn("[archivador] el video no arrancó", { error: String(err) }));
        }
        setEstado("lista");
        espera = setTimeout(vuelta, CADA_MS);
      })
      .catch((err: unknown) => {
        const nombre = err instanceof DOMException ? err.name : "";
        setEstado(nombre === "NotAllowedError" || nombre === "SecurityError" ? "sin_permiso" : "sin_camara");
        logger.warn("[archivador] sin cámara", { error: String(err) });
      });

    return () => {
      vivo = false;
      if (espera) clearTimeout(espera);
      stream?.getTracks().forEach((t) => t.stop());
      pistaRef.current = null;
    };
  }, []);

  const alternarLinterna = useCallback(() => {
    const pista = pistaRef.current;
    if (!pista) return;
    const prender = !linterna;
    pista
      .applyConstraints({ advanced: [{ torch: prender } as MediaTrackConstraintSet] })
      .then(() => setLinterna(prender))
      .catch((err: unknown) => logger.warn("[archivador] la linterna no respondió", { error: String(err) }));
  }, [linterna]);

  return { videoRef, estado, hayLinterna, linterna, alternarLinterna };
}
