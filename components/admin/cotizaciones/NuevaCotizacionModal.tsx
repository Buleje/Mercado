"use client";

/**
 * «Nueva cotización» en una ventana (antes era una pestaña): cliente de tu
 * lista (o alta en el mismo flujo) → ítems con el stock de hoy → vista previa
 * de lo que verá el cliente, con «Cambiar» para volver a cada paso.
 */
import { Check, Loader2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { button } from "@/components/ui-system/button-variants";
import type { EmpresaEmisor } from "@/lib/documentos/cotizacion-print";
import { cn } from "@/lib/utils";
import { PasoCliente } from "./PasoCliente";
import { PasoItems, TotalesPrevios } from "./PasoItems";
import { VistaPreviaCotizacion } from "./VistaPreviaCotizacion";
import type { FormNuevaCotizacion, PasoNueva } from "./use-nueva-cotizacion";

const PASOS: Record<PasoNueva, string> = { 1: "Cliente", 2: "Ítems", 3: "Confirmar" };

interface Props {
  form: FormNuevaCotizacion;
  cuantasPlantillas: number;
  onElegirPlantilla: () => void;
  onGestionarPlantillas: () => void;
  /** Membrete para «Ver como la verá el cliente» (null = encabezado neutro). */
  empresa: EmpresaEmisor | null;
}

export function NuevaCotizacionModal({ form, cuantasPlantillas, onElegirPlantilla, onGestionarPlantillas, empresa }: Props) {
  const { step, irAPaso, createError, creating } = form;

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

        {step === 1 && <PasoCliente form={form} />}

        {step === 2 && (
          <>
            <PasoItems form={form} cuantasPlantillas={cuantasPlantillas} onElegirPlantilla={onElegirPlantilla} onGestionarPlantillas={onGestionarPlantillas} />
            <TotalesPrevios subtotal={form.subtotal} igv={form.igv} total={form.total} />
          </>
        )}

        {step === 3 && <VistaPreviaCotizacion form={form} empresa={empresa} />}

        {createError && <p role="alert" className="text-sm font-semibold text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">{createError}</p>}
      </div>
    </AdminModal>
  );
}
