"use client";

import { useCallback, useState } from "react";
import { leerJson } from "@/lib/errores/sin-dato";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";

/** Los rechazos del servidor, dichos como en el mostrador. */
const POR_CODIGO: Record<string, string> = {
  no_abierto: "Este adelanto ya no está abierto: no se le pone fecha ni permiso.",
  contrato_ajeno: "Ese permiso ya no está en la lista. Recarga y elígelo de nuevo.",
};

export type PedidoControl = { fechaVencimiento: string | null } | { contratoId: string | null };

/**
 * `PATCH /api/adelantos/[id]` con la fecha para devolverlo o el permiso.
 * Devuelve `true` si se guardó; si no, deja el motivo en `error`.
 */
export function useControlarAdelanto(adelantoId: string) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = useCallback(
    async (pedido: PedidoControl): Promise<boolean> => {
      setGuardando(true);
      setError(null);
      try {
        const res = await fetch(`/api/adelantos/${adelantoId}`, {
          method: "PATCH",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify(pedido),
        });
        if (res.ok) return true;
        const j = await leerJson<{ error?: string; code?: string; issues?: string[] }>(res);
        setError(
          res.status === 403
            ? "Tu rol no puede cambiar adelantos. Pídeselo al dueño o a un administrador."
            : ((j?.code && POR_CODIGO[j.code]) ?? j?.issues?.[0] ?? j?.error ?? "No se pudo guardar."),
        );
        return false;
      } catch (e) {
        logger.error("[adelantos] no se pudo guardar vencimiento/permiso", { error: String(e) });
        setError("No se pudo guardar. Revisa la conexión.");
        return false;
      } finally {
        setGuardando(false);
      }
    },
    [adelantoId],
  );

  return { guardar, guardando, error, limpiarError: () => setError(null) };
}
