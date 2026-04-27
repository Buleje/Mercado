"use client";

/**
 * BannerPreviewStudio — modal de previsualización avanzada.
 *
 * Dos modos:
 *  - "Solo": un banner aislado sobre fondo blanco/gris con tamaños 1200/1600/full
 *    para validar el encuadre real sin distracciones.
 *  - "Presentación": rotación automática entre todos los banners del slot,
 *    con controles: play/pause, velocidad (3-15s), animación (fade/slide/zoom/none),
 *    flechas prev/next, indicators clickeables.
 *
 * Recibe la lista de banners ya filtrada (solo activos típicamente) + el banner
 * inicial focalizado. No persiste nada — es solo previsualización.
 */

import { useEffect, useState } from "react";
import {
  X,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Monitor,
  Layers,
  Gauge,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import PromoBannerRenderer, { type PromoBanner } from "@/components/marketplace/PromoBannerRenderer";

type Mode = "solo" | "show";
type Animation = "fade" | "slide" | "zoom" | "none";
type Width = "1200" | "1600" | "full";

interface Props {
  banners: PromoBanner[];
  initialIndex?: number;
  onClose: () => void;
}

const ANIM_DURATION_MS = 400;

export default function BannerPreviewStudio({ banners, initialIndex = 0, onClose }: Props) {
  const [mode, setMode] = useState<Mode>("solo");
  const [idx, setIdx] = useState(Math.min(initialIndex, Math.max(0, banners.length - 1)));
  const [width, setWidth] = useState<Width>("1600");
  const [animation, setAnimation] = useState<Animation>("fade");
  const [speedMs, setSpeedMs] = useState(6000);
  const [playing, setPlaying] = useState(true);
  const [animKey, setAnimKey] = useState(0);

  // Re-anima cada vez que cambia el banner (en modo show)
  useEffect(() => {
    setAnimKey((k) => k + 1);
  }, [idx]);

  // Auto-rotate en modo presentación
  useEffect(() => {
    if (mode !== "show" || !playing || banners.length <= 1) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % banners.length), speedMs);
    return () => clearInterval(id);
  }, [mode, playing, speedMs, banners.length]);

  // Cerrar con ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (mode === "show") {
        if (e.key === "ArrowLeft") setIdx((i) => (i - 1 + banners.length) % banners.length);
        if (e.key === "ArrowRight") setIdx((i) => (i + 1) % banners.length);
        if (e.key === " ") {
          e.preventDefault();
          setPlaying((p) => !p);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, banners.length, onClose]);

  if (banners.length === 0) return null;
  const current = banners[idx];
  const widthPx = width === "1200" ? 1200 : width === "1600" ? 1600 : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Estudio de previsualización"
      className="fixed inset-0 z-[100] flex flex-col bg-black/85 backdrop-blur-sm"
    >
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-white/10 bg-black/60 px-4 sm:px-6 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2 text-white">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-white">
            <Monitor className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-extrabold leading-none">Estudio de previsualización</p>
            <p className="text-[length:var(--ts-2xs)] text-white/60 leading-tight mt-0.5">
              {banners.length} banner{banners.length === 1 ? "" : "s"} · ESC para salir
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <ModeBtn active={mode === "solo"} onClick={() => setMode("solo")} icon={<Monitor className="h-3.5 w-3.5" />} label="Solo" />
          <ModeBtn active={mode === "show"} onClick={() => setMode("show")} icon={<Layers className="h-3.5 w-3.5" />} label="Presentación" />
          <button
            type="button"
            onClick={onClose}
            className="ml-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ── Stage ───────────────────────────────────────────────────── */}
      <div
        className={cn(
          "flex-1 min-h-0 flex items-center justify-center p-4 sm:p-8 overflow-auto",
          mode === "solo" ? "bg-white" : "bg-[#0c1015]",
        )}
      >
        <div
          className="w-full"
          style={widthPx ? { maxWidth: `${widthPx}px` } : undefined}
        >
          <div
            key={animKey}
            className={cn(
              mode === "show" && animation === "fade" && "animate-bs-fade",
              mode === "show" && animation === "slide" && "animate-bs-slide",
              mode === "show" && animation === "zoom" && "animate-bs-zoom",
            )}
            style={{ animationDuration: `${ANIM_DURATION_MS}ms` }}
          >
            <PromoBannerRenderer banner={current} asLink={false} />
          </div>

          {/* Pie informativo en modo solo */}
          {mode === "solo" && (
            <div className="mt-4 flex items-center justify-center gap-2 text-[#0c1015]/60 text-xs font-bold">
              <span>{widthPx ? `${widthPx}px` : "100% del contenedor"}</span>
              <span>·</span>
              <span className="truncate max-w-[40ch]">{current.title || "(sin título)"}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom controls ─────────────────────────────────────────── */}
      <footer className="shrink-0 border-t border-white/10 bg-black/60 px-4 sm:px-6 py-3">
        {mode === "solo" ? (
          <SoloControls
            width={width}
            onWidth={setWidth}
            idx={idx}
            total={banners.length}
            onPrev={() => setIdx((i) => (i - 1 + banners.length) % banners.length)}
            onNext={() => setIdx((i) => (i + 1) % banners.length)}
          />
        ) : (
          <ShowControls
            playing={playing}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            speedMs={speedMs}
            onSpeed={setSpeedMs}
            animation={animation}
            onAnimation={setAnimation}
            idx={idx}
            total={banners.length}
            onPrev={() => setIdx((i) => (i - 1 + banners.length) % banners.length)}
            onNext={() => setIdx((i) => (i + 1) % banners.length)}
            onJump={setIdx}
          />
        )}
      </footer>

      {/* Animations CSS — definidas inline para no depender de tailwind plugins */}
      <style jsx global>{`
        @keyframes bs-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes bs-slide {
          from { opacity: 0; transform: translateX(40px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes bs-zoom {
          from { opacity: 0; transform: scale(0.94); }
          to   { opacity: 1; transform: scale(1); }
        }
        .animate-bs-fade  { animation: bs-fade  ${ANIM_DURATION_MS}ms ease-out both; }
        .animate-bs-slide { animation: bs-slide ${ANIM_DURATION_MS}ms cubic-bezier(0.2,0.8,0.2,1) both; }
        .animate-bs-zoom  { animation: bs-zoom  ${ANIM_DURATION_MS}ms cubic-bezier(0.2,0.8,0.2,1) both; }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-controles
// ─────────────────────────────────────────────────────────────────────────────

function ModeBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-extrabold transition-colors",
        active ? "bg-[var(--accent)] text-white" : "bg-white/10 text-white/80 hover:bg-white/20",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function SoloControls({
  width,
  onWidth,
  idx,
  total,
  onPrev,
  onNext,
}: {
  width: Width;
  onWidth: (w: Width) => void;
  idx: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-white">
      <div className="flex items-center gap-1.5">
        {(["1200", "1600", "full"] as Width[]).map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => onWidth(w)}
            aria-pressed={width === w}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-extrabold transition-colors",
              width === w ? "bg-white text-[#0c1015]" : "bg-white/10 text-white/80 hover:bg-white/20",
            )}
          >
            {w === "full" ? "100%" : `${w}px`}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onPrev} disabled={total <= 1} className="navBtn"><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-xs font-bold tabular-nums min-w-[44px] text-center">
          {total === 0 ? "—" : `${idx + 1} / ${total}`}
        </span>
        <button type="button" onClick={onNext} disabled={total <= 1} className="navBtn"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <style jsx>{`
        .navBtn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 32px;
          width: 32px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.1);
          color: white;
          transition: background-color 150ms;
        }
        .navBtn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.2);
        }
        .navBtn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

