"use client";

/**
 * /superadmin/tenants/usage — Uso vs límites del plan por tienda
 * (gestión de tiendas, Brandon 2026-06-14). Detecta candidatas a upsell.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Gauge, ArrowLeft, TrendingUp, MessageSquare, RefreshCw } from "@buleje/design-system/icons";
import { AdminTabShell } from "../../_components/_shared";
import { SuperAdminModuleTabs, TENANTS_TABS } from "@/components/superadmin/_shared/ModuleTabs";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";

type UpgradeRec = { recommendedPlan: string; recommendedLabel: string; upsidePEN: number; newOrderLimit: number | null };
type UsageRow = {
  slug: string; name: string; plan: string; tier: string;
  ordersThisMonth: number; orderLimit: number | null; orderPct: number;
  nearLimit: boolean; products: number; adminUsers: number;
  recommendation: UpgradeRec | null;
};
type UpsellSummary = { count: number; monthlyUpsidePEN: number };
const fmtPEN = (n: number) => `S/${n.toLocaleString("es-PE")}`;

const PLAN_LABEL: Record<string, string> = { free: "Free", starter: "Starter", pro: "Pro", business: "Business", enterprise: "Enterprise" };

function barColor(pct: number, near: boolean): string {
  if (near || pct >= 90) return "var(--data-error-500)";
  if (pct >= 70) return "#0d9488";
  return "var(--accent)";
}

export default function TenantsUsagePage() {
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [summary, setSummary] = useState<UpsellSummary | null>(null);
  const [loading, setLoading] = useState(true);

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

  const upsell = rows.filter((r) => r.nearLimit);

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
          <button onClick={() => void load()} disabled={loading} className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
          </button>
          <Link href="/superadmin/tenants" className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40">
            <ArrowLeft className="h-4 w-4" /> Tiendas
          </Link>
        </div>
      }
    >
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

      {loading && rows.length === 0 ? (
        <div className="space-y-2">{[0,1,2,3,4].map((i) => <div key={i} className="h-14 animate-pulse bg-[var(--surface-sunken)] border border-[var(--rule-soft)]" />)}</div>
      ) : (
        <div className="overflow-x-auto border border-[var(--rule-base)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--surface-sunken)] text-left text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                <th className="px-3 py-2.5">Tienda</th>
                <th className="px-3 py-2.5">Plan</th>
                <th className="px-3 py-2.5 w-[34%]">Pedidos (mes) vs límite</th>
                <th className="px-3 py-2.5 text-right">Productos</th>
                <th className="px-3 py-2.5 text-right">Usuarios</th>
                <th className="px-3 py-2.5 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--rule-base)]">
              {rows.map((r) => (
                <tr key={r.slug} className={r.nearLimit ? "bg-[var(--data-error-500)]/5" : ""}>
                  <td className="px-3 py-2.5 font-bold text-[var(--text-primary)] truncate max-w-[200px]">{r.name}</td>
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
                      <Link href={`/superadmin/chat?tenant=${r.slug}`} className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--accent)] hover:underline" title={`Subir a ${r.recommendation.recommendedLabel}`}>
                        <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                        <span>→ {r.recommendation.recommendedLabel}</span>
                        {r.recommendation.upsidePEN > 0 && (
                          <span className="rounded-full bg-[#0d9488]/15 px-1.5 py-0.5 font-extrabold text-[#0d9488] whitespace-nowrap">+{fmtPEN(r.recommendation.upsidePEN)}/mes</span>
                        )}
                      </Link>
                    ) : r.nearLimit ? (
                      <Link href={`/superadmin/chat?tenant=${r.slug}`} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent)] hover:underline">
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
      )}
    </AdminTabShell>
    </>
  );
}
