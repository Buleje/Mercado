"use client";

/**
 * CtpComplianceHistoria — cómo VIENE el cumplimiento, no cómo está (ADR-384).
 *
 * El gauge de arriba contesta «¿cómo estoy hoy?». Esto contesta las tres que un
 * fiscalizador hace en voz alta y el dueño se hace en silencio:
 *
 *   ¿esto viene mejorando o empeorando?
 *   cuando corregimos los 12 fuera de plazo, ¿cuánto subió?
 *   ¿desde cuándo hay stock negativo?
 *
 * La serie es lo que el panel guardó cada día que alguien abrió el libro — el
 * mismo número que se vio en pantalla, no una recomposición. Por eso hay huecos
 * los días que nadie entró, y se dicen con esas palabras: una línea recta sobre
 * tres semanas sin medir afirmaría un dato que no existe.
 */

import { useMemo } from "react";
import { CardTitle } from "@buleje/design-system";
import { History, Minus, TrendingDown, TrendingUp } from "@buleje/design-system/icons";
import { BulejeLineChart } from "@/components/ui-system/charts";
import { useCtpComplianceSerie, type ComplianceSnapshot } from "@/hooks/use-ctp-compliance-serie";
import { densificarPorDia, queCambio, tramosSinMedir } from "@/lib/forestal/compliance-historia";
import type { CtpPeriodKey } from "@/lib/forestal/ctp-period";

/** Las cinco que restan puntos, con el nombre que usa el desglose del score. */
const CATEGORIAS = [
  { key: "fueraPlazo", label: "fuera de plazo" },
  { key: "pendientes", label: "pendientes de validar" },
  { key: "especiesEnNegativo", label: "especies en negativo" },
  { key: "stockNegativo", label: "stock negativo" },
  { key: "despachosSinTraza", label: "despachos sin traza" },
] as const satisfies readonly { key: keyof ComplianceSnapshot; label: string }[];

/** `yyyy-mm-dd` → «3 sep». UTC: la columna es date-only (off-by-one de Lima). */
const dia = (f: string) =>
  new Date(`${f}T00:00:00Z`).toLocaleDateString("es-PE", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

export default function CtpComplianceHistoria({
  periodo,
  periodLabel,
}: {
  periodo: CtpPeriodKey;
  periodLabel: string;
}) {
  const { serie, loading, error } = useCtpComplianceSerie(periodo, 90);

  /* El eje X es el CALENDARIO, no la lista de mediciones: sin densificar,
     Recharts dibuja seis puntos de días separados como equidistantes. */
  const datos = useMemo(
    () => densificarPorDia(serie ?? []).map((p) => ({ dia: dia(p.fecha), score: p.score })),
    [serie],
  );

  /* El gráfico ya muestra los huecos como corte de línea; el número los pone
     en palabras. */
  const huecos = useMemo(() => tramosSinMedir(serie ?? []), [serie]);

  const cambios = useMemo(() => queCambio(serie ?? [], CATEGORIAS), [serie]);

  if (error || (!loading && (serie?.length ?? 0) === 0)) {
    return (
      <section className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-4">
        <Cabecera periodLabel={periodLabel} />
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {error
            ? "No se pudo leer la historia del cumplimiento."
            : "Todavía no hay historia: la serie arranca hoy. Se guarda un punto cada día que abrís el libro — los días que nadie entra no tienen punto, y eso también dice algo."}
        </p>
      </section>
    );
  }

  if (loading && !serie) {
    return (
      <section className="rounded-2xl border-2 border-[var(--rule-base)] p-4">
        <Cabecera periodLabel={periodLabel} />
        <div className="mt-3 h-[200px] animate-pulse rounded-xl bg-[var(--surface-sunken)]" />
      </section>
    );
  }

  const puntos = serie ?? [];
  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];
  const delta = ultimo.score - primero.score;
  const Icono = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const tono =
    delta > 0
      ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
      : delta < 0
        ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
        : "text-[var(--text-tertiary)]";

  return (
    <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Cabecera periodLabel={periodLabel} />
        <p className={`inline-flex items-baseline gap-1.5 text-sm font-bold ${tono}`}>
          <Icono className="h-4 w-4 self-center" aria-hidden="true" />
          {delta > 0 ? "+" : ""}
          {delta} pts
          <span className="font-normal text-[var(--text-tertiary)]">
            desde el {dia(primero.fecha)}
          </span>
        </p>
      </div>

      {puntos.length === 1 ? (
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Un solo punto por ahora: <b className="text-[var(--text-primary)]">{ultimo.score}/100</b> el{" "}
          {dia(ultimo.fecha)}. Mañana ya hay línea.
        </p>
      ) : (
        <div className="mt-3">
          <BulejeLineChart
            data={datos}
            xKey="dia"
            series={[{ key: "score", label: "Score" }]}
            height={200}
            /* Con hueco, los puntos son la única marca de qué días SÍ se midió. */
            showDots={datos.length <= 45}
            format={(v) => `${v}/100`}
          />
        </div>
      )}

      {/* Lo accionable: qué categoría movió el número. «Bajó 18 pts» no dice qué
          hacer; «aparecieron 4 ingresos fuera de plazo» sí. */}
      {cambios.length > 0 && (
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Contra la medición anterior:{" "}
          {cambios.slice(0, 3).map((c, i) => (
            <span key={c.label}>
              {i > 0 && ", "}
              <b className={c.delta > 0 ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"}>
                {c.delta > 0 ? "+" : ""}
                {c.delta}
              </b>{" "}
              {c.label}
            </span>
          ))}
          .
        </p>
      )}

      <p className="mt-2 text-xs text-[var(--text-tertiary)]">
        {puntos.length} {puntos.length === 1 ? "medición" : "mediciones"} en los últimos 90 días
        {huecos > 0 && (
          <>
            {" · "}
            <b className="text-[var(--text-secondary)]">
              {huecos} {huecos === 1 ? "tramo" : "tramos"} sin medir
            </b>
    : la línea se corta ahí porque nadie miró esos días
          </>
        )}
        . Se guarda un punto por cada día que se abre el libro.
      </p>
    </section>
  );
}

function Cabecera({ periodLabel }: { periodLabel: string }) {
  return (
    <div className="flex items-center gap-2">
      <History className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden="true" />
      <CardTitle className="text-sm font-bold">
        Cómo viene el cumplimiento{" "}
        <span className="font-normal text-[var(--text-tertiary)]">· {periodLabel}</span>
      </CardTitle>
    </div>
  );
}
