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
