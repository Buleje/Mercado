"use client";

/**
 * «¿Qué planilla llenaste?» en el modo foto de los importadores del cubicador.
 * Con una planilla elegida, la IA lee la foto con el prompt de ESA hoja (el
 * del negocio si lo guardó); con «Otra hoja» la lee como venga, como siempre.
 */
import { useId } from "react";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { PLANILLAS } from "@/lib/forestal/planillas/catalogo";
import type { DestinoPlanilla, PlanillaId } from "@/lib/forestal/planillas/tipos";
import { I } from "../ctp-shared";

const OTRA = "";

export default function SelectorPlanilla({
  destino,
  value,
  onChange,
  disabled,
}: {
  destino: DestinoPlanilla;
  value: PlanillaId | null;
  onChange: (id: PlanillaId | null) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const opciones = PLANILLAS.filter((p) => p.destino === destino);
  if (opciones.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <label htmlFor={id} className="text-sm font-semibold text-[var(--text-primary)]">
          ¿Qué planilla llenaste?
        </label>
        <InfoTip
          title="La planilla de la foto"
          what="Si la hoja es una de las Planillas de campo que imprimiste desde Herramientas, elígela: la IA sabe qué columna es cuál y en qué unidad viene."
          affects="Con «Otra hoja» la IA adivina las columnas, como con un cuaderno cualquiera."
          example="Imprimiste la Rolliza Smalian, la llenaste en el patio y le tomaste foto: elige «Rolliza Smalian»."
        />
      </div>
      <select
        id={id}
        className={I}
        value={value ?? OTRA}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === OTRA ? null : (e.target.value as PlanillaId))}
      >
        {opciones.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
        <option value={OTRA}>Otra hoja (la IA la lee como venga)</option>
      </select>
    </div>
  );
}
