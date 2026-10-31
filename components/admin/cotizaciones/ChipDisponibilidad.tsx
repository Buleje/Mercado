/**
 * Una línea de cotización frente al stock de hoy (F26): «Hay 40 u», «Faltan 5
 * (hay 15 u)», «Servicio: no usa stock»… El color sigue la gravedad.
 */
import { AlertTriangle, PackageCheck, Wrench } from "@buleje/design-system/icons";
import type { EstadoLinea, NivelDisponibilidad } from "@/lib/cotizaciones/disponibilidad";
import { cn } from "@/lib/utils";

const TONO: Record<NivelDisponibilidad, string> = {
  servicio: "text-[var(--text-secondary)]",
  "sin-control": "text-[var(--text-secondary)]",
  hay: "text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]",
  "queda-bajo": "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]",
  falta: "text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]",
  agotado: "text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]",
  inactivo: "text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]",
};

export function ChipDisponibilidad({ estado, className }: { estado: EstadoLinea; className?: string }) {
  const Icono = estado.nivel === "servicio" ? Wrench : estado.nivel === "hay" || estado.nivel === "sin-control" ? PackageCheck : AlertTriangle;
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm font-semibold", TONO[estado.nivel], className)}>
      <Icono className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {estado.texto}
    </span>
  );
}
