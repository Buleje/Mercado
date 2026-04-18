"use client";

import { useState, useEffect } from "react";

interface CountdownState {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

function computeRemaining(endsAt: string): CountdownState {
  const diff = Math.max(0, new Date(endsAt).getTime() - Date.now());
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds, expired: diff === 0 };
}

/**
 * useDealsCountdown — countdown reactivo para una fecha ISO de cierre.
 * Tick cada segundo. SSR-safe (initializa en 0 y monta en client).
 */
export function useDealsCountdown(endsAt: string): CountdownState {
  const [state, setState] = useState<CountdownState>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    expired: false,
  });

  useEffect(() => {
    setState(computeRemaining(endsAt));

    const id = setInterval(() => {
      const next = computeRemaining(endsAt);
      setState(next);
      if (next.expired) clearInterval(id);
    }, 1000);

    return () => clearInterval(id);
  }, [endsAt]);

  return state;
}
