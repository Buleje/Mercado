import { CLASE_CHIP } from "@/components/admin/rrhh/rrhh-form";
import { cn } from "@/lib/utils";

/**
 * Estados de un retiro, con un color cada uno (Retiros por pagar, historial y
 * la ventana de pagar). «Por confirmar» no es un estado de la base: es un pago
 * que se mandó y no volvió la respuesta (P34) hasta que la lista se relee.
 */
export const ESTADO_RETIRO: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pendiente", cls: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]" },
  approved: { label: "Aprobado", cls: "bg-[var(--data-info-100)] text-[var(--data-info-700)]" },
  paid: { label: "Pagado", cls: "bg-[var(--data-success-100)] text-[var(--data-success-700)]" },
  rejected: { label: "Rechazado", cls: "bg-[var(--data-error-100)] text-[var(--data-error-700)]" },
  "por-confirmar": { label: "Error por confirmar", cls: "bg-[var(--data-error-100)] text-[var(--data-error-700)]" },
};

export function ChipEstadoRetiro({ status }: { status: string }) {
  const e = ESTADO_RETIRO[status] ?? { label: status, cls: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" };
  return <span className={cn(CLASE_CHIP, e.cls)}>{e.label}</span>;
}
