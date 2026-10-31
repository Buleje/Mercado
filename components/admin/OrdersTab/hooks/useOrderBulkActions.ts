"use client";

/**
 * Elegir varios pedidos y pasarlos de estado de una vez (Pedidos › Lista).
 *
 * 10-10: la respuesta del servidor se dice. Antes se tragaba cualquier
 * resultado (`catch {}` y sin mirar el status).
 * 17-10 (P09): «Aplicar» ya no manda a ciegas. Abre la revisión (cuáles van y
 * cuáles no, con el porqué), manda sólo los que pueden, y el informe dice qué
 * le pasó a CADA uno; «Reintentar» manda sólo los pendientes (red, 5xx,
 * cambió mientras tanto). Al cerrar quedan elegidos los que falta decidir.
 * La regla vive en `../lote-pedidos.ts`.
 */
import { useState } from "react";
import type { DbOrder, OrderStatus } from "@/lib/jsondb";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import {
  juntarResultados,
  pendientesDe,
  porDecidir,
  resultadoDelLote,
  revisarLote,
  type FilaLote,
  type RespuestaLote,
} from "../lote-pedidos";

interface UseOrderBulkActionsProps {
  onComplete: () => void;
}

export interface EstadoLote {
  destino: OrderStatus;
  /** revisar → (enviando) → informe; un reintento vuelve a «enviando». */
  fase: "revisar" | "enviando" | "informe";
  /** Los que se mandan en el primer envío. */
  elegibles: string[];
  /** Una fila por pedido elegido: los que no se mandan ya traen su resultado. */
  filas: FilaLote[];
  /** Los pedidos tal como estaban al abrir (nombre del cliente para la tabla). */
  pedidos: Pick<DbOrder, "id" | "status" | "customer" | "total">[];
}

export function useOrderBulkActions({ onComplete }: UseOrderBulkActionsProps) {
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [bulkStatusTarget, setBulkStatusTarget] = useState<OrderStatus | "">("");
  const [lote, setLote] = useState<EstadoLote | null>(null);

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

  /** «Aplicar»: abre la revisión con los elegidos que todavía se ven. */
  const revisar = (pedidos: readonly DbOrder[]) => {
    if (!bulkStatusTarget || pedidos.length === 0) return;
    const { elegibles, excluidos } = revisarLote(pedidos, bulkStatusTarget);
    const porId = new Map(excluidos.map((f) => [f.id, f]));
    setLote({
      destino: bulkStatusTarget,
      fase: "revisar",
      elegibles,
      filas: pedidos.map(
        (p) => porId.get(p.id) ?? { id: p.id, resultado: "pendiente", motivo: "Sin mandar todavía" },
      ),
      pedidos: pedidos.map((p) => ({ id: p.id, status: p.status, customer: p.customer, total: p.total })),
    });
  };

  const enviar = async (ids: string[]) => {
    if (!lote || ids.length === 0) return;
    const destino = lote.destino;
    setLote((l) => (l ? { ...l, fase: "enviando" } : l));
    let filas: FilaLote[];
    try {
      const res = await fetch("/api/orders/bulk-status", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ids, status: destino }),
      });
      const cuerpo = (await res.json().catch(() => ({}))) as RespuestaLote;
      filas = resultadoDelLote(ids, res.status, cuerpo, destino);
    } catch (err) {
      logger.warn("[pedidos] lote sin respuesta", { error: String(err) });
      filas = resultadoDelLote(ids, null, {}, destino);
    }
    setLote((l) => (l ? { ...l, fase: "informe", filas: juntarResultados(l.filas, filas) } : l));
    // Releer siempre: aun con error, alguno pudo cambiar antes del corte.
    onComplete();
  };

  const confirmarLote = () => void enviar(lote?.elegibles ?? []);
  const reintentarLote = () => void enviar(lote ? pendientesDe(lote.filas) : []);

  /** Cerrar: sin mandar, la selección queda como estaba; con informe, quedan los que falta decidir. */
  const cerrarLote = () => {
    if (lote && lote.fase !== "revisar") {
      setSelectedOrderIds(new Set(porDecidir(lote.filas)));
      setBulkStatusTarget("");
    }
    setLote(null);
  };

  return {
    selectedOrderIds,
    bulkStatusTarget,
    setBulkStatusTarget,
    /** Mandando un lote (deshabilita «Aplicar»). */
    bulkUpdating: lote?.fase === "enviando",
    toggleOrderSelect,
    setOrderSelection,
    clearOrderSelection,
    lote,
    revisar,
    confirmarLote,
    reintentarLote,
    cerrarLote,
  };
}
