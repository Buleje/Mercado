export interface CountdownParts {
  expired: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/** Descompone el tiempo restante en días/horas/min/seg para el timer en cajas. */
export function countdownParts(ms: number): CountdownParts {
  if (ms <= 0) {
    return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }
  const totalSec = Math.floor(ms / 1000);
  return {
    expired: false,
    days: Math.floor(totalSec / 86_400),
    hours: Math.floor((totalSec % 86_400) / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
  };
}

/**
 * Formatea el tiempo restante de una junta para la cuenta regresiva en vivo.
 * - <= 0 ms  → "Cerrada"
 * - >= 1 día → "Xd Yh Zm" (sin segundos: el ruido no aporta a esa escala)
 * - < 1 día  → "HH:MM:SS" (urgencia con segundos)
 */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "Cerrada";
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86_400);
  const h = Math.floor((totalSec % 86_400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
