"use client";

/**
 * AdminAlertsBanner v2 (2026-05-10) — bar de alertas del admin rediseñado.
 *
 * Antes: todas las alertas se apilaban en una fila horizontal con texto
 * plano y un solo X que dismisseaba TODO por 6h. Resultaba en una banda
 * confusa donde no se distinguía "trial vence en 2 días" de "1 solicitud
 * de repartidor pendiente".
 *
 * Ahora: cada alerta es un CARD independiente con:
 *   - Badge contador grande a la izquierda (1, 23, etc.) o icono pulsante.
 *   - Severity stripe lateral del color semántico (error/warning/info).
 *   - Label + descripción cortos.
 *   - CTA "Ver →" propio que abre el tab relevante.
 *   - Dismiss individual por alerta (key-per-alert en localStorage).
 *
 * Polling cada 30s al endpoint /api/admin/alerts-summary.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Clock,
  Bike,
  Users,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  X,
  Bell,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface Summary {
  solicitudesPendientes: number;
  pedidosSinPartner: number;
  partnersOnline: number;
  recentExpiredOffers: number;
  trialDaysLeft: number | null;
}

type Severity = "urgent" | "warning" | "info";

interface Alert {
  id: string;
  severity: Severity;
  icon: LucideIcon;
  count?: number;
  label: string;
  description: string;
  cta: string;
  href: string;
}

const REFRESH_MS = 30_000;
const DISMISS_PREFIX = "admin-alert-dismissed:";
const DISMISS_TTL_MS = 6 * 3600_000; // 6 horas

function readDismissed(id: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const at = localStorage.getItem(`${DISMISS_PREFIX}${id}`);
    if (!at) return false;
    if (Date.now() - Number(at) > DISMISS_TTL_MS) {
      localStorage.removeItem(`${DISMISS_PREFIX}${id}`);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function writeDismissed(id: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${DISMISS_PREFIX}${id}`, String(Date.now()));
  } catch {
    /* noop */
  }
}

