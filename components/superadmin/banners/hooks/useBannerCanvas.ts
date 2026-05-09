"use client";

import { useState, useEffect } from "react";

type StudioTheme = "dark" | "light";
type EditTab = "frame" | "image" | "text" | "color" | "promo" | "state";

/**
 * Manages panel widths (drag-to-resize), panel visibility, theme, and
 * the active edit tab. All values are persisted to localStorage with an
 * SSR-safe hydration pattern (initial render uses defaults, then
 * localStorage values are loaded in useEffect to avoid mismatch).
 */
export function useBannerCanvas() {
  const [theme, setTheme] = useState<StudioTheme>("dark");
  const [tab, setTab] = useState<EditTab>("frame");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  // Persistent panel widths — hydrated from localStorage after first render
  const [leftWidth, setLeftWidth] = useState<number>(240);
  const [rightWidth, setRightWidth] = useState<number>(320);

  useEffect(() => {
    try {
      const l = Number(localStorage.getItem("studio-left-w"));
      const r = Number(localStorage.getItem("studio-right-w"));
      if (Number.isFinite(l) && l >= 200 && l <= 520) setLeftWidth(l);
      if (Number.isFinite(r) && r >= 260 && r <= 600) setRightWidth(r);
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem("studio-left-w", String(leftWidth)); } catch {}
  }, [leftWidth]);

  useEffect(() => {
    try { localStorage.setItem("studio-right-w", String(rightWidth)); } catch {}
  }, [rightWidth]);

  return {
    theme, setTheme,
    tab, setTab,
    leftOpen, setLeftOpen,
    rightOpen, setRightOpen,
    leftWidth, setLeftWidth,
    rightWidth, setRightWidth,
  };
}
