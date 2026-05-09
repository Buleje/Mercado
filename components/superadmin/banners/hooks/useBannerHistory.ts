"use client";

import { useState, useCallback } from "react";
import type { ImageAdjust } from "@/lib/promo-banners";
import type { StudioBanner } from "../BannerPreviewStudio";

const DEFAULT_ADJ: ImageAdjust = { position: { x: 50, y: 50 }, scale: 100, fit: "cover" };
const HISTORY_CAP = 30;

export function useBannerHistory(
  banners: StudioBanner[],
  idx: number,
  onPatchBanner: ((index: number, patch: Partial<StudioBanner>) => void) | undefined,
) {
  const current = banners[idx];

  // Undo/redo de imageAdjust (por banner) en state — hasUndo/hasRedo es
  // derivado puro y no rompe la regla react-hooks/refs.
  const [history, setHistory] = useState<Record<string, { past: ImageAdjust[]; future: ImageAdjust[] }>>({});

  const pushHistory = useCallback((bannerId: string, prev: ImageAdjust) => {
    setHistory((h) => {
      const entry = h[bannerId] ?? { past: [], future: [] };
      const past = [...entry.past, prev];
      if (past.length > HISTORY_CAP) past.shift();
      return { ...h, [bannerId]: { past, future: [] } };
    });
  }, []);

  const patchAdjust = useCallback(
    (next: ImageAdjust, opts: { record?: boolean } = {}) => {
      if (!current || !onPatchBanner) return;
      if (opts.record !== false) pushHistory(current.id, current.imageAdjust ?? DEFAULT_ADJ);
      onPatchBanner(idx, { imageAdjust: next });
    },
    [current, idx, onPatchBanner, pushHistory],
  );

  const undo = useCallback(() => {
    if (!current || !onPatchBanner) return;
    const entry = history[current.id];
    if (!entry || entry.past.length === 0) return;
    const prev = entry.past[entry.past.length - 1]!;
    setHistory((h) => {
      const e = h[current.id]!;
      return {
        ...h,
        [current.id]: {
          past: e.past.slice(0, -1),
          future: [...e.future, current.imageAdjust ?? DEFAULT_ADJ],
        },
      };
    });
    onPatchBanner(idx, { imageAdjust: prev });
  }, [current, idx, history, onPatchBanner]);

  const redo = useCallback(() => {
    if (!current || !onPatchBanner) return;
    const entry = history[current.id];
    if (!entry || entry.future.length === 0) return;
    const next = entry.future[entry.future.length - 1]!;
    setHistory((h) => {
      const e = h[current.id]!;
      return {
        ...h,
        [current.id]: {
          past: [...e.past, current.imageAdjust ?? DEFAULT_ADJ],
          future: e.future.slice(0, -1),
        },
      };
    });
    onPatchBanner(idx, { imageAdjust: next });
  }, [current, idx, history, onPatchBanner]);

  return {
    patchAdjust,
    undo,
    redo,
    hasUndo: !!current && (history[current.id]?.past.length ?? 0) > 0,
    hasRedo: !!current && (history[current.id]?.future.length ?? 0) > 0,
  };
}
