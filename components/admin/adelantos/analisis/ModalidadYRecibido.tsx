/**
 * «Por modalidad» (en plata, y sólo si hay más de una: con todo en cuenta
 * corriente, una dona de un solo color no decía nada) y «Lo que recibiste»
 * (ADR-448: plata que te dieron a ti; nunca se mezcla con lo dado).
 */
import { StatCard } from "@buleje/design-system";
import { ArrowDownToLine, Coins, Landmark, Wrench } from "@buleje/design-system/icons";
import type { ModalidadAnalisis, RecibidoAnalisis } from "@/lib/adelantos/analisis";
import { fmtMon } from "../shared";
import { montoEnFrase } from "./formato";
import { Muestra } from "./Tarjeta";

const COLORES = ["var(--accent)", "var(--data-warning-500)", "var(--data-info-500)"] as const;
const colorDe = (i: number): string => COLORES[i % COLORES.length];

export function PorModalidad({ modalidades, moneda }: { modalidades: ModalidadAnalisis[]; moneda: string }) {
  return (
    <>
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]" aria-hidden>
        {modalidades.map((m, i) => (
          <div key={m.id} className="h-full" style={{ width: `${m.pct}%`, backgroundColor: colorDe(i) }} />
        ))}
      </div>
      <ul className="mt-3 grid gap-2 @lg:grid-cols-2">
        {modalidades.map((m, i) => (
          <li key={m.id} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3">
            <Muestra color={colorDe(i)}>{m.label}</Muestra>
            <span className="whitespace-nowrap text-sm tabular-nums text-[var(--text-secondary)]">
              <strong className="font-bold text-[var(--text-primary)]">{fmtMon(m.monto, moneda)}</strong> ({m.pct} %)
              {m.debe > 0 && <> · te deben {montoEnFrase(m.debe, moneda)}</>}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function LoQueRecibiste({ recibido, moneda, monedaLabel }: { recibido: RecibidoAnalisis; moneda: string; monedaLabel: string }) {
  const max = Math.max(1, ...recibido.personas.map((p) => p.monto));
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total recibido" value={fmtMon(recibido.total, moneda)} icon={ArrowDownToLine} subValue={monedaLabel} />
        <StatCard
          label="Por devolver"
          value={fmtMon(recibido.porDevolver, moneda)}
          icon={Coins}
          emphasis={recibido.porDevolver > 0 ? "warning" : "neutral"}
          subValue={recibido.porDevolver > 0 ? "Le debes" : "Al día"}
        />
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-3">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--text-secondary)]"><Wrench className="h-4 w-4 shrink-0" aria-hidden /> Servicio: <strong className="text-[var(--text-primary)]">{fmtMon(recibido.servicio, moneda)}</strong></span>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--text-secondary)]"><Landmark className="h-4 w-4 shrink-0" aria-hidden /> Préstamo: <strong className="text-[var(--text-primary)]">{fmtMon(recibido.prestamo, moneda)}</strong></span>
        </div>
      </div>
      {recibido.personas.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-bold text-[var(--text-secondary)]">A quién le debes más</p>
          <ul className="divide-y divide-[var(--rule-soft)]" aria-label="A quién le debes más">
            {recibido.personas.map((p) => (
              <li key={p.id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 break-words text-sm font-semibold text-[var(--text-primary)]">{p.nombre}</span>
                  <span className="shrink-0 whitespace-nowrap text-sm font-bold tabular-nums text-[var(--text-primary)]">Le debes {fmtMon(p.monto, moneda)}</span>
                </div>
                <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]" aria-hidden>
                  <div className="h-full rounded-full bg-[var(--data-info-500)]" style={{ width: `${Math.round((p.monto / max) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
