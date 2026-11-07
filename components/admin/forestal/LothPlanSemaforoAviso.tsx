"use client";

/**
 * El semáforo en los avisos del plan: lo que te expone a una observación y se
 * arregla desde acá. Una línea + ⓘ (regla del panel) y, si a la ficha le
 * faltan datos, «Completar la ficha» abre el formulario en el paso del primero.
 *
 * Sólo lo que el resto de los avisos NO dice: la vigencia y el estado ya
 * tienen su propia línea (`LothPlanAvisos`), y lo informativo (quién taló,
 * lo asentado tarde) se queda en el ⓘ de la cabecera. Sin nada que hacer, no
 * se dibuja. Si la primera razón es un papel, el botón principal es «Ver
 * papeles» (abre esa pestaña) y «Completar la ficha» queda al lado como
 * secundario; si la primera es la ficha, sólo «Completar la ficha». Si la línea de vigencia NO salió (un plan DECLARADO vencido con
 * la fecha todavía por delante no tiene días que contar), la vigencia va acá
 * (`vigenciaDicha={false}`): el rojo de la cabecera no puede quedar sin aviso.
 */

import { AlertTriangle, ShieldAlert } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import type { FichaDelPlan } from "@/lib/forestal/loth-plan-ficha";
import type { PasoPlan } from "@/lib/forestal/loth-plan-pasos";
import type { RazonSemaforo, SemaforoPlan } from "@/lib/forestal/loth-plan-semaforo";

/** Las razones que no piden hacer nada o que ya tienen su aviso propio. */
export function razonesDelAviso(s: SemaforoPlan, vigenciaDicha = true): RazonSemaforo[] {
  return s.razones.filter((r) => r.nivel !== "info" && r.clave !== "estado" && !(vigenciaDicha && r.clave === "vigencia"));
}

export default function LothPlanSemaforoAviso({ semaforo, ficha, vigenciaDicha = true, onCompletarFicha, onVerPapeles }: {
  semaforo: SemaforoPlan;
  ficha: FichaDelPlan | null;
  /** La línea de vigencia de `LothPlanAvisos` salió: no se repite acá. */
  vigenciaDicha?: boolean;
  /** Abre el formulario del plan en ese paso (`null` = el primero). */
  onCompletarFicha?: (paso: PasoPlan | null) => void;
  /** Abre la pestaña Papeles del plan (sin ella en la vista, no se ofrece). */
  onVerPapeles?: () => void;
}) {
  const razones = razonesDelAviso(semaforo, vigenciaDicha);
  if (razones.length === 0) return null;
  const rojo = razones.some((r) => r.nivel === "rojo");
  const Icono = rojo ? ShieldAlert : AlertTriangle;
  const primera = razones[0];
  const faltan = ficha?.faltan ?? [];
  const pasoFicha = faltan.find((f) => f.paso != null)?.paso ?? null;
  const conFicha = razones.some((r) => r.clave === "ficha") && onCompletarFicha;
  const conPapeles = primera?.clave === "papeles" && onVerPapeles;
  return (
    <div
      data-aviso-semaforo={rojo ? "rojo" : "ambar"}
      data-aviso-nivel={rojo ? "rojo" : "ambar"}
      data-aviso-resumen={(primera?.texto ?? "").replace(/(:|\.\s|\.$).*$/, "")}
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border-2 px-3 py-2 text-sm ${
        rojo
          ? "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/12"
          : "border-[var(--data-warning-500)]/60 bg-[var(--data-warning-100)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/15"
      }`}
    >
      <span className="flex min-w-0 grow basis-[18rem] items-center gap-2">
        <Icono className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0">
          <span className="font-bold">{rojo ? "Riesgo de multa" : "Revisa"}:</span> {primera?.texto}
          {razones.length > 1 && <span className="font-semibold"> (+{razones.length - 1} más)</span>}
        </span>
        <InfoTip
          title="Lo que te expone a una observación"
          ariaLabel="Ver todo lo que hay que revisar del plan"
          ancho="w-96"
          body={
            <span className="block space-y-1.5">
              {razones.map((r, i) => (
                <span key={`${r.clave}-${i}`} className="block">
                  <strong>{r.nivel === "rojo" ? "Urgente" : "Revisa"}:</strong> {r.texto}
                </span>
              ))}
              {faltan.map((f) => (
                <span key={f.id} className="block text-[var(--text-tertiary)]">
                  {f.falta}: {f.fuente}
                </span>
              ))}
            </span>
          }
        />
      </span>
      {(conPapeles || conFicha) && (
        <span data-aviso-botones className="flex shrink-0 flex-wrap gap-2">
          {conPapeles && (
            <button type="button" onClick={() => onVerPapeles?.()} className={button({ className: "shrink-0 rounded-xl" })}>
              Ver papeles
            </button>
          )}
          {conFicha && (
            <button
              type="button"
              onClick={() => onCompletarFicha?.(pasoFicha)}
              className={button({ variant: "secondary", className: "shrink-0 rounded-xl" })}
            >
              Completar la ficha
            </button>
          )}
        </span>
      )}
    </div>
  );
}
