"use client";

/**
 * LiveViewersChip — "X personas viendo este producto ahora".
 *
 * Patron social proof probado en Amazon/Mercado Libre. Aumenta urgencia
 * y sensacion de alta demanda sin ser pushy.
 *
 * Fuente: polling al endpoint que retorna count activo (via Redis/KV
 * con TTL 5min). MVP: numero aleatorio determinista basado en productId
 * + tiempo para simular data realista.
 *
 * Props:
 *   productId — para generar numero consistente
 *   endpoint — API opcional (sino usa simulacion)
 *   refreshMs — polling interval (default 30s)
 */

import { useEffect, useState } from "react";
import { Eye } from "@buleje/design-system/icons";

interface Props {
  productId: string | number;
  endpoint?: string;
  refreshMs?: number;
  /** Umbral minimo para mostrar (si menos, oculta). Default 3 */
  minThreshold?: number;
}

/** Genera count determinista 0-30 basado en productId + bucket 5min */
function simulatedCount(productId: string | number): number {
  const bucket = Math.floor(Date.now() / 300_000); // 5 min buckets
  const seed = String(productId).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const raw = (seed * 7 + bucket * 13) % 30;
  return raw;
}

export default function LiveViewersChip({
  productId,
  endpoint,
  refreshMs = 30_000,
  minThreshold = 3,
}: Props) {
  const [count, setCount] = useState<number>(() => simulatedCount(productId));

  useEffect(() => {
    if (!endpoint) {
      // Simulacion: update cada refreshMs
      const id = setInterval(() => setCount(simulatedCount(productId)), refreshMs);
      return () => clearInterval(id);
    }
    let active = true;
    const controller = new AbortController();
    const fetchCount = async () => {
      try {
        const res = await fetch(`${endpoint}?productId=${encodeURIComponent(String(productId))}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (active && typeof data.count === "number") setCount(data.count);
      } catch {
        /* silent */
      }
    };
    fetchCount();
    const id = setInterval(fetchCount, refreshMs);
    return () => {
      active = false;
      controller.abort();
      clearInterval(id);
    };
  }, [productId, endpoint, refreshMs]);

  if (count < minThreshold) return null;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold"
      aria-label={`${count} personas viendo ahora`}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inset-0 rounded-full bg-[var(--accent)] animate-ping opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
      </span>
      <Eye className="h-3 w-3" strokeWidth={1.75} aria-hidden />
      {count} viendo ahora
    </span>
  );
}
