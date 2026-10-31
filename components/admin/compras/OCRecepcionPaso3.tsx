"use client";

import { Check } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { textoVence } from "@/lib/compras/lotes-recepcion";
import { listarCorto } from "@/lib/compras/ciclo-oc";
import { conVence, type ReceivedItem } from "./oc-recepcion-tipos";

/** Paso 3 de «Recibir la orden»: resumen, notas y confirmar. */
export default function OCRecepcionPaso3({ receivedItems, itemsRecibidos, itemsConDiferencia, totalFactura, sinVence, notas, setNotas, error }: {
  receivedItems: ReceivedItem[];
  itemsRecibidos: ReceivedItem[];
  itemsConDiferencia: ReceivedItem[];
  totalFactura: number;
  /** Perecibles que entran sin fecha de vencimiento (no saldrán en Por vencer). */
  sinVence: string[];
  notas: string;
  setNotas: (n: string) => void;
  error: string | null;
}) {
  return (
    <>
      <p className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex items-center gap-2">
        <Check className="h-4 w-4 text-[var(--data-success-500)]" />
        Confirmar la recepción
      </p>
      {sinVence.length > 0 && (
        <p className="text-sm font-semibold text-[var(--data-warning-ink)]" data-qa="perecibles-sin-vence">
          Sin fecha de vencimiento: {listarCorto(sinVence)}. No saldrá{sinVence.length === 1 ? "" : "n"} en Por vencer; vuelve a «Anterior» para anotarla.
        </p>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-primary/10 dark:bg-primary/15 rounded-xl p-3 text-center border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30">
          <p className="text-sm font-bold text-[var(--data-success-ink)] uppercase">Recibidos</p>
          <p className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{itemsRecibidos.length}</p>
        </div>
        <div className="bg-[var(--data-warning-50)] dark:bg-amber-950/20 rounded-xl p-3 text-center border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/30">
          <p className="text-sm font-bold text-[var(--data-warning-ink)] uppercase">Con diferencia</p>
          <p className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{itemsConDiferencia.length}</p>
        </div>
        <div className="bg-primary/10 dark:bg-primary/15 rounded-xl p-3 text-center border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30">
          <p className="text-sm font-bold text-[var(--data-success-ink)] uppercase">Total factura</p>
          <p className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{formatCurrency(totalFactura)}</p>
        </div>
      </div>

      {/* Items summary */}
      <div className="bg-[var(--surface-sunken)] dark:bg-accent/50 rounded-xl p-3 space-y-1 max-h-40 overflow-y-auto">
        {receivedItems.map((item) => (
          <div key={item.productId} className="flex justify-between text-sm">
            <span className={cn("text-[var(--text-primary)] dark:text-[var(--text-primary)]", item.receivedQty === 0 && "line-through text-[var(--text-tertiary)]")}>
              {item.name}
            </span>
            <span className="text-[var(--text-secondary)] dark:text-muted font-semibold">
              {item.receivedQty}/{item.orderedQty} - {formatCurrency(item.receivedQty * item.unitPrice)}
              {conVence(item) && item.expiryDate ? ` · vence ${textoVence(item.expiryDate)}` : ""}
            </span>
          </div>
        ))}
      </div>

      <textarea
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        placeholder="Notas sobre la recepcion (opcional)..."
        className="w-full border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl px-3 py-2 text-sm bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary resize-none"
        rows={3}
      />

      {error && (
        <div className="text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
    </>
  );
}
