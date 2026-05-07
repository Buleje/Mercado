"use client";

import { useState, useRef, useEffect, startTransition, useCallback } from "react";
import { Gift, X, Copy, Check, Sparkles, Trophy, RefreshCw } from "@buleje/design-system/icons";

// Paleta cohesiva — colores vibrantes pero coordinados (no random RGB).
// Alterna entre "premio" (warm) y "neutral" (cool) para legibilidad.
const SEGMENTS = [
  { label: "10% OFF", color: "#e11d48", value: 10, kind: "percent" as const },
  { label: "Envío GRATIS", color: "#0ea5e9", value: 0, kind: "freedelivery" as const },
  { label: "5% OFF", color: "#f97316", value: 5, kind: "percent" as const },
  { label: "Otra vez", color: "#475569", value: -1, kind: "tryagain" as const },
  { label: "15% OFF", color: "#9333ea", value: 15, kind: "percent" as const },
  { label: "S/5 OFF", color: "#0d9488", value: 5, kind: "fixed" as const },
  { label: "S/2 OFF", color: "#ca8a04", value: 2, kind: "fixed" as const },
  { label: "Sorpresa", color: "#db2777", value: 0, kind: "surprise" as const },
];

const STORAGE_KEY = "buleje-spin-played";
const COUPON_KEY = "buleje-spin-coupon";
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const SEG_COUNT = SEGMENTS.length;
const SEG_ANGLE = 360 / SEG_COUNT;

