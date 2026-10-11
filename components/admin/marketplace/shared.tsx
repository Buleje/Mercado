import type React from "react";
import { StatCard } from "@buleje/design-system";
import { ChevronDown, ChevronUp, Clock, CheckCircle, Search, X } from "@buleje/design-system/icons";
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

// ── Indicador clickeable (Órdenes + Productos): la cifra y, al tocarla, el filtro ──
const TONO_INDICADOR = {
  success: { activo: "border-[var(--data-success-500)] bg-[var(--data-success-500)]/10", hover: "hover:border-[var(--data-success-500)]", cifra: "text-[var(--data-success-ink)]" },
  warning: { activo: "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10", hover: "hover:border-[var(--data-warning-500)]", cifra: "text-[var(--data-warning-ink)]" },
  danger: { activo: "border-[var(--data-error-500)] bg-[var(--data-error-500)]/10", hover: "hover:border-[var(--data-error-500)]", cifra: "text-[var(--data-error-ink)]" },
  neutral: { activo: "border-[var(--text-tertiary)] bg-[var(--surface-sunken)]", hover: "hover:border-[var(--text-tertiary)]", cifra: "text-[var(--text-primary)]" },
} as const;

export function CounterChip({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: keyof typeof TONO_INDICADOR;
  active: boolean;
  onClick: () => void;
}) {
  const t = TONO_INDICADOR[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={active ? "Quitar el filtro" : `Ver sólo: ${label.toLowerCase()}`}
      className={cn(
        "flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border-2 px-3 py-2 text-left transition-colors",
        active ? t.activo : cn("border-[var(--rule-base)] bg-[var(--surface-raised)]", t.hover),
      )}
    >
      <span className="text-sm font-semibold text-[var(--text-secondary)]">{label}</span>
      <span className={cn("text-xl font-bold tabular-nums leading-none", active ? t.cifra : "text-[var(--text-primary)]")}>{value}</span>
    </button>
  );
}

/** Campo de la fila de filtros (buscador, selects): 48 px, texto de 14. */
export const CAMPO_EN_FILA =
  "h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-primary";

/** El buscador de la fila de filtros, con su «×» para vaciarlo. */
export function BuscadorEnFila({ valor, onCambiar, placeholder, className }: { valor: string; onCambiar: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <div className={cn("relative h-12 min-w-0 grow basis-full sm:basis-64", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
      <input
        type="search"
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(CAMPO_EN_FILA, "w-full pl-10 pr-12")}
      />
      {valor && (
        <button
          type="button"
          onClick={() => onCambiar("")}
          aria-label="Vaciar la búsqueda"
          className="absolute right-0.5 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
