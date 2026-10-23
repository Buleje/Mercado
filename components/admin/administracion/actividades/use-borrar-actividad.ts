"use client";

/**
 * Borrar una actividad de la agenda, con su confirmación (ADR-501 §3). Lo usan
 * la lista de Actividades y el «⋯» de cada fila de «Por hacer» (Hoy, calendario
 * y el centro «Pendientes y avisos»): un solo texto, un solo trato del 404.
 */
import { useCallback } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { useAgenda } from "@/hooks/use-agenda";
import type { ActividadDTO } from "@/lib/agenda/tipos";
import { borrarActividad } from "../agenda-api";

/** `true` si la actividad quedó borrada (o ya no existía). */
export function useBorrarActividad(): (a: Pick<ActividadDTO, "id" | "nombre">) => Promise<boolean> {
  const { refrescar } = useAgenda();
  const { confirm } = useConfirm();
  return useCallback(
    async (a) => {
      const ok = await confirm({
        title: `¿Borrar «${a.nombre}»?`,
        description: "Deja de salir en Hoy y en el calendario. Lo que ya marcaste se queda en el historial.",
        intent: "danger",
        confirmLabel: "Borrar",
      });
      if (!ok) return false;
      const r = await borrarActividad(a.id);
      if (!r.ok && r.status !== 404) {
        toast.error(r.error);
        return false;
      }
      toast.success(`«${a.nombre}» se borró`);
      refrescar();
      return true;
    },
    [confirm, refrescar],
  );
}
