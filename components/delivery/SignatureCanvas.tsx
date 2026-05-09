"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { Trash2, Check } from "@buleje/design-system/icons";

interface SignatureCanvasProps {
  onConfirm: (dataUrl: string) => void;
  onClear?: () => void;
  className?: string;
}

export default function SignatureCanvas({
  onConfirm,
  onClear,
  className = "",
}: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const [hasStrokes, setHasStrokes] = useState(false);

  // Ajustar resolución para pantallas retina
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio ?? 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  useEffect(() => {
    setupCanvas();
    window.addEventListener("resize", setupCanvas);
    return () => window.removeEventListener("resize", setupCanvas);
  }, [setupCanvas]);

  function getPos(
    e: React.TouchEvent | React.MouseEvent,
    canvas: HTMLCanvasElement
  ): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    }
    return {
      x: (e as React.MouseEvent).clientX - rect.left,
      y: (e as React.MouseEvent).clientY - rect.top,
    };
  }

  function startDrawing(e: React.TouchEvent | React.MouseEvent) {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    isDrawingRef.current = true;
    lastPosRef.current = getPos(e, canvas);
  }

  function draw(e: React.TouchEvent | React.MouseEvent) {
    e.preventDefault();
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !lastPosRef.current) return;

    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPosRef.current = pos;
    setHasStrokes(true);
  }

  function stopDrawing() {
    isDrawingRef.current = false;
    lastPosRef.current = null;
  }

  function handleClear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio ?? 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setHasStrokes(false);
    onClear?.();
  }

  function handleConfirm() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Exportar como PNG base64
    const dataUrl = canvas.toDataURL("image/png");
    onConfirm(dataUrl);
  }

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        Firma del cliente
      </p>

      {/* Canvas de firma */}
      <div className="relative rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 overflow-hidden touch-none">
        <canvas
          ref={canvasRef}
          className="w-full h-32 cursor-crosshair block"
          style={{ touchAction: "none" }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        {!hasStrokes && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-gray-400 dark:text-gray-600 select-none">
              Firmar aqui
            </p>
          </div>
        )}
      </div>

      {/* Botones */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleClear}
          className="
            flex items-center justify-center gap-2
            min-h-[44px] rounded-xl
            bg-[var(--surface-sunken)] dark:bg-gray-800
            text-gray-700 dark:text-gray-300
            font-semibold text-sm
            hover:bg-[var(--rule-soft)] dark:hover:bg-gray-700
            active:scale-95 transition-all
          "
        >
          <Trash2 className="h-4 w-4" />
          Limpiar
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!hasStrokes}
          className="
            flex items-center justify-center gap-2
            min-h-[44px] rounded-xl
            bg-[var(--accent)] hover:bg-[var(--accent-dark)]
            text-white font-bold text-sm
            active:scale-95 transition-all
            disabled:opacity-40 disabled:cursor-not-allowed
          "
        >
          <Check className="h-4 w-4" />
          Confirmar
        </button>
      </div>
    </div>
  );
}
