"use client";

/**
 * Tomar la foto del comprobante SIN salir del formulario.
 *
 * POR QUÉ. El adelanto se registra en el momento en que sale la plata, muchas
 * veces desde el celular y con el recibo en la mano. «Adjuntar archivo» obliga a
 * sacar la foto con la cámara del sistema, buscarla en la galería y volver — tres
 * pasos que en el mostrador terminan en «después la subo», que es nunca.
 *
 * CÓMO. `getUserMedia` con la cámara trasera si hay (`environment`), preview
 * para poder repetirla antes de subir, y recién ahí el POST. Se sube lo mismo
 * que el adjuntar de siempre (`/api/upload`), así que del otro lado no cambia
 * nada.
 *
 * Si el navegador no da permiso o no hay cámara, lo dice y no rompe: el botón de
 * adjuntar archivo sigue estando al lado.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, X } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";

/** Calidad de JPEG: un recibo se lee perfecto y pesa un tercio que el PNG. */
const CALIDAD = 0.85;

export default function CapturaFoto({
  onSubida,
  onCerrar,
}: {
  onSubida: (url: string) => void;
  onCerrar: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [tomada, setTomada] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Apagar la cámara al salir: dejarla prendida enciende el LED y gasta batería. */
  const apagar = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const encender = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // `environment` = cámara trasera en el celular, que es la que apunta al
        // papel. En una laptop no existe y el navegador cae a la que haya.
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      logger.error("[adelantos] no se pudo abrir la cámara", { error: String(err) });
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "No diste permiso para usar la cámara. Podés adjuntar la foto desde el archivo."
          : "No se encontró una cámara disponible. Podés adjuntar la foto desde el archivo.",
      );
    }
  }, []);

  useEffect(() => {
    void encender();
    return apagar;
  }, [encender, apagar]);

  const capturar = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    setTomada(canvas.toDataURL("image/jpeg", CALIDAD));
    // La cámara se apaga en cuanto hay foto: mientras se decide si sirve, no
    // tiene sentido seguir filmando.
    apagar();
  };

  const repetir = () => {
    setTomada(null);
    void encender();
  };

  const usar = async () => {
    if (!tomada) return;
    setSubiendo(true);
    setError(null);
    try {
      const blob = await (await fetch(tomada)).blob();
      const fd = new FormData();
      fd.append("file", new File([blob], `comprobante-${Date.now()}.jpg`, { type: "image/jpeg" }));
      fd.append("folder", "media");
      const r = await fetch("/api/upload", {
        method: "POST",
        headers: csrfHeaders(),
        credentials: "include",
        body: fd,
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.url) throw new Error(j?.error ?? `HTTP ${r.status}`);
      onSubida(j.url);
      onCerrar();
    } catch (err) {
      logger.error("[adelantos] no se pudo subir la foto", { error: String(err) });
      setError("No se pudo subir la foto. Probá de nuevo o adjuntala desde el archivo.");
    } finally {
      setSubiendo(false);
    }
  };

  return (
    /* z-[60]: por encima del modal de alta (z-50), que sigue montado detrás. */
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onCerrar}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Tomar foto del comprobante"
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]"
      >
        <div className="flex items-center justify-between px-5 py-3">
          <p className="text-base font-extrabold text-[var(--text-primary)]">Foto del comprobante</p>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative aspect-[4/3] bg-black">
          {tomada ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL local, aún sin subir
            <img src={tomada} alt="Comprobante recién tomado" className="h-full w-full object-contain" />
          ) : (
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
          )}
        </div>

        {error && (
          <p className="px-5 pt-3 text-sm font-semibold text-[var(--data-error)]">{error}</p>
        )}

        <div className="flex gap-2 px-5 py-4">
          {tomada ? (
            <>
              <button
                onClick={repetir}
                disabled={subiendo}
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] text-base font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" /> Repetir
              </button>
              <button
                onClick={() => void usar()}
                disabled={subiendo}
                className="h-12 flex-1 rounded-2xl bg-primary text-base font-bold text-white hover:bg-primary-dark disabled:opacity-50"
              >
                {subiendo ? "Subiendo…" : "Usar esta foto"}
              </button>
            </>
          ) : (
            <button
              onClick={capturar}
              disabled={Boolean(error)}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-white hover:bg-primary-dark disabled:opacity-50"
            >
              <Camera className="h-5 w-5" /> Tomar foto
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
