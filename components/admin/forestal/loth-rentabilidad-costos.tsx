"use client";

/**
 * Costos operativos por m³ del plan: extracción, transformación y flete. Es un
 * ajuste ocasional, por eso vive en un modal y no ocupa lugar en la vista. Se
 * aplican a todas las especies del plan; el derecho (VEN) sale de cada especie.
 */

import type { Dispatch, SetStateAction } from "react";
import { Calculator, RefreshCw, Save } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/format";
import type { CostosForm } from "./hooks/use-loth-rentabilidad";

function Campo({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">
        {label} <span className="font-normal text-[var(--text-tertiary)]">(S/ por m³)</span>
      </span>
      <input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0.00"
        className="h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 font-mono text-sm tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]"
      />
      <span className="mt-1 block text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{hint}</span>
    </label>
  );
}

export default function LothRentabilidadCostos({
  abierto,
  onCerrar,
  costos,
  setCostos,
  guardando,
  onGuardar,
  costoOperativoM3,
}: {
  abierto: boolean;
  onCerrar: () => void;
  costos: CostosForm;
  setCostos: Dispatch<SetStateAction<CostosForm>>;
  guardando: boolean;
  onGuardar: () => void;
  costoOperativoM3: number | null;
}) {
  return (
    <AdminModal
      open={abierto}
      onClose={onCerrar}
      title="Costos operativos por m³"
      description="Se aplican a todas las especies del plan para calcular el margen."
      icon={Calculator}
      variant="wide"
    >
      <div className="space-y-4 px-5 py-5 sm:px-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Campo label="Extracción" hint="tala + arrastre + patio" value={costos.extraccionM3} onChange={(v) => setCostos((f) => ({ ...f, extraccionM3: v }))} />
          <Campo label="Transformación" hint="aserrío" value={costos.transformacionM3} onChange={(v) => setCostos((f) => ({ ...f, transformacionM3: v }))} />
          <Campo label="Flete" hint="transporte a destino" value={costos.fleteM3} onChange={(v) => setCostos((f) => ({ ...f, fleteM3: v }))} />
        </div>
        <p className="flex items-center gap-1.5 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          {costoOperativoM3 != null ? (
            <>
              Hoy el costo operativo suma <b className="font-mono tabular-nums">{formatCurrency(costoOperativoM3)}</b> por m³
            </>
          ) : (
            "Margen por m³"
          )}
          <InfoTip
            title="Cómo se calcula el margen"
            what="Margen por m³ = precio de venta − (derecho VEN + extracción + transformación + flete)."
            affects="El VEN sale de cada especie del plan; los otros tres, de estos campos."
            example="Precio S/ 850, VEN S/ 300 y operativo S/ 320: margen S/ 230 por m³."
            side="bottom"
          />
        </p>
        <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 border-t-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-3">
          <button type="button" onClick={onCerrar} className="h-11 rounded-xl px-4 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
            Cancelar
          </button>
          <button
            type="button"
            onClick={onGuardar}
            disabled={guardando}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white hover:bg-[var(--accent-600)] disabled:opacity-50"
          >
            {guardando ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />} Guardar costos
          </button>
        </div>
      </div>
    </AdminModal>
  );
}
