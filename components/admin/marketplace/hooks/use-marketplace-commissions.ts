"use client";

import { useState, useEffect, useCallback } from "react";
import { csrfHeaders } from "@/lib/csrf-client";

export interface CommissionEntry {
  id: string;
  orderId: string;
  amount: number;
  status: "pendiente" | "liquidado" | "pagado";
  createdAt: string;
  orderTotal: number;
}

export interface CommissionSummary {
  pendiente: number;
  liquidado: number;
  pagado: number;
}

// La API (`/api/commissions/ledger`) usa estados en inglés
// (pending/settled/paid/refunded). El tab los muestra en español.
// `refunded` no se modela en el tipo del tab → lo tratamos como "pagado"
// (movimiento cerrado) para no romper la UI.
const STATUS_EN_TO_ES: Record<string, CommissionEntry["status"]> = {
  pending: "pendiente",
  settled: "liquidado",
  paid: "pagado",
  refunded: "pagado",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toEntry(row: any): CommissionEntry {
  return {
    id: String(row?.id ?? ""),
    orderId: String(row?.orderId ?? ""),
    amount: Number(row?.amount ?? 0),
    status: STATUS_EN_TO_ES[String(row?.status)] ?? "pendiente",
    createdAt: String(row?.createdAt ?? ""),
    // mapLedger (lib/db/commissions.db.ts) no expone el total de la orden;
    // sería un join extra a Order. Default 0 hasta que el DTO lo incluya.
    orderTotal: Number(row?.orderTotal ?? 0),
  };
}

export function useMarketplaceCommissions() {
  const [entries, setEntries] = useState<CommissionEntry[]>([]);
  const [summary, setSummary] = useState<CommissionSummary>({ pendiente: 0, liquidado: 0, pagado: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/commissions/ledger")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        // El endpoint devuelve { data, totals } — NO { entries }.
        const list: CommissionEntry[] = Array.isArray(d?.data) ? d.data.map(toEntry) : [];
        setEntries(list);
        // `totals` ya viene agregado del backend (en inglés). Lo mapeamos a ES.
        const t = d?.totals ?? {};
        setSummary({
          pendiente: Number(t.totalPending ?? 0),
          liquidado: Number(t.totalSettled ?? 0),
          pagado: Number(t.totalPaid ?? 0),
        });
      })
      .catch(() => setError("No se pudieron cargar las comisiones."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleMarkPaid = async (entryId: string) => {
    setMarkingPaid(entryId);
    try {
      // TODO: el PATCH de /api/commissions/ledger solo liquida (pending→settled);
      // no soporta transición a "paid". Esta acción liquida la comisión hasta
      // que exista un endpoint de pago. Body = { ids } (el schema ignora `status`).
      const res = await fetch("/api/commissions/ledger", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ids: [entryId] }),
      });
      if (!res.ok) throw new Error();
      setEntries((prev) => prev.map((e) => e.id === entryId ? { ...e, status: "liquidado" } : e));
      setSummary((prev) => {
        const entry = entries.find((e) => e.id === entryId);
        if (!entry) return prev;
        return {
          ...prev,
          [entry.status]: prev[entry.status as keyof CommissionSummary] - entry.amount,
          liquidado: prev.liquidado + entry.amount,
        };
      });
    } catch {
      setError("Error al liquidar la comisión.");
    } finally {
      setMarkingPaid(null);
    }
  };

  const handleBulkPay = async () => {
    // Solo se pueden liquidar las pendientes (pending→settled).
    const pendingIds = entries.filter((e) => e.status === "pendiente").map((e) => e.id);
    if (pendingIds.length === 0) return;
    setMarkingPaid("bulk");
    try {
      // TODO: igual que handleMarkPaid — el endpoint solo liquida, no paga.
      const res = await fetch("/api/commissions/ledger", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ids: pendingIds }),
      });
      if (!res.ok) throw new Error();
      load();
    } catch {
      setError("Error al liquidar las comisiones.");
    } finally {
      setMarkingPaid(null);
    }
  };

  const filtered = filterStatus === "all" ? entries : entries.filter((e) => e.status === filterStatus);

  return {
    entries, filtered, summary, loading, error,
    filterStatus, setFilterStatus,
    markingPaid, load,
    handleMarkPaid, handleBulkPay,
  };
}
