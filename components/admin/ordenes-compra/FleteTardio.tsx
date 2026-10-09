"use client";

import { leerJson } from "@/lib/errores/sin-dato";
import { csrfHeaders } from "@/lib/csrf-client";
import { useState } from "react";
import { Loader2, Check, Truck } from "@buleje/design-system/icons";
import type { DbPurchaseOrder } from "@/lib/jsondb";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";

/**
 * Cargar el flete a una orden ya recibida (ADR-377 · backfill).
 *
 * Las compras anteriores al ADR no tienen flete, así que el costo de esos
 * productos —y el margen que sale de él— es optimista. Acá se carga, y el
 * servidor reparte el sobrecosto entre las unidades que quedan en stock.
 */
export default function FleteTardio({
  orden,
  onGuardado,
}: {
  orden: DbPurchaseOrder;
  onGuardado: (mensaje: string) => void;
}) {
  const yaTiene = (orden.flete ?? 0) + (orden.otrosCostos ?? 0) > 0;
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState(orden.flete ?? 0);
  const [guardando, setGuardando] = useState(false);

  if (orden.status !== "recibido") return null;

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={cn(
          "mt-3 inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border-2 text-xs font-bold transition-colors",
          yaTiene
            ? "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--text-primary)] hover:text-[var(--text-primary)]"
            : "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/10 text-[var(--data-warning-500)]",
        )}
      >
        <Truck className="h-3.5 w-3.5" />
        {yaTiene ? `Costo de traerla: ${formatCurrency((orden.flete ?? 0) + (orden.otrosCostos ?? 0))}` : "Falta cargar el flete"}
      </button>
    );
  }

  const guardar = async () => {
    setGuardando(true);
    try {
      const res = await fetch(`/api/purchases/${orden.id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ flete: monto }),
      });
      if (!res.ok) { onGuardado("No se pudo guardar el flete"); return; }
      const data = await leerJson<{ productosRevaluados?: number }>(res);
      const n = data?.productosRevaluados ?? 0;
      onGuardado(
        n > 0
          ? `Flete cargado — se recalculó el costo de ${n} producto${n === 1 ? "" : "s"}`
          : "Flete cargado — no quedaba stock de esta compra, así que no hubo costo que recalcular",
      );
      setAbierto(false);
    } catch {
      onGuardado("Sin conexión con el servidor — el flete no se guardó");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="mt-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3.5 space-y-2.5">
      <p className="text-xs text-[var(--text-secondary)]">
        Lo que costó traer esta compra (mototaxi, carga, estiba). Se reparte entre las unidades
        que todavía tienes en stock, para que el costo del producto deje de ser optimista.
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-[var(--text-tertiary)]">S/</span>
          <input
            type="number" min="0" step="0.5"
            value={monto}
            onChange={(e) => setMonto(Math.max(0, Number(e.target.value)))}
            aria-label="Costo de traer la mercadería"
            className="w-32 h-11 pl-9 pr-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold tabular-nums text-[var(--text-primary)] outline-none focus:border-primary"
          />
        </div>
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="inline-flex items-center gap-1.5 h-11 px-4 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-60"
        >
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Guardar
        </button>
        <button
          type="button"
          onClick={() => { setAbierto(false); setMonto(orden.flete ?? 0); }}
          className="h-11 px-3 rounded-xl text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
