"use client";

/**
 * El embudo del libro (bosque → producto) como una tarjeta más de los
 * Indicadores de Secciones (compactación 17-10). Antes era el bloque
 * «Aprovechamiento» arriba de las secciones (`LothResumenStrip`, 48 px plegado
 * y 184 abierto); sus avisos —bloqueos, alertas, m³ fuera del plan— pasaron a
 * la campana de la banda y sus cifras, acá.
 *
 * Son cifras del libro ENTERO (todos los planes), no de la sección: lo dice el
 * rótulo. «Rentabilidad y rendimiento» las da por plan y puede dar otra cifra.
 */

import { ArrowRight, ChevronRight, TrendingUp } from "@buleje/design-system/icons";
import { formatNumber } from "@/lib/format";
import CtpKpi from "./CtpKpi";
import type { EmbudoLibroTh } from "./hooks/use-loth-avisos-libro";

const fm = (n: number, dp: 0 | 1 | 2 = 2) => formatNumber(n, dp);

export default function LothEmbudoKpi({
  embudo: e,
  onVerRentabilidad,
}: {
  embudo: EmbudoLibroTh | null;
  onVerRentabilidad?: () => void;
}) {
  if (!e || !e.hayActividad) return null;
  const poa = e.autorizado > 0 ? ` · POA ${fm(e.pctPoa, 0)} %` : "";
  const enRojo = e.excedido || e.volFueraDePlan > 0;
  return (
    <CtpKpi
      /* Rótulo corto: «libro entero» partía el rótulo en dos renglones a 1280
         y desalineaba la fila de tarjetas; lo de «todo el libro» va abajo. */
      label="Movilizado · libro"
      value={`${fm(e.movilizado)} m³`}
      subValue={`de ${fm(e.talado)} m³ talados${e.rendimientoPct > 0 ? ` · trozado rinde ${fm(e.rendimientoPct, 1)} %` : ""}${poa} · todo el libro`}
      icon={TrendingUp}
      emphasis={enRojo ? "error" : e.pctPoa > 85 ? "warning" : "neutral"}
      desgloseLabel="Del bosque al despacho"
      desglose={
        <div className="space-y-2 text-sm">
          <p className="flex flex-wrap items-center gap-x-1.5 tabular-nums text-[var(--text-secondary)]">
            <span>Talado <b className="text-[var(--text-primary)]">{fm(e.talado)}</b></span>
            <ChevronRight className="h-3.5 w-3.5 text-[var(--text-tertiary)]" aria-hidden />
            <span>Trozado <b className="text-[var(--text-primary)]">{fm(e.trozado)}</b></span>
            <ChevronRight className="h-3.5 w-3.5 text-[var(--text-tertiary)]" aria-hidden />
            <span>Movilizado <b className="text-[var(--text-primary)]">{fm(e.movilizado)}</b> m³</span>
          </p>
          {e.autorizado > 0 && (
            <div title="Mide sólo las especies declaradas en el plan de manejo: lo movilizado de una especie no autorizada nunca tuvo saldo.">
              <span className="flex justify-between gap-2 text-xs text-[var(--text-tertiary)]">
                <span>Saldo POA · especies autorizadas</span>
                <span className={`font-mono font-bold tabular-nums ${e.excedido ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "text-[var(--text-secondary)]"}`}>
                  {fm(e.movilizadoAutorizado)} / {fm(e.autorizado)} m³
                </span>
              </span>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                <span
                  className={`block h-full rounded-full ${e.excedido ? "bg-[var(--data-error-500)]" : e.pctPoa > 85 ? "bg-[var(--data-warning-500)]" : "bg-[var(--accent)]"}`}
                  style={{ width: `${Math.max(2, e.pctPoa)}%` }}
                />
              </span>
            </div>
          )}
          {e.volFueraDePlan > 0 && (
            <p className="text-xs font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
              {fm(e.volFueraDePlan)} m³ fuera del plan:{" "}
              {e.fueraDePlan.map((x) => `${x.species} ${fm(x.movilizadoM3)} m³`).join(" · ")}
            </p>
          )}
          <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-tertiary)]">
            <span>
              <b className="font-mono tabular-nums text-[var(--text-secondary)]">{e.especies}</b>{" "}
              {e.especies === 1 ? "especie aprovechada" : "especies aprovechadas"}
            </span>
            {onVerRentabilidad && (
              <button
                type="button"
                onClick={onVerRentabilidad}
                title="Rentabilidad y rendimiento, de un plan. Estas cifras son del libro entero (todos los planes)."
                className="inline-flex h-8 items-center gap-1 rounded-lg px-1.5 font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]"
              >
                Ver rentabilidad <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </p>
        </div>
      }
    />
  );
}
