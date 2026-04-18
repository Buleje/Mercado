"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import { Camera, RotateCcw, Check, Upload, X, AlertCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  onCapture: (base64: string) => void;
  onClose?: () => void;
  className?: string;
}

type CaptureState = "idle" | "streaming" | "captured" | "error";

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProductPhotoCapture({ onCapture, onClose, className }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<CaptureState>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [cameraSupported, setCameraSupported] = useState(true);

  useEffect(() => {
    const supported =
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices &&
      !!navigator.mediaDevices.getUserMedia;
    setCameraSupported(supported);
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  const startCamera = useCallback(async () => {
    setError("");
    setState("idle");

    if (!cameraSupported) {
      setError("Este dispositivo no tiene cámara disponible.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setState("streaming");
    } catch (err: unknown) {
      const msg =
        err instanceof Error && err.name === "NotAllowedError"
          ? "Permiso de cámara denegado. Habilítelo en la configuración del navegador."
          : "No se pudo acceder a la cámara.";
      setError(msg);
      setState("error");
    }
  }, [cameraSupported]);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL("image/jpeg", 0.85);

    stopStream();
    setPreview(base64);
    setState("captured");
  }, [stopStream]);

  const retake = useCallback(() => {
    setPreview(null);
    setState("idle");
    startCamera();
  }, [startCamera]);

  const usePhoto = useCallback(() => {
    if (preview) {
      onCapture(preview);
    }
  }, [preview, onCapture]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        setPreview(result);
        setState("captured");
      };
      reader.readAsDataURL(file);
    },
    []
  );

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-[var(--rule-base)] bg-white p-4",
        "dark:border-[var(--rule-base)] dark:bg-gray-900",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            Foto del producto
          </span>
        </div>
        {onClose && (
          <button
            onClick={() => {
              stopStream();
              onClose();
            }}
            className="rounded-md p-1 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-tertiary)]"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--data-error)] bg-[var(--data-error-50)] p-3 dark:border-[var(--data-error)] dark:bg-[var(--data-error)]/20">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-error)] dark:text-[var(--data-error)]" />
          <p className="text-xs text-[var(--data-error)] dark:text-[var(--data-error)]">{error}</p>
        </div>
      )}

      {/* Video stream */}
      <div
        className={cn(
          "relative overflow-hidden rounded-lg bg-gray-900",
          state !== "streaming" && "hidden"
        )}
        style={{ aspectRatio: "16/9" }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-48 w-64 rounded-lg border-2 border-dashed border-white/60" />
        </div>
      </div>

      {/* Preview */}
      {state === "captured" && preview && (
        <div
          className="relative overflow-hidden rounded-lg bg-[var(--surface-sunken)]"
          style={{ aspectRatio: "16/9" }}
        >
          <Image
            src={preview}
            alt="Foto capturada"
            fill
            sizes="(max-width: 768px) 100vw, 400px"
            className="object-cover"
            unoptimized
          />
        </div>
      )}

      {/* Idle placeholder */}
      {state === "idle" && !error && (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-[var(--rule-base)] bg-gray-50 dark:border-[var(--rule-base)] dark:bg-gray-800/50"
          style={{ aspectRatio: "16/9" }}
        >
          <Camera className="h-10 w-10 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]" />
          <p className="text-sm text-[var(--text-tertiary)]">
            Presiona &ldquo;Abrir camara&rdquo; para comenzar
          </p>
        </div>
      )}

      {/* Canvas oculto para captura */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {state === "idle" || state === "error" ? (
          <>
            {cameraSupported && (
              <button
                onClick={startCamera}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-[#245a40]"
              >
                <Camera className="h-4 w-4" />
                Abrir cámara
              </button>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border border-[var(--rule-base)] px-4 py-2 text-sm font-medium",
                "text-[var(--text-primary)] transition hover:bg-gray-50 dark:border-gray-600 dark:text-[var(--text-tertiary)] dark:hover:bg-gray-800",
                !cameraSupported && "flex-1"
              )}
            >
              <Upload className="h-4 w-4" />
              {cameraSupported ? "Subir imagen" : "Seleccionar imagen"}
            </button>
          </>
        ) : state === "streaming" ? (
          <button
            onClick={capturePhoto}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-[#245a40]"
          >
            <Camera className="h-4 w-4" />
            Tomar foto
          </button>
        ) : (
          <>
            <button
              onClick={usePhoto}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-[#245a40]"
            >
              <Check className="h-4 w-4" />
              Usar foto
            </button>
            <button
              onClick={retake}
              className="flex items-center justify-center gap-2 rounded-lg border border-[var(--rule-base)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-gray-50 dark:border-gray-600 dark:text-[var(--text-tertiary)] dark:hover:bg-gray-800"
            >
              <RotateCcw className="h-4 w-4" />
              Retomar
            </button>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
