"use client";

import { Kicker } from "@buleje/design-system";
import { Loader2, Plus, Wallet } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import SelectorContrato from "@/components/admin/forestal/SelectorContrato";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { PAYMENT_METHOD_LABELS, type ExpensePaymentMethod } from "@/lib/expense-meta";
import ComprobanteCampos from "./ComprobanteCampos";
import { CATEGORIAS_GASTO } from "./categorias";
import { campo, chip } from "./estilos";
import { useGastoNuevo, type GastoGuardado } from "./use-gasto-nuevo";

const METODOS = Object.keys(PAYMENT_METHOD_LABELS) as ExpensePaymentMethod[];

interface Props {
  open: boolean;
  onClose: () => void;
  onGuardado: (r: GastoGuardado) => void;
}

/** «Registrar gasto»: monto, cómo pagaste, si salió de la caja y el comprobante. */
export default function GastoNuevoModal({ open, onClose, onGuardado }: Props) {
  const g = useGastoNuevo(open, onGuardado);
  const { form, set, caja, error } = g;
  const esEfectivo = form.paymentMethod === "efectivo";
  const pocoEnCaja = g.puedeSalirDeCaja && form.salidaDeCaja && caja?.esperado != null && g.monto > caja.esperado;

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="Registrar gasto"
      icon={Wallet}
      footer={
        <div className="flex flex-col gap-2">
          {error ? (
            <p role="alert" className="text-sm font-semibold text-[var(--data-error-500)]">{error.texto}</p>
          ) : g.motivoBloqueo ? (
            <p aria-live="polite" className="text-sm text-[var(--text-secondary)]">{g.motivoBloqueo}</p>
          ) : null}
          <button
            type="button"
            onClick={() => void g.guardar()}
            disabled={!g.puedeGuardar}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-50"
          >
            {g.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Guardar gasto{g.monto > 0 ? ` de ${formatCurrency(g.monto)}` : ""}
          </button>
        </div>
      }
    >
      <div className={cn(MODAL_BODY, "space-y-4")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
          <select value={form.category} onChange={(e) => set("category", e.target.value)} aria-label="Categoría del gasto" className={campo()}>
            {CATEGORIAS_GASTO.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} aria-label="Fecha del gasto" className={campo()} />
        </div>
        <input value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Qué pagaste (por ejemplo: gas de la cocina)" aria-label="Descripción del gasto" className={campo()} />
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--text-tertiary)]">S/</span>
          <input type="number" inputMode="decimal" step="0.01" min="0" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0.00" aria-label="Monto total pagado" className={cn(campo(), "pl-8 tabular-nums")} />
        </div>

        <div className="space-y-2">
          <Kicker>Cómo pagaste</Kicker>
          <div role="radiogroup" aria-label="Cómo pagaste" className="flex flex-wrap gap-2">
            {METODOS.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={form.paymentMethod === m} onClick={() => set("paymentMethod", m)} className={chip(form.paymentMethod === m)}>
                {PAYMENT_METHOD_LABELS[m]}
              </button>
            ))}
          </div>
          {esEfectivo && !form.recurring && (
            <div className="flex items-start gap-2 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm">
              {!g.esDeHoy ? (
                <span className="flex-1 text-[var(--text-secondary)]">Es un gasto de otro día: no sale de la caja de hoy.</span>
              ) : caja?.abierta ? (
                <label className="flex flex-1 items-start gap-2">
                  <input type="checkbox" checked={form.salidaDeCaja} onChange={(e) => set("salidaDeCaja", e.target.checked)} className="mt-0.5 h-4 w-4 rounded" />
                  <span className="text-[var(--text-primary)]">
                    Sale de la caja abierta
                    {caja.esperado != null && <span className="text-[var(--text-tertiary)]"> · en el cajón debería haber {formatCurrency(caja.esperado)}</span>}
                    {pocoEnCaja && <span className="block text-xs font-semibold text-[var(--data-error-500)]">El gasto es mayor que lo que hay en el cajón.</span>}
                  </span>
                </label>
              ) : (
                <span className="flex-1 text-[var(--text-secondary)]">{caja ? "No hay caja abierta: el gasto se guarda y la caja no se toca." : "Mirando la caja…"}</span>
              )}
              <InfoTip
                title="Sale de la caja"
                what="El efectivo que sacas del cajón para pagar se anota como un retiro de la caja abierta, en el mismo momento."
                affects="El arqueo del día cuadra: la caja sabe que salió esa plata. En Mi Plata el gasto se cuenta una sola vez."
                example="Pagas S/ 40 de gas con la plata del cajón → la caja anota «Gasto · gas de la cocina» por S/ 40."
              />
            </div>
          )}
        </div>

        <ComprobanteCampos g={g} />

        <SelectorContrato
          id="gasto-contrato"
          value={form.contratoId}
          onChange={(contratoId) => set("contratoId", contratoId)}
          hint="No hay un permiso sugerido para un gasto: elígelo si corresponde a uno."
        />
        <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
          <input type="checkbox" checked={form.recurring} onChange={(e) => set("recurring", e.target.checked)} className="h-4 w-4 rounded" />
          Gasto fijo (se repite cada mes)
        </label>
      </div>
    </AdminModal>
  );
}
