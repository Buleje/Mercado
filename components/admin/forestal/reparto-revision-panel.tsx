"use client";

/**
 * El repaso antes de registrar: qué renglón no cuadra y qué hacer con él.
 *
 * Cada hallazgo dice DÓNDE, QUÉ pasa y CÓMO se arregla — un aviso que sólo
 * dice «hay un problema» obliga a adivinar, y adivinar sobre un papel que se
 * presenta ante SERFOR es exactamente lo que esta pantalla existe para evitar.
 * La regla y el ejemplo van en el ⓘ, no en la fila.
 */

import { AlertTriangle, ShieldCheck, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { HallazgoRevision } from "@/lib/forestal/reparto-revision";

export function PanelRevision({ hallazgos, onCerrar }: { hallazgos: HallazgoRevision[]; onCerrar: () => void }) {
  const errores = hallazgos.filter((h) => h.severidad === "error");
  return (
    <div className="mb-4 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3 print:hidden" data-panel-revision>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          {hallazgos.length === 0
            ? <><ShieldCheck className="h-4 w-4 text-[var(--data-success-600)] dark:text-[var(--data-success-500)]" aria-hidden /> Todo cuadra: no hay nada que corregir antes de registrar.</>
            : <><AlertTriangle className="h-4 w-4 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden /> Repaso antes de registrar</>}
        </span>
        <button type="button" onClick={onCerrar} aria-label="Cerrar el repaso" className="rounded-xl p-1 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]">
          <X className="h-4 w-4" />
        </button>
      </div>
      {hallazgos.length > 0 && (
        <>
          <p className="mb-2 text-sm text-[var(--text-tertiary)]">
            {errores.length > 0
              ? <><b className="text-[var(--data-error-600)] dark:text-[var(--data-error-500)]">{errores.length}</b> no debería declararse así; el resto conviene mirarlo.</>
              : "Nada impide declarar: son cosas para mirar antes de firmar."}
          </p>
          <ul className="space-y-1.5">
            {hallazgos.map((h) => (
              <li
                key={h.id}
                data-hallazgo={h.id}
                className={`rounded-lg border-l-[3px] bg-[var(--surface-raised)] px-3 py-2 ${h.severidad === "error"
                  ? "border-l-[var(--data-error-500)]"
                  : "border-l-[var(--data-warning-500)]"}`}
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className={`text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide ${h.severidad === "error"
                    ? "text-[var(--data-error-600)] dark:text-[var(--data-error-500)]"
                    : "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"}`}
                  >
                    {h.severidad === "error" ? "Falta" : "Mirar"}
                  </span>
                  <b className="text-sm text-[var(--text-primary)]">{h.donde}</b>
                  {/* El ⓘ va DENTRO del texto: como hermano del flex-wrap, a 400 px
                      caía solo en una línea propia. */}
                  <span className="text-sm text-[var(--text-secondary)]">
                    {h.que}
                    {h.info && (
                      <InfoTip
                        title={h.donde}
                        what={h.info.what}
                        example={h.info.example}
                        side="left"
                        className="-my-1 ml-1"
                        ariaLabel={`De dónde sale este aviso: ${h.donde}`}
                      />
                    )}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-[var(--text-tertiary)]">{h.comoArreglar}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
