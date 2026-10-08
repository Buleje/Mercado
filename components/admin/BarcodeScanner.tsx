"use client";

import { CardTitle, LoadingState } from "@buleje/design-system";
import { useEffect, useId, useRef, useState, useCallback, type ReactNode } from "react";
import { Camera, X, SwitchCamera, Flashlight, FlashlightOff } from "@buleje/design-system/icons";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";

type Props = {
  onDetected: (code: string) => void;
  onClose: () => void;
  /**
   * Sigue leyendo después de cada código (escanear una pila de trozas de
   * corrido). El mismo código no se vuelve a leer hasta pasados unos segundos:
   * la cámara lo sigue viendo mientras el operario mueve el celular.
   */
  continuo?: boolean;
  /** Lo que se muestra bajo el video — en modo continuo, el resultado de la última lectura. */
  pie?: ReactNode;
};

/** En modo continuo: pausa entre lecturas y ventana en que el MISMO código se ignora. */
const PAUSA_CONTINUO_MS = 1200;
const REPETIDO_MS = 3000;

const BEEP_FREQ = 1800;
const BEEP_DURATION = 150;

function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = BEEP_FREQ;
    gain.gain.value = 0.3;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + BEEP_DURATION / 1000);
    setTimeout(() => ctx.close(), BEEP_DURATION + 100);
  } catch {
    // AudioContext not available
  }
}

export default function BarcodeScanner({ onDetected, onClose, continuo = false, pie }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectedRef = useRef(false);
  const scanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tituloId = useId();
  /* El lazo de lectura se arma una vez al montar: sin el ref, en modo continuo
     cada lectura llamaría al `onDetected` del primer render, con datos viejos. */
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);
  const ultimoRef = useRef<{ codigo: string; en: number } | null>(null);

  const [error, setError] = useState("");
  const [starting, setStarting] = useState(true);
  const [supported, setSupported] = useState(true);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);

  const stopCamera = useCallback(() => {
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const cerrar = useCallback(() => {
    stopCamera();
    onClose();
  }, [stopCamera, onClose]);

  useModalAccesible(panelRef, { onCerrar: cerrar, activo: true });
  const ventana = useVentanaDeModal(true, { ref: panelRef, asaAutomatica: true, aplicarTranslate: true, claveMemoria: "admin-escaner-codigo-barras" });

  const startCamera = useCallback(async (facing: "environment" | "user") => {
    stopCamera();
    setStarting(true);
    setError("");
    detectedRef.current = false;

    if (!window.BarcodeDetector) {
      setSupported(false);
      setStarting(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;

      // Check torch capability
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities?.() as Record<string, unknown> | undefined;
      setHasTorch(!!caps?.torch);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStarting(false);

      // Start scan loop
      const detector = new BarcodeDetector({
        formats: ["ean_13", "ean_8", "code_128", "qr_code", "upc_a", "upc_e"],
      });

      scanTimerRef.current = setInterval(async () => {
        if (detectedRef.current || !videoRef.current) return;
        const video = videoRef.current;
        if (video.readyState < video.HAVE_ENOUGH_DATA) return;

        try {
          const results = await detector.detect(video);
          if (results.length > 0 && !detectedRef.current) {
            const code = results[0].rawValue;
            const previo = ultimoRef.current;
            if (continuo && previo && previo.codigo === code && Date.now() - previo.en < REPETIDO_MS) return;
            detectedRef.current = true;
            ultimoRef.current = { codigo: code, en: Date.now() };
            playBeep();
            try { navigator.vibrate?.(200); } catch { /* not supported */ }
            onDetectedRef.current(code);
            if (continuo) setTimeout(() => { detectedRef.current = false; }, PAUSA_CONTINUO_MS);
          }
        } catch {
          // detect() can fail on some frames, just skip
        }
      }, 500);
    } catch {
      setError("No se pudo acceder a la cámara. Verifica los permisos.");
      setStarting(false);
    }
  }, [stopCamera, continuo]);

  useEffect(() => {
    startCamera(facingMode);
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSwitchCamera = () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    setTorchOn(false);
    startCamera(next);
  };

  const handleToggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      // Torch not available
    }
  };

  return (
    <div className="fixed inset-0 z-system bg-black/80 flex items-center justify-center p-4" onClick={() => { if (!ventana.fijado) cerrar(); }}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="relative bg-[var(--surface-raised)] rounded-xl w-full max-w-lg overflow-hidden"
      >
        {/* Header */}
        <div className="px-2 sm:px-4 py-2 sm:py-3 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            <CardTitle id={tituloId} className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Escanear código de barras</CardTitle>
          </div>
          <div className="flex items-center gap-1">
          <ControlesDeVentana ventana={ventana} />
          <button aria-label="Cerrar"
            onClick={cerrar}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          </div>
        </div>

        {/* Video area */}
        <div className="relative bg-black aspect-video">
          {starting && <LoadingState variant="overlay" message="" />}
          {!supported && (
            <div className="absolute inset-0 flex items-center justify-center text-[var(--data-warning-500)] text-sm text-center p-6">
              <div>
                <p className="font-bold mb-2">Navegador no compatible</p>
                <p>Tu navegador no soporta el escáner de códigos de barras. Usa Chrome o Edge para esta función.</p>
              </div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center text-[var(--data-error-500)] text-sm text-center p-4">
              {error}
            </div>
          )}
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />
          {/* Scan guide overlay with animated red line */}
          {!error && supported && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-64 h-32 border-2 border-white/60 rounded-lg relative overflow-hidden">
                <div className="absolute left-0 right-0 h-0.5 bg-[var(--data-error-500)] shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-[scanline_2s_ease-in-out_infinite]" />
              </div>
            </div>
          )}
        </div>

        {pie && (
          <div className="border-b border-[var(--rule-soft)] px-2 py-2 sm:px-4" aria-live="polite">
            {pie}
          </div>
        )}

        {/* Controls */}
        <div className="px-2 sm:px-4 py-2 sm:py-3 flex items-center justify-between">
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted">
            Apunta la cámara al código de barras
          </p>
          <div className="flex items-center gap-2">
            {hasTorch && (
              <button
                onClick={handleToggleTorch}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[var(--text-secondary)] dark:text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                title={torchOn ? "Apagar linterna" : "Encender linterna"}
              >
                {torchOn
                  ? <FlashlightOff className="h-4 w-4" />
                  : <Flashlight className="h-4 w-4" />}
              </button>
            )}
            <button
              onClick={handleSwitchCamera}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[var(--text-secondary)] dark:text-muted hover:text-primary hover:bg-primary/10 transition-colors"
              title="Cambiar cámara"
            >
              <SwitchCamera className="h-4 w-4" />
            </button>
          </div>
        </div>
        <TiradorDeVentana ventana={ventana} />
      </div>

      {/* Scanline animation keyframes */}
      <style>{`
        @keyframes scanline {
          0%, 100% { top: 10%; }
          50% { top: 85%; }
        }
      `}</style>
    </div>
  );
}
