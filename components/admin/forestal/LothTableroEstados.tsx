"use client";

/**
 * «Estado de las trozas»: cada cifra es también el filtro de su estado. La
 * sexta tarjeta (ADR-459) es la que más pide trabajo: lo que lleva más de 15
 * días en el patio — la madera rolliza en la selva se mancha (mancha azul).
 */

import { CardTitle } from "@buleje/design-system";
import { Clock } from "@buleje/design-system/icons";
import { useKpisPlegables } from "./kpis-plegables";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { TONO_ESTADO } from "./loth-tablero-estilos";
import {
  ESTADOS_META,
  UMBRAL_PATIO_DIAS,
  type EstadoTroza,
  type ResumenEstado,
  type ResumenViejas,
} from "@/lib/forestal/loth-tablero-trozas";


const TARJETA = "rounded-2xl border-2 px-3 py-2.5 text-left transition-colors";
const INACTIVA = "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--rule-strong)]";
const ROTULO = "text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]";

export default function LothTableroEstados({
  resumen,
  viejas,
  estados,
  soloViejas,
  onEstado,
  onViejas,
}: {
  resumen: readonly ResumenEstado[];
  viejas: ResumenViejas;
  estados: readonly EstadoTroza[];
  soloViejas: boolean;
  onEstado: (e: EstadoTroza) => void;
  onViejas: () => void;
}) {
  const tonoViejas =
    viejas.criticas > 0
      ? "border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/12"
      : "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/12";
  /* Las seis cifras se pliegan (Brandon 05-10); cada una sigue siendo el filtro de su estado. */
  const total = resumen.reduce((a, r) => a + r.n, 0);
  const { boton, panel } = useKpisPlegables({
    claveMemoria: "loth-tablero-estados",
    resumen: `${total} ${total === 1 ? "troza" : "trozas"}${viejas.n > 0 ? ` · ${viejas.n} con +${UMBRAL_PATIO_DIAS.atencion} días en patio` : ""}`,
    filtrosActivos: estados.length + (soloViejas ? 1 : 0),
    tarjetas: [
      ...resumen.map((r) => {
          const activo = estados.includes(r.estado);
          return (
            <button
              key={r.estado}
              type="button"
              aria-pressed={activo}
              title={ESTADOS_META[r.estado].ayuda}
              onClick={() => onEstado(r.estado)}
              className={`${TARJETA} ${activo ? TONO_ESTADO[r.estado].chip : INACTIVA}`}
            >
              <span className="flex items-center gap-1.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${TONO_ESTADO[r.estado].punto}`} aria-hidden="true" />
                <span className={ROTULO}>{r.label}</span>
              </span>
              <span className="mt-0.5 block font-mono text-xl font-bold tabular-nums text-[var(--text-primary)]">{r.n}</span>
              <span className="block text-xs text-[var(--text-tertiary)]">
                {fmtM3(r.m3)} m³
                {r.sinVolumen > 0 && ` · ${r.sinVolumen} sin volumen`}
              </span>
            </button>
          );
      }),
        <button
          key="viejas"
          type="button"
          aria-pressed={soloViejas}
          title={`Trozas que siguen en el patio hace ${UMBRAL_PATIO_DIAS.atencion} días o más; en rojo las de ${UMBRAL_PATIO_DIAS.critico} o más. La madera rolliza se mancha (mancha azul) si no se mueve.`}
          onClick={onViejas}
          className={`${TARJETA} ${soloViejas ? tonoViejas : viejas.n > 0 ? `${tonoViejas} border-dashed` : INACTIVA}`}
        >
          <span className="flex items-center gap-1.5">
            <Clock
              className={`h-3.5 w-3.5 shrink-0 ${viejas.criticas > 0 ? "text-[var(--data-error-500)]" : viejas.n > 0 ? "text-[var(--data-warning-500)]" : "text-[var(--text-tertiary)]"}`}
              aria-hidden="true"
            />
            <span className={ROTULO}>Patio +{UMBRAL_PATIO_DIAS.atencion} días</span>
          </span>
          <span className="mt-0.5 block font-mono text-xl font-bold tabular-nums text-[var(--text-primary)]">{viejas.n}</span>
          <span className="block text-xs text-[var(--text-tertiary)]">
            {fmtM3(viejas.m3)} m³{viejas.criticas > 0 && ` · ${viejas.criticas} con +${UMBRAL_PATIO_DIAS.critico}`}
          </span>
        </button>,
    ],
  });
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
          Estado de las trozas
        </CardTitle>
        {boton}
      </div>
      {panel}
    </section>
  );
}
