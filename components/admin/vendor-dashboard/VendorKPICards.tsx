"use client";

import type { VendorKPIs } from "./vendor-dashboard.types";
import { TrendingUp, TrendingDown, Minus, ShoppingBag, AlertTriangle, Package } from "@buleje/design-system/icons";
import StatusBadge from "@/components/admin/shared/StatusBadge";

type Props = {
  kpis: VendorKPIs;
};

function formatSoles(value: number): string {
  return `S/ ${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

/**
 * TrendBadge — delta vs referencia, siempre via tokens.
 * (ADR-074 Phase 2: eliminado bg-primary/10/red-50 hardcoded).
 */
function TrendBadge({ today, reference, label }: { today: number; reference: number; label: string }) {
  if (reference === 0) return null;
  const pct = ((today - reference) / reference) * 100;
  const up = pct >= 0;
  const Icon = pct === 0 ? Minus : up ? TrendingUp : TrendingDown;
  const variant: "success" | "error" | "neutral" = pct === 0 ? "neutral" : up ? "success" : "error";

  return (
    <StatusBadge
      variant={variant}
      label={`${Math.abs(pct).toFixed(0)}% vs ${label}`}
      size="sm"
      icon={Icon}
    />
  );
}

/**
 * KPITile inline — wrapper unificado para esta dashboard.
 * Usa AdminCard pattern (rounded-xl + border rule-base + surface-raised)
 * sin duplicar markup en cada card.
 */
function KPITile({
  icon: Icon,
  label,
  value,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-[var(--text-secondary)] text-sm font-medium">
        <Icon className="h-4 w-4 text-[var(--text-primary)]" />
        {label}
      </div>
      <p className="text-2xl font-extrabold text-[var(--text-primary)] tabular-nums leading-none">{value}</p>
      {children && <div className="flex flex-col gap-1">{children}</div>}
    </div>
  );
}

export function VendorKPICards({ kpis }: Props) {
  const pendingVariant: "success" | "warning" | "error" =
    kpis.pendingOrdersCount === 0 ? "success" : kpis.pendingOrdersCount <= 3 ? "warning" : "error";
  const pendingLabel =
    kpis.pendingOrdersCount === 0 ? "Al día" : kpis.pendingOrdersCount <= 3 ? "Atender pronto" : "Urgente";

  const stockVariant: "success" | "warning" = kpis.lowStockCount === 0 ? "success" : "warning";
  const stockLabel = kpis.lowStockCount === 0 ? "Todo OK" : "Reponer pronto";

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KPITile icon={ShoppingBag} label="Ventas hoy" value={formatSoles(kpis.salesToday)}>
        <TrendBadge today={kpis.salesToday} reference={kpis.salesYesterday} label="ayer" />
        <TrendBadge today={kpis.salesToday} reference={kpis.salesLastWeek} label="sem. pasada" />
      </KPITile>

      <KPITile icon={Package} label="Sin atender" value={String(kpis.pendingOrdersCount)}>
        <StatusBadge variant={pendingVariant} label={pendingLabel} size="sm" />
      </KPITile>

      <KPITile icon={AlertTriangle} label="Stock bajo" value={String(kpis.lowStockCount)}>
        <StatusBadge variant={stockVariant} label={stockLabel} size="sm" />
      </KPITile>

      <KPITile icon={TrendingUp} label="Ayer" value={formatSoles(kpis.salesYesterday)}>
        <span className="text-sm text-[var(--text-tertiary)]">ventas del día anterior</span>
      </KPITile>
    </div>
  );
}
