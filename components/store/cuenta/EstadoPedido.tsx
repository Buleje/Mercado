/**
 * La pastilla del estado de un pedido, igual en el saludo y en la lista.
 * Lo que está en curso va con el acento del negocio; entregado, neutro;
 * cancelado, en rojo; esperando, en ámbar.
 */
import { cn } from "@/lib/utils";

const ESTADOS: Record<string, { texto: string; clase: string }> = {
  pendiente: { texto: "Recibido", clase: "bg-[var(--data-warning-50)] text-[var(--data-warning-700)]" },
  confirmado: { texto: "Preparando", clase: "bg-[var(--accent-soft)] text-[var(--text-primary)] ring-1 ring-[var(--accent)]" },
  preparando: { texto: "Preparando", clase: "bg-[var(--accent-soft)] text-[var(--text-primary)] ring-1 ring-[var(--accent)]" },
  en_camino: { texto: "En camino", clase: "bg-[var(--accent-soft)] text-[var(--text-primary)] ring-1 ring-[var(--accent)]" },
  // Entregado = terminado: neutro, para que la vista no grite lo que ya no pide nada.
  entregado: { texto: "Entregado", clase: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" },
  cancelado: { texto: "Cancelado", clase: "bg-[var(--data-error-50)] text-[var(--data-error-700)]" },
};

export function textoEstado(status: string): string {
  return ESTADOS[status]?.texto ?? status.replace(/_/g, " ");
}

export function EstadoPedido({ status, className }: { status: string; className?: string }) {
  const e = ESTADOS[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-sm font-semibold",
        e?.clase ?? "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
        className,
      )}
    >
      {textoEstado(status)}
    </span>
  );
}
