"use client";

/**
 * Lo que el plan ya guardaba y el alta no preguntaba.
 *
 * Tres campos de costo por m³ (`costoExtraccionM3`, `costoTransformacionM3`,
 * `costoFleteM3`), el valor de la **UIT** de referencia y las observaciones
 * viven en `ForestPlan` desde siempre. Los costos alimentan el margen de la
 * vista Analítica; la UIT es la base del pago por derecho de aprovechamiento.
 *
 * Dos de ellos estaban peor que ausentes:
 * · la **UIT viajaba invisible con 5350** — el formulario la mandaba sin
 *   mostrarla, así que el plan del año siguiente nacía con la UIT del anterior
 *   y nadie podía verlo;
 * · las **observaciones** no tenían dónde escribirse en ninguna pantalla.
 *
 * Nada de esto es obligatorio para crear el plan: va plegado, y plegado dice lo
 * que trae adentro. Los costos también se editan en Analítica — es el mismo
 * campo, no otra verdad.
 */

import { useState } from "react";
import { ChevronDown, Coins } from "@buleje/design-system/icons";
import { ESTADOS_CONTRATO } from "@/lib/forestal/contratos";
import { Field, cls } from "./loth-plan-ui";

/** Los mismos cuatro estados que un permiso: un plan viejo se carga cerrado. */
const ESTADO_LABEL: Record<string, string> = {
  vigente: "Vigente",
  vencido: "Vencido",
  cerrado: "Cerrado",
  suspendido: "Suspendido",
};

export interface CamposDeCosteo {
  uitRef: string;
  costoExtraccionM3: string;
  costoTransformacionM3: string;
  costoFleteM3: string;
  estado: string;
  notes: string;
}

export default function LothPlanFormCosteo({
  valores,
  onCambio,
}: {
  valores: CamposDeCosteo;
  onCambio: (k: keyof CamposDeCosteo, v: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const cargados = [valores.costoExtraccionM3, valores.costoTransformacionM3, valores.costoFleteM3].filter((v) => v.trim()).length;

  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2.5 text-left transition-colors hover:border-[var(--rule-strong)]"
      >
        <Coins className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-[var(--text-primary)]">Costeo, estado y observaciones</span>
          {/* Plegado también dice lo que trae: plegar no es esconder el dato. */}
          <span className="block text-xs text-[var(--text-tertiary)]">
            UIT S/ {valores.uitRef || "—"} · {cargados === 0 ? "sin costos por m³" : `${cargados} de 3 costos por m³`} ·{" "}
            {ESTADO_LABEL[valores.estado] ?? "Vigente"}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {abierto && (
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3 lg:grid-cols-4">
          <Field label="UIT de referencia (S/)">
            <input
              type="number"
              step="0.01"
              min="0"
              value={valores.uitRef}
              onChange={(e) => onCambio("uitRef", e.target.value)}
              className={`${cls} tabular-nums`}
            />
            <span className="mt-1 block text-xs text-[var(--text-tertiary)]">
              La UIT del año de la resolución: con ella se calcula el pago por derecho de aprovechamiento.
            </span>
          </Field>
          <Field label="Extracción (S/ por m³)">
            <input
              type="number"
              step="0.01"
              min="0"
              value={valores.costoExtraccionM3}
              onChange={(e) => onCambio("costoExtraccionM3", e.target.value)}
              placeholder="Tala, arrastre y patio"
              className={`${cls} tabular-nums`}
            />
          </Field>
          <Field label="Transformación (S/ por m³)">
            <input
              type="number"
              step="0.01"
              min="0"
              value={valores.costoTransformacionM3}
              onChange={(e) => onCambio("costoTransformacionM3", e.target.value)}
              placeholder="Aserrío"
              className={`${cls} tabular-nums`}
            />
          </Field>
          <Field label="Flete (S/ por m³)">
            <input
              type="number"
              step="0.01"
              min="0"
              value={valores.costoFleteM3}
              onChange={(e) => onCambio("costoFleteM3", e.target.value)}
              placeholder="Hasta el destino"
              className={`${cls} tabular-nums`}
            />
          </Field>
          <Field label="Estado del plan">
            <select value={valores.estado} onChange={(e) => onCambio("estado", e.target.value)} className={cls}>
              {ESTADOS_CONTRATO.map((e) => (
                <option key={e} value={e}>
                  {ESTADO_LABEL[e]}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-[var(--text-tertiary)]">
              Un plan de años anteriores se carga como cerrado: entra al historial sin figurar entre los vigentes.
            </span>
          </Field>
          <Field label="Observaciones">
            <textarea
              value={valores.notes}
              onChange={(e) => onCambio("notes", e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="Lo que haya que recordar de este documento"
              className={`${cls} h-auto py-2`}
            />
          </Field>
          <p className="col-span-2 self-end text-xs text-[var(--text-tertiary)] lg:col-span-2">
            Los tres costos son los que usa <strong className="text-[var(--text-secondary)]">Analítica</strong> para el margen por
            m³. Se pueden dejar vacíos y cargarlos después ahí mismo: es el mismo dato.
          </p>
        </div>
      )}
    </section>
  );
}
