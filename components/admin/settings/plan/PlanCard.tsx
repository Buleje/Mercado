"use client";

/**
 * Piezas del Plan (Configuración › Plan): la tarjeta de cada plan para
 * comparar, la fila de una funcionalidad y la barra de uso. Salieron de
 * `PlanTab` (685 líneas) al compactarlo (11-10).
 *
 * Arreglos: el precio salía con «$» y es en soles (`lib/plans`: «PEN, la UI
 * dibuja S/»); la barra de uso del plan Starter era `bg-primary/10` (casi
 * invisible); «Plan actual» y «Tarjeta» eran blanco sobre turquesa (3,2:1).
 */
import { CardTitle } from "@buleje/design-system";
import { button } from "@/components/ui-system/button-variants";
import { formatNumber } from "@/lib/format";
import type { PlanDef, PlanLimits } from "@/lib/plans";
import {
  AlertTriangle, CheckCircle2, CreditCard, Crown, Loader2, ShoppingBag, ShoppingCart, Users, XCircle,
} from "@buleje/design-system/icons";

export function precioPlan(def: PlanDef): string {
  return def.priceMonthly === 0 ? "Gratis" : `S/ ${formatNumber(def.priceMonthly)}/mes`;
}

export function formatLimit(max: number) {
  return max === -1 ? "Ilimitado" : formatNumber(max);
}

/** Las funcionalidades que cambian entre planes, en el orden en que se comparan. */
export const FUNCIONALIDADES: { clave: keyof PlanLimits; label: string }[] = [
  { clave: "customDomain", label: "Dominio propio" },
  { clave: "advancedAnalytics", label: "Analytics avanzado" },
  { clave: "apiAccess", label: "Acceso por API" },
  { clave: "multiStore", label: "Multi-tienda" },
  { clave: "prioritySupport", label: "Soporte prioritario" },
  { clave: "whiteLabel", label: "Marca blanca" },
  { clave: "dedicatedSupport", label: "Soporte dedicado" },
  { clave: "sla", label: "SLA garantizado" },
];

// ─── Icono SVG de Mercado Pago ────────────────────────────
function MercadoPagoIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" fill="currentColor" className={className} aria-hidden="true">
      <path d="M14 0C6.268 0 0 6.268 0 14s6.268 14 14 14 14-6.268 14-14S21.732 0 14 0zm6.576 10.164c-.394 2.61-2.07 4.76-4.34 5.875l2.43 5.797H15.29l-2.13-5.07h-1.498v5.07H8.28V7.164h5.688c2.942 0 5.014 1.274 6.608 3zm-6.608-.558h-2.256v4.046h2.256c1.38 0 2.34-.87 2.34-2.024 0-1.152-.96-2.022-2.34-2.022z" />
    </svg>
  );
}

const WARNING_THRESHOLD = 80; // % de uso desde el que se avisa

