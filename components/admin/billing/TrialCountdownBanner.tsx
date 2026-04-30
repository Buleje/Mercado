"use client";

/**
 * TrialCountdownBanner — banner sticky con cuenta regresiva del trial.
 *
 * Muestra los días restantes del trial de 15 días. Cuando se vence (sin plan
 * pagado activo), el sistema entra en modo read-only (ver ADR-084).
 *
 * Severidades:
 *   - >7 días → no muestra (silencioso)
 *   - 4-7 días → amarillo (warning)
 *   - 1-3 días → rojo (critical)
 *   - 0 / vencido → crítico bloqueante (suspended)
 *
 * El banner es 100% client-side — recibe trialEndsAt como prop y calcula la
 * diferencia con Date.now(). El consumidor (layout de /admin) decide si mostrarlo
 * según el plan: solo si plan === "free" && stripeSubscriptionId == null.
 */

import { useEffect, useState, useId } from "react";
import { ShieldCheck, Clock, AlertTriangle, X } from "@buleje/design-system/icons";

export interface TrialCountdownBannerProps {
  /** Fecha de expiración del trial (ISO string o Date). null = sin trial. */
  trialEndsAt: string | Date | null;
  /** URL del tab de planes para hacer upgrade. */
  upgradeHref?: string;
  /** Permite cerrar el banner por sesión (no se persiste). Default: true cuando >3 días. */
  dismissible?: boolean;
}

type Severity = "warning" | "critical" | "expired" | "none";

function severityFromDays(days: number): Severity {
  if (days <= 0) return "expired";
  if (days <= 3) return "critical";
  if (days <= 7) return "warning";
  return "none";
}

function diffInDays(target: Date): number {
  const ms = target.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

const STYLES: Record<Exclude<Severity, "none">, {
  bg: string;
  border: string;
  text: string;
  icon: React.ComponentType<{ className?: string }>;
  liveMode: "polite" | "assertive";
}> = {
  warning: {
    bg: "bg-amber-50 dark:bg-amber-900/20",
    border: "border-amber-300 dark:border-amber-700/50",
    text: "text-amber-800 dark:text-amber-200",
    icon: Clock,
    liveMode: "polite",
  },
  critical: {
    bg: "bg-red-50 dark:bg-red-900/20",
    border: "border-red-300 dark:border-red-700/50",
    text: "text-red-800 dark:text-red-200",
    icon: AlertTriangle,
    liveMode: "assertive",
  },
  expired: {
    bg: "bg-red-100 dark:bg-red-950/40",
    border: "border-red-500 dark:border-red-700",
    text: "text-red-900 dark:text-red-100",
    icon: ShieldCheck,
    liveMode: "assertive",
  },
};

export function TrialCountdownBanner({
  trialEndsAt,
  upgradeHref = "/admin?tab=plan",
  dismissible,
}: TrialCountdownBannerProps) {
  const labelId = useId();
  const [dismissed, setDismissed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Re-render diario para refrescar el conteo sin esperar reload.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000 * 60 * 60); // 1h
    return () => clearInterval(interval);
  }, []);

  if (!trialEndsAt || dismissed) return null;

  const target = new Date(trialEndsAt);
  if (Number.isNaN(target.getTime())) return null;

  // Force re-eval con `now` (el lint no lo capta porque diffInDays usa Date.now())
  void now;

  const days = diffInDays(target);
  const severity = severityFromDays(days);
  if (severity === "none") return null;

  const style = STYLES[severity];
  const Icon = style.icon;
  const canDismiss = dismissible ?? severity === "warning";

  let title: string;
  let body: string;
  let cta: string;

  if (severity === "expired") {
    title = "Tu trial expiró";
    body =
      "Tu tienda está oculta del marketplace y no puede procesar ventas. Activa un plan para volver a operar.";
    cta = "Activar plan ahora";
  } else if (severity === "critical") {
    title = `Quedan ${days} ${days === 1 ? "día" : "días"} de prueba`;
    body =
      "Cuando termine el trial, tu tienda se ocultará y no podrás vender hasta activar un plan.";
    cta = "Elegir plan";
  } else {
    title = `Quedan ${days} días de prueba`;
    body =
      "Activa tu plan antes que expire para mantener tu tienda visible y seguir vendiendo sin interrupciones.";
    cta = "Ver planes";
  }

  return (
    <div
      role="alert"
      aria-live={style.liveMode}
      aria-labelledby={labelId}
      className={`sticky top-0 z-30 w-full border-b-2 ${style.border} ${style.bg} ${style.text}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <Icon className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p id={labelId} className="text-sm font-extrabold leading-tight">
              {title}
            </p>
            <p className="text-xs mt-0.5 opacity-90 leading-relaxed">{body}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <a
            href={upgradeHref}
            className={`inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl font-bold text-sm transition-all ${
              severity === "expired"
                ? "bg-red-600 hover:bg-red-700 text-white shadow-md"
                : severity === "critical"
                  ? "bg-red-600 hover:bg-red-700 text-white shadow-md"
                  : "bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
            }`}
          >
            {cta}
          </a>
          {canDismiss && (
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Cerrar aviso"
              className="inline-flex items-center justify-center h-11 w-11 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
