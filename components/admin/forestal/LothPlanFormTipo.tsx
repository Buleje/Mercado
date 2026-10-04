"use client";

/** Bloque 1 del formulario del plan: qué documento es —decide todo lo demás— y «Copiar de un plan anterior». */

import { Check, ChevronDown, Copy } from "@buleje/design-system/icons";
import { etiquetaPlanPrevio, type PlanPrevio } from "@/lib/forestal/loth-plan-alta";
import { TIPOS_PLAN_LISTA } from "@/lib/forestal/loth-tipos-plan";
import Bloque from "./LothPlanFormBloque";
import type { LothPlanFormEstado } from "./hooks/use-loth-plan-form";

export default function LothPlanFormTipo({
  form,
  planesPrevios,
}: {
  form: LothPlanFormEstado;
  planesPrevios: readonly PlanPrevio[];
}) {
  const { f, meta, menuCopiar, setMenuCopiar, copiarDe, copiadoDe, elegirTipo } = form;
  return (
    <Bloque
      n={1}
      titulo="Qué documento vas a registrar"
      accion={
        planesPrevios.length > 0 ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuCopiar((v) => !v)}
              aria-expanded={menuCopiar}
              title="Trae lo que se repite: ARFFS, región, regente, UIT y costos"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)]"
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
              Copiar de un plan anterior
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${menuCopiar ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {menuCopiar && (
              <>
              {/* Un clic afuera cierra el menú: sin esto queda tapando el
                  formulario hasta que alguien vuelva a tocar el botón. */}
              <button
                type="button"
                aria-hidden="true"
                tabIndex={-1}
                onClick={() => setMenuCopiar(false)}
                className="fixed inset-0 z-10 cursor-default"
              />
              <div className="absolute right-0 z-20 mt-1.5 max-h-64 w-[20rem] max-w-[90vw] overflow-y-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1 shadow-[var(--shadow-lg)]">
                {planesPrevios.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => copiarDe(p)}
                    className="block w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--surface-sunken)]"
                  >
                    <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{etiquetaPlanPrevio(p)}</span>
                    <span className="block truncate text-xs text-[var(--text-tertiary)]">{p.titularName}</span>
                  </button>
                ))}
              </div>
              </>
            )}
          </div>
        ) : undefined
      }
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {TIPOS_PLAN_LISTA.map((t) => {
          const activo = f.planType === t.key;
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={activo}
              onClick={() => elegirTipo(t.key)}
              className={`rounded-xl border-2 p-3 text-left transition-colors ${
                activo
                  ? "border-[var(--data-success-500)] bg-[var(--data-success-50)]"
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--rule-strong)]"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <span className={`text-sm font-bold ${activo ? "text-[var(--data-success-700)]" : "text-[var(--text-primary)]"}`}>
                  {t.sigla}
                </span>
                {activo && <Check className="h-3.5 w-3.5 text-[var(--data-success-700)]" strokeWidth={3} />}
              </span>
              <span className="mt-0.5 block text-xs font-semibold text-[var(--text-secondary)]">{t.nombre}</span>
              <span className="mt-1 block text-xs text-[var(--text-tertiary)]">{t.para}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-[var(--text-tertiary)]">{meta.ayuda}</p>
      {copiadoDe && (
        <p className="mt-2 rounded-xl border border-[var(--data-info-100)] bg-[var(--data-info-50)] px-3 py-2 text-xs text-[var(--text-secondary)] dark:border-[var(--data-info-500)]/30 dark:bg-[var(--data-info-500)]/10">
          De <b className="text-[var(--text-primary)]">{copiadoDe.plan}</b> se copiaron: {copiadoDe.campos.join(", ")}. El número, la
          resolución, la parcela y la vigencia no se copian: son de este documento.
        </p>
      )}
    </Bloque>
  );
}
