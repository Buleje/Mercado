"use client";

import { useState, useEffect, useCallback } from "react";

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
        const list: CommissionEntry[] = Array.isArray(d?.entries) ? d.entries : [];
        setEntries(list);
        const s: CommissionSummary = { pendiente: 0, liquidado: 0, pagado: 0 };
        list.forEach((e) => { s[e.status] = (s[e.status] || 0) + e.amount; });
        setSummary(s);
      })
      .catch(() => setError("No se pudieron cargar las comisiones."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleMarkPaid = async (entryId: string) => {
    setMarkingPaid(entryId);
    try {
      const res = await fetch("/api/commissions/ledger", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [entryId], status: "pagado" }),
      });
      if (!res.ok) throw new Error();
      setEntries((prev) => prev.map((e) => e.id === entryId ? { ...e, status: "pagado" } : e));
      setSummary((prev) => {
        const entry = entries.find((e) => e.id === entryId);
        if (!entry) return prev;
        return {
          ...prev,
          [entry.status]: prev[entry.status as keyof CommissionSummary] - entry.amount,
          pagado: prev.pagado + entry.amount,
        };
      });
    } catch {
      setError("Error al marcar como pagado.");
    } finally {
      setMarkingPaid(null);
    }
  };

  const handleBulkPay = async () => {
    const settledIds = entries.filter((e) => e.status === "liquidado").map((e) => e.id);
    if (settledIds.length === 0) return;
    setMarkingPaid("bulk");
    try {
      const res = await fetch("/api/commissions/ledger", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: settledIds, status: "pagado" }),
      });
      if (!res.ok) throw new Error();
      load();
    } catch {
      setError("Error al marcar comisiones como pagadas.");
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
