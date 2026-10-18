"use client";

import { Plus, Users, AlertTriangle, Search } from "@buleje/design-system/icons";
import POSSplitPayment from "@/components/admin/pos/POSSplitPayment";
import { fmt } from "@/components/admin/pos/pago/pago-shared";
import type { PagoModal } from "@/components/admin/pos/pago/usePagoModal";
import PagoBilletera from "@/components/admin/pos/pago/PagoBilletera";
import PagoMetodos from "@/components/admin/pos/pago/PagoMetodos";
import PagoEfectivo from "@/components/admin/pos/pago/PagoEfectivo";
import PagoLineasMonto from "@/components/admin/pos/pago/PagoLineasMonto";
import PagoVuelto from "@/components/admin/pos/pago/PagoVuelto";
import { enfocarBuscarCliente } from "@/components/admin/pos/pago/useAtajosDelCobro";

/** Texto del aviso de Fiado: quién, cuánto debe ya y en cuánto quedaría (preview; el backend registra). */
function avisoFiado({ customerPhone, customerName, total, deuda }: Pick<PagoModal, "customerPhone" | "customerName" | "total" | "deuda">): string {
  if (!customerPhone) return "Elige a quién se le fía.";
  const quien = customerName || customerPhone;
  if (deuda.loading) return `Viendo cuánto debe ${quien}…`;
  const debe = deuda.data?.montoPendiente ?? 0;
  if (debe <= 0.009) return `${quien} no debe nada. Esta venta queda como su deuda: ${fmt(total)}.`;
  const vencido = deuda.data?.hasFiadosVencidos ? " (tiene fiado vencido)" : "";
  return `${quien} ya debe ${fmt(debe)}${vencido}. Con esta venta quedaría en ${fmt(debe + total)}.`;
}

/** Fiado: la deuda que se registra y lo que el cliente ya debe (`useFiadoResumen`). */
function AvisoFiado({ p }: { p: PagoModal }) {
  const { customerPhone, customerName, total, deuda } = p;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-[var(--data-warning-500)]/50 bg-[var(--data-warning-50)] p-4">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-[var(--data-warning-ink)]">
          Fiado · la venta queda como deuda
        </p>
        <p className="mt-1 text-sm text-[var(--data-warning-ink)]" data-pos-fiado-aviso>
          {avisoFiado({ customerPhone, customerName, total, deuda })}
        </p>
        {!customerPhone && (
          <button
            type="button"
            onClick={enfocarBuscarCliente}
            className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--data-warning-500)]/60 bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--data-warning-ink)] transition-colors hover:border-[var(--data-warning-500)]"
          >
            <Search className="h-4 w-4" aria-hidden /> Elegir cliente
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * «Cómo paga» — la zona izquierda del cobro: método en una fila, lo que se
 * recibe y el vuelto a la vista, y abajo las acciones secundarias (otro método,
 * dividir la cuenta).
 */
export default function PagoLineas({ p }: { p: PagoModal }) {
  const { paymentLines, showSplit, setShowSplit, total, pendiente, vuelto, lastLine, addLine, handleSplitConfirm, isSinglePayment, isFiado } = p;
  if (showSplit) {
    return <POSSplitPayment total={total} onSplitPayments={handleSplitConfirm} onCancel={() => setShowSplit(false)} />;
  }
  const efectivoSolo = isSinglePayment && paymentLines[0]?.method === "efectivo";
  return (
    <div className="space-y-4">
      {isSinglePayment ? (
        <PagoMetodos p={p} />
      ) : (
        <p className="text-sm font-semibold text-[var(--text-secondary)]">Pago mixto</p>
      )}

      {isFiado && <AvisoFiado p={p} />}

      <PagoBilletera p={p} />

      {efectivoSolo ? (
        <PagoEfectivo p={p} />
      ) : (
        !isFiado && (
          <>
            <PagoLineasMonto p={p} />
            <PagoVuelto vuelto={vuelto} pendiente={pendiente} conVuelto={lastLine?.method === "efectivo"} />
          </>
        )
      )}

      {!isFiado && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-[var(--rule-soft)] pt-2">
          <button
            type="button"
            onClick={addLine}
            className="inline-flex h-10 items-center gap-1.5 text-sm font-semibold text-[var(--accent-ink)] hover:underline"
          >
            <Plus className="h-4 w-4" aria-hidden /> Agregar método
          </button>
          <button
            type="button"
            onClick={() => setShowSplit(true)}
            className="inline-flex h-10 items-center gap-1.5 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--accent-ink)]"
          >
            <Users className="h-4 w-4" aria-hidden /> Dividir cuenta
          </button>
        </div>
      )}
    </div>
  );
}