export default function AdminAlertsBanner() {
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);

  // Hidratar dismissed desde localStorage en mount
  useEffect(() => {
    const ids = new Set<string>();
    for (const id of ["trial-urgent", "trial-warning", "no-partner", "solicitudes-pending"]) {
      if (readDismissed(id)) ids.add(id);
    }
    setDismissedIds(ids);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/alerts-summary", { credentials: "include" });
        if (!res.ok) return;
        const data: Summary = await res.json();
        if (!cancelled) setSummary(data);
      } catch {
        /* polling silencioso */
      }
    };
    load();
    // QW4 perf (2026-05-16): pausar polling cuando document.hidden
    // (pestaña no visible). Banner vive en TODO /admin/* → cada sesión
    // inactiva eran 120 req/h. Ahora 0 req/h cuando idle. Al volver
    // visible, refetch inmediato para datos frescos.
    let id: ReturnType<typeof setInterval> | null = setInterval(load, REFRESH_MS);
    function handleVisibilityChange() {
      if (document.hidden) {
        if (id) { clearInterval(id); id = null; }
      } else {
        load();
        if (!id) id = setInterval(load, REFRESH_MS);
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      if (id) clearInterval(id);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const alerts = useMemo<Alert[]>(() => {
    if (!summary) return [];
    const list: Alert[] = [];

    if (summary.trialDaysLeft != null && summary.trialDaysLeft <= 3) {
      list.push({
        id: "trial-urgent",
        severity: "urgent",
        icon: AlertTriangle,
        count: summary.trialDaysLeft,
        label: `Tu trial vence en ${summary.trialDaysLeft} día${summary.trialDaysLeft === 1 ? "" : "s"}`,
        description: "Activa un plan ahora para no perder tu tienda online.",
        cta: "Ver planes",
        href: "/admin?tab=plan",
      });
    } else if (summary.trialDaysLeft != null && summary.trialDaysLeft <= 7) {
      list.push({
        id: "trial-warning",
        severity: "warning",
        icon: Clock,
        count: summary.trialDaysLeft,
        label: `Trial: ${summary.trialDaysLeft} días restantes`,
        description: "Te quedan pocos días del trial gratuito.",
        cta: "Ver planes",
        href: "/admin?tab=plan",
      });
    }

    if (summary.pedidosSinPartner > 0) {
      list.push({
        id: "no-partner",
        severity: "urgent",
        icon: Bike,
        count: summary.pedidosSinPartner,
        label: `${summary.pedidosSinPartner} pedido${summary.pedidosSinPartner === 1 ? "" : "s"} sin repartidor`,
        description: "Asigna un repartidor antes de que el cliente reclame.",
        cta: "Asignar",
        href: "/admin?tab=pedidos",
      });
    }

    if (summary.solicitudesPendientes > 0) {
      list.push({
        id: "solicitudes-pending",
        severity: "warning",
        icon: Users,
        count: summary.solicitudesPendientes,
        label: `${summary.solicitudesPendientes} solicitud${summary.solicitudesPendientes === 1 ? "" : "es"} de repartidor pendiente${summary.solicitudesPendientes === 1 ? "" : "s"}`,
        description: "Revisá los repartidores que quieren trabajar contigo.",
        cta: "Revisar",
        href: "/admin?tab=delivery-partners",
      });
    }

    return list.filter((a) => !dismissedIds.has(a.id));
  }, [summary, dismissedIds]);

  const handleDismiss = useCallback((id: string) => {
    writeDismissed(id);
    setDismissedIds((prev) => new Set(prev).add(id));
  }, []);

  if (alerts.length === 0) return null;

  const urgentCount = alerts.filter((a) => a.severity === "urgent").length;
  const headerTone = urgentCount > 0 ? "urgent" : "warning";

  const first = alerts[0];
  const FirstIcon = first.icon;
  const toneFg =
    headerTone === "urgent"
      ? "text-[var(--data-error-700,#b91c1c)]"
      : "text-[var(--data-warning-700)]";
  const toneBg =
    headerTone === "urgent"
      ? "bg-[var(--data-error-50,#fef2f2)] border-[var(--data-error-200,#fecaca)]"
      : "bg-[var(--data-warning-50)] border-[var(--data-warning-200,#fde68a)]";
  const ctaCls =
    headerTone === "urgent"
      ? "bg-[var(--data-error-600,#dc2626)] hover:bg-[var(--data-error-700,#b91c1c)] text-white"
      : "bg-[var(--data-warning-600,var(--data-warning-500))] hover:bg-[var(--data-warning-700)] text-white";

  return (
    <div
      role="region"
      aria-label="Alertas del administrador"
      className={cn("border-b", toneBg)}
    >
      {/* Fila compacta — misma altura aprox que AdminTopHeader (h-10 ~ 40px) */}
      <div className="px-4 sm:px-6 h-10 flex items-center gap-2 sm:gap-3 min-w-0">
        {/* Dot animado + bell — micro indicador */}
        <span aria-hidden className="relative inline-flex h-2 w-2 shrink-0">
          <span
            className={cn(
              "absolute inline-flex h-full w-full rounded-full opacity-70 animate-ping",
              headerTone === "urgent"
                ? "bg-[var(--data-error-500,#ef4444)]"
                : "bg-[var(--data-warning-500)]",
            )}
          />
          <span
            className={cn(
              "relative inline-flex h-2 w-2 rounded-full",
              headerTone === "urgent"
                ? "bg-[var(--data-error-600,#dc2626)]"
                : "bg-[var(--data-warning-600,var(--data-warning-500))]",
            )}
          />
        </span>
        <Bell className={cn("h-4 w-4 shrink-0", toneFg)} strokeWidth={2.5} />

        {/* Counter pill */}
        <span
          className={cn(
            "text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider shrink-0",
            toneFg,
          )}
        >
          {alerts.length} {alerts.length === 1 ? "alerta" : "alertas"}
        </span>

        {/* Separador + primera alerta inline (resumen) */}
        <span aria-hidden className={cn("hidden sm:inline shrink-0 opacity-50", toneFg)}>
          ·
        </span>
        <FirstIcon
          className={cn("hidden sm:inline-block h-3.5 w-3.5 shrink-0", toneFg)}
          strokeWidth={2.25}
        />
        <p
          className={cn(
            "hidden sm:block text-sm font-semibold truncate min-w-0 flex-1",
            toneFg,
          )}
          title={first.label}
        >
          {first.label}
        </p>

        {/* CTA primera alerta */}
        <button
          type="button"
          onClick={() => router.push(first.href)}
          className={cn(
            "shrink-0 inline-flex items-center gap-1 h-7 px-3 rounded-full text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider transition-all hover:gap-1.5",
            ctaCls,
          )}
        >
          {first.cta}
          <ArrowRight className="h-3 w-3" strokeWidth={2.75} aria-hidden />
        </button>

        {/* Expandir si hay más alertas */}
        {alerts.length > 1 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className={cn(
              "shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider border transition-colors",
              headerTone === "urgent"
                ? "border-[var(--data-error-300,#fca5a5)] text-[var(--data-error-700,#b91c1c)] hover:bg-[var(--data-error-100,#fee2e2)]"
                : "border-[var(--data-warning-300,#fcd34d)] text-[var(--data-warning-700)] hover:bg-[var(--data-warning-100)]",
            )}
          >
            +{alerts.length - 1}
            {expanded ? (
              <ChevronUp className="h-3 w-3" strokeWidth={2.5} />
            ) : (
              <ChevronDown className="h-3 w-3" strokeWidth={2.5} />
            )}
          </button>
        )}

        {/* Close primera alerta */}
        <button
          type="button"
          onClick={() => handleDismiss(first.id)}
          aria-label={`Descartar: ${first.label}`}
          className={cn(
            "shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors",
            headerTone === "urgent"
              ? "text-[var(--data-error-700,#b91c1c)] hover:bg-[var(--data-error-100,#fee2e2)]"
              : "text-[var(--data-warning-700)] hover:bg-[var(--data-warning-100)]",
          )}
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      </div>

      {/* Expandido: resto de alertas como cards compactas (drawer dentro del banner) */}
      {expanded && alerts.length > 1 && (
        <div className="px-4 sm:px-6 pb-3">
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {alerts.slice(1).map((a) => (
              <AlertCard
                key={a.id}
                alert={a}
                onAction={() => router.push(a.href)}
                onDismiss={() => handleDismiss(a.id)}
              />
            ))}
          </ul>
          {alerts.length > 2 && (
            <button
              type="button"
              onClick={() => alerts.forEach((a) => handleDismiss(a.id))}
              className="mt-2 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors uppercase tracking-wider"
            >
              Descartar todas
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AlertCard({
  alert,
  onAction,
  onDismiss,
}: {
  alert: Alert;
  onAction: () => void;
  onDismiss: () => void;
}) {
  const Icon = alert.icon;
  const sev = alert.severity;

  // Tokens por severidad. El stripe lateral usa el accent fuerte; el bg del
  // card es surface-raised para destacar contra el bg semántico del banner.
  const stripeColor =
    sev === "urgent"
      ? "var(--data-error-600,#dc2626)"
      : sev === "warning"
        ? "var(--data-warning-600,var(--data-warning-500))"
        : "var(--data-info-600,var(--accent))";

  const iconBg =
    sev === "urgent"
      ? "bg-[var(--data-error-100,#fee2e2)] text-[var(--data-error-700,#b91c1c)]"
      : sev === "warning"
        ? "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]"
        : "bg-[var(--accent-soft)] text-[var(--accent)]";

  return (
    <li
      className="group relative flex items-stretch gap-0 rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-base)] overflow-hidden shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-shadow"
    >
      {/* Stripe lateral por severidad */}
      <span
        aria-hidden
        className="w-1.5 shrink-0"
        style={{ background: stripeColor }}
      />

      {/* Badge contador + icono */}
      <div className="flex items-center gap-3 pl-3 pr-2 py-2.5 shrink-0">
        {alert.count != null ? (
          <span
            aria-hidden
            className={cn(
              "inline-flex h-10 min-w-10 px-2 items-center justify-center rounded-xl text-xl font-extrabold tabular-nums leading-none",
              iconBg,
            )}
          >
            {alert.count}
          </span>
        ) : (
          <span
            aria-hidden
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-xl",
              iconBg,
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={2.25} />
          </span>
        )}
      </div>

      {/* Contenido */}
      <div className="flex-1 min-w-0 pl-1 pr-2 py-2.5">
        <p className="text-sm font-extrabold text-[var(--text-primary)] leading-tight truncate inline-flex items-center gap-1.5">
          {alert.count == null && <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" strokeWidth={2.25} />}
          {alert.label}
        </p>
        <p className="mt-0.5 text-[length:var(--ts-2xs)] text-[var(--text-secondary)] leading-snug line-clamp-2">
          {alert.description}
        </p>
        <button
          type="button"
          onClick={onAction}
          className={cn(
            "mt-1.5 inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider transition-all hover:gap-1.5",
            sev === "urgent"
              ? "text-[var(--data-error-700,#b91c1c)]"
              : sev === "warning"
                ? "text-[var(--data-warning-700)]"
                : "text-[var(--accent)]",
          )}
        >
          {alert.cta}
          <ArrowRight className="h-3 w-3" strokeWidth={2.75} aria-hidden />
        </button>
      </div>

      {/* Close individual */}
      <button
        type="button"
        onClick={onDismiss}
        aria-label={`Descartar: ${alert.label}`}
        className="self-start inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors mr-1 mt-1.5"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
    </li>
  );
}