export default function SpinWheel() {
  const [show, setShow] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<typeof SEGMENTS[0] | null>(null);
  const [rotation, setRotation] = useState(0);
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const played = localStorage.getItem(STORAGE_KEY);
    if (played) {
      // Allow replay after 7 days
      const ts = parseInt(played, 10);
      if (!isNaN(ts) && Date.now() - ts < SEVEN_DAYS) return;
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(COUPON_KEY);
    }

    let triggered = false;
    const trigger = () => {
      if (triggered) return;
      triggered = true;
      startTransition(() => setShow(true));
      window.removeEventListener("scroll", handleScroll);
      clearTimeout(timer);
    };

    // Trigger on 60% scroll OR 35s, whichever comes first
    const handleScroll = () => {
      const scrollPct = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
      if (scrollPct >= 0.6) trigger();
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    const timer = setTimeout(trigger, 35_000);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      clearTimeout(timer);
    };
  }, []);

  // Draw wheel — alta resolución (DPR-aware) + tipografía grande
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // High-DPR rendering (retina friendly)
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const cssSize = 320;
    canvas.width = cssSize * dpr;
    canvas.height = cssSize * dpr;
    canvas.style.width = `${cssSize}px`;
    canvas.style.height = `${cssSize}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const size = cssSize;
    const center = size / 2;
    const radius = center - 8;

    ctx.clearRect(0, 0, size, size);

    // Outer ring (sombra + borde)
    ctx.beginPath();
    ctx.arc(center, center, radius + 6, 0, Math.PI * 2);
    ctx.fillStyle = "#0f172a";
    ctx.fill();

    SEGMENTS.forEach((seg, i) => {
      const startAngle = (i * SEG_ANGLE - 90) * (Math.PI / 180);
      const endAngle = ((i + 1) * SEG_ANGLE - 90) * (Math.PI / 180);

      // Gradient radial por segmento — más vibrante hacia el borde
      const gradient = ctx.createRadialGradient(center, center, 30, center, center, radius);
      gradient.addColorStop(0, lighten(seg.color, 0.18));
      gradient.addColorStop(1, seg.color);

      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // Borde blanco entre segmentos
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Texto del segmento — más grande y bold
      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(startAngle + (endAngle - startAngle) / 2);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 4;
      ctx.font = "bold 15px system-ui, -apple-system, sans-serif";
      ctx.fillText(seg.label, radius - 18, 0);
      ctx.shadowBlur = 0;
      ctx.restore();
    });

    // Center hub con doble anillo
    ctx.beginPath();
    ctx.arc(center, center, 36, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Logo "B" interior
    ctx.fillStyle = "#0f172a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 24px system-ui, -apple-system, sans-serif";
    ctx.fillText("B", center, center + 1);
  }, [show]);

  // Helper: lighten un hex hacia blanco
  const lighten = (hex: string, factor: number): string => {
    if (!hex.startsWith("#")) return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const lr = Math.round(r + (255 - r) * factor);
    const lg = Math.round(g + (255 - g) * factor);
    const lb = Math.round(b + (255 - b) * factor);
    return `rgb(${lr},${lg},${lb})`;
  };

  const [couponError, setCouponError] = useState(false);

  const spin = useCallback(() => {
    if (spinning) return;
    setSpinning(true);
    setCouponError(false);

    const winIdx = Math.floor(Math.random() * SEG_COUNT);
    const targetAngle = 360 * 5 + (360 - winIdx * SEG_ANGLE - SEG_ANGLE / 2);
    setRotation((prev) => prev + targetAngle);

    setTimeout(async () => {
      const prize = SEGMENTS[winIdx];
      setSpinning(false);
      setResult(prize);
      localStorage.setItem(STORAGE_KEY, Date.now().toString());

      // Generate real coupon for winning prizes
      if (prize.value !== -1) {
        setCouponLoading(true);
        setCouponError(false);
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const res = await fetch("/api/coupons/spin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prize: prize.label,
              type: prize.value === 0 ? "free_delivery" : prize.label.includes("%") ? "percent" : "fixed",
              value: prize.value,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (res.ok) {
            const data = await res.json() as { code: string };
            setCouponCode(data.code);
            localStorage.setItem(COUPON_KEY, data.code);
          } else {
            setCouponError(true);
          }
        } catch {
          setCouponError(true);
        }
        setCouponLoading(false);
      }
    }, 4000);
  }, [spinning]);

  const retryCoupon = useCallback(async () => {
    if (!result || result.value === -1) return;
    setCouponLoading(true);
    setCouponError(false);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch("/api/coupons/spin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prize: result.label,
          type: result.value === 0 ? "free_delivery" : result.label.includes("%") ? "percent" : "fixed",
          value: result.value,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json() as { code: string };
        setCouponCode(data.code);
        localStorage.setItem(COUPON_KEY, data.code);
      } else {
        setCouponError(true);
      }
    } catch {
      setCouponError(true);
    }
    setCouponLoading(false);
  }, [result]);

  const dismiss = () => {
    setShow(false);
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
  };

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center bg-slate-950/75 backdrop-blur-md p-4 animate-[spinwheel-fade_0.3s_ease-out]"
      style={{ animation: "spinwheel-fade 0.3s ease-out" }}
    >
      <style>{`
        @keyframes spinwheel-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes spinwheel-pop { from { opacity: 0; transform: scale(0.92) translateY(20px) } to { opacity: 1; transform: scale(1) translateY(0) } }
        @keyframes spinwheel-glow { 0%, 100% { box-shadow: 0 0 60px rgba(255,255,255,0.15) } 50% { box-shadow: 0 0 90px rgba(255,255,255,0.3) } }
        @keyframes spinwheel-confetti { 0% { opacity: 0; transform: translateY(0) rotate(0deg) } 50% { opacity: 1 } 100% { opacity: 0; transform: translateY(60px) rotate(360deg) } }
        @keyframes spinwheel-pulse { 0%, 100% { transform: scale(1) } 50% { transform: scale(1.05) } }
      `}</style>

      <div
        className="relative max-w-md w-full p-6 sm:p-8 text-center rounded-[28px] bg-gradient-to-br from-white via-white to-[var(--color-primary)]/5 dark:from-card dark:via-card dark:to-[var(--color-primary)]/10 shadow-[0_25px_70px_-15px_rgba(0,0,0,0.5)] border border-white/40 dark:border-white/10"
        style={{ animation: "spinwheel-pop 0.4s cubic-bezier(0.16,1,0.3,1) both" }}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Cerrar"
          className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 backdrop-blur shadow-md hover:scale-110 hover:bg-white transition-all"
        >
          <X className="w-4.5 h-4.5 text-foreground" strokeWidth={2.5} />
        </button>

        {!result ? (
          <>
            {/* Header con gift box */}
            <div className="mb-5">
              <div
                className="mx-auto w-20 h-20 rounded-3xl flex items-center justify-center mb-4 bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dark)] shadow-xl shadow-[var(--color-primary)]/40 relative"
                style={{ animation: spinning ? "none" : "spinwheel-pulse 2s ease-in-out infinite" }}
              >
                <Gift className="w-10 h-10 text-white" strokeWidth={1.75} />
                {/* Sparkle overlay */}
                <Sparkles className="absolute -top-2 -right-2 w-5 h-5 text-amber-400 animate-pulse" strokeWidth={2} />
              </div>
              <h3 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight leading-tight">
                ¡Gira y gana!
              </h3>
              <p className="text-sm sm:text-base text-muted mt-2 leading-relaxed max-w-xs mx-auto">
                Tenés <span className="font-bold text-[var(--color-primary)]">1 giro gratis</span>. Probá tu suerte y ganá descuentos reales.
              </p>
            </div>

            {/* Wheel container */}
            <div className="relative mx-auto w-[320px] h-[340px] mb-6">
              {/* Outer glow */}
              <div
                className="absolute inset-2 rounded-full bg-[var(--color-primary)]/20 blur-3xl pointer-events-none"
                style={{ animation: spinning ? "spinwheel-glow 1s ease-in-out infinite" : "none" }}
                aria-hidden="true"
              />

              {/* Pointer arrow — más grande con sombra */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center">
                <div
                  className="w-0 h-0"
                  style={{
                    borderLeft: "16px solid transparent",
                    borderRight: "16px solid transparent",
                    borderTop: "24px solid var(--color-primary)",
                    filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.25))",
                  }}
                />
                <div className="h-3 w-1 bg-[var(--color-primary)] rounded-b-full -mt-0.5" />
              </div>

              {/* Canvas wheel */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2">
                <canvas
                  ref={canvasRef}
                  className="rounded-full"
                  style={{
                    width: "320px",
                    height: "320px",
                    transform: `rotate(${rotation}deg)`,
                    transition: spinning ? "transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)" : "none",
                    filter: "drop-shadow(0 10px 25px rgba(0,0,0,0.25))",
                  }}
                />
              </div>
            </div>

            {/* Spin button */}
            <button
              type="button"
              onClick={spin}
              disabled={spinning}
              className="w-full h-14 rounded-2xl bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-dark)] text-white font-extrabold text-base tracking-wide shadow-xl shadow-[var(--color-primary)]/35 hover:shadow-2xl hover:scale-[1.02] active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {spinning ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-white/70 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-2 w-2 rounded-full bg-white/70 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-2 w-2 rounded-full bg-white/70 animate-bounce" style={{ animationDelay: "300ms" }} />
                  Girando…
                </span>
              ) : (
                "¡GIRAR LA RULETA!"
              )}
            </button>

            {/* Footer trust line */}
            <div className="mt-4 flex items-center justify-center gap-x-3 gap-y-1 flex-wrap text-[10px] font-bold uppercase tracking-wider text-muted">
              <span>1 giro por persona</span>
              <span className="h-1 w-1 rounded-full bg-muted/50" />
              <span>Cupón válido 7 días</span>
              <span className="h-1 w-1 rounded-full bg-muted/50" />
              <span>Sin monto mínimo</span>
            </div>
          </>
        ) : (
          <>
            <div className="py-3 sm:py-4 relative">
              {/* Sparkles decorativos — sin emojis genéricos */}
              {result.value !== -1 && (
                <>
                  <Sparkles
                    className="absolute top-2 left-8 h-5 w-5 text-[var(--color-primary)]"
                    style={{ animation: "spinwheel-confetti 1.2s ease-out 0.2s forwards" }}
                    aria-hidden="true"
                  />
                  <Sparkles
                    className="absolute top-3 right-10 h-6 w-6 text-amber-500"
                    style={{ animation: "spinwheel-confetti 1.2s ease-out 0.4s forwards" }}
                    aria-hidden="true"
                  />
                  <Sparkles
                    className="absolute top-1 right-1/3 h-4 w-4 text-amber-400"
                    style={{ animation: "spinwheel-confetti 1.2s ease-out 0.6s forwards" }}
                    aria-hidden="true"
                  />
                </>
              )}

              {/* Trophy / refresh — iconos propios del DS, no emojis */}
              <div
                className={cn(
                  "mx-auto w-24 h-24 rounded-full flex items-center justify-center mb-4 shadow-xl",
                  result.value === -1
                    ? "bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 shadow-gray-300/40"
                    : "bg-gradient-to-br from-amber-300 via-amber-400 to-amber-500 shadow-amber-500/40"
                )}
              >
                {result.value === -1 ? (
                  <RefreshCw className="h-12 w-12 text-gray-500" strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <Trophy className="h-12 w-12 text-white" strokeWidth={1.75} aria-hidden="true" />
                )}
              </div>

              <h3 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight leading-tight mb-2">
                {result.value === -1 ? "¡Casi lo lográs!" : "¡Felicidades!"}
              </h3>
              <p className="text-sm sm:text-base text-muted leading-relaxed max-w-xs mx-auto mb-5">
                {result.value === -1
                  ? "No te preocupes, podés volver a intentar en 7 días."
                  : "Ganaste un descuento real para usar en tu próximo pedido."}
              </p>

              {result.value !== -1 && (
                <div className="bg-gradient-to-br from-[var(--color-primary)]/10 to-[var(--color-primary)]/5 rounded-2xl px-5 py-5 mb-5 border-2 border-[var(--color-primary)]/20">
                  <p className="text-3xl sm:text-4xl font-extrabold text-[var(--color-primary)] tracking-tight mb-3">
                    {result.label}
                  </p>
                  {couponLoading ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted animate-pulse uppercase tracking-wider font-bold">Generando tu cupón…</p>
                      <div className="h-12 rounded-xl bg-white/60 dark:bg-surface/60 animate-pulse" />
                    </div>
                  ) : couponCode ? (
                    <div className="space-y-2">
                      <p className="text-[10px] text-muted uppercase tracking-[0.18em] font-bold">Tu código de cupón</p>
                      <button
                        type="button"
                        onClick={async () => {
                          try { await navigator.clipboard.writeText(couponCode); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* fallback */ }
                        }}
                        className="inline-flex items-center gap-3 w-full justify-center px-4 py-3.5 bg-white dark:bg-surface rounded-xl border-2 border-dashed border-[var(--color-primary)]/50 hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 transition-all"
                      >
                        <span className="font-mono text-xl sm:text-2xl font-extrabold text-[var(--color-primary)] tracking-[0.15em]">{couponCode}</span>
                        {copied ? (
                          <span className="inline-flex items-center gap-1 text-[var(--data-success-600)]">
                            <Check className="h-4 w-4" />
                            <span className="text-xs font-bold">Copiado</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted">
                            <Copy className="h-4 w-4" />
                            <span className="text-xs font-bold">Copiar</span>
                          </span>
                        )}
                      </button>
                      <p className="text-xs text-muted leading-relaxed">
                        Válido por <span className="font-bold">7 días</span> · Úsalo al hacer checkout
                      </p>
                    </div>
                  ) : couponError ? (
                    <div className="space-y-2">
                      <p className="text-xs text-[var(--data-error-500)] font-semibold">No se pudo generar tu cupón</p>
                      <button type="button" onClick={retryCoupon}
                        className="text-xs font-bold text-[var(--color-primary)] hover:underline">
                        Reintentar
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted leading-relaxed">Se aplica automáticamente en tu próxima compra</p>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="w-full h-14 rounded-2xl bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-dark)] text-white font-extrabold text-base tracking-wide shadow-xl shadow-[var(--color-primary)]/35 hover:shadow-2xl hover:scale-[1.02] active:scale-[0.99] transition-all"
            >
              {result.value === -1 ? "Seguir comprando" : "¡Genial, a comprar!"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Mini helper para className condicional sin importar lib externa
function cn(...classes: (string | false | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
