"use client";

import { useState } from "react";
import { toast } from "sonner";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { REGIMEN_LABELS, type RegimenTributario } from "@/lib/tax/obligaciones-peru";

const CAMPO =
  "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none";

/** Régimen tributario y RUC: cambian la tasa de la Renta y la semana de vencimiento. */
export default function RegimenModal({
  open,
  onClose,
  regimen,
  ruc,
  guardar,
}: {
  open: boolean;
  onClose: () => void;
  regimen: RegimenTributario;
  ruc: string;
  guardar: (patch: { regimenTributario?: RegimenTributario; ruc?: string }) => Promise<void>;
}) {
  const [nuevoRegimen, setNuevoRegimen] = useState(regimen);
  const [nuevoRuc, setNuevoRuc] = useState(ruc);
  const [guardando, setGuardando] = useState(false);
  const rucValido = nuevoRuc === "" || nuevoRuc.length === 11;

  const onGuardar = async () => {
    if (!rucValido) return;
    setGuardando(true);
    try {
      await guardar({ regimenTributario: nuevoRegimen, ...(nuevoRuc !== ruc && { ruc: nuevoRuc }) });
      toast.success("Guardado: el cálculo ya usa tu régimen");
      onClose();
    } catch {
      toast.error("No se pudo guardar. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="Régimen y RUC"
      description="Con esto se calcula la Renta y la semana en que vence tu declaración."
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-12 rounded-xl px-4 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void onGuardar()}
            aria-disabled={guardando || !rucValido}
            className="h-12 rounded-xl bg-[var(--accent-dark)] px-5 text-sm font-bold text-white hover:brightness-110 aria-disabled:opacity-60"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      }
    >
      <div className={`${MODAL_BODY} space-y-4`}>
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Régimen tributario</span>
          <select value={nuevoRegimen} onChange={(e) => setNuevoRegimen(e.target.value as RegimenTributario)} className={CAMPO}>
            {(Object.keys(REGIMEN_LABELS) as RegimenTributario[]).map((r) => (
              <option key={r} value={r}>{REGIMEN_LABELS[r]}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">RUC</span>
          <input
            value={nuevoRuc}
            inputMode="numeric"
            onChange={(e) => setNuevoRuc(e.target.value.replace(/\D/g, "").slice(0, 11))}
            placeholder="11 dígitos"
            className={CAMPO}
          />
          {!rucValido && <span className="block text-sm text-[var(--data-error-ink)]">El RUC tiene 11 dígitos.</span>}
        </label>
      </div>
    </AdminModal>
  );
}
