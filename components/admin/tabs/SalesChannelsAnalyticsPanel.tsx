"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  Users,
  ShoppingBag,
  TrendingUp,
  Loader2,
} from "@buleje/design-system/icons";
import { SectionTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";

/**
 * SalesChannelsAnalyticsPanel — rendimiento por canal social dentro de Canales
 * de Venta. Reusa el tracking de visitas de la tienda (`/api/store-page/
 * analytics`, que ya captura utm_source): agrupa las fuentes en TikTok / Meta /
 * Google / Directo / Otros y muestra visitas + conversiones + share por canal.
 *
 * IMPORTANTE: es tráfico+conversiones a nivel VISITA, no ingreso por pedido —
 * la atribución de S/ por canal requeriría capturar utm_source en el checkout
 * (zona de pagos). Se aclara en la UI para no prometer un dato que no existe.
 */

type Analytics = {
  visits7d: number;
  visits30d: number;
  conversions7d: number;
  conversions30d: number;
  conversionRate30d: number;
  topUtmSources: { source: string; count: number }[];
  visitsByDay: { day: string; visits: number; conversions: number }[];
};

type ChannelDef = { key: string; color: string; match: (s: string) => boolean };

// Orden = prioridad de match (Otros es el fallback).
const CHANNELS: ChannelDef[] = [
  { key: "TikTok", color: "var(--text-primary)", match: (s) => s.includes("tiktok") || s === "tt" },
  { key: "Meta", color: "var(--data-info-500)", match: (s) => /facebook|instagram|meta|^fb$|^ig$/.test(s) },
  { key: "Google", color: "var(--data-warning-500)", match: (s) => s.includes("google") || s.includes("gads") },
  { key: "Directo", color: "var(--text-tertiary)", match: (s) => s === "(none)" || s === "direct" || s === "directo" || s === "" },
];

function channelOf(source: string): string {
  const s = source.toLowerCase().trim();
  return CHANNELS.find((c) => c.match(s))?.key ?? "Otros";
}

function colorOf(key: string): string {
  return CHANNELS.find((c) => c.key === key)?.color ?? "var(--accent)";
}

export default function SalesChannelsAnalyticsPanel() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/store-page/analytics", { headers: csrfHeaders({}) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Analytics | null) => {
        if (active) setData(d);
      })
      .catch((err) => console.error("[sales-channels] analytics load failed", err))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  // Agrupa las fuentes UTM en canales y suma sus visitas.
  const byChannel = new Map<string, number>();
  let tracked = 0;
  for (const { source, count } of data?.topUtmSources ?? []) {
    const k = channelOf(source);
    byChannel.set(k, (byChannel.get(k) ?? 0) + count);
    tracked += count;
  }
  const rows = [...byChannel.entries()]
    .map(([key, visits]) => ({ key, visits, pct: tracked ? Math.round((visits / tracked) * 100) : 0 }))
    .sort((a, b) => b.visits - a.visits);

  const maxDay = Math.max(1, ...(data?.visitsByDay ?? []).map((d) => d.visits));

  return (
    <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 space-y-4">
      <header className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-[var(--accent)]" />
        <SectionTitle as="h2" className="text-base font-extrabold text-[var(--text-primary)]">Rendimiento por canal</SectionTitle>
      </header>

      {loading ? (
        <div className="py-8 text-center">
          <Loader2 className="h-5 w-5 animate-spin mx-auto text-[var(--text-tertiary)]" />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-3">
            <Kpi Icon={Users} label="Visitas (30d)" value={String(data?.visits30d ?? 0)} />
            <Kpi Icon={ShoppingBag} label="Conversiones (30d)" value={String(data?.conversions30d ?? 0)} />
            <Kpi Icon={TrendingUp} label="Tasa conversión" value={`${(data?.conversionRate30d ?? 0).toFixed(1)}%`} />
          </div>

          {/* Breakdown por canal */}
          {rows.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)] rounded-xl border-2 border-dashed border-[var(--rule-base)] px-3 py-4 text-center">
              Todavía no hay visitas etiquetadas por canal. Cuando compartas tu tienda con enlaces
              UTM (ej. <code className="font-mono">?utm_source=tiktok</code>) vas a ver acá cuánto
              tráfico trae cada red.
            </p>
          ) : (
            <div className="space-y-2.5">
              {rows.map((r) => (
                <div key={r.key} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-bold text-[var(--text-primary)]">{r.key}</span>
                    <span className="text-[var(--text-secondary)] tabular-nums">
                      {r.visits} visitas · {r.pct}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${r.pct}%`, background: colorOf(r.key) }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Mini serie diaria */}
          {(data?.visitsByDay?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)] mb-1.5">
                Visitas por día (30d)
              </p>
              <div className="flex items-end gap-0.5 h-16">
                {data!.visitsByDay.map((d) => (
                  <div
                    key={d.day}
                    title={`${d.day}: ${d.visits} visitas`}
                    className="flex-1 rounded-t bg-[var(--accent)] min-h-[2px]"
                    style={{ height: `${Math.max(4, (d.visits / maxDay) * 100)}%` }}
                  />
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-[var(--text-tertiary)]">
            Tráfico y conversiones de visitas a tu tienda. Para atribuir soles (S/) por canal se
            necesita capturar el <span className="font-mono">utm_source</span> en el checkout.
          </p>
        </>
      )}
    </section>
  );
}

function Kpi({ Icon, label, value }: { Icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-tertiary)]">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <p className="text-xl font-extrabold text-[var(--text-primary)] mt-1 tabular-nums">{value}</p>
    </div>
  );
}