/** Una línea de uso: rótulo y cifra arriba, barra abajo; el aviso sólo si te acercas al tope. */
export function UsageBar({ label, icon, used, max }: { label: string; icon: React.ReactNode; used: number; max: number }) {
  const unlimited = max === -1;
  const percent = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, max)) * 100));
  const isWarning = !unlimited && percent >= WARNING_THRESHOLD;
  const isFull = !unlimited && percent >= 100;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex min-w-0 items-center gap-1.5 font-medium text-[var(--text-primary)]">{icon}<span className="truncate">{label}</span></span>
        <span className={`shrink-0 font-semibold ${isFull ? "text-[var(--data-error-ink)]" : isWarning ? "text-[var(--data-warning-ink)]" : "text-[var(--text-secondary)]"}`}>
          {unlimited ? <span className="text-[var(--data-success-ink)]">∞ ilimitado</span> : <>{formatNumber(used)} / {formatNumber(max)}</>}
        </span>
      </div>
      {!unlimited && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
          <div
            className={`h-full rounded-full transition-all ${isFull ? "bg-[var(--data-error-500)]" : isWarning ? "bg-[var(--data-warning-500)]" : "bg-primary"}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      {isWarning && (
        <p className={`flex items-center gap-1 text-sm ${isFull ? "text-[var(--data-error-ink)]" : "text-[var(--data-warning-ink)]"}`}>
          {isFull ? <XCircle className="h-3.5 w-3.5" aria-hidden /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
          {isFull ? "Llegaste al tope: mejora tu plan" : `Cerca del tope (${percent} %)`}
        </p>
      )}
    </div>
  );
}

function FeatureRow({ label, available }: { label: string; available: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {available
        ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--data-success-500)]" aria-hidden />
        : <XCircle className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />}
      <span className={available ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)] line-through"}>{label}</span>
    </div>
  );
}

export function PlanCard({ def, isActive, onSelectStripe, onSelectMP, loadingStripe, loadingMP }: {
  def: PlanDef;
  isActive: boolean;
  onSelectStripe?: () => void;
  onSelectMP?: () => void;
  loadingStripe?: boolean;
  loadingMP?: boolean;
}) {
  const limits = def.limits;
  const isPaid = def.priceMonthly > 0;
  return (
    <div className={`space-y-3 rounded-xl border p-4 transition-colors ${isActive ? "border-primary bg-primary/5" : "border-[var(--rule-base)] hover:border-primary/40"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            {(def.id === "business" || def.id === "enterprise") && <Crown className={`h-4 w-4 ${def.id === "enterprise" ? "text-[var(--data-warning-ink)]" : "text-[var(--text-secondary)]"}`} aria-hidden />}
            <CardTitle className="text-sm font-bold">{def.name}</CardTitle>
          </div>
          <p className="mt-1 text-xl font-extrabold text-[var(--text-primary)]">{precioPlan(def)}</p>
        </div>
        {isActive && <span className="rounded-full bg-primary/10 px-2 py-1 text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">Tu plan</span>}
      </div>

      <div className="space-y-1 text-sm text-[var(--text-secondary)]">
        <p className="flex items-center gap-1.5"><ShoppingBag className="h-3.5 w-3.5" aria-hidden /> {formatLimit(limits.maxProducts)} productos</p>
        <p className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" aria-hidden /> {formatLimit(limits.maxUsers)} usuarios</p>
        <p className="flex items-center gap-1.5"><ShoppingCart className="h-3.5 w-3.5" aria-hidden /> {formatLimit(limits.maxOrdersPerMonth)} pedidos/mes</p>
      </div>

      <div className="space-y-1.5 border-t border-[var(--rule-base)] pt-3">
        {FUNCIONALIDADES.map((f) => <FeatureRow key={f.clave} label={f.label} available={Boolean(limits[f.clave])} />)}
      </div>

      {!isActive && isPaid && (
        <div className="space-y-2">
          <button type="button" onClick={onSelectStripe} disabled={loadingStripe || loadingMP} className={button({ variant: "primary", fullWidth: true, className: "rounded-xl" })}>
            {loadingStripe ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CreditCard className="h-4 w-4" aria-hidden />}
            Tarjeta
          </button>
          {/* Azul de la marca Mercado Pago (arte propio del ícono, como PaymentIcons). */}
          <button
            type="button"
            onClick={onSelectMP}
            disabled={loadingStripe || loadingMP}
            className={button({ variant: "ghost", fullWidth: true, className: "rounded-xl text-white hover:opacity-90" })}
            style={{ backgroundColor: loadingStripe || loadingMP ? "#009ee3cc" : "#009ee3" }}
          >
            {loadingMP ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <MercadoPagoIcon className="h-4 w-4" />}
            Yape / BCP / MP
          </button>
        </div>
      )}
      {!isActive && !isPaid && <p className="text-center text-sm text-[var(--text-secondary)]">Plan base, sin costo</p>}
    </div>
  );
}
