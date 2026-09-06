"use client";

/**
 * TenantCostsPanel — pestaña "Costos por tienda" del panel de gastos.
 *
 * Antes era una tabla cruda. Ahora responde de un vistazo la pregunta de
 * plataforma: ¿qué tiendas nos cuestan plata? Agrega KPIs (costo total, margen
 * prom, tiendas en pérdida, la más cara), un reparto del costo de infra
 * (storage · compute · IA) y una tabla con jerarquía: barra relativa en el
 * total y filas en pérdida resaltadas. Solo lee/visualiza los costos ya
 * calculados por /api/superadmin/costs. Brandon 2026-07-04.
 */

import { useState, type ComponentType } from "react";
import {
  Server, Building2, TrendingDown, TrendingUp, HardDrive, Cpu, Sparkles, ChevronDown,
} from "@buleje/design-system/icons";
import { SAKpiCard } from "@/components/superadmin/_shared/SAKpiCard";
import SuperadminChartCard from "@/components/superadmin/_shared/SuperadminChartCard";
import { fmtPen, type CostsData, type TenantCost } from "./gastos-helpers";

type SortKey = "name" | "storage" | "compute" | "ai" | "total" | "margin";

export function TenantCostsPanel({ costs, loading }: { costs: CostsData | null; loading: boolean }) {
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [asc, setAsc] = useState(false);

  const base = costs?.tenants ?? [];
  const total = costs?.totalMonthlyCost ?? 0;
  const avgMargin = costs?.avgGrossMargin ?? 0;
  const lossCount = base.filter((t) => t.grossMargin < 0).length;

  const storageT = base.reduce((s, t) => s + t.storageCost, 0);
  const computeT = base.reduce((s, t) => s + t.computeCost, 0);
  const aiT = base.reduce((s, t) => s + t.aiCost, 0);
  const compTotal = Math.max(1, storageT + computeT + aiT);
  const maxTotal = Math.max(1, ...base.map((t) => t.totalCost));
  // La tienda más cara es SIEMPRE la de mayor costo (no depende del orden de la tabla).
  const priciest = base.reduce<TenantCost | null>((m, t) => (!m || t.totalCost > m.totalCost ? t : m), null);

  const val = (t: TenantCost): number | string =>
    sortKey === "name" ? t.tenantName.toLowerCase()
    : sortKey === "storage" ? t.storageCost
    : sortKey === "compute" ? t.computeCost
    : sortKey === "ai" ? t.aiCost
    : sortKey === "margin" ? t.grossMargin
    : t.totalCost;
  const tenants = [...base].sort((a, b) => {
    const av = val(a), bv = val(b);
    const cmp = typeof av === "string" ? av.localeCompare(String(bv), "es") : (av as number) - (bv as number);
    return asc ? cmp : -cmp;
  });
  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setAsc((a) => !a);
    else { setSortKey(k); setAsc(false); }
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SAKpiCard label="Costo infra / mes" value={fmtPen(total)} icon={Server} sub={`${tenants.length} tiendas`} />
        <SAKpiCard
          label="Margen bruto prom."
          value={`${avgMargin.toFixed(0)}%`}
          icon={avgMargin >= 0 ? TrendingUp : TrendingDown}
          tone={avgMargin >= 50 ? "good" : avgMargin >= 0 ? "warn" : "bad"}
        />
        <SAKpiCard
          label="Tiendas en pérdida"
          value={String(lossCount)}
          icon={TrendingDown}
          tone={lossCount > 0 ? "bad" : "good"}
          sub={lossCount > 0 ? "cuestan más de lo que pagan" : "todas rentables"}
        />
        <SAKpiCard
          label="Tienda más cara"
          value={priciest ? fmtPen(priciest.totalCost) : "—"}
          icon={Building2}
          sub={priciest?.tenantName ?? "sin datos"}
        />
      </div>

      <SuperadminChartCard
        kicker="Infra"
        title="¿En qué se va el costo de infra?"
        description="Reparto del costo mensual de todas las tiendas entre almacenamiento, cómputo e IA."
        density="compact"
      >
        <CompositionBar
          segs={[
            { label: "Almacenamiento", val: storageT, color: "var(--data-info-500,#3b82f6)", Icon: HardDrive },
            { label: "Cómputo", val: computeT, color: "var(--accent,#00a0a0)", Icon: Cpu },
            { label: "IA", val: aiT, color: "var(--data-warning-500,#f59e0b)", Icon: Sparkles },
          ]}
          total={compTotal}
        />
      </SuperadminChartCard>

      <SuperadminChartCard
        title="Costos por tienda"
        description="Infra estimada por tienda y margen bruto. Las filas en rojo cuestan más de lo que pagan."
        density="compact"
      >
        <div className="overflow-x-auto rounded-lg border border-[var(--rule-soft)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-sunken)] text-left text-sm font-bold text-[var(--text-tertiary)]">
              <tr>
                <SortTh label="Tienda" k="name" cur={sortKey} asc={asc} onSort={toggleSort} />
                <th className="p-2">Plan</th>
                <SortTh label="Storage" k="storage" cur={sortKey} asc={asc} onSort={toggleSort} align="right" />
                <SortTh label="Compute" k="compute" cur={sortKey} asc={asc} onSort={toggleSort} align="right" />
                <SortTh label="IA" k="ai" cur={sortKey} asc={asc} onSort={toggleSort} align="right" />
                <SortTh label="Total / mes" k="total" cur={sortKey} asc={asc} onSort={toggleSort} />
                <SortTh label="Margen" k="margin" cur={sortKey} asc={asc} onSort={toggleSort} align="right" />
              </tr>
            </thead>
            <tbody>
              {tenants.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-[var(--text-tertiary)]">Sin datos de costos.</td>
                </tr>
              )}
              {tenants.map((t) => {
                const loss = t.grossMargin < 0;
                return (
                  <tr
                    key={t.tenantId}
                    className={`border-t border-[var(--rule-soft)] ${loss ? "bg-[var(--data-error-500)]/8" : ""}`}
                  >
                    <td className="p-2">
                      <span className="inline-flex items-center gap-1.5 font-bold text-[var(--text-primary)]">
                        <Building2 className="h-4 w-4 text-[var(--text-tertiary)]" />
                        {t.tenantName}
                      </span>
                    </td>
                    <td className="p-2 text-[var(--text-secondary)]">{t.plan}</td>
                    <td className="p-2 text-right tabular-nums text-[var(--text-secondary)]">{fmtPen(t.storageCost)}</td>
                    <td className="p-2 text-right tabular-nums text-[var(--text-secondary)]">{fmtPen(t.computeCost)}</td>
                    <td className="p-2 text-right tabular-nums text-[var(--text-secondary)]">{fmtPen(t.aiCost)}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <div className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--rule-base)] sm:block">
                          <div
                            className="h-full rounded-full bg-[var(--accent)]"
                            style={{ width: `${Math.max(3, (t.totalCost / maxTotal) * 100)}%` }}
                          />
                        </div>
                        <span className="tabular-nums font-bold text-[var(--text-primary)]">{fmtPen(t.totalCost)}</span>
                      </div>
                    </td>
                    <td className="p-2 text-right">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-bold tabular-nums ${
                          loss
                            ? "bg-[var(--data-error-500)]/12 text-[var(--data-error-700,#b91c1c)]"
                            : "bg-[var(--data-success-500)]/12 text-[var(--data-success-700,#047857)]"
                        }`}
                      >
                        {loss ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
                        {t.grossMargin.toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SuperadminChartCard>
    </>
  );
}

/** Encabezado clickeable que ordena por su columna (con indicador ▲/▼). */
function SortTh({
  label, k, cur, asc, onSort, align = "left",
}: {
  label: string;
  k: SortKey;
  cur: SortKey;
  asc: boolean;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = cur === k;
  return (
    <th className={`p-0 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex w-full items-center gap-1 p-2 hover:text-[var(--text-primary)] ${
          align === "right" ? "justify-end" : "justify-start"
        } ${active ? "text-[var(--text-primary)]" : ""}`}
        aria-label={`Ordenar por ${label}`}
      >
        {label}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${
            active ? "opacity-100" : "opacity-30"
          } ${active && asc ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
    </th>
  );
}

function CompositionBar({
  segs,
  total,
}: {
  segs: { label: string; val: number; color: string; Icon: ComponentType<{ className?: string }> }[];
  total: number;
}) {
  if (total <= 1 && segs.every((s) => s.val === 0)) {
    return <p className="text-sm text-[var(--text-tertiary)]">Sin costos de infra para repartir.</p>;
  }
  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--rule-base)]">
        {segs.map((s) => (
          <div key={s.label} style={{ width: `${(s.val / total) * 100}%`, background: s.color }} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {segs.map(({ label, val, color, Icon }) => (
          <li key={label} className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm" style={{ background: color }} />
            <Icon className="h-4 w-4 text-[var(--text-tertiary)]" />
            <span className="text-[var(--text-secondary)]">{label}</span>
            <span className="font-bold tabular-nums text-[var(--text-primary)]">{fmtPen(val)}</span>
            <span className="tabular-nums text-[var(--text-tertiary)]">({Math.round((val / total) * 100)}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
