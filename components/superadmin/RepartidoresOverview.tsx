"use client";

/**
 * Panorama EJECUTIVO de la flota de repartidores (cross-tenant) — funciones de
 * alto nivel sobre /superadmin/repartidores (Brandon 2026-06-19). Se monta arriba
 * del módulo de aprobación; datos reales vía /api/superadmin/repartidores/overview.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Users, Star, Truck, Clock, MapPin, ChevronDown, AlertTriangle, TrendingUp,
  Activity, RefreshCw, Trophy,
} from "@buleje/design-system/icons";

type Fleet = {
  total: number; active: number; online: number; pending: number; onlinePct: number;
  avgRating: number | null; avgAcceptance: number | null; totalDeliveries: number;
  deliveries24h: number; deliveries7d: number; avgDeliveryMin: number | null;
};
type Sos = { id: string; partnerId: string; name: string; message: string | null; createdAt: string };
type TopPerformer = { id: string; name: string; zone: string; rating: number; acceptanceRate: number; totalAccepted: number; tenant: string | null; isOnline: boolean };
type AtRisk = { id: string; name: string; zone: string; rating: number; acceptanceRate: number; lastPingAt: string | null; tenant: string | null; reasons: string[] };
type Zone = { zone: string; count: number; online: number; avgRating: number };
type Overview = { fleet: Fleet; sos: Sos[]; topPerformers: TopPerformer[]; atRisk: AtRisk[]; byZone: Zone[] };

function KpiCard({ icon: Icon, label, value, sub, tone = "default" }: {
  icon: typeof Users; label: string; value: string; sub?: string; tone?: "default" | "good" | "warn";
}) {
  const valueColor =
    tone === "good" ? "text-[var(--data-success-600,#16a34a)]" :
    tone === "warn" ? "text-[#0d9488]" : "text-[var(--text-primary)]";
  return (
    <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4">
      <div className="flex items-center gap-1.5 mb-2 text-[var(--text-tertiary)]">
        <Icon className="h-4 w-4" />
        <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider">{label}</span>
      </div>
      <p className={`font-display text-2xl font-extrabold tabular-nums ${valueColor}`}>{value}</p>
      {sub && <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{sub}</p>}
    </div>
  );
}

export default function RepartidoresOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/superadmin/repartidores/overview");
      if (res.ok) setData((await res.json()) as Overview);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const f = data?.fleet;

  return (
    <section className="mb-6 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-[var(--rule-soft)]">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 min-w-0">
          <Activity className="h-5 w-5 text-[var(--accent)] shrink-0" />
          <span className="text-base font-extrabold text-[var(--text-primary)] truncate">Panorama de la flota</span>
          <ChevronDown className={`h-4 w-4 text-[var(--text-tertiary)] transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
        <button type="button" onClick={() => void load()} disabled={loading} title="Actualizar" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent)]/40 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="p-4 sm:p-5 space-y-5">
          {loading && !data ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-[var(--surface-sunken)]" />)}
            </div>
          ) : !data ? (
            <p className="text-sm text-[var(--text-tertiary)] py-6 text-center">No se pudo cargar el panorama.</p>
          ) : (
            <>
              {/* SOS activos — seguridad, prioridad máxima */}
              {data.sos.length > 0 && (
                <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[color-mix(in_oklch,var(--data-error)_8%,transparent)] p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-5 w-5 text-[var(--data-error-500)]" />
                    <p className="text-sm font-extrabold text-[var(--data-error-600,#dc2626)]">{data.sos.length} SOS activo{data.sos.length > 1 ? "s" : ""} — atención inmediata</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {data.sos.map((s) => (
                      <span key={s.id} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--data-error-500)]/30 px-2.5 py-1 text-xs font-bold text-[var(--text-primary)]">
                        {s.name}{s.message ? ` · ${s.message}` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* KPIs de flota */}
              {f && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <KpiCard icon={Activity} label="Online ahora" value={`${f.online}/${f.active}`} sub={`${f.onlinePct}% de activos`} tone={f.onlinePct >= 30 ? "good" : "warn"} />
                  <KpiCard icon={Star} label="Rating prom" value={f.avgRating != null ? Number(f.avgRating).toFixed(2) : "—"} sub="sobre 5.0" tone={f.avgRating != null && f.avgRating >= 4.5 ? "good" : "warn"} />
                  <KpiCard icon={TrendingUp} label="Aceptación" value={f.avgAcceptance != null ? `${Math.round(f.avgAcceptance * 100)}%` : "—"} sub="promedio flota" tone={f.avgAcceptance != null && f.avgAcceptance >= 0.7 ? "good" : "warn"} />
                  <KpiCard icon={Truck} label="Entregas 7d" value={f.deliveries7d.toLocaleString()} sub={`${f.deliveries24h} en 24h`} />
                  <KpiCard icon={Clock} label="Tiempo medio" value={f.avgDeliveryMin != null ? `${f.avgDeliveryMin}m` : "—"} sub="pedido → entregado" />
                  <KpiCard icon={Users} label="Total flota" value={f.total.toLocaleString()} sub={`${f.pending} por aprobar`} tone={f.pending > 0 ? "warn" : "default"} />
                </div>
              )}

              {/* Leaderboard + En riesgo */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Trophy className="h-4 w-4 text-[var(--accent)]" />
                    <h3 className="text-sm font-extrabold text-[var(--text-primary)]">Top repartidores</h3>
                  </div>
                  {data.topPerformers.length === 0 ? (
                    <p className="text-xs text-[var(--text-tertiary)]">Sin datos aún.</p>
                  ) : (
                    <ol className="space-y-2">
                      {data.topPerformers.map((p, i) => (
                        <li key={p.id} className="flex items-center gap-3">
                          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-extrabold tabular-nums">{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-[var(--text-primary)] truncate">{p.name}{p.isOnline && <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-[var(--data-success-500)] align-middle" title="Online" />}</p>
                            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate">{p.zone}{p.tenant ? ` · ${p.tenant}` : ""}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]">{p.totalAccepted}</p>
                            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] tabular-nums">★{Number(p.rating).toFixed(1)} · {Math.round(p.acceptanceRate * 100)}%</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="h-4 w-4 text-[#0d9488]" />
                    <h3 className="text-sm font-extrabold text-[var(--text-primary)]">En riesgo / atención <span className="text-[var(--text-tertiary)] font-bold">{data.atRisk.length}</span></h3>
                  </div>
                  {data.atRisk.length === 0 ? (
                    <p className="text-xs text-[var(--text-tertiary)]">Ningún repartidor en riesgo. 🎯</p>
                  ) : (
                    <ul className="space-y-2">
                      {data.atRisk.map((p) => (
                        <li key={p.id} className="flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-[var(--text-primary)] truncate">{p.name}</p>
                            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate">{p.zone}{p.tenant ? ` · ${p.tenant}` : ""}</p>
                          </div>
                          <div className="flex flex-wrap justify-end gap-1 shrink-0 max-w-[55%]">
                            {p.reasons.map((r) => (
                              <span key={r} className="rounded-md bg-[color-mix(in_oklch,#0d9488_12%,transparent)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[#0d9488]">{r}</span>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Cobertura por zona */}
              {data.byZone.length > 0 && (
                <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin className="h-4 w-4 text-[var(--accent)]" />
                    <h3 className="text-sm font-extrabold text-[var(--text-primary)]">Cobertura por zona</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {data.byZone.map((z) => (
                      <div key={z.zone} className="rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-2">
                        <p className="text-sm font-bold text-[var(--text-primary)]">{z.zone}</p>
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] tabular-nums">
                          <span className="text-[var(--data-success-500)] font-bold">{z.online}</span>/{z.count} online · ★{Number(z.avgRating).toFixed(1)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
