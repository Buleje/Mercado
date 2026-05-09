"use client";

/**
 * LiveViewers
 *
 * Muestra "N personas lo vieron en la última hora" cuando N >= 3.
 * Datos reales desde /api/marketplace/stores/[slug]/live-viewers.
 * Umbral >= 3 para evitar el efecto "1 persona" que suena vacio
 * (coherente con LowStockUrgency).
 *
 * Variante compact para cards de grid (sin caja, solo texto inline).
 */

import { useEffect, useState } from "react";
import { Eye } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface Props {
  storeSlug: string;
  compact?: boolean;
  className?: string;
}

type FetchState = "idle" | "loading" | "ok" | "error";

const MIN_VIEWERS = 3;

export default function LiveViewers({ storeSlug, compact = false, className }: Props) {
  const [count, setCount] = useState<number>(0);
  // Init condicional evita setStatus("error") sincronico dentro del effect
  // cuando storeSlug es falsy (regla react-hooks/set-state-in-effect de React 19).
  const [status, setStatus] = useState<FetchState>(storeSlug ? "loading" : "error");

  useEffect(() => {
    if (!storeSlug) return;

    let cancelled = false;
    setStatus("loading");

    fetch(`/api/marketplace/stores/${encodeURIComponent(storeSlug)}/live-viewers`, {
      cache: "no-store",
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ recentViewers: number }>;
      })
      .then((data) => {
        if (cancelled) return;
        setCount(typeof data.recentViewers === "number" ? data.recentViewers : 0);
        setStatus("ok");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [storeSlug]);

  // Skeleton mientras carga
  if (status === "loading") {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "inline-block h-4 w-32 animate-pulse rounded bg-[var(--rule-soft)] dark:bg-gray-700",
          className,
        )}
      />
    );
  }

  // Error o datos insuficientes — degradacion elegante, no mostrar nada
  if (status === "error" || count < MIN_VIEWERS) {
    return null;
  }

  const label = `${count} personas lo vieron en la última hora`;

  if (compact) {
    return (
      <span
        role="status"
        aria-live="polite"
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400",
          className,
        )}
      >
        <Eye className="h-3 w-3 shrink-0" aria-hidden="true" />
        {label}
      </span>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-1.5 rounded-md bg-[var(--surface-alt)] px-2.5 py-1.5 text-xs font-medium text-gray-600 ring-1 ring-gray-200 dark:bg-gray-800/50 dark:text-gray-300 dark:ring-gray-700",
        className,
      )}
    >
      <Eye className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
      {label}
    </div>
  );
}
