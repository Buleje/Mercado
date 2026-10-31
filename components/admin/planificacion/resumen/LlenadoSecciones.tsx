"use client";

/**
 * El mapa del plan en el Resumen (ADR-497): una tarjeta por sección con
 * cuánto está escrito; al tocarla se abre esa sección.
 */
import { BlockTitle } from "@buleje/design-system";
import { ChevronRight } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { llenado } from "@/lib/planificacion/calculos";
import { NOMBRE_SECCION, SECCIONES_PLAN, type DatosPlan, type DatosSeccion, type SeccionPlan } from "@/lib/planificacion/secciones";
import { cn } from "@/lib/utils";

interface Props {
  plan: Partial<DatosPlan>;
  general: number;
  onAbrir: (s: SeccionPlan) => void;
}

function tono(pct: number): string {
  if (pct >= 100) return "bg-[var(--data-success-500)]";
  if (pct > 0) return "bg-[var(--data-5)]";
  return "bg-transparent";
}

export function LlenadoSecciones({ plan, general, onAbrir }: Props) {
  const secciones = SECCIONES_PLAN.filter((s) => plan[s] !== undefined);

  return (
    <section className="space-y-3" aria-label="Cuánto del plan está escrito">
      <div className="flex items-center gap-1.5">
        <BlockTitle as="h3">Secciones del plan</BlockTitle>
        <InfoTip
          what="Qué tanto de cada sección está escrito. Toca una para abrirla."
          affects={`El plan completo va en ${general} %: el promedio de las secciones que puedes ver.`}
        />
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {secciones.map((s) => {
          const pct = llenado(s, plan[s] as DatosSeccion<typeof s>);
          return (
            <li key={s}>
              <button
                type="button"
                className="group flex w-full flex-col gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 text-left transition-colors hover:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
                onClick={() => onAbrir(s)}
              >
                <span className="flex w-full items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-primary)]">{NOMBRE_SECCION[s]}</span>
                  <span className={cn("text-sm tabular-nums", pct >= 100 ? "text-[var(--data-success-ink)]" : "text-[var(--text-secondary)]")}>
                    {pct >= 100 ? "Listo" : `${pct} %`}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-tertiary)] group-hover:text-[var(--accent-ink)]" aria-hidden />
                </span>
                <span className="block h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]" aria-hidden>
                  <span className={cn("block h-full rounded-full", tono(pct))} style={{ width: `${pct}%` }} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
