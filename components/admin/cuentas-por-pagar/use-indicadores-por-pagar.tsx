"use client";

/**
 * Los indicadores de Por pagar con el patrón del panel (`useKpisPlegables`): el
 * botón va en la fila del título y, plegado, lleva lo que le debes en el titular.
 * Reemplaza a `KpisPorPagar` (tarjetas fijas con un botón propio).
 */
import { AlertTriangle, CalendarClock, Check, Wallet, type LucideIcon } from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { formatCurrency } from "@/lib/format";
import { DIAS_PRONTO, type ResumenCuentas } from "./resumen-cuentas";

type Tono = "neutral" | "warning" | "error" | "success";

const EMPHASIS = { neutral: "neutral", warning: "warning", error: "error", success: "success" } as const;

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
    soloIcono: true,
    sinTitular: true,
    compactoEnMovil: true,
    sinDatosAun: !cargada,
    /* Corto a propósito: en la fila del título el botón deja ~15 caracteres antes del «…». */
    resumen: formatCurrency(r.porPagar),
    tarjetas: items.map(({ label, valor, detalle, tono, Icono }) => (
      <StatCard key={label} label={label} value={valor} subValue={detalle} icon={Icono} iconEmphasis emphasis={EMPHASIS[tono]} />
    )),
  });
}
