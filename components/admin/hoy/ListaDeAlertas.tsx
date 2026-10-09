"use client";

import { ArrowRight, AlertTriangle, AlertCircle, Info } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { irEnElPanel } from "@/lib/admin/ir-en-el-panel";
import type { AlertaDeInicio, SeveridadAlerta } from "@/lib/admin/overview-tipos";

const ICONO: Record<SeveridadAlerta, typeof Info> = {
  danger: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const COLOR: Record<SeveridadAlerta, string> = {
  danger: "text-[var(--data-error-500)]",
  warning: "text-[var(--data-warning-500)]",
  info: "text-[var(--text-tertiary)]",
};

/**
 * Las filas de «Alertas accionables» de Inicio: cada una lleva a su destino ya
 * filtrado y, si trae `enlaces`, muestra debajo los atajos a cada parte
 * («50 sin costo · 22 sin mínimo»). Los atajos van como hermanos del enlace
 * principal, nunca adentro (un `<a>` dentro de otro no es válido). Cambian de
 * módulo con `irEnElPanel`: el enlace de Next dejaba la pantalla quieta.
 *
 * `amplio` = la columna de Inicio al lado de la Meta; `compacto` = el bloque
 * bajo el hero de TodayHub.
 */
export function ListaDeAlertas({
  alerts,
  tamano,
  className,
}: {
  alerts: AlertaDeInicio[];
  tamano: "amplio" | "compacto";
  className?: string;
}) {
  const amplio = tamano === "amplio";
  const fila = cn("flex items-center gap-3", amplio ? "px-5 sm:px-6 py-3.5" : "px-5 py-3");
  const icono = amplio ? "h-5 w-5" : "h-4 w-4";
  const texto = cn(
    "flex-1 text-[var(--text-primary)] font-semibold",
    amplio ? "text-sm sm:text-base leading-snug" : "text-sm",
  );

  return (
    <ul className={cn("divide-y divide-[var(--rule-soft)]", className)}>
      {alerts.map((alert) => {
        const Icon = ICONO[alert.severity];
        const cuerpo = (
          <>
            <Icon className={cn(icono, "shrink-0", COLOR[alert.severity])} strokeWidth={amplio ? 2 : 1.75} aria-hidden />
            <span className={texto}>{alert.text}</span>
          </>
        );
        return (
          <li key={alert.id} data-alerta={alert.id}>
            {alert.href ? (
              <a href={alert.href} onClick={irEnElPanel} className={cn(fila, "hover:bg-[var(--surface-sunken)] transition-colors group")}>
                {cuerpo}
                <ArrowRight
                  className="h-4 w-4 shrink-0 text-[var(--text-tertiary)] group-hover:translate-x-0.5 transition-transform"
                  strokeWidth={amplio ? 2 : 1.75}
                  aria-hidden
                />
              </a>
            ) : (
              <div className={fila}>{cuerpo}</div>
            )}
            {alert.enlaces && alert.enlaces.length > 0 && (
              <div className={cn("flex flex-wrap gap-2 pb-3", amplio ? "pl-13 pr-5 sm:pl-14 sm:pr-6" : "pl-12 pr-5")}>
                {alert.enlaces.map((e) => (
                  <a
                    key={e.href}
                    href={e.href}
                    onClick={irEnElPanel}
                    className="inline-flex min-h-9 items-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                  >
                    {e.label}
                  </a>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
