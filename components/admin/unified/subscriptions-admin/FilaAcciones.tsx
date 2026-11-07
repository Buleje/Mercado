"use client";

import { MoreHorizontal, Pause, Play, X } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import type { Accion, Subscription } from "./tipos";

/** La acción que sigue (Pausar o Reanudar) a la vista; Cancelar, en el «⋯». */
export function FilaAcciones({ s, onAction }: { s: Subscription; onAction: (s: Subscription, a: Accion) => void }) {
  const mas: MenuAccion[] = s.status !== "cancelled" ? [{ id: "cancelar", label: "Cancelar suscripción", icon: X, tone: "danger", onSelect: () => onAction(s, "cancelar") }] : [];
  return (
    <div className="flex items-center justify-end gap-1">
      {s.status === "active" && (
        <button type="button" onClick={() => onAction(s, "pausar")} className="inline-flex min-h-12 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]">
          <Pause className="h-4 w-4" aria-hidden /> Pausar
        </button>
      )}
      {s.status === "paused" && (
        <button type="button" onClick={() => onAction(s, "reanudar")} className="inline-flex min-h-12 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[var(--accent-ink)] hover:bg-primary/10 dark:text-[var(--accent)]">
          <Play className="h-4 w-4" aria-hidden /> Reanudar
        </button>
      )}
      {mas.length === 0 && <span className="w-12 shrink-0" aria-hidden />}
      {mas.length > 0 && <ActionMenu label={`Más acciones de ${s.customerName}`} icon={MoreHorizontal} actions={mas} soloIcono size="md" className="w-12 shrink-0" title="Cancelar suscripción" />}
    </div>
  );
}
