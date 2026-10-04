"use client";

/**
 * Planes vivos del permiso — una fila por plan, debajo de la ficha.
 *
 * Por qué existe: `/plan?active=1` devuelve UN plan (el `isActive` más nuevo)
 * y la ficha grande lo sigue a él. Medido en Blas (2026-09-30): hay DOS planes
 * vivos y el más nuevo no tiene vigencia, mientras el de Tornillo está vigente
 * hasta el 20/03/2028. Con una sola ficha, el papel vigente quedaba fuera de la
 * vista. Acá cada plan vivo dice su estado con palabra y color (nunca sólo
 * color), sus días y su fecha de fin — la misma cuenta que la ficha
 * (`construirFichaPermiso` → `estadoVigencia`), no una resta aparte.
 *
 * Sólo se dibuja con 2+ planes vivos: con uno, la ficha ya lo dice todo.
 */

import { useMemo } from "react";
import { ArrowRight } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { construirFichaPermiso, nombreDelPlan, type PlanFichaApi } from "@/lib/forestal/loth-ficha-permiso";
import { formatNumber } from "@/lib/format";
import { ETIQUETA_FICHA, TONO_FICHA } from "./LothFichaPermiso";

export interface LothPlanesVivosProps {
  /** Ya filtrados y ordenados (`planesVivos`): el del libro primero. */
  planes: readonly PlanFichaApi[];
  /** El plan contra el que el libro mide saldo y cupo. */
  activoId: string | null;
  /** Cómo se marca ese plan: «el del libro» (el activo) o «el elegido» (el del chip del libro). */
  etiquetaActivo?: string;
  onCompletarPlan?: () => void;
}

const KICKER = "text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]";

function cuanto(dias: number | null): string | null {
  if (dias == null) return null;
  if (dias < 0) return `venció hace ${formatNumber(-dias)} ${dias === -1 ? "día" : "días"}`;
  if (dias === 0) return "vence hoy";
  return `${dias === 1 ? "queda" : "quedan"} ${formatNumber(dias)} ${dias === 1 ? "día" : "días"}`;
}

export default function LothPlanesVivos({ planes, activoId, etiquetaActivo = "el del libro", onCompletarPlan }: LothPlanesVivosProps) {
  const filas = useMemo(
    () => planes.map((p) => ({ plan: p, ficha: construirFichaPermiso(null, p) })),
    [planes],
  );
  if (filas.length < 2) return null;

  return (
    <section aria-label="Planes vivos" className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="flex items-center gap-1 px-4 pt-2.5">
        <span className={KICKER}>Planes vivos · {filas.length}</span>
        <InfoTip
          title="Planes vivos"
          what="Todos los planes de manejo que siguen activos, cada uno con su vigencia."
          affects="La ficha de arriba, el saldo por especie y el cupo se miden contra el plan del libro (el más nuevo). Las trozas de los otros planes siguen amparadas por su propio plan."
          example="PO Tornillo: vigente hasta el lunes 20/03/2028, quedan 537 días."
        />
      </div>
      <ul className="divide-y divide-[var(--rule-soft)]">
        {filas.map(({ plan, ficha }) => {
          const tono = TONO_FICHA[ficha.estado];
          const dias = cuanto(ficha.diasQuedan);
          const sinVigencia = ficha.faltantes.some((f) => f.clave === "plan-vigencia");
          return (
            <li
              key={plan.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm"
              data-plan-vivo={plan.id}
            >
              <span className={`shrink-0 rounded-full border border-current/40 px-2 py-0.5 text-xs font-bold ${tono.cifra}`}>
                {ETIQUETA_FICHA[ficha.estado]}
              </span>
              <span className="min-w-0 font-semibold text-[var(--text-primary)]">
                {nombreDelPlan(plan)}
                {plan.alias && nombreDelPlan(plan) !== plan.alias && (
                  <span className="font-normal text-[var(--text-secondary)]"> · {plan.alias}</span>
                )}
              </span>
              {plan.id === activoId && (
                <span className="rounded-md bg-[var(--accent-soft)] px-1.5 py-0.5 text-xs font-semibold text-[var(--accent-dark)] dark:text-[var(--accent)]">
                  {etiquetaActivo}
                </span>
              )}
              {ficha.parcelaCorta && (
                <span className="text-xs text-[var(--text-secondary)]">
                  Parcela <span className="font-mono font-semibold">{ficha.parcelaCorta}</span>
                </span>
              )}
              <span className="basis-full text-xs text-[var(--text-secondary)] sm:ml-auto sm:basis-auto sm:text-right">
                {dias ? (
                  <>
                    <span className={`font-bold tabular-nums ${tono.cifra}`}>{dias}</span>
                    {ficha.vigenciaHasta && <> · hasta el {ficha.vigenciaHasta}</>}
                  </>
                ) : (
                  <span className="font-semibold">{ficha.estadoTexto}</span>
                )}
                {sinVigencia && onCompletarPlan && (
                  <button
                    type="button"
                    onClick={onCompletarPlan}
                    aria-label={`Completar la vigencia de ${nombreDelPlan(plan)}`}
                    className="ml-2 inline-flex h-11 items-center gap-1 rounded-lg px-2 font-bold text-[var(--accent-dark)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] sm:h-8 dark:text-[var(--accent)]"
                  >
                    Completar <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
