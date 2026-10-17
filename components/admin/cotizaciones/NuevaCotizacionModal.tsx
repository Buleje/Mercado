"use client";

/**
 * «Nueva cotización» en una ventana (antes era una pestaña): cliente → ítems →
 * vigencia y notas. Lo que se manda al servidor no cambió.
 */
import { Calendar, Check, Hash, Loader2, User } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { button } from "@/components/ui-system/button-variants";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PasoItems, TotalesPrevios } from "./PasoItems";
import type { FormNuevaCotizacion, PasoNueva } from "./use-nueva-cotizacion";

const INPUT =
  "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";
const ROTULO = "mb-1 block text-sm font-semibold text-[var(--text-secondary)]";
const ICONO = "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]";
const PASOS: Record<PasoNueva, string> = { 1: "Cliente", 2: "Ítems", 3: "Confirmar" };

interface Props {
  form: FormNuevaCotizacion;
  cuantasPlantillas: number;
  onElegirPlantilla: () => void;
  onGestionarPlantillas: () => void;
}

export function NuevaCotizacionModal({ form, cuantasPlantillas, onElegirPlantilla, onGestionarPlantillas }: Props) {
  const { step, irAPaso, createError, creating } = form;
  const conItems = form.items.filter((i) => i.descripcion.trim()).length;

  const pie = (
    <div className="flex w-full items-center justify-between gap-2">
      {step > 1 ? (
        <button type="button" onClick={() => irAPaso((step - 1) as PasoNueva)} className={button({ variant: "ghost", className: "rounded-xl" })}>Atrás</button>
      ) : (
        <button type="button" onClick={form.cerrar} className={button({ variant: "ghost", className: "rounded-xl" })}>Cancelar</button>
      )}
      {step < 3 ? (
        <button type="button" onClick={() => irAPaso((step + 1) as PasoNueva)} className={button({ variant: "primary", className: "rounded-xl px-6" })}>Siguiente</button>
      ) : (
        <button type="button" onClick={form.crear} disabled={creating} className={button({ variant: "primary", className: "gap-1.5 rounded-xl px-6" })}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
          Crear cotización
        </button>
      )}
    </div>
  );

  return (
    <AdminModal open={form.abierta} onClose={form.cerrar} title="Nueva cotización" variant="wide" footer={pie}>
      <div className={cn("space-y-4", MODAL_BODY)}>
        <ol className="flex items-center gap-2" aria-label="Pasos">
          {([1, 2, 3] as const).map((s) => (
            <li key={s} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => irAPaso(s)}
                aria-current={step === s ? "step" : undefined}
                className={cn(
                  "inline-flex h-12 items-center gap-2 rounded-xl px-2 text-sm font-semibold",
                  step === s ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                )}
              >
                <span className={cn("flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold tabular-nums", step >= s ? "bg-[var(--text-primary)] text-[var(--surface-raised)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]")}>{s}</span>
                <span className={step === s ? "" : "max-sm:sr-only"}>{PASOS[s]}</span>
              </button>
              {s < 3 && <span className={cn("h-0.5 w-6", step > s ? "bg-[var(--text-primary)]" : "bg-[var(--rule-base)]")} aria-hidden />}
            </li>
          ))}
        </ol>

        {step === 1 && (
          <div className="space-y-3">
            <label className="block">
              <span className={ROTULO}>Nombre del cliente</span>
              <span className="relative block">
                <User className={ICONO} aria-hidden />
                <input type="text" value={form.clienteNombre} onChange={(e) => form.setClienteNombre(e.target.value)} placeholder="Nombre o razón social" className={INPUT} autoFocus />
              </span>
            </label>
            <label className="block">
              <span className={ROTULO}>RUC (opcional)</span>
              <span className="relative block">
                <Hash className={ICONO} aria-hidden />
                <input type="text" inputMode="numeric" value={form.clienteRuc} onChange={(e) => form.setClienteRuc(e.target.value)} placeholder="20XXXXXXXXX" maxLength={20} className={INPUT} />
              </span>
            </label>
          </div>
        )}

        {step === 2 && (
          <>
            <PasoItems form={form} cuantasPlantillas={cuantasPlantillas} onElegirPlantilla={onElegirPlantilla} onGestionarPlantillas={onGestionarPlantillas} />
            <TotalesPrevios subtotal={form.subtotal} igv={form.igv} total={form.total} />
          </>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <dl className="grid grid-cols-1 gap-2 rounded-xl bg-[var(--surface-sunken)] p-4 text-sm sm:grid-cols-3">
              <div><dt className="text-[var(--text-secondary)]">Cliente</dt><dd className="font-semibold text-[var(--text-primary)]">{form.clienteNombre}{form.clienteRuc ? ` · RUC ${form.clienteRuc}` : ""}</dd></div>
              <div><dt className="text-[var(--text-secondary)]">Ítems</dt><dd className="font-semibold tabular-nums text-[var(--text-primary)]">{conItems}</dd></div>
              <div><dt className="text-[var(--text-secondary)]">Total</dt><dd className="font-bold tabular-nums text-[var(--text-primary)]">{formatCurrency(form.total)}</dd></div>
            </dl>
            <label className="block">
              <span className={ROTULO}>Válida hasta</span>
              <span className="relative block">
                <Calendar className={ICONO} aria-hidden />
                <input type="date" value={form.validoHasta} onChange={(e) => form.setValidoHasta(e.target.value)} className={INPUT} />
              </span>
            </label>
            <label className="block">
              <span className={ROTULO}>Notas (opcional)</span>
              <textarea
                value={form.notas}
                onChange={(e) => form.setNotas(e.target.value)}
                placeholder="Condiciones, forma de pago, plazo de entrega…"
                rows={3}
                className="w-full resize-none rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
              />
            </label>
          </div>
        )}

        {createError && <p role="alert" className="text-sm font-semibold text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">{createError}</p>}
      </div>
    </AdminModal>
  );
}
