"use client";

/** Bloque «dónde y hasta cuándo» del formulario del plan (en una plantación: dónde, y la vigencia opcional). */

import { ChevronDown } from "@buleje/design-system/icons";
import { pideCampo } from "@/lib/forestal/loth-tipos-plan";
import { Field, cls } from "./loth-plan-ui";
import LothPlanFormUbicacion from "./LothPlanFormUbicacion";
import Bloque from "./LothPlanFormBloque";
import type { LothPlanFormEstado } from "./hooks/use-loth-plan-form";

export default function LothPlanFormArea({ form }: { form: LothPlanFormEstado }) {
  const { f, setF, set, esPlantacion, rot, meta, vigenciaAbierta, setVigenciaAbierta } = form;
  return (
    <Bloque
      n={esPlantacion ? 5 : 4}
      titulo={rot.bloqueArea}
      ayuda={
        meta.vigenciaTipicaAnios != null
          ? {
              what: `Un ${meta.sigla} suele aprobarse por ${meta.vigenciaTipicaAnios} año${meta.vigenciaTipicaAnios === 1 ? "" : "s"}.`,
              example: "Carga las fechas de tu resolución, no las típicas.",
            }
          : undefined
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <LothPlanFormUbicacion
          valores={{ region: f.region, provincia: f.provincia, distrito: f.distrito, sector: f.sector, cuenca: f.cuenca }}
          onCambio={(cambios) => setF((p) => ({ ...p, ...cambios }))}
        />
        {pideCampo(f.planType, "parcelaCorta") && (
          <Field label="Parcela de corta">
            <input value={f.parcelaCorta} onChange={(e) => set("parcelaCorta", e.target.value)} placeholder="PC 12" className={cls} />
          </Field>
        )}
        <Field label={rot.area}>
          <input type="number" step="0.01" value={f.areaHa} onChange={(e) => set("areaHa", e.target.value)} className={cls} />
        </Field>
        {(!rot.vigenciaOpcional || vigenciaAbierta) && (
          <>
            <Field label={rot.vigenciaOpcional ? "Aprovechamiento desde" : "Vigencia desde"}>
              <input type="date" value={f.vigenciaDesde} onChange={(e) => set("vigenciaDesde", e.target.value)} className={cls} />
            </Field>
            <Field label={rot.vigenciaOpcional ? "Aprovechamiento hasta" : "Vigencia hasta"}>
              <input type="date" value={f.vigenciaHasta} onChange={(e) => set("vigenciaHasta", e.target.value)} className={cls} />
            </Field>
          </>
        )}
      </div>
      {/* Un registro de plantación no vence como un PO: el período es
          opcional y va plegado. Plegado NO borra lo que ya tenía fechas. */}
      {rot.vigenciaOpcional && (
        <button
          type="button"
          onClick={() => setVigenciaAbierta((v) => !v)}
          aria-expanded={vigenciaAbierta}
          className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${vigenciaAbierta ? "rotate-180" : ""}`} aria-hidden="true" />
          Período de aprovechamiento (opcional)
          {!vigenciaAbierta && (f.vigenciaDesde || f.vigenciaHasta) && (
            <span className="font-normal text-[var(--text-tertiary)]">· cargado</span>
          )}
        </button>
      )}
    </Bloque>
  );
}
