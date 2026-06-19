"use client";

/**
 * /superadmin/tenants/usage — Uso vs límites del plan por tienda
 * (gestión de tiendas, Brandon 2026-06-14). Detecta candidatas a upsell.
 *
 * v2 (Brandon 2026-06-19): KPIs ejecutivos + búsqueda/filtros (plan, cerca del
 * límite) + ordenamiento por columna + export CSV. Datos reales del endpoint.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Gauge, ArrowLeft, TrendingUp, MessageSquare, RefreshCw, Search, X,
  Download, Building2, AlertTriangle, Activity,
} from "@buleje/design-system/icons";
import { AdminTabShell } from "../../_components/_shared";
import { SuperAdminModuleTabs, TENANTS_TABS } from "@/components/superadmin/_shared/ModuleTabs";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";

type UpgradeRec = { recommendedPlan: string; recommendedLabel: string; upsidePEN: number; newOrderLimit: number | null };
type UsageRow = {
  slug: string; name: string; plan: string; tier: string;
  ordersThisMonth: number; orderLimit: number | null; orderPct: number;
  nearLimit: boolean; products: number; adminUsers: number;
  trialDaysLeft: number | null; ageDays: number;
  recommendation: UpgradeRec | null;
};
const isDoubleRisk = (r: UsageRow) => r.nearLimit && r.trialDaysLeft != null && r.trialDaysLeft >= 0 && r.trialDaysLeft <= 7;
function upgradeMsg(r: UsageRow): string {
  const to = r.recommendation ? ` a ${r.recommendation.recommendedLabel}` : "";
  return `Hola, vi que ${r.name} ya está al ${r.orderPct}% de su límite de pedidos del plan ${PLAN_LABEL[r.plan] ?? r.plan}. Te conviene subir${to} para no frenar tus ventas. ¿Lo activamos?`;
}
type UpsellSummary = { count: number; monthlyUpsidePEN: number };
type SortKey = "name" | "usage" | "orders" | "products" | "users";

const fmtPEN = (n: number) => `S/${n.toLocaleString("es-PE")}`;
const PLAN_LABEL: Record<string, string> = { free: "Free", starter: "Starter", pro: "Pro", business: "Business", enterprise: "Enterprise" };

function barColor(pct: number, near: boolean): string {
  if (near || pct >= 90) return "var(--data-error-500)";
  if (pct >= 70) return "#0d9488";
  return "var(--accent)";
}

function exportCSV(rows: UsageRow[]) {
  const head = ["Tienda", "Slug", "Plan", "Pedidos mes", "Límite", "Uso %", "Cerca límite", "Productos", "Usuarios", "Recomendación", "Upside PEN/mes"];
  const lines = rows.map((r) => [
    r.name, r.slug, r.plan, r.ordersThisMonth, r.orderLimit ?? "∞", r.orderPct,
    r.nearLimit ? "sí" : "no", r.products, r.adminUsers,
    r.recommendation?.recommendedLabel ?? "", r.recommendation?.upsidePEN ?? 0,
  ]);
  const csv = [head, ...lines].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url; a.download = `uso-limites-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

function KpiCard({ icon: Icon, label, value, sub, tone = "default" }: {
  icon: typeof Gauge; label: string; value: string; sub?: string; tone?: "default" | "good" | "warn" | "bad";
}) {
  const color =
    tone === "good" ? "text-[var(--data-success-600,#16a34a)]" :
    tone === "warn" ? "text-[#0d9488]" :
    tone === "bad" ? "text-[var(--data-error-600,#dc2626)]" : "text-[var(--text-primary)]";
  return (
    <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4">
      <div className="flex items-center gap-1.5 mb-2 text-[var(--text-tertiary)]">
        <Icon className="h-4 w-4" />
        <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider">{label}</span>
      </div>
      <p className={`font-display text-2xl font-extrabold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{sub}</p>}
    </div>
  );
}

export default function TenantsUsagePage() {
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [summary, setSummary] = useState<UpsellSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [nearOnly, setNearOnly] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "usage", dir: "desc" });
  const [detail, setDetail] = useState<UsageRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSuperadmin("/api/superadmin/tenants/usage");
      if (res.ok) {
        const d = (await res.json()) as { rows: UsageRow[]; upsell?: UpsellSummary };
        setRows(d.rows ?? []);
        setSummary(d.upsell ?? null);
      }
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const planOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.plan))), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (planFilter !== "all" && r.plan !== planFilter) return false;
      if (nearOnly && !r.nearLimit) return false;
      if (q && !`${r.name} ${r.slug} ${r.plan}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, planFilter, nearOnly]);

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === "name") return a.name.localeCompare(b.name) * dir;
      if (sort.key === "orders") return (a.ordersThisMonth - b.ordersThisMonth) * dir;
      if (sort.key === "products") return (a.products - b.products) * dir;
      if (sort.key === "users") return (a.adminUsers - b.adminUsers) * dir;
      return (a.orderPct - b.orderPct) * dir; // usage
    });
  }, [filtered, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === "asc" ? "▲" : "▼") : "⇅");

  const kpis = useMemo(() => {
    const limited = rows.filter((r) => r.orderLimit != null);
    const avgUsage = limited.length ? Math.round(limited.reduce((s, r) => s + r.orderPct, 0) / limited.length) : 0;
    return {
      total: rows.length,
      near: rows.filter((r) => r.nearLimit).length,
      saturated: rows.filter((r) => r.orderLimit != null && r.orderPct >= 100).length,
      avgUsage,
      upside: summary?.monthlyUpsidePEN ?? 0,
      doubleRisk: rows.filter(isDoubleRisk).length,
    };
  }, [rows, summary]);

  const upsell = filtered.filter((r) => r.nearLimit);
  const hasFilters = search !== "" || planFilter !== "all" || nearOnly;

  return (
    <>
      <SuperAdminModuleTabs tabs={TENANTS_TABS} />
      <AdminTabShell
        title="Uso vs límites"
        kicker="Plataforma · Tiendas"
        description="Consumo de cada tienda frente al límite de su plan. Identifica candidatas a upsell."
        icon={Gauge}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => exportCSV(sorted)} disabled={sorted.length === 0} className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 disabled:opacity-50">
              <Download className="h-4 w-4" /> CSV
            </button>
            <button onClick={() => void load()} disabled={loading} className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
            </button>
            <Link href="/superadmin/tenants" className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40">
              <ArrowLeft className="h-4 w-4" /> Tiendas
            </Link>
          </div>
        }
      >
        {/* KPIs ejecutivos */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          <KpiCard icon={Building2} label="Tiendas" value={String(kpis.total)} sub="con plan asignado" />
          <KpiCard icon={AlertTriangle} label="Cerca del límite" value={String(kpis.near)} sub="candidatas a upsell" tone={kpis.near > 0 ? "warn" : "good"} />
          <KpiCard icon={Gauge} label="Saturadas" value={String(kpis.saturated)} sub="≥100% del límite" tone={kpis.saturated > 0 ? "bad" : "good"} />
          <KpiCard icon={Activity} label="Uso promedio" value={`${kpis.avgUsage}%`} sub="planes con límite" />
          <KpiCard icon={TrendingUp} label="MRR potencial" value={fmtPEN(kpis.upside)} sub="/mes si convertís" tone={kpis.upside > 0 ? "warn" : "default"} />
          <KpiCard icon={AlertTriangle} label="Doble riesgo" value={String(kpis.doubleRisk)} sub="al límite + trial" tone={kpis.doubleRisk > 0 ? "bad" : "good"} />
        </div>

        {/* Resumen upsell */}
        {upsell.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-3 border-2 border-teal-500 bg-teal-50 dark:bg-teal-500/10 px-4 py-3">
            <TrendingUp className="h-5 w-5 text-[#0d9488] shrink-0" />
            <p className="text-sm font-bold text-[#0d9488]">
              {upsell.length} {upsell.length === 1 ? "tienda cerca" : "tiendas cerca"} del límite — candidatas a upsell
            </p>
            {summary && summary.monthlyUpsidePEN > 0 && (
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[#0d9488] px-3 py-1 text-sm font-extrabold text-white">
                +{fmtPEN(summary.monthlyUpsidePEN)}/mes de MRR potencial
              </span>
            )}
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar tienda, slug o plan…"
              className="h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] pl-10 pr-9 text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} aria-label="Limpiar" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            aria-label="Filtrar por plan"
            className="h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] cursor-pointer"
          >
            <option value="all">Todos los planes</option>
            {planOptions.map((p) => <option key={p} value={p}>{PLAN_LABEL[p] ?? p}</option>)}
          </select>
          <button
            type="button"
            onClick={() => setNearOnly((v) => !v)}
            aria-pressed={nearOnly}
            className={[
              "inline-flex h-11 items-center gap-1.5 rounded-xl px-3.5 text-sm font-bold transition-colors shrink-0",
              nearOnly ? "bg-[var(--data-error-500)] text-white" : "border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            ].join(" ")}
          >
            <AlertTriangle className="h-4 w-4" /> Cerca del límite
          </button>
        </div>

        {loading && rows.length === 0 ? (
          <div className="space-y-2">{[0,1,2,3,4].map((i) => <div key={i} className="h-14 animate-pulse bg-[var(--surface-sunken)] border border-[var(--rule-soft)]" />)}</div>
        ) : sorted.length === 0 ? (
          <div className="border-2 border-dashed border-[var(--rule-base)] py-12 text-center">
            <p className="text-sm font-bold text-[var(--text-primary)]">Ninguna tienda con estos filtros</p>
            {hasFilters && (
              <button type="button" onClick={() => { setSearch(""); setPlanFilter("all"); setNearOnly(false); }} className="mt-2 text-sm font-bold text-[var(--accent)] hover:underline">Limpiar filtros</button>
            )}
          </div>
        ) : (
          <>
            <p className="text-xs text-[var(--text-tertiary)] mb-2 tabular-nums">{sorted.length} de {rows.length} tiendas</p>
            <div className="overflow-x-auto border border-[var(--rule-base)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--surface-sunken)] text-left text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                    <th className="px-3 py-2.5"><button type="button" onClick={() => toggleSort("name")} className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-[var(--text-primary)]">Tienda <span className="text-[10px]" aria-hidden>{arrow("name")}</span></button></th>
                    <th className="px-3 py-2.5">Plan</th>
                    <th className="px-3 py-2.5 w-[34%]"><button type="button" onClick={() => toggleSort("usage")} className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-[var(--text-primary)]">Pedidos (mes) vs límite <span className="text-[10px]" aria-hidden>{arrow("usage")}</span></button></th>
                    <th className="px-3 py-2.5 text-right"><button type="button" onClick={() => toggleSort("products")} className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-[var(--text-primary)]">Productos <span className="text-[10px]" aria-hidden>{arrow("products")}</span></button></th>
                    <th className="px-3 py-2.5 text-right"><button type="button" onClick={() => toggleSort("users")} className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-[var(--text-primary)]">Usuarios <span className="text-[10px]" aria-hidden>{arrow("users")}</span></button></th>
                    <th className="px-3 py-2.5 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--rule-base)]">
                  {sorted.map((r) => (
                    <tr key={r.slug} className={r.nearLimit ? "bg-[var(--data-error-500)]/5" : ""}>
                      <td className="px-3 py-2.5 max-w-[220px]">
                        <button type="button" onClick={() => setDetail(r)} className="flex items-center gap-1.5 max-w-full font-bold text-[var(--text-primary)] hover:text-[var(--accent)]">
                          <span className="truncate">{r.name}</span>
                          {isDoubleRisk(r) && <span className="rounded-full bg-[var(--data-error-500)] px-1.5 py-0.5 text-[10px] font-extrabold text-white shrink-0">trial −{r.trialDaysLeft}d</span>}
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--surface-sunken)] text-[var(--text-secondary)]">{PLAN_LABEL[r.plan] ?? r.plan}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-[var(--surface-sunken)] overflow-hidden min-w-[80px]">
                            <div className="h-full" style={{ width: `${Math.min(100, r.orderPct)}%`, background: barColor(r.orderPct, r.nearLimit) }} />
                          </div>
                          <span className="tabular-nums text-xs text-[var(--text-secondary)] shrink-0 w-24 text-right">
                            {r.ordersThisMonth}{r.orderLimit != null ? ` / ${r.orderLimit}` : " / ∞"}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{r.products}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{r.adminUsers}</td>
                      <td className="px-3 py-2.5 text-right">
                        {r.nearLimit && r.recommendation ? (
                          <Link href={`/superadmin/chat?tenant=${r.slug}&msg=${encodeURIComponent(upgradeMsg(r))}`} className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--accent)] hover:underline" title={upgradeMsg(r)}>
                            <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                            <span>→ {r.recommendation.recommendedLabel}</span>
                            {r.recommendation.upsidePEN > 0 && (
                              <span className="rounded-full bg-[#0d9488]/15 px-1.5 py-0.5 font-extrabold text-[#0d9488] whitespace-nowrap">+{fmtPEN(r.recommendation.upsidePEN)}/mes</span>
                            )}
                          </Link>
                        ) : r.nearLimit ? (
                          <Link href={`/superadmin/chat?tenant=${r.slug}&msg=${encodeURIComponent(upgradeMsg(r))}`} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent)] hover:underline">
                            <MessageSquare className="h-3.5 w-3.5" /> Ofrecer upgrade
                          </Link>
                        ) : (
                          <span className="text-xs text-[var(--text-tertiary)]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </AdminTabShell>

      {/* Drawer de detalle por tienda */}
      {detail && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/50" onClick={() => setDetail(null)} aria-hidden />
          <aside role="dialog" aria-label={`Uso de ${detail.name}`} className="fixed top-0 right-0 h-full w-full max-w-md z-[61] bg-[var(--surface-raised)] border-l border-[var(--rule-base)] shadow-[var(--shadow-xl)] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-base)] shrink-0">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-[var(--text-primary)] truncate">{detail.name}</h2>
                <p className="text-xs text-[var(--text-tertiary)] truncate font-mono">{detail.slug} · {PLAN_LABEL[detail.plan] ?? detail.plan}</p>
              </div>
              <button type="button" onClick={() => setDetail(null)} aria-label="Cerrar" className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] shrink-0"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Uso de pedidos */}
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Pedidos del mes</p>
                  <p className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]">{detail.ordersThisMonth}{detail.orderLimit != null ? ` / ${detail.orderLimit}` : " / ∞"} <span className="text-[var(--text-tertiary)]">({detail.orderPct}%)</span></p>
                </div>
                <div className="h-3 rounded bg-[var(--surface-sunken)] overflow-hidden">
                  <div className="h-full" style={{ width: `${Math.min(100, detail.orderPct)}%`, background: barColor(detail.orderPct, detail.nearLimit) }} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="border border-[var(--rule-soft)] p-2.5"><p className="text-[length:var(--ts-2xs)] font-extrabold uppercase text-[var(--text-tertiary)]">Productos</p><p className="font-display text-xl font-extrabold tabular-nums text-[var(--text-primary)]">{detail.products}</p></div>
                <div className="border border-[var(--rule-soft)] p-2.5"><p className="text-[length:var(--ts-2xs)] font-extrabold uppercase text-[var(--text-tertiary)]">Usuarios</p><p className="font-display text-xl font-extrabold tabular-nums text-[var(--text-primary)]">{detail.adminUsers}</p></div>
                <div className="border border-[var(--rule-soft)] p-2.5"><p className="text-[length:var(--ts-2xs)] font-extrabold uppercase text-[var(--text-tertiary)]">Antigüedad</p><p className="font-display text-xl font-extrabold tabular-nums text-[var(--text-primary)]">{detail.ageDays}d</p></div>
              </div>
              {detail.trialDaysLeft != null && (
                <div className={`flex items-center gap-2 border p-3 text-sm ${isDoubleRisk(detail) ? "border-[var(--data-error-500)] bg-[var(--data-error-500)]/5 text-[var(--data-error-600,#dc2626)]" : "border-[var(--rule-soft)] text-[var(--text-secondary)]"}`}>
                  <Gauge className="h-4 w-4 shrink-0" />
                  Trial: {detail.trialDaysLeft >= 0 ? `vence en ${detail.trialDaysLeft}d` : `venció hace ${-detail.trialDaysLeft}d`}
                  {isDoubleRisk(detail) && <span className="ml-auto font-extrabold">DOBLE RIESGO</span>}
                </div>
              )}
              {detail.recommendation && (
                <div className="border border-[#0d9488]/40 bg-[#0d9488]/5 p-3">
                  <p className="text-sm font-bold text-[#0d9488]">Recomendación: subir a {detail.recommendation.recommendedLabel}</p>
                  {detail.recommendation.upsidePEN > 0 && <p className="text-xs text-[var(--text-secondary)] mt-0.5">+{fmtPEN(detail.recommendation.upsidePEN)}/mes de MRR · nuevo límite {detail.recommendation.newOrderLimit ?? "∞"} pedidos</p>}
                </div>
              )}
              {detail.nearLimit && (
                <div className="border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-3">
                  <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">Mensaje sugerido</p>
                  <p className="text-sm text-[var(--text-secondary)]">{upgradeMsg(detail)}</p>
                </div>
              )}
              {detail.nearLimit && (
                <Link href={`/superadmin/chat?tenant=${detail.slug}&msg=${encodeURIComponent(upgradeMsg(detail))}`} className="inline-flex w-full h-11 items-center justify-center gap-1.5 rounded-xl bg-[var(--accent)] text-sm font-bold text-white hover:brightness-110">
                  <MessageSquare className="h-4 w-4" /> Ofrecer upgrade por chat
                </Link>
              )}
            </div>
          </aside>
        </>
      )}
    </>
  );
}