function ShowControls({
  playing,
  onPlay,
  onPause,
  speedMs,
  onSpeed,
  animation,
  onAnimation,
  idx,
  total,
  onPrev,
  onNext,
  onJump,
}: {
  playing: boolean;
  onPlay: () => void;
  onPause: () => void;
  speedMs: number;
  onSpeed: (ms: number) => void;
  animation: Animation;
  onAnimation: (a: Animation) => void;
  idx: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onJump: (i: number) => void;
}) {
  return (
    <div className="space-y-3 text-white">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={playing ? onPause : onPlay}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-extrabold hover:opacity-90 transition-opacity"
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {playing ? "Pausar" : "Reproducir"}
        </button>

        <div className="flex items-center gap-2">
          <button type="button" onClick={onPrev} disabled={total <= 1} className="navBtn"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-xs font-bold tabular-nums min-w-[44px] text-center">
            {total === 0 ? "—" : `${idx + 1} / ${total}`}
          </span>
          <button type="button" onClick={onNext} disabled={total <= 1} className="navBtn"><ChevronRight className="h-4 w-4" /></button>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Gauge className="h-3.5 w-3.5 text-white/60" />
          <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-white/60">
            Velocidad
          </span>
          <input
            type="range"
            min={2000}
            max={15000}
            step={500}
            value={speedMs}
            onChange={(e) => onSpeed(Number(e.target.value))}
            className="w-32 accent-[var(--accent)]"
            aria-label="Velocidad de rotación"
          />
          <span className="text-xs font-bold tabular-nums min-w-[42px] text-right">
            {(speedMs / 1000).toFixed(1)}s
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-white/60">
          Animación
        </span>
        {(["fade", "slide", "zoom", "none"] as Animation[]).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => onAnimation(a)}
            aria-pressed={animation === a}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-extrabold transition-colors capitalize",
              animation === a ? "bg-white text-[#0c1015]" : "bg-white/10 text-white/80 hover:bg-white/20",
            )}
          >
            {a === "none" ? "Sin animación" : a}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onJump(i)}
              aria-label={`Banner ${i + 1}`}
              aria-current={i === idx}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === idx ? "w-8 bg-white" : "w-2 bg-white/30 hover:bg-white/60",
              )}
            />
          ))}
        </div>
      </div>

      <style jsx>{`
        .navBtn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 32px;
          width: 32px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.1);
          color: white;
          transition: background-color 150ms;
        }
        .navBtn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.2);
        }
        .navBtn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
