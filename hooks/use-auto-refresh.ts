"use client";
import { useEffect, useRef, useState, useCallback } from "react";

interface UseAutoRefreshOptions {
  /** Interval in seconds (0 = disabled) */
  intervalSeconds: number;
  /** Callback fired on each refresh */
  onRefresh: () => void | Promise<void>;
  /** Whether auto-refresh is active */
  enabled?: boolean;
}

/**
 * Hook for auto-refreshing data at configurable intervals.
 * Returns controls to pause/resume and a countdown timer.
 */
export function useAutoRefresh({ intervalSeconds, onRefresh, enabled = true }: UseAutoRefreshOptions) {
  const [paused, setPaused] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(intervalSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);

  const clearTimers = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  }, []);

  const restart = useCallback(() => {
    clearTimers();
    if (!enabled || paused || intervalSeconds <= 0) return;
    setSecondsLeft(intervalSeconds);
    countdownRef.current = setInterval(() => {
      setSecondsLeft(prev => (prev <= 1 ? intervalSeconds : prev - 1));
    }, 1000);
    intervalRef.current = setInterval(() => {
      onRefreshRef.current();
      setSecondsLeft(intervalSeconds);
    }, intervalSeconds * 1000);
  }, [enabled, paused, intervalSeconds, clearTimers]);

   
  useEffect(() => {
    restart();
    return clearTimers;
  }, [restart, clearTimers]);
   

  const togglePause = useCallback(() => setPaused(p => !p), []);

  const refreshNow = useCallback(() => {
    onRefreshRef.current();
    setSecondsLeft(intervalSeconds);
    restart();
  }, [intervalSeconds, restart]);

  return { paused, togglePause, secondsLeft, refreshNow, isActive: enabled && !paused && intervalSeconds > 0 };
}
