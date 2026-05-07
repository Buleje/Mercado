"use client";

import { CardTitle, LoadingState } from "@buleje/design-system";
import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, X, Loader2, SwitchCamera, Flashlight, FlashlightOff } from "@buleje/design-system/icons";

type Props = {
  onDetected: (code: string) => void;
  onClose: () => void;
};

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

export default function BarcodeScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectedRef = useRef(false);
  const scanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
            detectedRef.current = true;
            const code = results[0].rawValue;
            playBeep();
            try { navigator.vibrate?.(200); } catch { /* not supported */ }
            onDetected(code);
          }
        } catch {
          // detect() can fail on some frames, just skip
        }
      }, 500);
    } catch {
      setError("No se pudo acceder a la cámara. Verifica los permisos.");
      setStarting(false);
    }
  }, [stopCamera, onDetected]);

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
    <div className="fixed inset-0 z-9000 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-card rounded-xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="px-2 sm:px-4 py-2 sm:py-3 border-b border-[var(--rule-soft)] dark:border-card-border flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            <CardTitle className="font-bold text-[var(--text-primary)] dark:text-foreground">Escanear código de barras</CardTitle>
          </div>
          <button
            onClick={() => { stopCamera(); onClose(); }}
            className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
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

        {/* Controls */}
        <div className="px-2 sm:px-4 py-2 sm:py-3 flex items-center justify-between">
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted">
            Apunta la cámara al código de barras
          </p>
          <div className="flex items-center gap-2">
            {hasTorch && (
              <button
                onClick={handleToggleTorch}
                className="p-2 rounded-lg text-[var(--text-secondary)] dark:text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                title={torchOn ? "Apagar linterna" : "Encender linterna"}
              >
                {torchOn
                  ? <FlashlightOff className="h-4 w-4" />
                  : <Flashlight className="h-4 w-4" />}
              </button>
            )}
            <button
              onClick={handleSwitchCamera}
              className="p-2 rounded-lg text-[var(--text-secondary)] dark:text-muted hover:text-primary hover:bg-primary/10 transition-colors"
              title="Cambiar cámara"
            >
              <SwitchCamera className="h-4 w-4" />
            </button>
          </div>
        </div>
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
