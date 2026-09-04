"use client";

/**
 * CtpCuadreSniffs — el libro contra sí mismo y contra el período de al lado
 * (ADR-386).
 *
 * Dos preguntas que el Libro no sabía contestar, en la misma tarjeta porque se
 * leen juntas:
 *
 * **1 · ¿Puedo probar que SERFOR conoce estas guías?** Medido en el tenant:
 * 2 de 22 asientos vivos tienen su constancia del SNIFFS guardada. El SNIFFS
 * no expone API, así que el libro NO puede afirmar «SERFOR no la tiene» — sí
 * puede afirmar lo que importa y es igual de accionable: *este libro no puede
 * probarlo*. Es la primera pregunta de una fiscalización.
 *
 * **2 · ¿Esto viene subiendo o bajando?** «Entraron 135 m³» no dice nada solo.
 * «135 m³, 40 % menos que el mes pasado» es una decisión de compra. Se compara
 * contra un lapso del MISMO largo (`periodoAnterior`): un trimestre contra un
 * mes fabricaría una caída del 66 % que nunca existió.
 */

import { useEffect, useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { ArrowRight, Minus, ShieldCheck, TrendingDown, TrendingUp } from "@buleje/design-system/icons";
import { applyCtpPeriodParams, periodoAnterior, type CtpPeriod } from "@/lib/forestal/ctp-period";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import { logger } from "@/lib/logger";
import type { WoodEntryStats } from "./ctp-shared";

const fmt = (n: number, dec = 0) =>
  n.toLocaleString("es-PE", { minimumFractionDigits: dec, maximumFractionDigits: dec });

/** Variación porcentual. `null` cuando el antes es 0: nada no crece un %. */
function variacion(ahora: number, antes: number): number | null {
  if (!Number.isFinite(ahora) || !Number.isFinite(antes) || antes <= 0) return null;
  return Math.round(((ahora - antes) / antes) * 100);
}

export default function CtpCuadreSniffs({
  period,
  onNavigate,
}: {
  period: CtpPeriod;
  /** Lleva a Ingresos, donde se carga la constancia de cada guía. */
  onNavigate: () => void;
}) {
  const [ahora, setAhora] = useState<WoodEntryStats | null>(null);
  const [antes, setAntes] = useState<WoodEntryStats | null>(null);
  const [error, setError] = useState(false);

  const previo = useMemo(() => periodoAnterior(period), [period]);

  useEffect(() => {
    let vivo = true;
    setError(false);
    const url = (p: CtpPeriod) =>
      `/api/admin/forestal/wood-entries?${applyCtpPeriodParams(new URLSearchParams({ stats: "1", limit: "1" }), p)}`;

    /* Deduplicado (ADR-347): el del período actual lo pide también el panel de
       Cumplimiento en el mismo montaje. El del anterior es el único pedido
       nuevo de toda la comparación. */
    Promise.all([
      ctpGet<{ stats: WoodEntryStats }>(url(period)),
      previo
        ? ctpGet<{ stats: WoodEntryStats }>(url(previo)).catch((err) => {
            /* El período anterior es OPCIONAL: sin él se muestra el cuadre
               igual, sin la comparación. Perderla no puede costar la tarjeta. */
            logger.warn("[ctp-cuadre] no se pudo leer el período anterior", { error: String(err) });
            return null;
          })
        : Promise.resolve(null),
    ])
      .then(([a, b]) => {
        if (!vivo) return;
        setAhora(a.stats);
        setAntes(b?.stats ?? null);
      })
      .catch((err) => {
        if (!vivo) return;
        logger.warn("[ctp-cuadre] no se pudo leer el cuadre", { error: String(err) });
        setError(true);
      });
    return () => {
      vivo = false;
    };
  }, [period, previo]);

  if (error) {
    return (
      <section className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-4">
        <Cabecera />
        <p className="mt-2 text-sm text-[var(--text-secondary)]">No se pudo leer el cuadre del libro.</p>
      </section>
    );
  }

  if (!ahora) {
    return (
      <section className="rounded-2xl border-2 border-[var(--rule-base)] p-4">
        <Cabecera />
        <div className="mt-3 h-24 animate-pulse rounded-xl bg-[var(--surface-sunken)]" />
      </section>
    );
  }

  const total = ahora.totalCount;
  const sin = ahora.sinConstanciaCount ?? 0;
  const con = Math.max(0, total - sin);
  const pct = total > 0 ? Math.round((con / total) * 100) : 0;

  return (
    <section className="space-y-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <Cabecera />

      {/* ── 1 · Lo que el libro puede probar ─────────────────────────────── */}
      {total === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">No hay asientos vivos en este período.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-2xl font-bold tabular-nums text-[var(--text-primary)]">
              {con}/{total}
            </span>
            <span className="text-sm text-[var(--text-secondary)]">
              asientos con su constancia del SNIFFS guardada
              <span className="ml-1 font-mono tabular-nums text-[var(--text-tertiary)]">({pct} %)</span>
            </span>
          </div>

          {/* La barra dice de un vistazo qué parte del libro está respaldada. */}
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]"
            role="img"
            aria-label={`${pct} por ciento de los asientos con constancia del SNIFFS`}
          >
            <div
              className={`h-full rounded-full transition-[width] ${pct >= 90 ? "bg-[var(--data-success-500)]" : pct >= 50 ? "bg-[var(--data-warning-500)]" : "bg-[var(--data-error-500)]"}`}
              style={{ width: `${pct}%` }}
            />
          </div>

          {sin > 0 && (
            <button
              type="button"
              onClick={onNavigate}
              className="flex w-full items-center gap-2 rounded-xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] px-3 py-2 text-left text-sm text-[var(--data-warning-700)] transition-colors hover:border-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]"
            >
              <span className="min-w-0 flex-1">
                <b>
                  {sin} {sin === 1 ? "guía" : "guías"} sin constancia
                </b>{" "}
                — el libro no puede probar que SERFOR las conoce. Es lo primero que se pide en una
                fiscalización; se carga al consultar la guía en el SNIFFS.
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
            </button>
          )}
        </>
      )}

      {/* ── 2 · Contra el período de al lado ─────────────────────────────── */}
      {antes && previo ? (
        <div className="grid gap-2 border-t-2 border-[var(--rule-base)] pt-3 sm:grid-cols-3">
          <Delta label="Asientos" ahora={ahora.totalCount} antes={antes.totalCount} />
          <Delta label="Volumen" ahora={ahora.totalVolumeM3} antes={antes.totalVolumeM3} unidad="m³" dec={2} />
          <Delta label="Piezas" ahora={ahora.totalPieces} antes={antes.totalPieces} />
          <p className="text-xs text-[var(--text-tertiary)] sm:col-span-3">
            Contra <b className="text-[var(--text-secondary)]">{previo.label}</b> — mismo largo de período,
            para que el porcentaje signifique algo.
          </p>
        </div>
      ) : (
        <p className="border-t-2 border-[var(--rule-base)] pt-3 text-xs text-[var(--text-tertiary)]">
          {previo
            ? "No se pudo leer el período anterior para comparar."
            : "«Todo el histórico» no tiene un período anterior contra el cual compararse. Elegí un mes, un trimestre o un año."}
        </p>
      )}
    </section>
  );
}

