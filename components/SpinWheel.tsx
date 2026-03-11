"use client";

import { useState, useRef, useEffect, startTransition, useCallback } from "react";
import { Gift, X } from "lucide-react";

const SEGMENTS = [
  { label: "5% OFF", color: "#ef4444", value: 5 },
  { label: "Envío gratis", color: "#3b82f6", value: 0 },
  { label: "3% OFF", color: "#f59e0b", value: 3 },
  { label: "¡Intenta de nuevo!", color: "#6b7280", value: -1 },
  { label: "10% OFF", color: "#8b5cf6", value: 10 },
  { label: "S/2 OFF", color: "#3b82f6", value: 2 },
  { label: "S/5 OFF", color: "#ec4899", value: 5 },
  { label: "Sorpresa 🎁", color: "#818cf8", value: 0 },
];

const STORAGE_KEY = "bsm-spin-played";
const SEG_COUNT = SEGMENTS.length;
const SEG_ANGLE = 360 / SEG_COUNT;

export default function SpinWheel() {
  const [show, setShow] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<typeof SEGMENTS[0] | null>(null);
  const [rotation, setRotation] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const played = localStorage.getItem(STORAGE_KEY);
    if (!played) {
      const timer = setTimeout(() => startTransition(() => setShow(true)), 15_000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Draw wheel
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const size = canvas.width;
    const center = size / 2;
    const radius = center - 4;

    ctx.clearRect(0, 0, size, size);

    SEGMENTS.forEach((seg, i) => {
      const startAngle = (i * SEG_ANGLE - 90) * (Math.PI / 180);
      const endAngle = ((i + 1) * SEG_ANGLE - 90) * (Math.PI / 180);

      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Text
      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(startAngle + (endAngle - startAngle) / 2);
      ctx.textAlign = "right";
      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px system-ui";
      ctx.fillText(seg.label, radius - 12, 4);
      ctx.restore();
    });

    // Center circle
    ctx.beginPath();
    ctx.arc(center, center, 18, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [show]);

  const spin = useCallback(() => {
    if (spinning) return;
    setSpinning(true);

    const winIdx = Math.floor(Math.random() * SEG_COUNT);
    // Calculate rotation: 5 full spins + land on the winning segment
    const targetAngle = 360 * 5 + (360 - winIdx * SEG_ANGLE - SEG_ANGLE / 2);
    setRotation((prev) => prev + targetAngle);

    setTimeout(() => {
      setSpinning(false);
      setResult(SEGMENTS[winIdx]);
      localStorage.setItem(STORAGE_KEY, Date.now().toString());
    }, 4000);
  }, [spinning]);

  const dismiss = () => {
    setShow(false);
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative bg-card rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center">
        {/* Close */}
        <button type="button" onClick={dismiss} className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
          <X className="w-5 h-5 text-muted" />
        </button>

        {!result ? (
          <>
            <div className="flex items-center justify-center gap-2 mb-4">
              <Gift className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-extrabold text-foreground">¡Gira y gana!</h3>
            </div>
            <p className="text-sm text-muted mb-5">Tienes un giro gratis. ¡Prueba tu suerte!</p>

            {/* Wheel */}
            <div className="relative mx-auto w-60 h-60 mb-5">
              {/* Arrow pointer */}
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10 w-0 h-0 border-l-8 border-r-8 border-t-12 border-l-transparent border-r-transparent border-t-primary" />
              <canvas
                ref={canvasRef}
                width={240}
                height={240}
                className="w-full h-full rounded-full"
                style={{
                  transform: `rotate(${rotation}deg)`,
                  transition: spinning ? "transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)" : "none",
                }}
              />
            </div>

            <button
              type="button"
              onClick={spin}
              disabled={spinning}
              className="w-full py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {spinning ? "Girando..." : "¡GIRAR!"}
            </button>
          </>
        ) : (
          <>
            <div className="py-6">
              <div className="text-5xl mb-4">🎉</div>
              <h3 className="text-xl font-extrabold text-foreground mb-2">
                {result.value === -1 ? "¡Casi lo logras!" : "¡Felicidades!"}
              </h3>
              <p className="text-sm text-muted mb-4">
                {result.value === -1
                  ? "No te preocupes, hay más sorpresas esperándote"
                  : `Ganaste: ${result.label}`}
              </p>
              {result.value !== -1 && (
                <div className="bg-primary/10 rounded-xl px-4 py-3 mb-4">
                  <p className="text-lg font-extrabold text-primary">{result.label}</p>
                  <p className="text-xs text-muted mt-1">Se aplica automáticamente en tu próxima compra</p>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="w-full py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-colors"
            >
              ¡Genial, ir a comprar!
            </button>
          </>
        )}
      </div>
    </div>
  );
}
