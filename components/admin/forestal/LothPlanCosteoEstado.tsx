"use client";

/**
 * El estado del plan con su fecha de vencimiento (si el formulario la tiene) y
 * el aviso de un plan cuya vigencia ya terminó pero sigue marcado «vigente».
 * El aviso no bloquea nada: ofrece marcarlo vencido con un toque.
 */

import { AlertTriangle } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { ESTADOS_CONTRATO } from "@/lib/forestal/contratos";
import { fechaConDia, vencidoPeroVigente } from "@/lib/forestal/loth-plan-costeo";
import { cls } from "./loth-plan-ui";
/* Los mismos cuatro estados que un permiso: un plan viejo se carga cerrado. */
import { ESTADO_LABEL } from "./contratos-ui";

const ID = "plan-costeo-estado";

export default function LothPlanCosteoEstado({
  estado,
  vigenciaHasta,
  hoy,
  onEstado,
}: {
  estado: string;
  vigenciaHasta: string;
  /** Clave Lima `YYYY-MM-DD`. */
  hoy: string;
  onEstado: (v: string) => void;
}) {
  const hasta = vigenciaHasta.trim().slice(0, 10);
  const vencido = vencidoPeroVigente(estado, hasta, hoy);
  return (
    <div className="col-span-2 lg:col-span-1">
      <div className="mb-1 flex items-center gap-1">
        <label htmlFor={ID} className="text-xs font-medium text-[var(--text-secondary)]">
          Estado del plan
        </label>
        <InfoTip
          title="Estado del plan"
          what="Un plan de años anteriores se carga como cerrado: entra al historial sin figurar entre los vigentes."
          example="El PO 2023 ya terminó: cárgalo «Cerrado»."
        />
      </div>
      <select id={ID} value={estado} onChange={(e) => onEstado(e.target.value)} className={cls}>
        {ESTADOS_CONTRATO.map((e) => (
          <option key={e} value={e}>
            {ESTADO_LABEL[e]}
          </option>
        ))}
      </select>
      {hasta && !vencido && (
        <span className="mt-1 block text-xs text-[var(--text-tertiary)]">
          {hasta < hoy ? "Venció el" : "Vence el"} {fechaConDia(hasta, hoy)}
        </span>
      )}
      {vencido && (
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Venció el {fechaConDia(hasta, hoy)} y sigue «Vigente».
          <button
            type="button"
            onClick={() => onEstado("vencido")}
            className="inline-flex min-h-8 items-center rounded-lg border border-[var(--data-warning-500)]/50 px-2 font-bold transition-colors hover:bg-[var(--data-warning-500)]/10"
          >
            Marcar vencido
          </button>
        </span>
      )}
    </div>
  );
}
