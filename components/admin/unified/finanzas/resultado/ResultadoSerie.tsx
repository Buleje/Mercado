"use client";

/**
 * La tira de meses: el resultado de cada uno, en barras que crecen hacia
 * arriba si ganaste y hacia abajo si perdiste. Tocar un mes lo abre arriba.
 * Los totales son los de la serie del servidor (`PuntoSerie`), los mismos que
 * da el mes abierto.
 */

import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PuntoSerie } from "@/lib/finance/resultado-del-negocio";
import { mesConAnio, mesCorto, montoTexto } from "./fuentes";

const ALTO = 112;

export default function ResultadoSerie({
  serie,
  elegido,
  onElegir,
}: {
  serie: PuntoSerie[];
  elegido: string;
  onElegir: (mes: string) => void;
}) {
  if (serie.length === 0) return null;
  const maximo = Math.max(...serie.map((p) => Math.abs(p.resultado)), 1);
  const hayNegativo = serie.some((p) => p.resultado < 0);
  const hayPositivo = serie.some((p) => p.resultado > 0);
  /* La línea del cero va donde haga falta: todo arriba, todo abajo, o al medio. */
  const arriba = hayPositivo && hayNegativo ? ALTO / 2 : hayNegativo ? 0 : ALTO;
  const abajo = ALTO - arriba;

  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-1.5">
        <CardTitle className="text-sm font-bold" as="h3">Últimos {serie.length} meses</CardTitle>
        <InfoTip
          title="Resultado mes a mes"
          what="Cada barra es lo que ganaste o perdiste en ese mes. Hacia arriba, ganancia; hacia abajo, pérdida."
          affects="Toca un mes para abrirlo arriba. «≈» = tiene cifras estimadas."
        />
      </div>
      <ul className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${serie.length}, minmax(0, 1fr))` }}>
        {serie.map((p) => {
          const alto = (Math.abs(p.resultado) / maximo) * (p.resultado >= 0 ? arriba : abajo);
          const activo = p.mes === elegido;
          const color = p.resultado >= 0 ? "bg-[var(--data-success-500)]" : "bg-[var(--data-error-500)]";
          return (
            <li key={p.mes} className="min-w-0">
              <button
                type="button"
                onClick={() => onElegir(p.mes)}
                aria-pressed={activo}
                aria-label={`${mesConAnio(p.mes)}: ingresos ${montoTexto(p.ingresos)}, costos ${montoTexto(p.costos)}, resultado ${montoTexto(p.resultado, { aproximado: p.estimado, signo: true })}`}
                className={cn(
                  "relative flex w-full flex-col items-stretch rounded-lg border px-1 py-1.5 transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                  activo ? "border-[var(--accent)] bg-[var(--surface-sunken)]" : "border-transparent",
                )}
              >
                <span className="flex flex-col justify-end" style={{ height: arriba }} aria-hidden>
                  {p.resultado > 0 && <span className={cn("mx-auto w-3/5 rounded-t", color)} style={{ height: Math.max(alto, 2) }} />}
                </span>
                <span className="h-px bg-[var(--rule-strong)]" aria-hidden />
                <span className="flex flex-col justify-start" style={{ height: abajo }} aria-hidden>
                  {p.resultado < 0 && <span className={cn("mx-auto w-3/5 rounded-b", color)} style={{ height: Math.max(alto, 2) }} />}
                </span>
                <span className="mt-1 text-center text-xs font-semibold text-[var(--text-primary)]">
                  {mesCorto(p.mes)}
                  {p.estimado && <span className="font-normal text-[var(--text-secondary)]"> ≈</span>}
                  {p.cerradoCtp && <span className="sr-only"> (cerrado)</span>}
                </span>
                <span className="whitespace-nowrap text-center text-xs tabular-nums text-[var(--text-secondary)]">
                  {p.resultado < 0 ? "−" : ""}
                  {formatNumber(Math.abs(p.resultado), 0)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
