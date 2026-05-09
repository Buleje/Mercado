/**
 * LowStockBadge — "Solo quedan N unidades" cuando stock < 10.
 *
 * Urgencia sin mentir. Solo aparece si stock es real y bajo.
 *
 * Props:
 *   stock — numero real del DB
 *   threshold — debajo de cual mostrar. Default 10
 */

import { AlertTriangle, Flame } from "@buleje/design-system/icons";

interface Props {
  stock: number;
  threshold?: number;
}

export default function LowStockBadge({ stock, threshold = 10 }: Props) {
  if (stock <= 0 || stock > threshold) return null;

  const isUrgent = stock <= 3;
  const Icon = isUrgent ? Flame : AlertTriangle;
  const colorClasses = isUrgent
    ? "bg-[var(--data-error,_#e11d48)]/10 text-[var(--data-error,_#e11d48)] border-[var(--data-error,_#e11d48)]/30"
    : "bg-[var(--data-warning,_#eab308)]/10 text-[var(--data-warning,_#eab308)] border-[var(--data-warning,_#eab308)]/30";

  const message = isUrgent
    ? stock === 1
      ? "Última unidad"
      : `Solo quedan ${stock}`
    : `Quedan ${stock}`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold ${colorClasses}`}
      aria-label={message}
    >
      <Icon className="h-3 w-3" strokeWidth={2} aria-hidden />
      {message}
    </span>
  );
}
