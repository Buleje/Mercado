"use client";

/**
 * Modal "Nuevo gasto recurrente" — versión completa.
 *
 * Reemplaza al modal inline de PuntoCompraView (3 campos) por uno con:
 *  - Categoría (con soporte para crear custom)
 *  - Descripción
 *  - Monto
 *  - Frecuencia (mensual/quincenal/semanal/anual/único)
 *  - Día de pago (1-31 o día de semana según frecuencia)
 *  - Método de pago
 *  - Proveedor opcional (texto libre)
 *  - Notas internas
 *  - Color e ícono visual (para distinguir cards en el catálogo)
 *
 * La metadata extra se serializa dentro de `description` (ver lib/expense-meta.ts)
 * para no requerir migración de schema.
 */

import { useRef } from "react";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { X, Check, Loader2 } from "@buleje/design-system/icons";
import { SectionTitle } from "@buleje/design-system";
import { getCategoryIcon } from "@/lib/expense-icons";
import { cn } from "@/lib/utils";
import { CATEGORY_COLOR_CLASSES } from "@/lib/expense-categories";
import { useGastoRecurrente } from "@/components/admin/gastos/recurrente/use-gasto-recurrente";
import CategoriaRecurrente from "@/components/admin/gastos/recurrente/CategoriaRecurrente";
import DatosRecurrente from "@/components/admin/gastos/recurrente/DatosRecurrente";
import PagoRecurrente from "@/components/admin/gastos/recurrente/PagoRecurrente";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  tenantSlug: string; // para localStorage de categorías custom
  defaultCategory?: string;
};

export default function RecurringExpenseModal({ open, onClose, onCreated, tenantSlug, defaultCategory }: Props) {
  /* Sin esto Tab se va a la pantalla de abajo y Escape no cierra. */
  /* `activo: open` no es decorativo: el componente NO se desmonta al
     cerrarse —sólo su contenido— así que sin esto el efecto corre una vez
     con el ref vacío y no vuelve a mirar cuando el modal aparece. */
  const cajaRef = useRef<HTMLDivElement>(null);
  /* Escape ya lo maneja el atajo propio de esta pantalla: el hook pone
       el foco, la trampa de Tab y el scroll, no una segunda salida. */
  useModalAccesible(cajaRef, { onCerrar: onClose, cerrarConEscape: false, activo: open });
  const ventana = useVentanaDeModal(open, { ref: cajaRef, aplicarTranslate: true, claveMemoria: "pos-gasto-recurrente" });
  const r = useGastoRecurrente({ open, onClose, onCreated, tenantSlug, defaultCategory });
  const { selectedCategory, submitting, error, handleSubmit } = r;

  if (!open) return null;

  const colorCls = CATEGORY_COLOR_CLASSES[selectedCategory.color] ?? CATEGORY_COLOR_CLASSES.gray;
  const SelectedIcon = getCategoryIcon(selectedCategory.iconKey);

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget && !submitting && !ventana.fijado) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape" && !submitting) onClose(); }}
    >
      <div ref={cajaRef} tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recurring-expense-title"
        className="relative bg-[var(--surface-raised)] rounded-2xl shadow-[var(--shadow-xl)] w-full max-w-3xl my-8 overflow-hidden border border-[var(--rule-base)]">
        {/* ── Header ── */}
        <header {...ventana.asaProps} className={cn("px-5 sm:px-6 py-4 border-b border-[var(--rule-base)] flex items-center gap-3", colorCls.bg)}>
          <span className={cn("inline-flex items-center justify-center h-12 w-12 rounded-xl ring-1", colorCls.iconBg, colorCls.border)}>
            <SelectedIcon className={cn("h-6 w-6", colorCls.text)} strokeWidth={2} />
          </span>
          <div className="flex-1 min-w-0">
            <SectionTitle as="h2" id="recurring-expense-title" className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)]">
              Nuevo gasto recurrente
            </SectionTitle>
            <p className="text-sm text-[var(--text-secondary)] truncate">
              Configura un pago fijo (alquiler, internet, etc.) para registrarlo en 1 click cuando llegue la fecha.
            </p>
          </div>
          <span className="ml-auto flex items-center gap-1 shrink-0">
            <ControlesDeVentana ventana={ventana} />
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              aria-label="Cerrar"
              className="h-10 w-10 inline-flex items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-white/60 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              <X className="h-5 w-5" />
            </button>
          </span>
        </header>

        {/* ── Body ── */}
        <div className="max-h-[70vh] overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
          <CategoriaRecurrente r={r} />

          <DatosRecurrente r={r} />

          <PagoRecurrente r={r} />

          {error && (
            <div className="rounded-2xl border-2 border-[var(--data-error-500)]/50 bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10 px-4 py-3 text-sm font-semibold text-[var(--data-error-500)]">
              {error}
            </div>
          )}
        </div>

        {/* ── Footer sticky ── */}
        <footer className="px-5 sm:px-6 py-4 border-t border-[var(--rule-base)] bg-[var(--surface-sunken)] flex flex-col-reverse sm:flex-row sm:items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 h-12 rounded-2xl text-sm font-semibold text-[var(--text-secondary)] bg-[var(--surface-raised)] border border-[var(--rule-base)] hover:border-[var(--text-secondary)] transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 sm:flex-[2] h-12 inline-flex items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-white bg-primary hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Check className="h-5 w-5" />
            )}
            Guardar gasto recurrente
          </button>
        </footer>
        <TiradorDeVentana ventana={ventana} />
      </div>
    </div>
  );
}
