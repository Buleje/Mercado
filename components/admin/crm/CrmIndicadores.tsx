"use client";

import { Fragment } from "react";
import { Users, UserPlus, TrendingUp, UserCheck, Crown } from "@buleje/design-system/icons";
import { m } from "@/components/admin/providers";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { fmt } from "@/components/admin/crm/crm-compartido";
import type { Crm } from "@/components/admin/crm/use-crm";

const CRMTabChart = dynamic(() => import("@/components/admin/CRMTabChart"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full animate-pulse bg-[var(--surface-sunken)] rounded-xl" />
  ),
});

/** Colores del canal: tokens de datos (antes tres hex sueltos que no cambiaban en oscuro). */
const CHANNEL_COLORS = ["var(--accent)", "var(--data-warning-500)", "var(--data-2)", "var(--data-5)", "var(--text-secondary)"];
const CHANNEL_LABELS: Record<string, string> = { local: "Local", whatsapp: "WhatsApp", web: "Web", referido: "Referido", redes: "Redes" };

/**
 * Indicadores del CRM, el canal por el que llegaron y el cliente top. Plegables y recordados
 * (el botón vive en la barra del buscador); plegados, las cuatro cifras quedan en una línea.
 */
export default function CrmIndicadores({ crm, abierto, panelId }: { crm: Crm; abierto: boolean; panelId: string }) {
  const { customers, stats, topCustomer, avgSpent } = crm;
  const kpis = [
    { label: "Total clientes", value: String(stats.total),   icon: Users,      color: "text-[var(--data-success-500)]" },
    { label: "Activos (30d)",  value: String(stats.activos), icon: UserCheck,  color: "text-[var(--data-success-500)]" },
    { label: "Nuevos",         value: String(stats.nuevos),  icon: UserPlus,   color: "text-primary" },
    { label: "CLV promedio",   value: fmt(stats.clvProm),    icon: TrendingUp, color: "text-[var(--text-secondary)]" },
  ];

  if (!abierto) {
    return (
      <p id={panelId} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm tabular-nums text-[var(--text-secondary)]">
        {kpis.map((k, i) => (
          <Fragment key={k.label}>
            {i > 0 && <span aria-hidden="true">·</span>}
            <span>
              {k.label} <strong className="text-[var(--text-primary)]">{k.value}</strong>
            </span>
          </Fragment>
        ))}
      </p>
    );
  }

  const channelCounts: Record<string, number> = {};
  for (const c of customers) {
    if (c.comoLlego) {
      const key = c.comoLlego.toLowerCase();
      channelCounts[key] = (channelCounts[key] ?? 0) + 1;
    }
  }
  const entries = Object.entries(channelCounts).sort((a, b) => b[1] - a[1]);
  const totalWithChannel = entries.reduce((s, [, v]) => s + v, 0);
  const chartData = entries.map(([name, value]) => ({ name: CHANNEL_LABELS[name] ?? name, value }));

  return (
    <div id={panelId} className="space-y-4">
      {/* ── KPIs neutros — bg unificado, color solo en el icono ──────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => (
          <m.div
            key={k.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl p-4 border border-[var(--rule-soft)] bg-[var(--surface-raised)]"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <k.icon className={cn("h-4 w-4", k.color)} />
              <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">{k.label}</p>
            </div>
            <p className="text-2xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] tabular-nums">{k.value}</p>
          </m.div>
        ))}
      </div>

      {/* Mejora 13: Canal de adquisicion (sólo con 5 o más clientes que dijeron cómo llegaron) */}
      {totalWithChannel >= 5 && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 flex items-center gap-4">
          <div style={{ width: 100, height: 100 }}>
            <CRMTabChart data={chartData} colors={CHANNEL_COLORS} />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Canal de adquisición</p>
            {chartData.map((d, i) => (
              <div key={d.name} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }} />
                <span className="text-[var(--text-primary)] dark:text-[var(--text-primary)] font-medium">{d.name}</span>
                <span className="text-[var(--text-tertiary)] dark:text-muted">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mejora 10: Top customer summary — barra compacta (antes entre los filtros y la tabla) */}
      {topCustomer && customers.length >= 3 && (
        <div className="flex items-center justify-between bg-[var(--surface-sunken)]/50 rounded-xl px-4 py-2.5 text-xs flex-wrap gap-2">
          <span className="flex items-center gap-1.5"><Crown className="h-3.5 w-3.5 text-[var(--data-warning-500)]" aria-hidden /> Top: <strong>{topCustomer.name}</strong> &middot; {fmt(topCustomer.totalSpent ?? 0)}</span>
          <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-[var(--data-success-500)]" /> {customers.length} clientes</span>
          <span className="flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-[var(--data-success-500)]" /> Prom: {fmt(avgSpent)}</span>
          <span className="flex items-center gap-1.5"><UserCheck className="h-3.5 w-3.5 text-[var(--text-secondary)]" /> Activos 30d: {stats.activos}</span>
        </div>
      )}
    </div>
  );
}
