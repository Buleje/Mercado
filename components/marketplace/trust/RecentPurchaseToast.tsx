"use client";

/**
 * RecentPurchaseToast — "Ana pidió esto hace 2 horas".
 *
 * Social proof real-time. Chip discreto que aparece en PDP o product
 * cards, rotando entre compras recientes del producto.
 *
 * Props:
 *   purchases — array de compras recientes (firstName + minutesAgo)
 *   rotateMs — cada cuánto cambiar el mensaje. Default 8s.
 */

import { useEffect, useState } from "react";
import { ShoppingBag } from "@buleje/design-system/icons";

interface RecentPurchase {
  firstName: string;
  minutesAgo: number;
}

interface Props {
  purchases: RecentPurchase[];
  rotateMs?: number;
}

function formatTimeAgo(min: number): string {
  if (min < 1) return "justo ahora";
  if (min < 60) return `hace ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} día${days === 1 ? "" : "s"}`;
}

export default function RecentPurchaseToast({
  purchases,
  rotateMs = 8000,
}: Props) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (purchases.length <= 1) return;
    const id = setInterval(() => {
      setIdx((prev) => (prev + 1) % purchases.length);
    }, rotateMs);
    return () => clearInterval(id);
  }, [purchases.length, rotateMs]);

  if (purchases.length === 0) return null;

  const current = purchases[idx];

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] border border-[var(--rule-soft)] px-2.5 py-1 text-[length:var(--ts-2xs)] text-[var(--text-secondary)]"
      aria-live="polite"
      aria-atomic="true"
    >
      <ShoppingBag className="h-3 w-3 text-[var(--accent)]" strokeWidth={1.75} aria-hidden />
      <span className="font-bold text-[var(--text-primary)]">{current.firstName}</span>
      <span>lo pidió {formatTimeAgo(current.minutesAgo)}</span>
    </span>
  );
}
