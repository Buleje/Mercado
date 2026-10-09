"use client";

/**
 * Cobro masivo (Mejora 3): marcar varios fiados en la tabla y repartir un
 * pago del más viejo al más nuevo. Salió de FiadosModule sin cambiar el reparto.
 */
import { useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { estaAbierto, type Fiado } from "./tipos";

export type Reparto = { fiadoId: string; customerName: string; saldo: number; pago: number; tipo: string };

export function useCobroMasivo(fiados: Fiado[], alTerminar: () => void) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCobroMasivo, setShowCobroMasivo] = useState(false);
  const [cobroMonto, setCobroMonto] = useState("");
  const [cobroPaying, setCobroPaying] = useState(false);
  const [cobroError, setCobroError] = useState<string | null>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedFiados = fiados.filter((f) => selectedIds.has(f.id) && estaAbierto(f));
  const selectedTotal = selectedFiados.reduce((s, f) => s + f.saldo, 0);

  // Reparte el pago del fiado más viejo al más nuevo
  const computeDistribution = (totalPago: number): Reparto[] => {
    const sorted = [...selectedFiados].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    let remaining = totalPago;
    const distribution: Reparto[] = [];
    for (const f of sorted) {
      if (remaining <= 0) break;
      const pago = Math.min(remaining, f.saldo);
      distribution.push({ fiadoId: f.id, customerName: f.customerName || f.customerId, saldo: f.saldo, pago, tipo: pago >= f.saldo ? "Pago completo" : "Abono parcial" });
      remaining -= pago;
    }
    return distribution;
  };

  const handleCobroMasivo = async () => {
    const monto = parseFloat(cobroMonto);
    if (isNaN(monto) || monto <= 0) { setCobroError("Monto inválido"); return; }
    setCobroPaying(true);
    setCobroError(null);
    try {
      const payments = computeDistribution(monto).map((d) => ({ fiadoId: d.fiadoId, monto: d.pago }));
      const res = await fetch("/api/fiados/cobro-masivo", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ payments }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error" }));
        throw new Error(err.error || "Error al cobrar");
      }
      setShowCobroMasivo(false);
      setCobroMonto("");
      setSelectedIds(new Set());
      alTerminar();
    } catch (e) {
      setCobroError(e instanceof Error ? e.message : "Error");
    } finally {
      setCobroPaying(false);
    }
  };

  return {
    selectedIds, setSelectedIds, toggleSelect, selectedFiados, selectedTotal,
    showCobroMasivo, setShowCobroMasivo, cobroMonto, setCobroMonto, cobroPaying, cobroError, setCobroError,
    computeDistribution, handleCobroMasivo,
  };
}
