import type React from "react";
import { StatCard } from "@buleje/design-system";
import { ChevronDown, ChevronUp, Clock, CheckCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

/**
 * Helpers, tipos y configs compartidos entre las tabs del módulo Marketplace.
 * Extraído de MarketplaceModule.tsx (refactor 2026-06-15) — single source, sin
 * cambios de comportamiento. Cada tab importa de acá en vez de duplicar.
 */

export const MODULE_ID = "marketplace";

// ── UI compartida ──
export const Spinner = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

export const TableSkeleton = () => (
  <div className="space-y-3 animate-pulse">
    {[1, 2, 3, 4].map((i) => (
      <div key={i} className="flex items-center gap-4">
        <div className="h-10 w-10 bg-[var(--rule-base)] rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-[var(--rule-base)] rounded w-1/2" />
          <div className="h-3 bg-[var(--rule-base)] rounded w-1/3" />
        </div>
        <div className="h-8 w-20 bg-[var(--rule-base)] rounded-lg" />
      </div>
    ))}
  </div>
);

/**
 * SortIcon top-level (no inline en render): evita "Cannot create components
 * during render" + re-mount de las flechas en cada tipeo.
 */
export function SortIcon({ k, currentKey, currentDir }: { k: string; currentKey: string; currentDir: "asc" | "desc" }) {
  if (currentKey !== k) return <ChevronDown className="h-3 w-3 opacity-30" aria-hidden />;
  return currentDir === "asc" ? (
    <ChevronUp className="h-3 w-3 text-[var(--accent)]" aria-hidden />
  ) : (
    <ChevronDown className="h-3 w-3 text-[var(--accent)]" aria-hidden />
  );
}

export function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  // Wrapper sobre el primitivo del DS (sweep StatCard 2026-09-07): misma API
  // externa (label/value/sub) para no tocar a sus consumidores (ProductosTab),
  // pero ahora hereda el estándar visual único en vez de un tile a mano.
  return <StatCard label={label} value={value} subValue={sub} density="compact" />;
}

// ── Tipos ──
export interface StoreData {
  id?: string;
  slug: string;
  name: string;
  description: string;
  logoUrl: string;
  category: string;
  zone: string;
  commissionRate: number;
  isActive: boolean;
  vacationMode?: boolean;
  vacationMessage?: string;
}

// ── Status badge configs ──
export const ORDER_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  /* Seis estados, seis colores: «Pendiente» y «En camino» habían quedado
     iguales al pasar los hex a tokens (revisión 2026-09-12). «En camino» va en
     info como en el kanban de Pedidos; «Preparando» vuelve a su violeta. El
     texto usa los tonos -ink (el -500 como texto no llega a AA). */
  pendiente:   { label: "Pendiente",  className: "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-ink)]" },
  confirmado:  { label: "Confirmado", className: "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" },
  preparando:  { label: "Preparando", className: "bg-[var(--brand-purple)]/15 text-[color-mix(in_oklab,var(--brand-purple)_72%,black)] dark:text-[var(--brand-purple)]" },
  en_camino:   { label: "En camino",  className: "bg-[var(--data-info-500)]/15 text-[var(--data-info-ink)]" },
  entregado:   { label: "Entregado",  className: "bg-[var(--data-success-500)]/15 text-[var(--data-success-ink)]" },
  cancelado:   { label: "Cancelado",  className: "bg-[var(--data-error-500)]/15 text-[var(--data-error-ink)]" },
};

export const COMMISSION_STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  pendiente:  { label: "Pendiente",  className: "bg-[var(--data-warning-100)] text-[var(--data-warning)]",     icon: Clock },
  liquidado:  { label: "Liquidado",  className: "bg-primary/10 text-[var(--data-success)]",         icon: CheckCircle },
  pagado:     { label: "Pagado",     className: "bg-primary/10 text-[var(--data-success)]", icon: CheckCircle },
};

export const REVIEW_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:  { label: "Pendiente", className: "bg-[var(--data-warning-100)] text-[var(--data-warning)]" },
  approved: { label: "Aprobada",  className: "bg-primary/10 text-[var(--data-success)]" },
  rejected: { label: "Rechazada", className: "bg-[var(--data-error-100)] text-[var(--data-error)]" },
};

export const TIER_CONFIG: Record<string, { label: string; className: string; minPoints: string }> = {
  bronce: { label: "Bronce", className: "bg-[var(--data-warning-100)] text-[var(--data-warning)]", minPoints: "0 - 499" },
  plata:  { label: "Plata",  className: "bg-[var(--rule-soft)] text-[var(--text-secondary)]",   minPoints: "500 - 999" },
  oro:    { label: "Oro",    className: "bg-[var(--data-warning-100)] text-[var(--data-warning)]", minPoints: "1000+" },
};

// ── Counter chip clickeable para el KPI strip (usado por Órdenes + Productos) ──
export function CounterChip({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: "success" | "warning" | "danger" | "neutral";
  active: boolean;
  onClick: () => void;
}) {
  const toneClasses = {
    success: { bg: "bg-[var(--data-success-500)]/10", text: "text-[var(--data-success-500)]", border: "border-[var(--data-success-500)]" },
    warning: { bg: "bg-[var(--data-warning-500)]/10", text: "text-[var(--data-warning-500)]", border: "border-[var(--data-warning-500)]" },
    danger: { bg: "bg-[var(--data-error-500)]/10", text: "text-[var(--data-error-500)]", border: "border-[var(--data-error-500)]" },
    neutral: { bg: "bg-[var(--surface-sunken)]", text: "text-[var(--text-secondary)]", border: "border-[var(--text-tertiary)]" },
  } as const;
  const t = toneClasses[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "text-left rounded-xl border-2 px-3.5 min-h-11 transition-colors",
        active
          ? cn(t.border, t.bg)
          : cn("border-[var(--rule-base)] bg-[var(--surface-raised)]", `hover:${t.border}`, `hover:${t.bg}`),
      )}
    >
      <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">
        {label}
      </p>
      <p className={cn("text-2xl font-extrabold tabular-nums leading-none", active ? t.text : "text-[var(--text-primary)]")}>
        {value}
      </p>
    </button>
  );
}
