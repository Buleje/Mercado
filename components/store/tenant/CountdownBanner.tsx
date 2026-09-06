"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

/**
 * CountdownBanner — banda con cuenta regresiva (Brandon 2026-06-26, Modo
 * Creativo). Urgencia para ofertas. Client component (el tiempo corre en vivo).
 * Se oculta sola cuando la oferta termina. Usa el color primario de la marca.
 */
function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}
const pad = (n: number) => String(n).padStart(2, "0");

export default function CountdownBanner({
  title,
  endsAt,
}: {
  title: string;
  endsAt: string;
}) {
  const target = endsAt ? new Date(endsAt).getTime() : 0;
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!target) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (!target || Number.isNaN(target)) return null;
  // Antes de hidratar (now === null) muestra 00s (evita usar Date.now() en render →
  // sin hydration mismatch). Tras hidratar, si ya venció, se oculta.
  if (now !== null && now >= target) return null;

  const t = parts(now === null ? 0 : Math.max(0, target - now));

  return (
    <div
      data-pb="countdown"
      className="w-full text-white"
      style={{ background: "var(--tenant-primary, var(--accent))" }}
    >
      <div className="max-w-5xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
        <span className="inline-flex items-center gap-1.5 font-extrabold text-sm sm:text-base">
          <Clock className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          {title}
        </span>
        <span className="inline-flex items-center gap-1 font-mono font-extrabold tabular-nums">
          {t.d > 0 && (
            <>
              <Cell n={t.d} label="d" />
              <i className="not-italic opacity-70">:</i>
            </>
          )}
          <Cell n={t.h} label="h" />
          <i className="not-italic opacity-70">:</i>
          <Cell n={t.m} label="m" />
          <i className="not-italic opacity-70">:</i>
          <Cell n={t.s} label="s" />
        </span>
      </div>
    </div>
  );
}

function Cell({ n, label }: { n: number; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-0.5">
      <span className="rounded bg-white/20 px-1.5 py-0.5 text-sm sm:text-base">{pad(n)}</span>
      <span className="text-[length:var(--ts-2xs)] opacity-80">{label}</span>
    </span>
  );
}
