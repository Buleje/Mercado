"use client";

/**
 * CommandCenterAttention — cockpit "lo que necesita tu atención AHORA" (Brandon
 * 2026-06-19). Una sola fila de tarjetas en vivo que unifican los 5 módulos de
 * soporte + el estado operativo, cada una con severidad y salto directo. Datos
 * reales de /api/superadmin/command-center.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, RefreshCw, CheckCircle2, ArrowRight } from "@buleje/design-system/icons";
import { useVisiblePolling } from "@/components/superadmin/_shared/useVisiblePolling";

type Item = { key: string; label: string; count: number; sub?: string; href: string; severity: "bad" | "warn" | "good" };
type Data = { items: Item[]; totalUrgent: number; generatedAt: string };

const TONE: Record<string, { ring: string; num: string }> = {
  bad: { ring: "border-[var(--data-error-500)]/40 hover:border-[var(--data-error-500)]", num: "text-[var(--data-error-600,#dc2626)]" },
  warn: { ring: "border-[#0d9488]/40 hover:border-[#0d9488]", num: "text-[#0d9488]" },
  good: { ring: "border-[var(--rule-soft)] hover:border-[var(--accent)]/40", num: "text-[var(--text-tertiary)]" },
};

export function CommandCenterAttention() {
  const [d, setD] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/superadmin/command-center", { credentials: "include", cache: "no-store" });
      if (res.ok) setD((await res.json()) as Data);
    } finally { if (!silent) setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useVisiblePolling(() => void load(true), 20_000);

  if (loading && !d) return <div className="h-40 animate-pulse rounded-2xl bg-[var(--surface-sunken)] border border-[var(--rule-base)]" />;
  if (!d) return null;

  return (
    <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${d.totalUrgent > 0 ? "bg-[var(--data-error-500)]/10 text-[var(--data-error-600,#dc2626)]" : "bg-[var(--data-success-500)]/10 text-[var(--data-success-600,#059669)]"}`}>
            {d.totalUrgent > 0 ? <Bell className="h-4 w-4" strokeWidth={1.75} /> : <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />}
          </span>
          <div>
            <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">Lo que necesita tu atención ahora</h3>
            <p className="text-xs text-[var(--text-tertiary)]">{d.totalUrgent > 0 ? `${d.totalUrgent} cosas pendientes en total` : "Todo bajo control"} · en vivo · auto 20s</p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent)]/40"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {d.items.map((it) => {
          const t = TONE[it.severity];
          return (
            <Link key={it.key} href={it.href} className={`group rounded-xl border-2 bg-[var(--surface-raised)] p-3 transition-colors ${t.ring}`}>
              <p className={`font-display text-3xl font-extrabold tabular-nums ${t.num}`}>{it.count}</p>
              <p className="mt-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-primary)] leading-tight">{it.label}</p>
              {it.sub && <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5 truncate">{it.sub}</p>}
              <span className="mt-1 inline-flex items-center gap-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity">Ir <ArrowRight className="h-3 w-3" /></span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
