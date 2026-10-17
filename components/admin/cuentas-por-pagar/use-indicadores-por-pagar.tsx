"use client";

/**
 * Los indicadores de Por pagar con el patrón del panel (`useKpisPlegables`): el
 * botón va en la fila del título y, plegado, lleva lo que le debes en el titular.
 * Reemplaza a `KpisPorPagar` (tarjetas fijas con un botón propio).
 */
import { AlertTriangle, CalendarClock, Check, Wallet, type LucideIcon } from "@buleje/design-system/icons";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DIAS_PRONTO, type ResumenCuentas } from "./resumen-cuentas";

type Tono = "neutral" | "warning" | "error" | "success";

const COLOR: Record<Tono, string> = {
  neutral: "text-[var(--text-primary)]",
  warning: "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]",
  error: "text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]",
  success: "text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]",
};

export function useIndicadoresPorPagar(r: ResumenCuentas, cargada: boolean) {
  const items: { label: string; valor: string; detalle: string; tono: Tono; Icono: LucideIcon }[] = [
    { label: "Le debes", valor: formatCurrency(r.porPagar), detalle: `${r.pendientes} cuenta${r.pendientes === 1 ? "" : "s"}`, tono: r.porPagar > 0 ? "warning" : "neutral", Icono: Wallet },
    { label: "Vencido", valor: formatCurrency(r.vencido), detalle: `${r.vencidas} cuenta${r.vencidas === 1 ? "" : "s"}`, tono: r.vencidas > 0 ? "error" : "neutral", Icono: AlertTriangle },
    { label: "Esta semana", valor: formatCurrency(r.pronto), detalle: `${r.prontoN} vence${r.prontoN === 1 ? "" : "n"} en ${DIAS_PRONTO} días`, tono: r.prontoN > 0 ? "warning" : "neutral", Icono: CalendarClock },
    { label: "Ya pagaste", valor: formatCurrency(r.pagado), detalle: "en total", tono: "success", Icono: Check },
  ];
  return useKpisPlegables({
    claveMemoria: "compras:por-pagar",
    alto: "md",
    compactoEnMovil: true,
    sinDatosAun: !cargada,
    /* Corto a propósito: en la fila del título el botón deja ~15 caracteres antes del «…». */
    resumen: formatCurrency(r.porPagar),
    tarjetas: items.map(({ label, valor, detalle, tono, Icono }) => (
      <div key={label} className="flex min-w-0 items-start gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
        <Icono className={cn("mt-0.5 h-5 w-5 shrink-0", COLOR[tono])} strokeWidth={1.75} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--text-secondary)]">{label}</p>
          <p className={cn("text-lg font-extrabold tabular-nums", COLOR[tono])}>{valor}</p>
          <p className="truncate text-sm text-[var(--text-secondary)]">{detalle}</p>
        </div>
      </div>
    )),
  });
}
