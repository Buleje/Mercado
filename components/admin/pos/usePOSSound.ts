"use client";

import { useCallback, useState, useEffect } from "react";

// ── Web Audio API — no external audio files ────────────────────────────

let ctx: AudioContext | null = null;
function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export function usePOSSound() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setEnabled(localStorage.getItem("pos-sounds") !== "false");
    }
  }, []);

  const playDing = useCallback(() => {
    if (!enabled) return;
    try {
      const c = getCtx();
      const o = c.createOscillator();
      const g = c.createGain();
      o.connect(g);
      g.connect(c.destination);
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.3, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3);
      o.start();
      o.stop(c.currentTime + 0.3);
      if (navigator.vibrate) navigator.vibrate(50);
    } catch {
      // AudioContext not available
    }
  }, [enabled]);

  const playCashRegister = useCallback(() => {
    if (!enabled) return;
    try {
      const c = getCtx();
      // First tone
      const o1 = c.createOscillator();
      const g1 = c.createGain();
      o1.connect(g1);
      g1.connect(c.destination);
      o1.frequency.value = 523;
      g1.gain.setValueAtTime(0.3, c.currentTime);
      g1.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15);
      o1.start();
      o1.stop(c.currentTime + 0.15);

      // Second tone (delayed)
      const o2 = c.createOscillator();
      const g2 = c.createGain();
      o2.connect(g2);
      g2.connect(c.destination);
      o2.frequency.value = 659;
      g2.gain.setValueAtTime(0.3, c.currentTime + 0.15);
      g2.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.4);
      o2.start(c.currentTime + 0.15);
      o2.stop(c.currentTime + 0.4);

      if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
    } catch {
      // AudioContext not available
    }
  }, [enabled]);

  const playError = useCallback(() => {
    if (!enabled) return;
    try {
      const c = getCtx();
      const o = c.createOscillator();
      const g = c.createGain();
      o.connect(g);
      g.connect(c.destination);
      o.frequency.value = 220;
      g.gain.setValueAtTime(0.3, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2);
      o.start();
      o.stop(c.currentTime + 0.2);
      if (navigator.vibrate) navigator.vibrate(100);
    } catch {
      // AudioContext not available
    }
  }, [enabled]);

  // Mejora QW-2: Sonido diferente por monto de venta
  const playSaleComplete = useCallback((amount: number) => {
    if (!enabled) return;
    try {
      const c = getCtx();
      if (amount > 100) {
        // Cash register: 3 notas ascendentes rapidas
        [523, 659, 784].forEach((freq, i) => {
          const o = c.createOscillator();
          const g = c.createGain();
          o.connect(g); g.connect(c.destination);
          o.frequency.value = freq;
          g.gain.setValueAtTime(0.4, c.currentTime + i * 0.1);
          g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.1 + 0.2);
          o.start(c.currentTime + i * 0.1);
          o.stop(c.currentTime + i * 0.1 + 0.2);
        });
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      } else if (amount >= 20) {
        // Ding normal
        const o = c.createOscillator();
        const g = c.createGain();
        o.connect(g); g.connect(c.destination);
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.3, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3);
        o.start(); o.stop(c.currentTime + 0.3);
        if (navigator.vibrate) navigator.vibrate(50);
      } else {
        // Ding suave
        const o = c.createOscillator();
        const g = c.createGain();
        o.connect(g); g.connect(c.destination);
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.15, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2);
        o.start(); o.stop(c.currentTime + 0.2);
        if (navigator.vibrate) navigator.vibrate(50);
      }
    } catch {
      // AudioContext not available
    }
  }, [enabled]);

  const toggle = useCallback(() => {
    const next =
      localStorage.getItem("pos-sounds") === "false" ? "true" : "false";
    localStorage.setItem("pos-sounds", next);
    setEnabled(next === "true");
  }, []);

  return { playDing, playCashRegister, playError, playSaleComplete, toggle, enabled };
}
