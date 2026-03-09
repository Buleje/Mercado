﻿"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, X, Loader2 } from "lucide-react";

type Props = {
  onDetected: (code: string) => void;
  onClose: () => void;
};

export default function BarcodeScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(true);
  const detectedRef = useRef(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStarting(false);
        scanLoop();
      } catch {
        setError("No se pudo acceder a la cámara. Verifica los permisos.");
        setStarting(false);
      }
    }

    async function scanLoop() {
      // Dynamically import Quagga to avoid SSR issues
      const Quagga = (await import("@ericblade/quagga2")).default;

      const tick = () => {
        if (cancelled || detectedRef.current || !videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video.readyState !== video.HAVE_ENOUGH_DATA) {
          requestAnimationFrame(tick);
          return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(video, 0, 0);

        Quagga.decodeSingle(
          {
            src: canvas.toDataURL("image/png"),
            numOfWorkers: 0,
            inputStream: { size: 800 },
            decoder: {
              readers: [
                "ean_reader",
                "ean_8_reader",
                "upc_reader",
                "upc_e_reader",
                "code_128_reader",
                "code_39_reader",
              ],
            },
          },
          (result) => {
            if (result?.codeResult?.code && !detectedRef.current) {
              detectedRef.current = true;
              onDetected(result.codeResult.code);
            } else if (!cancelled) {
              setTimeout(() => requestAnimationFrame(tick), 200);
            }
          }
        );
      };

      requestAnimationFrame(tick);
    }

    start();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [onDetected, stopCamera]);

  return (
    <div className="fixed inset-0 z-9000 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-card rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-card-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            <h3 className="font-bold text-gray-900 dark:text-foreground">Escanear código de barras</h3>
          </div>
          <button
            onClick={() => { stopCamera(); onClose(); }}
            className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative bg-black aspect-video">
          {starting && (
            <div className="absolute inset-0 flex items-center justify-center text-white">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center text-red-400 text-sm text-center p-4">
              {error}
            </div>
          )}
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />
          <canvas ref={canvasRef} className="hidden" />
          {/* Scan guide overlay */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-64 h-32 border-2 border-white/60 rounded-lg" />
          </div>
        </div>

        <div className="px-4 py-3 text-center">
          <p className="text-sm text-gray-500 dark:text-muted">
            Apunta la cámara al código de barras del producto
          </p>
        </div>
      </div>
    </div>
  );
}
