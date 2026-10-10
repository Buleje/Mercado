"use client";

/**
 * «Por pie tablar» del flete (ADR-440 §6, Brandon 2026-09-26: «la oxapampina
 * es con la que trabajo con dueños, compras, ventas, flete»).
 *
 * Sólo MUESTRA y deja tipear la tarifa: el monto lo pone el servidor al
 * guardar (tarifa × PT de la guía). Lo que se ve acá es la misma cuenta
 * (`montoPorPt`) sobre el mismo PT (`GET /fletes?ptGuia=`), antes de guardar.
 *
 * Un viaje ya cobrado conserva su PT aunque la guía se vuelva a medir: el
 * cambio se ofrece («Usar la de hoy»), nunca se aplica solo.
 */

import { useId } from "react";
import { AlertTriangle, Loader2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency, formatNumber } from "@/lib/format";
import { TARIFA_PT_MAX } from "@/lib/forestal/fletes";
import { textoFuentePt, type PtParaPagar } from "@/lib/forestal/plata-de-guia";
import { I } from "../ctp-shared";

const pt = (v: number) => `${formatNumber(v, { max: 2 })} pt`;

export default function CobroFletePorPt({
  tarifa,
  onTarifa,
  vigente,
  cargando,
  error,
  noExiste,
  cobrado,
  usarHoy,
  onUsarHoy,
  ptElegido,
  monto,
  montoAntes,
}: {
  tarifa: number | null;
  onTarifa: (v: number | null) => void;
  /** El PT de la guía HOY (servidor). */
  vigente: PtParaPagar | null;
  cargando: boolean;
  error: string | null;
  noExiste: boolean;
  /** Lo que este viaje ya cobró (editando), si fue por pt y con la misma guía. */
  cobrado: { pt: number; fuente: "oxapampa" | "estimado" | null } | null;
  usarHoy: boolean;
  onUsarHoy: (si: boolean) => void;
  /** El PT con el que se va a cobrar (el cobrado o el de hoy). */
  ptElegido: number | null;
  monto: number | null;
  /** El monto guardado del viaje, para ver el cambio antes de guardar. */
  montoAntes: number | null;
}) {
  const idTarifa = useId();
  const difiere = cobrado != null && vigente != null && Math.abs(cobrado.pt - vigente.pt) > 0.005;
  const fuente = difiere && !usarHoy ? cobrado.fuente : (vigente?.fuente ?? null);

  return (
    <div className="grid gap-3 sm:col-span-12 sm:grid-cols-12">
      <div className="sm:col-span-4">
        <div className="mb-1 flex items-center gap-1.5">
          <label htmlFor={idTarifa} className="text-sm font-bold text-[var(--text-secondary)]">
            Tarifa por pt (S/)
          </label>
          <InfoTip
            title="Flete por pie tablar"
            what="El flete sale de tu tarifa por el pie tablar de la guía: el PT Oxapampa si mediste todas sus trozas; si falta alguna, el ≈ estimado."
            affects="El monto lo calcula el sistema al guardar. Si después vuelves a medir, este viaje no cambia solo."
            example="S/ 0,30 × 3 120 pt = S/ 936,00"
          />
        </div>
        <input
          id={idTarifa}
          type="number"
          inputMode="decimal"
          min={0}
          max={TARIFA_PT_MAX}
          step="0.0001"
          className={`${I} text-right font-mono tabular-nums`}
          value={tarifa ?? ""}
          onChange={(e) => onTarifa(e.target.value === "" ? null : Number(e.target.value))}
          placeholder="0.30"
        />
      </div>

      <div className="min-w-0 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm sm:col-span-8">
        {cargando ? (
          <p className="flex items-center gap-2 text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo el pie tablar de la guía…
          </p>
        ) : noExiste ? (
          <p className="flex items-start gap-1.5 font-bold text-[var(--data-warning-ink)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> No encuentro esa guía en
            tus ingresos: cobra este viaje por monto.
          </p>
        ) : error ? (
          <p role="alert" className="font-bold text-[var(--data-error-ink)]">
            {error}
          </p>
        ) : vigente && ptElegido != null ? (
          <div className="space-y-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="min-w-0">
                <span className="text-[var(--text-secondary)]">
                  × <b className="font-mono tabular-nums text-[var(--text-primary)]">{pt(ptElegido)}</b>
                </span>
                <span
                  className={`block text-xs font-semibold ${fuente === "oxapampa" ? "text-[var(--data-success-ink)]" : "text-[var(--data-warning-ink)]"}`}
                >
                  {difiere && !usarHoy
                    ? `${fuente === "oxapampa" ? "PT Oxapampa" : "≈ estimado"} · lo ya cobrado`
                    : textoFuentePt(vigente)}
                </span>
              </span>
              <span className="text-right">
                <span className="text-[var(--text-secondary)]">= </span>
                <b className="font-mono text-base tabular-nums text-[var(--text-primary)]">
                  {monto == null ? "—" : formatCurrency(monto)}
                </b>
                {montoAntes != null && monto != null && Math.abs(montoAntes - monto) > 0.005 && (
                  <span className="block text-xs text-[var(--text-tertiary)]">
                    antes {formatCurrency(montoAntes)}
                  </span>
                )}
              </span>
            </div>
            {difiere && (
              <div className="flex flex-wrap items-center gap-2 text-[var(--text-secondary)]">
                <span>
                  Cobrado con {pt(cobrado.pt)} · hoy la guía da {pt(vigente.pt)} ({textoFuentePt(vigente)})
                </span>
                <button
                  type="button"
                  onClick={() => onUsarHoy(!usarHoy)}
                  className="h-9 rounded-lg border border-[var(--rule-base)] px-2 font-bold text-[var(--accent-ink)] hover:border-[var(--accent)] dark:text-[var(--accent)]"
                >
                  {usarHoy ? "Dejar lo cobrado" : "Usar la de hoy"}
                </button>
              </div>
            )}
            {vigente.fuente === "estimado" && vigente.total > 0 && !(difiere && !usarHoy) && (
              <p className="text-xs text-[var(--text-tertiary)]">
                Cubica las {vigente.total - vigente.cubicadas} trozas que faltan para cobrar con PT Oxapampa.
              </p>
            )}
          </div>
        ) : (
          <p className="text-[var(--text-tertiary)]">Pon el N° de guía para traer su pie tablar.</p>
        )}
      </div>
    </div>
  );
}
