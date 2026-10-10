'use client';

import { Zap, ClipboardList, Loader2 } from "@buleje/design-system/icons";
import { cn } from '@/lib/utils';
import AdminModal from "@/components/admin/shared/AdminModal";
import { LinkedDocumentsSection } from "@/components/admin/documentos/LinkedDocumentsSection";
import ProveedorFormCompleto from './ProveedorFormCompleto';
import ProveedorFormSimple from './ProveedorFormSimple';
import { useProveedorForm, type Formato } from './use-proveedor-form';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  supplier?: Record<string, unknown> | null;
  initialFormat?: Formato;
};

// ── Component ──────────────────────────────────────────────────────────────
// Partido el 09-10 (675 líneas): datos en `proveedor-form-datos.ts`, estado y
// guardado en `use-proveedor-form.ts`, cada formato en su componente.

export default function ProveedorFormModal({ isOpen, onClose, onSaved, supplier, initialFormat }: Props) {
  const { format, changeFormat, form, setForm, set, saving, error, rucLookup, setRucLookup, handleRucLookup, isEdit, handleSubmit } =
    useProveedorForm({ supplier, initialFormat, onSaved, onClose });

  return (
    <AdminModal
      open={isOpen}
      onClose={onClose}
      title={isEdit ? 'Editar proveedor' : 'Nuevo proveedor'}
      variant="wide"
    >
      {/* Format toggle */}
      <div className="pt-4 pb-2 flex gap-2 px-5 py-5 sm:px-6">
        <button
          type="button"
          onClick={() => changeFormat('simple')}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors",
            format === 'simple'
              ? "bg-primary text-white"
              : "bg-[var(--rule-soft)] text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--rule-base)] "
          )}
        >
          <Zap className="h-3.5 w-3.5" /> Simple
        </button>
        <button
          type="button"
          onClick={() => changeFormat('completo')}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors",
            format === 'completo'
              ? "bg-primary text-white"
              : "bg-[var(--rule-soft)] text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--rule-base)] "
          )}
        >
          <ClipboardList className="h-3.5 w-3.5" /> Completo
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {/* ── SIMPLE FORMAT ── */}
        {format === 'simple' && (
          <ProveedorFormSimple form={form} set={set} rucLookup={rucLookup} setRucLookup={setRucLookup} handleRucLookup={handleRucLookup} />
        )}

        {/* ── COMPLETE FORMAT ── */}
        {format === 'completo' && <ProveedorFormCompleto form={form} set={set} setForm={setForm} />}

        {/* ADR-119: Documentos vinculados a este proveedor (solo en edición) */}
        {isEdit && typeof supplier?.id === "string" && (
          <div className="mt-4">
            <LinkedDocumentsSection entity="supplier" id={supplier.id as string} />
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)] font-semibold bg-[var(--data-error-50)] dark:bg-red-950/20 px-3 py-2 rounded-lg">{error}</p>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-10 rounded-xl border border-[var(--rule-base)] dark:border-card-border text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-sunken)] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 h-10 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? 'Guardando...' : isEdit ? 'Guardar proveedor' : format === 'simple' ? 'Crear proveedor' : 'Guardar proveedor'}
          </button>
        </div>
      </form>
    </AdminModal>
  );
}
