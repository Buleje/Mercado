"use client";

/**
 * Elegir varios pedidos y pasarlos de estado de una vez (Pedidos › Lista).
 *
 * 10-10: la respuesta del servidor se dice. Antes se tragaba cualquier
 * resultado (`catch {}` y sin mirar el status): si el paso no valía para
 * ninguno (422, «no se puede cambiar de pendiente a entregado») o valía sólo
 * para algunos, la selección se borraba igual y nadie se enteraba.
 */
import { useState } from "react";
import { toast } from "sonner";
import type { OrderStatus } from "@/lib/jsondb";
import { csrfHeaders } from "@/lib/csrf-client";
import { STATUS_LABELS } from "../types";

interface UseOrderBulkActionsProps {
  onComplete: () => void;
}

interface RespuestaLote {
  updated?: number;
  rechazados?: { id: string; desde?: string }[];
  sinCambio?: number;
  error?: string;
}

const pedidos = (n: number) => `${n} ${n === 1 ? "pedido" : "pedidos"}`;

export function useOrderBulkActions({ onComplete }: UseOrderBulkActionsProps) {
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [bulkStatusTarget, setBulkStatusTarget] = useState<OrderStatus | "">("");
  const [bulkUpdating, setBulkUpdating] = useState(false);

  const toggleOrderSelect = (id: string) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Elige exactamente estos (la casilla de la cabeza de la Lista: todos los que se ven, o ninguno). */
  const setOrderSelection = (ids: Iterable<string>) => setSelectedOrderIds(new Set(ids));
  const clearOrderSelection = () => setSelectedOrderIds(new Set());

  /** `ids`: los elegidos que todavía se ven (un filtro puesto después no arrastra a los ocultos). */
  const executeBulkStatus = async (ids: readonly string[] = Array.from(selectedOrderIds)) => {
    if (!bulkStatusTarget || ids.length === 0) return;
    const destino = STATUS_LABELS[bulkStatusTarget];
    setBulkUpdating(true);
    try {
      const res = await fetch("/api/orders/bulk-status", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ids, status: bulkStatusTarget }),
      });
      const cuerpo = (await res.json().catch(() => ({}))) as RespuestaLote;
      if (!res.ok) {
        toast.error(cuerpo.error ?? `No se pudieron pasar a ${destino}`);
        return;
      }
      const hechos = cuerpo.updated ?? 0;
      const rechazados = cuerpo.rechazados ?? [];
      if (rechazados.length > 0) {
        toast.warning(
          `${pedidos(hechos)} a ${destino}; ${pedidos(rechazados.length)} no podían saltar a ese paso`,
        );
      } else if (hechos === 0) {
        toast.info(`Ya estaban en ${destino}`);
      } else {
        toast.success(`${pedidos(hechos)} a ${destino}`);
      }
      // Cambio a medias: los rechazados quedan elegidos para verlos y decidir.
      if (rechazados.length > 0) {
        setSelectedOrderIds(new Set(rechazados.map((r) => r.id)));
      } else {
        clearOrderSelection();
      }
      setBulkStatusTarget("");
      onComplete();
    } catch {
      toast.error("Sin conexión: los pedidos no cambiaron. Prueba otra vez.");
    } finally {
      setBulkUpdating(false);
    }
  };

  return {
    selectedOrderIds,
    bulkStatusTarget,
    setBulkStatusTarget,
    bulkUpdating,
    toggleOrderSelect,
    setOrderSelection,
    clearOrderSelection,
    executeBulkStatus,
  };
}
