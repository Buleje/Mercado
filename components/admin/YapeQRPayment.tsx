"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Check, Clock, Smartphone } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type QRProvider = "yape" | "plin";

interface YapeQRPaymentProps {
  amount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const PROVIDER_CONFIG: Record<QRProvider, { label: string; color: string }> = {
  yape: { label: "Yape", color: "#6C2DA4" },
  plin: { label: "Plin", color: "#00BFA5" },
};

const TIMER_SECONDS = 5 * 60;

function fmt(n: number) {
  return `S/${n.toFixed(2)}`;
}

// ── QR Canvas drawing ────────────────────────────────────────────────────────

function drawQRPattern(canvas: HTMLCanvasElement, amount: number, provider: QRProvider) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const size = canvas.width;
  const config = PROVIDER_CONFIG[provider];

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, size, size);

  const moduleSize = 8;
  const modules = Math.floor(size / moduleSize);

  const seed = Math.round(amount * 100) + (provider === "yape" ? 7919 : 1301);
  function pseudoRandom(i: number) {
    const x = Math.sin(seed + i * 9301 + 49297) * 49297;
    return x - Math.floor(x);
  }

  const finderSize = 7;
  const drawFinder = (ox: number, oy: number) => {
    ctx.fillStyle = "#000000";
    for (let r = 0; r < finderSize; r++) {
      for (let c = 0; c < finderSize; c++) {
        if (r === 0 || r === finderSize - 1 || c === 0 || c === finderSize - 1 ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
          ctx.fillRect((ox + c) * moduleSize, (oy + r) * moduleSize, moduleSize, moduleSize);
        }
      }
    }
  };

  drawFinder(1, 1);
  drawFinder(modules - finderSize - 1, 1);
  drawFinder(1, modules - finderSize - 1);

  ctx.fillStyle = "#000000";
  let idx = 0;
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      const inFinder1 = r >= 1 && r < 1 + finderSize && c >= 1 && c < 1 + finderSize;
      const inFinder2 = r >= 1 && r < 1 + finderSize && c >= modules - finderSize - 1 && c < modules - 1;
      const inFinder3 = r >= modules - finderSize - 1 && r < modules - 1 && c >= 1 && c < 1 + finderSize;
      if (inFinder1 || inFinder2 || inFinder3) continue;
      if (r === 0 || r === modules - 1 || c === 0 || c === modules - 1) continue;

      if (pseudoRandom(idx++) > 0.55) {
        ctx.fillRect(c * moduleSize, r * moduleSize, moduleSize, moduleSize);
      }
    }
  }

  // Center overlay with provider color
  const centerSize = size * 0.22;
  const centerX = (size - centerSize) / 2;
  const centerY = (size - centerSize) / 2;

  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.roundRect(centerX - 4, centerY - 4, centerSize + 8, centerSize + 8, 8);
  ctx.fill();

  ctx.fillStyle = config.color;
  ctx.beginPath();
  ctx.roundRect(centerX, centerY, centerSize, centerSize, 6);
  ctx.fill();

  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold ${Math.round(centerSize * 0.55)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(config.label[0], size / 2, size / 2);
}

// ── Component ────────────────────────────────────────────────────────────────

export default function YapeQRPayment({ amount, onConfirm, onCancel }: YapeQRPaymentProps) {
  const [provider, setProvider] = useState<QRProvider>("yape");
  const [secondsLeft, setSecondsLeft] = useState(TIMER_SECONDS);
  const [expired, setExpired] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) drawQRPattern(canvas, amount, provider);
  }, [provider, amount]);

  useEffect(() => {
    setSecondsLeft(TIMER_SECONDS);
    setExpired(false);
  }, [provider]);

  useEffect(() => {
    if (expired) return;
    const interval = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          setExpired(true);
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [expired, provider]);

  const handleRegenerate = useCallback(() => {
    setSecondsLeft(TIMER_SECONDS);
    setExpired(false);
    const canvas = canvasRef.current;
    if (canvas) drawQRPattern(canvas, amount + Math.random() * 0.001, provider);
  }, [amount, provider]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const config = PROVIDER_CONFIG[provider];
  const timerPercent = (secondsLeft / TIMER_SECONDS) * 100;

  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl  overflow-hidden">
      {/* Tabs */}
      <div className="flex">
        {(["yape", "plin"] as const).map(p => {
          const cfg = PROVIDER_CONFIG[p];
          const active = provider === p;
          return (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold transition-all",
                active
                  ? "text-white"
                  : "text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] bg-gray-50 dark:bg-surface"
              )}
              style={active ? { backgroundColor: cfg.color } : undefined}
            >
              <Smartphone className="h-4 w-4" />
              {cfg.label}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div className="p-4 sm:p-6 space-y-4">
        {/* Amount */}
        <div className="text-center">
          <p className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted mb-1">Monto a cobrar</p>
          <p className="text-3xl sm:text-4xl font-extrabold" style={{ color: config.color }}>
            {fmt(amount)}
          </p>
        </div>

        {/* QR Code */}
        <div className="flex justify-center">
          <div
            className={cn(
              "relative rounded-xl p-3 border-2 transition-colors",
              expired ? "border-[var(--rule-base)] dark:border-[var(--rule-base)] opacity-50" : ""
            )}
            style={!expired ? { borderColor: config.color } : undefined}
          >
            <canvas ref={canvasRef} width={240} height={240} className="rounded-lg" />
            {expired && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 dark:bg-[var(--surface-raised)]/80 rounded-xl">
                <Clock className="h-8 w-8 text-[var(--text-tertiary)] dark:text-muted mb-2" />
                <p className="text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">QR expirado</p>
                <button
                  onClick={handleRegenerate}
                  className="mt-2 px-4 py-1.5 rounded-lg text-xs font-bold text-white transition-colors"
                  style={{ backgroundColor: config.color }}
                >
                  Generar nuevo QR
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className={cn(
          "rounded-xl p-3 text-center",
          provider === "yape" ? "bg-[var(--surface-sunken)]" : "bg-teal-50 dark:bg-teal-950/20"
        )}>
          <p className="text-xs font-semibold" style={{ color: config.color }}>
            Pide al cliente que escanee el QR con {config.label}
          </p>
          <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)] dark:text-muted mt-1">
            Abre {config.label} &gt; Escanear QR &gt; Confirmar pago de {fmt(amount)}
          </p>
        </div>

        {/* Timer */}
        {!expired && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[var(--text-secondary)] dark:text-muted flex items-center gap-1">
                <Clock className="h-3 w-3" /> Tiempo restante
              </span>
              <span className={cn(
                "font-bold tabular-nums",
                secondsLeft <= 60 ? "text-[var(--data-error-500)]" : "text-[var(--text-primary)] dark:text-[var(--text-primary)]"
              )}>
                {minutes}:{seconds.toString().padStart(2, "0")}
              </span>
            </div>
            <div className="w-full h-1.5 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-[var(--dur-slower)] ease-linear"
                style={{
                  width: `${timerPercent}%`,
                  backgroundColor: secondsLeft <= 60 ? "#ef4444" : config.color,
                }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted font-bold text-sm hover:bg-gray-50 dark:hover:bg-surface transition-colors flex items-center justify-center gap-1.5"
          >
            <X className="h-4 w-4" />
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={expired}
            className="flex-1 py-3 rounded-lg text-white font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 bg-primary/10 hover:bg-primary/10 disabled:bg-gray-400"
          >
            <Check className="h-4 w-4" />
            Pago recibido
          </button>
        </div>
      </div>
    </div>
  );
}
