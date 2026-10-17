"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";

/**
 * La cámara frontal de la tablet del kiosko: queda prendida mientras la
 * página está abierta (prenderla cada vez tarda 1-2 s), lee el QR del
 * fotocheck con `BarcodeDetector` (Chrome de Android/ChromeOS/Mac; sin él se
 * tipea el DNI) y saca la foto del momento como JPEG.
 */

export type EstadoCamara = "iniciando" | "lista" | "sin_camara" | "sin_permiso";

interface Detector {
  detect: (fuente: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
}
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

const CADA_MS = 250;

function crearDetector(): Detector | null {
  const Ctor = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    return new Ctor({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

export function useCamaraKiosko(escaneando: boolean, onCodigo: (texto: string) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [estado, setEstado] = useState<EstadoCamara>("iniciando");
  const [leeQr, setLeeQr] = useState(false);
  const detectorRef = useRef<Detector | null>(null);
  const onCodigoRef = useRef(onCodigo);
  useEffect(() => {
    onCodigoRef.current = onCodigo;
  });

  // Prender la cámara una vez.
  useEffect(() => {
    let stream: MediaStream | null = null;
    let vigente = true;
    detectorRef.current = crearDetector();
    setLeeQr(detectorRef.current != null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setEstado("sin_camara");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then(async (s) => {
        if (!vigente) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const v = videoRef.current;
        if (v) {
          v.srcObject = s;
          await v.play().catch((err: unknown) => logger.warn("[kiosko] el video no arrancó", { error: String(err) }));
        }
        setEstado("lista");
      })
      .catch((err: unknown) => {
        const nombre = err instanceof DOMException ? err.name : "";
        setEstado(nombre === "NotAllowedError" || nombre === "SecurityError" ? "sin_permiso" : "sin_camara");
        logger.warn("[kiosko] sin cámara", { error: String(err) });
      });
    return () => {
      vigente = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Buscar un QR mientras se espera a la persona.
  useEffect(() => {
    if (!escaneando || estado !== "lista" || !detectorRef.current) return;
    let vivo = true;
    let espera: ReturnType<typeof setTimeout> | undefined;
    const vuelta = async () => {
      const v = videoRef.current;
      const det = detectorRef.current;
      if (!vivo || !v || !det) return;
      try {
        if (v.readyState >= 2) {
          const hallados = await det.detect(v);
          const texto = hallados[0]?.rawValue?.trim();
          if (vivo && texto) {
            onCodigoRef.current(texto);
            return;
          }
        }
      } catch {
        /* un cuadro que no se pudo leer: se sigue con el siguiente */
      }
      if (vivo) espera = setTimeout(vuelta, CADA_MS);
    };
    espera = setTimeout(vuelta, CADA_MS);
    return () => {
      vivo = false;
      if (espera) clearTimeout(espera);
    };
  }, [escaneando, estado]);

  /** La foto del momento (JPEG), o `null` si no hay cámara. */
  const capturar = useCallback(async (): Promise<Blob | null> => {
    const v = videoRef.current;
    if (!v || estado !== "lista" || v.videoWidth === 0) return null;
    const lienzo = document.createElement("canvas");
    const escala = Math.min(1, 960 / v.videoWidth);
    lienzo.width = Math.round(v.videoWidth * escala);
    lienzo.height = Math.round(v.videoHeight * escala);
    lienzo.getContext("2d")?.drawImage(v, 0, 0, lienzo.width, lienzo.height);
    return new Promise((resolve) => lienzo.toBlob((b) => resolve(b), "image/jpeg", 0.82));
  }, [estado]);

  return { videoRef, estado, leeQr, capturar };
}
