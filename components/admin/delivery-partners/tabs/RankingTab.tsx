"use client";
import { useState, useEffect, useCallback } from "react";
import { CardTitle } from "@buleje/design-system";
import { CheckCircle, Clock, DollarSign, Star, Trophy, Users } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { tenantFetch } from "@/lib/tenant-fetch";
import { TableSkeleton, VehicleIcon, toNum } from "@/components/admin/delivery-partners/shared";

export function RankingTab() {
  const [data, setData] = useState<RankingEntry[]>([]);
  const [summary, setSummary] = useState<RankingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"week" | "month" | "all">("month");

  const fetchRanking = useCallback((p: string) => {
    setLoading(true);
    tenantFetch(`/api/admin/delivery/ranking?period=${p}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { ranking: [], summary: null }))
      .then((d) => {
        setData(d.ranking ?? []);
        setSummary(d.summary ?? null);
      })
      .catch(() => { setData([]); setSummary(null); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchRanking(period); }, [fetchRanking, period]);

  const PERIODS: { id: "week" | "month" | "all"; label: string }[] = [
    { id: "week",  label: "Esta semana" },
    { id: "month", label: "Este mes" },
    { id: "all",   label: "Todo" },
  ];

  const periodLabel = PERIODS.find((p) => p.id === period)?.label.toLowerCase() ?? "";
  const topPartner = data[0];

  return (
    <div className="space-y-6">
      {/* ── 1. Hero card con period selector + KPIs ─────────────── */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--data-warning-100)] text-[var(--data-warning-500)] shrink-0">
              <Trophy className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="font-display text-xl leading-tight">
                Ranking de repartidores
              </CardTitle>
              <p className="text-sm text-[var(--text-secondary)] mt-1 leading-snug">
                {topPartner
                  ? <>👑 <span className="font-bold text-[var(--text-primary)]">{topPartner.name}</span> lidera {periodLabel} con {topPartner.delivered} entregas y rating {toNum(topPartner.rating).toFixed(1)}.</>
                  : `Métricas de rendimiento ${periodLabel}. Aceptación, entregas, ratings y ganancias.`}
              </p>
            </div>
          </div>

          {/* Period pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={cn(
                  "px-4 h-10 rounded-xl text-sm font-bold transition-colors border",
                  period === p.id
                    ? "bg-primary text-white border-primary"
                    : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-soft)] hover:bg-[var(--surface-sunken)]",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {summary ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                  <Users className="h-5 w-5 text-primary" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Repartidores
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-[var(--text-primary)] leading-tight mt-2">
                {summary.totalPartners}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">Activos en ranking</p>
            </div>
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                  <CheckCircle className="h-5 w-5 text-[var(--data-success-500)]" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Entregados
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-[var(--data-success-500)] leading-tight mt-2">
                {summary.totalDelivered}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">Total entregas</p>
            </div>
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                  <DollarSign className="h-5 w-5 text-[var(--data-success-500)]" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Pagado a riders
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-[var(--text-primary)] leading-tight mt-2">
                S/{toNum(summary.totalEarnings).toFixed(0)}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">Tarifas acumuladas</p>
            </div>
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                  <Trophy className="h-5 w-5 text-primary" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Completion avg
              </p>
              <p className={cn(
                "text-3xl font-extrabold tabular-nums leading-tight mt-2",
                summary.avgCompletionRate >= 0.85
                  ? "text-[var(--data-success-500)]"
                  : summary.avgCompletionRate >= 0.5
                    ? "text-[var(--data-warning-500)]"
                    : "text-[var(--data-error-500)]",
              )}>
                {Math.round(summary.avgCompletionRate * 100)}%
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">Tasa de éxito</p>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── 2. Tabla / Empty / Loading ──────────────────────────── */}
      {loading ? (
        <TableSkeleton />
      ) : data.length === 0 ? (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-12 text-center shadow-sm">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-sunken)] mb-4">
            <Trophy className="h-8 w-8 text-[var(--text-tertiary)]" />
          </span>
          <p className="font-display text-xl font-extrabold text-[var(--text-primary)]">
            Sin datos de ranking
          </p>
          <p className="text-base text-[var(--text-secondary)] mt-2 max-w-md mx-auto leading-relaxed">
            No hay entregas registradas {periodLabel}. Cambia el periodo o esperá a que tus repartidores acumulen actividad.
          </p>
        </div>
      ) : (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--rule-base)] flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Tabla de posiciones · {periodLabel}
            </p>
            <p className="text-sm text-[var(--text-tertiary)] font-bold">
              {data.length} {data.length === 1 ? "repartidor" : "repartidores"}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-sunken)] border-b border-[var(--rule-base)]">
                <tr className="text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  <th className="px-6 py-4 w-16">#</th>
                  <th className="px-6 py-4">Repartidor</th>
                  <th className="px-4 py-4 text-center">Rating</th>
                  <th className="px-4 py-4 text-center">Aceptación</th>
                  <th className="px-4 py-4 text-center">Entregas</th>
                  <th className="px-4 py-4 text-center">Cancel.</th>
                  <th className="px-4 py-4 text-center">Avg min</th>
                  <th className="px-4 py-4 text-right">Ganado</th>
                  <th className="px-6 py-4 text-center">Completion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {data.map((entry, idx) => {
                  const isPodium = idx < 3;
                  const medalBg = idx === 0
                    ? "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]"
                    : idx === 1
                      ? "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                      : idx === 2
                        ? "bg-[var(--data-error-100)] text-[var(--data-error-500)]"
                        : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]";
                  return (
                    <tr
                      key={entry.id}
                      className={cn(
                        "transition-colors hover:bg-[var(--surface-sunken)]/50",
                        isPodium && "bg-[var(--data-warning-50)]/30",
                      )}
                    >
                      <td className="px-6 py-4">
                        <span className={cn(
                          "inline-flex items-center justify-center h-10 w-10 rounded-xl font-extrabold tabular-nums text-base",
                          medalBg,
                        )}>
                          {isPodium ? <Trophy className="h-5 w-5" /> : idx + 1}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-11 w-11 rounded-2xl flex items-center justify-center text-base font-extrabold text-[var(--accent-ink)] dark:text-[var(--accent)] bg-primary/10 shrink-0">
                            {entry.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-extrabold text-[var(--text-primary)] text-base leading-tight truncate">
                              {entry.name}
                            </p>
                            <p className="text-sm text-[var(--text-tertiary)] mt-0.5 flex items-center gap-1.5">
                              <VehicleIcon type={entry.vehicleType} className="h-3.5 w-3.5" />
                              <span className="font-mono">{entry.phone}</span>
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="inline-flex items-center justify-center gap-1 text-base font-extrabold text-[var(--data-warning-500)] tabular-nums">
                          <Star className="h-4 w-4 fill-[var(--data-warning-500)] text-[var(--data-warning-500)]" />
                          {toNum(entry.rating).toFixed(1)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center text-base font-bold text-[var(--text-secondary)] tabular-nums">
                        {Math.round(entry.acceptanceRate * 100)}%
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-base font-extrabold text-[var(--data-success-500)] tabular-nums">
                          {entry.delivered}
                        </span>
                        {entry.inProgress > 0 && (
                          <span className="ml-1 text-sm text-[var(--text-tertiary)] font-bold">
                            +{entry.inProgress}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center text-base text-[var(--text-tertiary)] tabular-nums font-bold">
                        {entry.cancelled || "—"}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="inline-flex items-center justify-center gap-1 text-base text-[var(--text-secondary)] font-bold tabular-nums">
                          <Clock className="h-4 w-4 text-[var(--text-tertiary)]" />
                          {entry.avgDeliveryMin != null ? `${Math.round(entry.avgDeliveryMin)}` : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right text-base font-extrabold text-[var(--text-primary)] tabular-nums">
                        S/{toNum(entry.totalEarnings).toFixed(0)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={cn(
                          "inline-flex items-center justify-center h-9 px-3 rounded-full text-sm font-extrabold tabular-nums",
                          entry.completionRate >= 0.85
                            ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                            : entry.completionRate >= 0.5
                              ? "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]"
                              : "bg-[var(--data-error-100)] text-[var(--data-error-500)]",
                        )}>
                          {Math.round(entry.completionRate * 100)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


// ── Tipos movidos de DeliveryPartnersModule (refactor 2026-06-15) ──
interface RankingEntry {
  id: string;
  name: string;
  phone: string;
  vehicleType: string;
  rating: number;
  acceptanceRate: number;
  delivered: number;
  cancelled: number;
  inProgress: number;
  totalAssignments: number;
  totalEarnings: number;
  completionRate: number;
  avgDeliveryMin: number | null;
}

interface RankingSummary {
  totalPartners: number;
  totalDelivered: number;
  totalEarnings: number;
  avgCompletionRate: number;
}
