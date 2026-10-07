"use client";

/**
 * LothPlanView — Plan de Manejo Forestal + especies autorizadas + censo (ADR-126).
 *
 * Base maestra del LO-TH: el permiso aprobado, los volúmenes autorizados por
 * especie (con precio/m³) y el censo de árboles. La Tala jala de acá por código.
 *
 * ORDEN (Brandon 2026-09-19: «muchas tablas dispersas y sin orden»). Antes eran
 * nueve bloques en una tirada —4,8 pantallas, 5 tablas, 8 títulos al mismo
 * peso—. Ahora la vista contesta de arriba abajo:
 *
 *   1. ¿Qué plan y cuánto queda?  → cabecera: título, plan, carátula en una
 *      línea e indicadores plegables (recordados).
 *   2. ¿Hay algo mal HOY?          → avisos, FUERA de las pestañas.
 *   3. El detalle, por pregunta    → pestañas «Avance y tala» · «Especies» ·
 *      «Censo», con las tablas que hablan de lo mismo juntas.
 *
 * Los datos y las cuentas viven en `hooks/use-loth-plan`; el estado de la
 * vista (pestaña, pedidos, cierre, baja del plan) en `hooks/use-loth-plan-view`;
 * el menú y las pestañas en `loth-plan-view-shared`; los formularios en
 * `LothPlanModales` y el detalle por pestaña en `LothPlanPaneles`. Esto sólo
 * ordena.
 *
 * PLANTACIÓN (ADR-459, Brandon 2-10-2026): «no es necesario poner el censo
 * porque es plantación». Su base es el REGISTRO —especies y m³— y la vista
 * cambia de forma: pestañas «Registro y saldo» (por defecto) y «Árboles
 * marcados (opcional)»; sin Plan Operativo, semilleros, DMC ni pago por
 * derecho (son de bosque natural), y la zafra sólo si el registro trae período.
 */

import { useMemo } from "react";
import { AlertCircle, FileText, Loader2, Plus } from "@buleje/design-system/icons";
import { analizarAprovechamiento } from "@/lib/forestal/loth-aprovechamiento";
import LothPlanCabecera from "./LothPlanCabecera";
import LothPlanModales from "./LothPlanModales";
import LothPlanPaneles from "./LothPlanPaneles";
import { useLothPlanView } from "./hooks/use-loth-plan-view";

/* Exportadas: la prueba en navegador las lee. */
export { CLAVE_PESTANA_PLAN, CLAVE_PESTANA_PLANTACION } from "./loth-plan-view-shared";

export default function LothPlanView({
  reloadSignal,
  onCambioDelLibro,
}: {
  reloadSignal?: number;
  /** Se borraron líneas del libro desde el plan: la página relee lista, contadores y paneles. */
  onCambioDelLibro?: () => void;
} = {}) {
  const v = useLothPlanView(reloadSignal, onCambioDelLibro);
  const { d, trees, plan, cargando, esPlantacion, errorPlan, opciones } = v;
  /* El aprovechamiento de la cabecera: la cascada del balance contra la base
     (registrado o autorizado) y la vigencia. Plantación mide lo talado;
     bosque, lo movilizado (el «Aprovechamiento POA» de siempre). */
  const aprovechamiento = useMemo(
    () =>
      plan
        ? analizarAprovechamiento({
            modo: esPlantacion ? "plantacion" : "bosque",
            cascada: d.cascada,
            baseM3: esPlantacion ? undefined : d.autorizadoTotal,
            vigenciaDesde: plan.vigenciaDesde,
            vigenciaHasta: plan.vigenciaHasta,
            taladoSinRegistrarM3: esPlantacion ? d.taladoSinRegistrarM3 : 0,
            hoy: new Date(),
          })
        : null,
    [plan, esPlantacion, d.cascada, d.autorizadoTotal, d.taladoSinRegistrarM3],
  );

  return (
    <div data-vista-plan className="space-y-4">
      {errorPlan && (
        <p className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-3 py-2 text-sm font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
          {errorPlan}
        </p>
      )}
      <LothPlanCabecera
        plans={d.plans}
        planId={d.planId}
        onPlan={d.setPlanId}
        plan={plan}
        opciones={opciones}
        aprovechamiento={aprovechamiento}
        kpis={
          plan
            ? {
                autorizadoTotal: d.autorizadoTotal,
                especies: d.species.length,
                aprovechamientoPct: d.autorizadoTotal > 0 ? d.aprovechamientoPct : null,
                movilizadoTotal: d.movilizadoTotal,
                saldoTotal: d.saldoTotal,
                censoTotal: d.censoTotal,
                censoTruncado: d.censoTruncado,
                cargados: trees.length,
                georrefPct: d.georrefPct,
                okCount: d.okCount,
                controlCount: d.controlRows.length,
                fueraDelPlan: d.noAutorizadas.length,
              }
            : null
        }
        kpisPlantacion={
          plan && esPlantacion
            ? {
                registrado: d.cascada.total.baseM3,
                talado: d.cascada.total.taladoM3,
                enPie: d.cascada.total.enPieM3,
                despachado: d.cascada.total.despachadoM3,
                enPatio: d.cascada.total.enPatioM3,
                especies: d.species.length,
                pctTalado: d.cascada.total.pctTalado,
                excedido: d.cascada.total.excedido,
                taladoSinRegistrar: d.taladoSinRegistrarM3,
              }
            : null
        }
      />

      {d.error && (
        <div role="alert" className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
          <AlertCircle className="mr-2 inline h-4 w-4" aria-hidden="true" /> {d.error}
        </div>
      )}

      <LothPlanModales v={v} />

      {cargando && (
        <div className="p-6 text-center text-[var(--text-tertiary)]" role="status" aria-label="Cargando el plan de manejo">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" aria-hidden="true" />
        </div>
      )}

      {!cargando && plan && <LothPlanPaneles v={v} plan={plan} />}

      {!cargando && d.plans.length === 0 && !d.showPlanForm && (
        <div className="rounded-2xl border border-dashed border-[var(--rule-base)] p-12 text-center text-[var(--text-tertiary)]">
          <FileText className="mx-auto mb-3 h-10 w-10 opacity-30" aria-hidden="true" />
          <p className="text-base font-medium">No hay planes de manejo cargados.</p>
          <p className="mt-1 text-sm">Crea el plan (permiso + resolución + titular) para empezar a censar árboles.</p>
          {/* Sin planes, crear uno ES la acción principal: va a la vista, no
              escondida en «Opciones». */}
          <button
            type="button"
            onClick={() => d.setShowPlanForm(true)}
            className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-4 text-sm font-semibold text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Nuevo plan
          </button>
        </div>
      )}
    </div>
  );
}
