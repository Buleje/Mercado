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
 *
 * Ronda 2026-10-07 (Brandon: «más detalles y funciones»): total por m³ y costo
 * estimado del plan (`LothPlanCosteoTotales`), la UIT del año de la resolución
 * cuando el repo la conoce, la fecha de vencimiento junto al estado con aviso
 * si ya venció y sigue «vigente» (`LothPlanCosteoEstado`), y contador y frases
 * rápidas en las observaciones (`LothPlanCosteoNotas`). Todo opcional.
 */

import { useState } from "react";
import { ChevronDown, Coins } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { anioDe, costoPorM3, uitDelAnio, vencidoPeroVigente } from "@/lib/forestal/loth-plan-costeo";
import { fmtSoles } from "@/lib/forestal/cubicacion-formato";
import { limaDateKey } from "@/lib/utils";
import { Field, cls } from "./loth-plan-ui";
import LothPlanCosteoTotales from "./LothPlanCosteoTotales";
import LothPlanCosteoEstado from "./LothPlanCosteoEstado";
import { ESTADO_LABEL } from "./contratos-ui";
import LothPlanCosteoNotas from "./LothPlanCosteoNotas";

export interface CamposDeCosteo {
  uitRef: string;
  costoExtraccionM3: string;
  costoTransformacionM3: string;
  costoFleteM3: string;
  estado: string;
  notes: string;
}

/** Lo que el bloque lee del resto del formulario (no lo edita). */
export interface ContextoDeCosteo {
  resolucionDate: string;
  vigenciaHasta: string;
  /** Σ m³ que el formulario conoce; `null` si no lo sabe (plan de bosque: está en el censo). */
  volumenM3: number | null;
  /** «autorizado» o «registrado». */
  base: string;
}

const COSTOS = [
  { k: "costoExtraccionM3", label: "Extracción (S/ por m³)", placeholder: "Tala, arrastre y patio" },
  { k: "costoTransformacionM3", label: "Transformación (S/ por m³)", placeholder: "Aserrío" },
  { k: "costoFleteM3", label: "Flete (S/ por m³)", placeholder: "Hasta el destino" },
] as const;

const UIT_ID = "plan-costeo-uit";

export default function LothPlanFormCosteo({
  valores,
  onCambio,
  contexto,
}: {
  valores: CamposDeCosteo;
  onCambio: (k: keyof CamposDeCosteo, v: string) => void;
  contexto?: ContextoDeCosteo;
}) {
  const [abierto, setAbierto] = useState(false);
  const hoy = limaDateKey();
  const costos = COSTOS.map((c) => valores[c.k]);
  const cargados = costos.filter((v) => v.trim()).length;
  const total = costoPorM3(costos);
  const vencido = vencidoPeroVigente(valores.estado, contexto?.vigenciaHasta ?? "", hoy);
  const anio = anioDe(contexto?.resolucionDate);
  const uitAnio = uitDelAnio(anio);
  const uitDistinta = uitAnio != null && Number(valores.uitRef) !== uitAnio;

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2.5 text-left transition-colors hover:border-[var(--rule-strong)]"
        >
          <Coins className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-[var(--text-primary)]">
              Costeo, estado y observaciones
            </span>
            {/* Plegado también dice lo que trae: plegar no es esconder el dato. */}
            <span className="block text-xs text-[var(--text-tertiary)]">
              UIT S/ {valores.uitRef || "—"} · {cargados === 0 ? "sin costos por m³" : `${cargados} de 3 costos por m³`}
              {total && ` (S/ ${fmtSoles(total.total)} por m³)`} · {ESTADO_LABEL[valores.estado as keyof typeof ESTADO_LABEL] ?? "Vigente"}
              {vencido && (
                <span className="font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"> · vigencia terminada</span>
              )}
              {valores.notes.trim() && " · con observaciones"}
            </span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        <InfoTip
          title="Costeo, estado y observaciones"
          what="Los tres costos son los que usa Analítica para el margen por m³."
          affects="Se pueden dejar vacíos y cargarlos después ahí mismo: es el mismo dato."
          example="No completar Extracción ahora y cargarla luego desde Analítica no crea un valor distinto."
        />
      </div>

      {abierto && (
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3 lg:grid-cols-4">
          <div>
            <div className="mb-1 flex items-center gap-1">
              <label htmlFor={UIT_ID} className="text-xs font-medium text-[var(--text-secondary)]">
                UIT de referencia (S/)
              </label>
              <InfoTip
                title="UIT de referencia"
                what="La UIT del año de la resolución: con ella se calcula el pago por derecho de aprovechamiento."
                affects="Si conozco la UIT de ese año, te propongo usarla. Si no, cópiala de la resolución."
                example="Resolución de marzo 2025 → UIT 2025, S/ 5 350."
              />
            </div>
            <input
              id={UIT_ID}
              type="number"
              step="0.01"
              min="0"
              value={valores.uitRef}
              onChange={(e) => onCambio("uitRef", e.target.value)}
              className={`${cls} tabular-nums`}
            />
            {uitDistinta && uitAnio != null && (
              <button
                type="button"
                onClick={() => onCambio("uitRef", String(uitAnio))}
                className="mt-1 inline-flex min-h-8 items-center rounded-lg px-1.5 text-xs font-bold text-[var(--accent-dark)] transition-colors hover:bg-[var(--accent-soft)] dark:text-[var(--accent)]"
              >
                Usar la UIT de {anio} (S/ {fmtSoles(uitAnio)})
              </button>
            )}
            {anio != null && uitAnio == null && (
              <span className="mt-1 block text-xs text-[var(--text-tertiary)]">Sin la UIT de {anio} cargada: cópiala de la resolución.</span>
            )}
          </div>
          {COSTOS.map((c) => (
            <Field key={c.k} label={c.label}>
              <input
                type="number"
                step="0.01"
                min="0"
                value={valores[c.k]}
                onChange={(e) => onCambio(c.k, e.target.value)}
                placeholder={c.placeholder}
                className={`${cls} tabular-nums`}
              />
            </Field>
          ))}
          <LothPlanCosteoTotales costos={costos} volumenM3={contexto?.volumenM3 ?? null} base={contexto?.base ?? "autorizado"} />
          <LothPlanCosteoEstado
            estado={valores.estado}
            vigenciaHasta={contexto?.vigenciaHasta ?? ""}
            hoy={hoy}
            onEstado={(v) => onCambio("estado", v)}
          />
          <LothPlanCosteoNotas notas={valores.notes} onNotas={(v) => onCambio("notes", v)} />
        </div>
      )}
    </section>
  );
}
