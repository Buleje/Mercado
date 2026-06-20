"use client";

/**
 * FeatureAdoptionConsole — adopción de funciones (Brandon 2026-06-19, idea #4).
 * Qué módulos usan los negocios (derivado de ActivityLog) + oportunidades de
 * coaching/upsell: a qué negocio ofrecerle qué función de crecimiento que no usa.
 * Datos reales de /api/superadmin/feature-adoption. Reusa SAKpiCard.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  TrendingUp, Layers, Users, Sparkles, Lightbulb, Store, MessageSquare,
  ExternalLink, RefreshCw,
} from "@buleje/design-system/icons";
import { SAKpiCard } from "@/components/superadmin/_shared/SAKpiCard";
import { useVisiblePolling } from "@/components/superadmin/_shared/useVisiblePolling";

type Feature = { key: string; label: string; growth: boolean; tenantsUsing: number; adoptionPct: number };
type Gap = { tenantId: string; tenantName: string; tenantSlug: string; missing: string[]; uses: number };
type Data = {
  features: Feature[]; gaps: Gap[];
  kpis: { tracked: number; activeTenants: number; avgFeatures: number; opportunities: number; worstFeature: string | null };
};

export function FeatureAdoptionConsole() {
  const [d, setD] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/superadmin/feature-adoption", { credentials: "include", cache: "no-store" });
      if (res.ok) setD((await res.json()) as Data);
    } finally { if (!silent) setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useVisiblePolling(() => void load(true), 60_000);

  if (loading && !d) return <div className="h-96 animate-pulse rounded-2xl bg-[var(--surface-sunken)] border border-[var(--rule-base)]" />;
  if (!d) return null;
  const k = d.kpis;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <SAKpiCard icon={Layers} label="Funciones" value={k.tracked} sub="rastreadas" />
        <SAKpiCard icon={Users} label="Tiendas activas" value={k.activeTenants} />
        <SAKpiCard icon={TrendingUp} label="Adopción media" value={`${k.avgFeatures}`} sub="funciones por tienda" tone={k.avgFeatures >= 5 ? "good" : "warn"} />
        <SAKpiCard icon={Lightbulb} label="Oportunidades" value={k.opportunities} sub="de coaching/upsell" tone={k.opportunities > 0 ? "warn" : "good"} />
        <SAKpiCard icon={Sparkles} label="Más sub-usada" value={k.worstFeature ? k.worstFeature.split(" (")[0] : "—"} sub={k.worstFeature ? k.worstFeature.match(/\((.+)\)/)?.[1] : ""} tone="bad" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Adopción por función */}
        <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
          <header className="flex items-center justify-between gap-2 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-4 py-3">
            <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-[var(--accent)]" /><h3 className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Adopción por función</h3></div>
            <button type="button" onClick={() => void load()} className="inline-flex h-7 items-center rounded-lg border border-[var(--rule-base)] px-2 text-[var(--text-tertiary)] hover:border-[var(--accent)]/40"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></button>
          </header>
          <div className="p-4 space-y-2">
            {d.features.map((f) => (
              <div key={f.key} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-sm font-bold text-[var(--text-primary)] truncate flex items-center gap-1">{f.label}{f.growth && <Sparkles className="h-3 w-3 text-[var(--accent)] shrink-0" />}</span>
                <div className="flex-1 h-3 rounded bg-[var(--surface-sunken)] overflow-hidden">
                  <div className={`h-full ${f.adoptionPct < 25 ? "bg-[var(--data-error-500)]" : f.adoptionPct < 60 ? "bg-[#0d9488]" : "bg-[var(--data-success-500)]"}`} style={{ width: `${Math.max(3, f.adoptionPct)}%` }} />
                </div>
                <span className="w-20 shrink-0 text-right text-xs tabular-nums text-[var(--text-tertiary)]">{f.adoptionPct}% · {f.tenantsUsing}/{k.activeTenants}</span>
              </div>
            ))}
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] pt-1"><Sparkles className="h-3 w-3 inline text-[var(--accent)]" /> = función de crecimiento (la que sube valor/retención).</p>
          </div>
        </section>

        {/* Oportunidades de coaching */}
        <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
          <header className="flex items-center gap-2 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-4 py-3">
            <Lightbulb className="h-4 w-4 text-[var(--accent)]" /><h3 className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Oportunidades de coaching ({d.gaps.length})</h3>
          </header>
          <div className="p-4">
            {d.gaps.length === 0 ? <p className="text-xs text-[var(--text-tertiary)]">Todos los negocios usan las funciones clave.</p> : (
              <ul className="space-y-2.5 max-h-[420px] overflow-y-auto">
                {d.gaps.map((g) => (
                  <li key={g.tenantId} className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Link href={`/superadmin/tenants/${encodeURIComponent(g.tenantSlug)}`} className="inline-flex items-center gap-1 text-sm font-extrabold text-[var(--text-primary)] hover:text-[var(--accent)] hover:underline"><Store className="h-3.5 w-3.5 text-[var(--accent)]" /> {g.tenantName}</Link>
                      <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">usa {g.uses} func.</span>
                      <div className="ml-auto flex items-center gap-1.5">
                        <Link href={`/superadmin/chat?tenant=${encodeURIComponent(g.tenantSlug)}&msg=${encodeURIComponent(`Hola, vi que ${g.tenantName} todavía no usa ${g.missing[0]}. Te muestro cómo te puede ayudar a vender más.`)}`} className="inline-flex h-7 items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]" title="Ofrecer ayuda"><MessageSquare className="h-3.5 w-3.5" /> Ofrecer</Link>
                        <Link href={`/superadmin/tenants/${encodeURIComponent(g.tenantSlug)}`} className="inline-flex h-7 items-center gap-1 rounded-lg bg-[var(--accent)] px-2 text-xs font-bold text-white hover:brightness-110" title="Ficha 360">Ficha <ExternalLink className="h-3 w-3" /></Link>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {g.missing.map((m) => <span key={m} className="rounded bg-[var(--accent)]/8 px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--accent)]">{m}</span>)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
