"use client";

import { useState } from "react";
import { Bell, Clock, ExternalLink, ShoppingBag } from "@buleje/design-system/icons";
import type { TenantRow } from "@/lib/superadmin-types";
import { PendingOrdersModal } from "./PendingOrdersModal";

/**
 * Vista compacta de tenant — Brandon 2026-06-05:
 * "algo tipo card pero sin muchos campos, para ver en perspectiva
 * más tiendas en poco espacio".
 *
 * Densidad alta: solo identidad + 3 señales operativas (pendientes,
 * ventas del mes, trial). Click en la card → detalle; botón flecha →
 * panel admin (impersonate). Todo lo demás vive en la vista cards/tabla.
 */

type Health = "healthy" | "warning" | "critical";

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  business: "Business",
  enterprise: "Enterprise",
};

const HEALTH_DOT: Record<Health, string> = {
  healthy: "bg-[var(--data-success-500)]",
  warning: "bg-[var(--data-warning-500)]",
  critical: "bg-[var(--data-error-500)]",
};

const HEALTH_TITLE: Record<Health, string> = {
  healthy: "Saludable — activo, sin pendientes excesivos",
  warning: "Atención — alguna métrica está baja",
  critical: "Crítico — suspendido o múltiples problemas",
};

interface TenantCardCompactProps {
  tenant: TenantRow;
  health: Health;
  onDetail: (t: TenantRow) => void;
  onImpersonate: (slug: string) => void;
}

export function TenantCardCompact({ tenant, health, onDetail, onImpersonate }: TenantCardCompactProps) {
  const t = tenant;
  const initials = t.name.slice(0, 2).toUpperCase();
  const pendingCount = t.pendingOrders ?? 0;
  const revenue = t.monthRevenue ?? 0;
  const isOnMarketplace = t.stores?.[0]?.isPublished === true;
  const [pendingModalOpen, setPendingModalOpen] = useState(false);

  // Trial restante — snapshot en mount (Date.now en render = impuro)
  const [now] = useState(() => Date.now());
  const trialEnds = t.trialEndsAt ? new Date(t.trialEndsAt) : null;
  const daysLeft =
    t.plan === "free" && trialEnds
      ? Math.max(0, Math.ceil((trialEnds.getTime() - now) / 86_400_000))
      : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onDetail(t)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onDetail(t);
        }
      }}
      title={`${t.name} — click para ver detalle`}
      className="group relative cursor-pointer rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:border-[var(--rule-strong)] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      {/* Identidad: logo + nombre + estado */}
      <div className="flex items-center gap-2.5">
        {t.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo externo sin remotePatterns
          <img
            src={t.logoUrl}
            alt={`Logo ${t.name}`}
            className="h-9 w-9 shrink-0 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] object-cover"
            onError={(e) => {
              const el = e.currentTarget;
              el.style.display = "none";
              const fallback = el.nextElementSibling as HTMLElement | null;
              if (fallback) fallback.style.display = "flex";
            }}
          />
        ) : null}
        <div
          className="h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] text-sm font-bold text-[var(--text-primary)]"
          style={{ display: t.logoUrl ? "none" : "flex" }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${HEALTH_DOT[health]}`}
              title={HEALTH_TITLE[health]}
            />
            <span className="truncate text-sm font-bold text-[var(--text-primary)]">{t.name}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
            <span className="truncate font-mono">{t.slug}</span>
            {isOnMarketplace && (
              <ShoppingBag
                className="h-3 w-3 shrink-0 text-[var(--accent)]"
                aria-label="Publicada en marketplace"
              />
            )}
          </div>
        </div>
        {/* Acción rápida: panel admin del tenant */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onImpersonate(t.slug);
          }}
          title={`Abrir panel admin de ${t.name}`}
          aria-label={`Abrir panel admin de ${t.name}`}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--rule-base)] text-[var(--text-tertiary)] opacity-70 transition-all hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] group-hover:opacity-100"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Señales: plan + ventas + pendientes + trial — 1 fila */}
      <div className="mt-2.5 flex items-center gap-1.5 border-t border-[var(--rule-soft)] pt-2.5">
        <span className="shrink-0 rounded-md bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          {PLAN_LABEL[t.plan] ?? t.plan}
        </span>
        <span
          className={`truncate text-xs font-bold tabular-nums ${revenue > 0 ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"}`}
          title="Ventas del mes"
        >
          S/{revenue.toLocaleString("es-PE", { maximumFractionDigits: 0 })}
        </span>
        <span className="flex-1" />
        {daysLeft !== null && (
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
              daysLeft <= 0
                ? "bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-red-950/40 dark:text-red-300"
                : daysLeft <= 7
                  ? "bg-amber-50 text-[var(--data-warning-700)] dark:bg-amber-950/40 dark:text-amber-300"
                  : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
            }`}
            title={daysLeft <= 0 ? "Trial expirado" : `${daysLeft} días de prueba restantes`}
          >
            <Clock className="h-3 w-3" />
            {daysLeft <= 0 ? "Exp." : `${daysLeft}d`}
          </span>
        )}
        {pendingCount > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setPendingModalOpen(true);
            }}
            title={`${pendingCount} pedido${pendingCount === 1 ? "" : "s"} pendiente${pendingCount === 1 ? "" : "s"} — click para ver`}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--data-error-500)] px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white transition-colors hover:bg-[var(--data-error-600)]"
          >
            <Bell className="h-3 w-3" strokeWidth={2.5} />
            {pendingCount}
          </button>
        )}
      </div>

      {pendingModalOpen && (
        <PendingOrdersModal
          tenantSlug={t.slug}
          tenantName={t.name}
          onClose={() => setPendingModalOpen(false)}
        />
      )}
    </div>
  );
}
