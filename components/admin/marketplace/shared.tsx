import type React from "react";
import { ChevronDown, ChevronUp, Clock, CheckCircle } from "@buleje/design-system/icons";

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
        <div className="h-10 w-10 bg-gray-200 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-3 bg-gray-200 rounded w-1/3" />
        </div>
        <div className="h-8 w-20 bg-gray-200 rounded-lg" />
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
  return (
    <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">{label}</p>
      <p className="text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{value}</p>
      {sub && <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] tabular-nums mt-0.5">{sub}</p>}
    </div>
  );
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
  pendiente:   { label: "Pendiente",  className: "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-500)]" },
  confirmado:  { label: "Confirmado", className: "bg-[var(--accent-soft)] text-[var(--accent)]" },
  preparando:  { label: "Preparando", className: "bg-[#a78bfa]/15 text-[#7c3aed]" },
  en_camino:   { label: "En camino",  className: "bg-[#fbbf24]/15 text-[#d97706]" },
  entregado:   { label: "Entregado",  className: "bg-[var(--data-success-500)]/15 text-[var(--data-success-500)]" },
  cancelado:   { label: "Cancelado",  className: "bg-[var(--data-error-500)]/15 text-[var(--data-error-500)]" },
};

export const COMMISSION_STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  pendiente:  { label: "Pendiente",  className: "bg-[var(--data-warning-100)] text-[var(--data-warning)]",     icon: Clock },
  liquidado:  { label: "Liquidado",  className: "bg-[var(--accent-soft)] text-[var(--data-success)]",         icon: CheckCircle },
  pagado:     { label: "Pagado",     className: "bg-[var(--accent-soft)] text-[var(--data-success)]", icon: CheckCircle },
};

export const REVIEW_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:  { label: "Pendiente", className: "bg-[var(--data-warning-100)] text-[var(--data-warning)]" },
  approved: { label: "Aprobada",  className: "bg-[var(--accent-soft)] text-[var(--data-success)]" },
  rejected: { label: "Rechazada", className: "bg-[var(--data-error-100)] text-[var(--data-error)]" },
};

export const TIER_CONFIG: Record<string, { label: string; className: string; minPoints: string }> = {
  bronce: { label: "Bronce", className: "bg-[var(--data-warning-100)] text-[var(--data-warning)]", minPoints: "0 - 499" },
  plata:  { label: "Plata",  className: "bg-gray-100 text-[var(--text-secondary)]",   minPoints: "500 - 999" },
  oro:    { label: "Oro",    className: "bg-[var(--data-warning-100)] text-[var(--data-warning)]", minPoints: "1000+" },
};
