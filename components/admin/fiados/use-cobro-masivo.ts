"use client";

/**
 * Cobro masivo (Mejora 3): marcar varios fiados en la tabla y cobrar un monto
 * que reparte el SERVIDOR del más viejo al más nuevo, en céntimos. La vista
 * previa usa la misma regla (`repartirCobroMasivo`): lo que ves es lo que se
 * cobra. Con su medio y, si quieres, a la caja abierta en la misma transacción
 * (antes el cobro masivo no entraba a la caja ni guardaba el medio).
 */
import { useState } from "react";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";
import { formatCurrency } from "@/lib/format";
import type { MetodoCobro } from "@/lib/fiados/cobro-metodo";
import { aCentimos, repartirCobroMasivo } from "@/lib/fiados/reparto-cobro-masivo";
import { estaAbierto, type Fiado } from "./tipos";

export type Reparto = { fiadoId: string; customerName: string; saldo: number; pago: number; tipo: string };
export type DatosCobroMasivo = { metodo: MetodoCobro; aCaja: boolean; notas: string };

type RespuestaCobroMasivo = { totalCobrado: number; sobrante?: number; caja?: { sinCaja: boolean; movimientos: number } };

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
  // En céntimos: 10.1 + 20.2 en float da 30.299999… y «Todo» mostraba un céntimo menos.
  const selectedTotal = selectedFiados.reduce((s, f) => s + aCentimos(f.saldo), 0) / 100;

  // Vista previa del reparto, con la misma regla que aplica el servidor.
  const computeDistribution = (totalPago: number): Reparto[] => {
    const nombre = new Map(selectedFiados.map((f) => [f.id, f.customerName || f.customerId]));
    return repartirCobroMasivo(selectedFiados, totalPago).pagos.map((p) => ({
      fiadoId: p.fiadoId,
      customerName: nombre.get(p.fiadoId) ?? "",
      saldo: p.saldo,
      pago: p.pago,
      tipo: p.completo ? "Pago completo" : "Abono parcial",
    }));
  };

  const handleCobroMasivo = async (datos?: DatosCobroMasivo) => {
    const monto = parseFloat(cobroMonto);
    if (!Number.isFinite(monto) || monto < 0.01) { setCobroError("Monto inválido"); return; }
    if (selectedFiados.length === 0) { setCobroError("Elige al menos un fiado con deuda"); return; }
    setCobroPaying(true);
    setCobroError(null);
    try {
      const res = await fetch("/api/fiados/cobro-masivo", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          fiadoIds: selectedFiados.map((f) => f.id),
          monto: aCentimos(monto) / 100,
          metodo: datos?.metodo,
          aCaja: datos?.aCaja ?? false,
          notas: datos?.notas.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        // 409/422: otro cobro o un fiado ya pagado. Se refresca la lista para que veas lo de ahora.
        if (res.status === 409 || res.status === 422) alTerminar();
        throw new Error(err.error || "Error al cobrar");
      }
      const r = (await res.json()) as RespuestaCobroMasivo;
      if (datos?.aCaja && r.caja?.sinCaja) toast.warning(`Cobraste ${formatCurrency(r.totalCobrado)}, pero no había caja abierta: no entró a la caja.`);
      else toast.success(`Cobraste ${formatCurrency(r.totalCobrado)}${r.caja && !r.caja.sinCaja ? " · entró a la caja" : ""}`);
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
