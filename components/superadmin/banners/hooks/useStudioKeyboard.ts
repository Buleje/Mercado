"use client";

import { useEffect } from "react";
import type { ImageAdjust } from "@/lib/promo-banners";

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}
import type { StudioBanner } from "../BannerPreviewStudio";

const DEFAULT_ADJ: ImageAdjust = { position: { x: 50, y: 50 }, scale: 100, fit: "cover" };
const ZOOM_MIN = 50;
const ZOOM_MAX = 250;
const NUDGE_PCT = 5;
const NUDGE_FAST = 20;

type Mode = "edit" | "solo" | "show";

interface UseStudioKeyboardProps {
  mode: Mode;
  editable: boolean;
  banners: StudioBanner[];
  current: StudioBanner | undefined;
  onClose: () => void;
  setMode: (m: Mode) => void;
  setIdx: (fn: (i: number) => number) => void;
  setPlaying: (fn: (p: boolean) => boolean) => void;
  patchAdjust: (next: ImageAdjust, opts?: { record?: boolean }) => void;
  undo: () => void;
  redo: () => void;
}

export function useStudioKeyboard({
  mode,
  editable,
  banners,
  current,
  onClose,
  setMode,
  setIdx,
  setPlaying,
  patchAdjust,
  undo,
  redo,
}: UseStudioKeyboardProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if (e.key === "Escape") {
        if (!inField) { e.preventDefault(); onClose(); }
        return;
      }
      if (inField) return;

      if (e.key === "1") setMode(editable ? "edit" : "solo");
      else if (e.key === "2") setMode("solo");
      else if (e.key === "3") setMode("show");

      if (mode === "show" && e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
        return;
      }

      // Cmd/Ctrl+Z / Shift+Z
      if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }

      // Navegación entre banners (modos Solo / Presentación)
      if (mode !== "edit") {
        if (e.key === "ArrowLeft") setIdx((i) => (i - 1 + banners.length) % banners.length);
        if (e.key === "ArrowRight") setIdx((i) => (i + 1) % banners.length);
        return;
      }

      // Modo Editar — arrows = nudge de imagen
      if (mode === "edit" && current?.imageUrl && current.imageAdjust !== undefined) {
        const adj = current.imageAdjust ?? DEFAULT_ADJ;
        const step = e.shiftKey ? NUDGE_FAST : NUDGE_PCT;
        const nudge = (dx: number, dy: number) =>
          patchAdjust({
            ...adj,
            position: { x: clamp(adj.position.x + dx, 0, 100), y: clamp(adj.position.y + dy, 0, 100) },
          });
        if (e.key === "ArrowLeft") { e.preventDefault(); nudge(-step, 0); }
        else if (e.key === "ArrowRight") { e.preventDefault(); nudge(step, 0); }
        else if (e.key === "ArrowUp") { e.preventDefault(); nudge(0, -step); }
        else if (e.key === "ArrowDown") { e.preventDefault(); nudge(0, step); }
        else if (e.key === "0") patchAdjust(DEFAULT_ADJ);
        else if (e.key === "+" || e.key === "=") patchAdjust({ ...adj, scale: clamp(adj.scale + 10, ZOOM_MIN, ZOOM_MAX) });
        else if (e.key === "-" || e.key === "_") patchAdjust({ ...adj, scale: clamp(adj.scale - 10, ZOOM_MIN, ZOOM_MAX) });
        else if (e.key === "c" || e.key === "C") patchAdjust({ ...adj, position: { x: 50, y: 50 } });
        else if (e.key === "f" || e.key === "F") patchAdjust({ ...adj, fit: adj.fit === "cover" ? "contain" : "cover" });
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, editable, banners.length, onClose, current, patchAdjust, undo, redo, setMode, setIdx, setPlaying]);
}