function Delta({
  label,
  ahora,
  antes,
  unidad,
  dec = 0,
}: {
  label: string;
  ahora: number;
  antes: number;
  unidad?: string;
  dec?: number;
}) {
  const v = variacion(ahora, antes);
  const Icono = v == null || v === 0 ? Minus : v > 0 ? TrendingUp : TrendingDown;
  /* Sin juicio de valor en el color: más ingresos no es «bueno» ni «malo», es
     más. El tono dice la DIRECCIÓN, no si conviene. */
  const tono = v == null || v === 0 ? "text-[var(--text-tertiary)]" : "text-[var(--text-secondary)]";

  return (
    <div>
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        {label}
      </p>
      <p className="font-mono text-lg font-bold tabular-nums text-[var(--text-primary)]">
        {fmt(ahora, dec)}
        {unidad && <span className="ml-1 text-sm font-normal text-[var(--text-tertiary)]">{unidad}</span>}
      </p>
      <p className={`inline-flex items-center gap-1 text-xs ${tono}`}>
        <Icono className="h-3.5 w-3.5" aria-hidden="true" />
        {v == null ? (
          /* Antes fue 0: no hay porcentaje posible, y «+∞ %» sería un chiste
             en un libro que se presenta ante una autoridad. */
          <>sin base anterior</>
        ) : (
          <>
            {v > 0 ? "+" : ""}
            {v} % · antes {fmt(antes, dec)}
          </>
        )}
      </p>
    </div>
  );
}

function Cabecera() {
  return (
    <div className="flex items-center gap-2">
      <ShieldCheck className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden="true" />
      <CardTitle className="text-sm font-bold">Cuadre contra el SNIFFS</CardTitle>
    </div>
  );
}
