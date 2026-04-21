"use client";
import { useState, useRef, useEffect, useCallback, ReactNode } from "react";

/* ── Types ── */
export interface TouchGestureOptions {
  threshold?: number;      // px minimo para swipe (default 50)
  longPressMs?: number;    // ms para long press (default 600)
  doubleTapMs?: number;    // ms max entre taps para doble tap (default 300)
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onLongPress?: () => void;
  onDoubleTap?: () => void;
}

interface GestureState {
  startX: number;
  startY: number;
  startTime: number;
  lastTap: number;
  longPressTimer: ReturnType<typeof setTimeout> | null;
  moved: boolean;
}

/* ── Hook reutilizable ── */
export function useTouchGestures(
  ref: React.RefObject<HTMLElement | null>,
  options: TouchGestureOptions = {}
) {
  const {
    threshold = 50,
    longPressMs = 600,
    doubleTapMs = 300,
    onSwipeRight,
    onSwipeLeft,
    onSwipeUp,
    onSwipeDown,
    onLongPress,
    onDoubleTap,
  } = options;

  const state = useRef<GestureState>({
    startX: 0,
    startY: 0,
    startTime: 0,
    lastTap: 0,
    longPressTimer: null,
    moved: false,
  });

  const clearTimer = useCallback(() => {
    if (state.current.longPressTimer) {
      clearTimeout(state.current.longPressTimer);
      state.current.longPressTimer = null;
    }
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      state.current.startX = touch.clientX;
      state.current.startY = touch.clientY;
      state.current.startTime = Date.now();
      state.current.moved = false;

      if (onLongPress) {
        state.current.longPressTimer = setTimeout(() => {
          if (!state.current.moved) onLongPress();
        }, longPressMs);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - state.current.startX);
      const dy = Math.abs(touch.clientY - state.current.startY);

      if (dx > 10 || dy > 10) {
        state.current.moved = true;
        clearTimer();
      }

      // Prevenir scroll si hay swipe horizontal detectado
      if (dx > dy && dx > threshold / 2 && (onSwipeLeft || onSwipeRight)) {
        e.preventDefault();
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      clearTimer();
      const touch = e.changedTouches[0];
      const dx = touch.clientX - state.current.startX;
      const dy = touch.clientY - state.current.startY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const elapsed = Date.now() - state.current.startTime;

      // Swipe
      if (absDx >= threshold || absDy >= threshold) {
        if (absDx > absDy) {
          if (dx > 0) onSwipeRight?.();
          else onSwipeLeft?.();
        } else {
          if (dy > 0) onSwipeDown?.();
          else onSwipeUp?.();
        }
        return;
      }

      // Double tap
      if (!state.current.moved && elapsed < 300 && onDoubleTap) {
        const now = Date.now();
        if (now - state.current.lastTap < doubleTapMs) {
          onDoubleTap();
          state.current.lastTap = 0;
        } else {
          state.current.lastTap = now;
        }
      }
    };

    const passive = false;
    el.addEventListener("touchstart", onTouchStart, { passive });
    el.addEventListener("touchmove", onTouchMove, { passive });
    el.addEventListener("touchend", onTouchEnd, { passive });

    return () => {
      clearTimer();
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [
    threshold, longPressMs, doubleTapMs,
    onSwipeRight, onSwipeLeft, onSwipeUp, onSwipeDown,
    onLongPress, onDoubleTap, clearTimer, ref,
  ]);
}

/* ── Componente wrapper ── */
interface TouchGestureWrapperProps extends TouchGestureOptions {
  children: ReactNode;
  className?: string;
}

export default function TouchGestures({
  children,
  className,
  threshold,
  longPressMs,
  doubleTapMs,
  onSwipeRight,
  onSwipeLeft,
  onSwipeUp,
  onSwipeDown,
  onLongPress,
  onDoubleTap,
}: TouchGestureWrapperProps) {
  const ref = useRef<HTMLDivElement>(null);

  useTouchGestures(ref as React.RefObject<HTMLElement>, {
    threshold,
    longPressMs,
    doubleTapMs,
    onSwipeRight,
    onSwipeLeft,
    onSwipeUp,
    onSwipeDown,
    onLongPress,
    onDoubleTap,
  });

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/* ── Demo visual (exportada para uso en docs/admin) ── */
export function TouchGesturesDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const [lastGesture, setLastGesture] = useState<string | null>(null);

  useTouchGestures(ref as React.RefObject<HTMLElement>, {
    threshold: 50,
    onSwipeRight: () => setLastGesture("Swipe derecha"),
    onSwipeLeft: () => setLastGesture("Swipe izquierda"),
    onSwipeUp: () => setLastGesture("Swipe arriba"),
    onSwipeDown: () => setLastGesture("Swipe abajo"),
    onLongPress: () => setLastGesture("Long press (600ms)"),
    onDoubleTap: () => setLastGesture("Doble tap"),
  });

  return (
    <div className="space-y-6">
      <div
        ref={ref}
        className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 dark:bg-primary/10 p-8 flex flex-col items-center justify-center min-h-44 select-none cursor-pointer touch-none"
      >
        <p className="text-sm font-medium text-[var(--text-secondary)] text-center">
          Area de prueba — toca aqui desde un movil o tablet
        </p>
        <p className="text-xs text-[var(--text-tertiary)] mt-1 text-center">
          Swipe / Long press / Doble tap
        </p>
        {lastGesture && (
          <div className="mt-4 px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold animate-pulse">
            {lastGesture}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <p className="text-sm font-medium text-[var(--text-secondary)] mb-3">
          Props del hook useTouchGestures
        </p>
        <div className="space-y-1.5 text-xs font-mono">
          {[
            ["threshold", "number (default 50px)", "Minimo para swipe"],
            ["longPressMs", "number (default 600)", "Duracion long press"],
            ["doubleTapMs", "number (default 300)", "Intervalo doble tap"],
            ["onSwipeRight", "() => void", "Swipe hacia la derecha"],
            ["onSwipeLeft", "() => void", "Swipe hacia la izquierda"],
            ["onSwipeUp", "() => void", "Swipe hacia arriba"],
            ["onSwipeDown", "() => void", "Swipe hacia abajo"],
            ["onLongPress", "() => void", "Mantener presionado"],
            ["onDoubleTap", "() => void", "Doble toque rapido"],
          ].map(([prop, type, desc]) => (
            <div
              key={prop}
              className="grid grid-cols-[auto_1fr_2fr] gap-3 items-center py-1 border-b border-gray-50 dark:border-[var(--rule-base)] last:border-0"
            >
              <span className="text-primary dark:text-primary font-semibold">{prop}</span>
              <span className="text-[var(--text-tertiary)]">{type}</span>
              <span className="text-[var(--text-tertiary)] font-sans">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
