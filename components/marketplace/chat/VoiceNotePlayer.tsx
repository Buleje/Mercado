"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { fmtDuration, waveformBars } from "@/lib/chat/voice";

/**
 * VoiceNotePlayer — Tanda 4 · reproductor de nota de voz (Brandon 2026-06-11).
 *
 * Play/pause + waveform decorativo que se "llena" según el progreso + tiempo +
 * toggle de velocidad (1× → 1.5× → 2×). Un solo <audio>. El waveform es
 * determinístico por `seed` (id del mensaje) — no parpadea ni decodifica el
 * audio. Compartido por la vista cliente y la del vendedor.
 *
 * `variant` adapta los colores al fondo de la burbuja:
 *   - "onAccent": burbuja con fondo de acento (texto/barras claros)
 *   - "onSurface": burbuja con fondo claro (texto/barras de acento)
 */

const SPEEDS = [1, 1.5, 2] as const;

interface VoiceNotePlayerProps {
  url: string;
  durationSec: number;
  seed: string;
  variant?: "onAccent" | "onSurface";
}

export function VoiceNotePlayer({ url, durationSec, seed, variant = "onSurface" }: VoiceNotePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0–1
  const [elapsed, setElapsed] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);

  const bars = useMemo(() => waveformBars(seed), [seed]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => {
      const dur = a.duration && Number.isFinite(a.duration) ? a.duration : durationSec || 1;
      setElapsed(a.currentTime);
      setProgress(dur > 0 ? Math.min(1, a.currentTime / dur) : 0);
    };
    const onEnd = () => { setPlaying(false); setProgress(0); setElapsed(0); a.currentTime = 0; };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
    };
  }, [durationSec]);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play().catch(() => { /* gesto/decodificación falló */ }); }
    else { a.pause(); }
  }

  function cycleSpeed() {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next];
  }

  const onAccent = variant === "onAccent";
  const shownTime = playing || elapsed > 0 ? elapsed : durationSec;

  return (
    <div className="flex items-center gap-2 py-0.5" onClick={(e) => e.stopPropagation()}>
      {/* audio oculto */}
      <audio ref={audioRef} src={url} preload="none" />

      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pausar nota de voz" : "Reproducir nota de voz"}
        className={cn(
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95",
          onAccent ? "bg-white text-[var(--accent)]" : "bg-[var(--accent)] text-white",
        )}
      >
        {playing ? <Pause className="h-4 w-4 fill-current" aria-hidden /> : <Play className="h-4 w-4 fill-current" aria-hidden />}
      </button>

      {/* Waveform */}
      <div className="flex h-8 min-w-0 flex-1 items-center gap-[2px]">
        {bars.map((h, i) => {
          const filled = i / bars.length <= progress;
          return (
            <span
              key={i}
              className={cn(
                "w-[3px] shrink-0 rounded-full",
                onAccent
                  ? filled ? "bg-white" : "bg-white/40"
                  : filled ? "bg-[var(--accent)]" : "bg-[var(--accent)]/30",
              )}
              style={{ height: `${h}%` }}
            />
          );
        })}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className={cn("text-[length:var(--ts-2xs)] font-bold tabular-nums", onAccent ? "text-white/90" : "text-[var(--text-tertiary)]")}>
          {fmtDuration(shownTime)}
        </span>
        <button
          type="button"
          onClick={cycleSpeed}
          aria-label="Velocidad de reproducción"
          className={cn(
            "rounded-full px-1.5 text-[length:var(--ts-2xs)] font-black leading-tight",
            onAccent ? "bg-white/20 text-white" : "bg-[var(--accent-soft)] text-[var(--accent)]",
          )}
        >
          {SPEEDS[speedIdx]}×
        </button>
      </div>
    </div>
  );
}
