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
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { BulejeLineChart } from "@/components/ui-system/charts";
import { useCtpComplianceSerie, type ComplianceSnapshot } from "@/hooks/use-ctp-compliance-serie";
import { densificarPorDia, queCambio, tramosSinMedir } from "@/lib/forestal/compliance-historia";
import type { CtpPeriodKey } from "@/lib/forestal/ctp-period";
import { formatDateShort } from "@/lib/format";

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
  formatDateShort(`${f}T00:00:00Z`, { soloFecha: true });

export default function CtpComplianceHistoria({
  periodo,
  periodLabel,
  especieFiltrada,
}: {
  periodo: CtpPeriodKey;
  periodLabel: string;
  /**
   * La especie que el panel de arriba tiene puesta (ADR-400), sólo para
   * decirlo. La serie NUNCA se recorta: guarda el puntaje DEL PERÍODO, y sin
   * este aviso el gauge marcando 85 sobre una línea que viene en 70 se lee
   * como que la historia está mal.
   */
  especieFiltrada?: string;
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
      <section className="rounded-2xl border border-dashed border-[var(--rule-base)] p-4">
        <Cabecera periodLabel={periodLabel} />
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {error ? "No se pudo leer la historia del cumplimiento." : "Todavía no hay historia: la serie arranca hoy."}
        </p>
      </section>
    );
  }

  if (loading && !serie) {
    return (
      <section className="rounded-2xl border border-[var(--rule-base)] p-4">
        <Cabecera periodLabel={periodLabel} />
        <div className="mt-3 h-[200px] animate-pulse rounded-xl bg-[var(--surface-sunken)]" />
      </section>
    );
  }

  const puntos = serie ?? [];
  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];
  /** Piso del eje: redondeado a la decena de abajo, con una ventana mínima de 20. */
  const piso = Math.max(0, Math.min(80, Math.floor(Math.min(...puntos.map((p) => p.score)) / 10) * 10 - 10));
  const delta = ultimo.score - primero.score;
  const Icono = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const tono =
    delta > 0
      ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
      : delta < 0
        ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
        : "text-[var(--text-tertiary)]";

  return (
    <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
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

      {especieFiltrada && (
        <p className="mt-1 text-sm font-bold text-[var(--text-secondary)]">
          Esta línea es del período completo, no sólo de {especieFiltrada}: se guarda un punto por
          día con el puntaje de todo el libro.
        </p>
      )}

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
            /* El eje llega SIEMPRE a 100 —el techo es parte del significado— y
               el piso baja hasta donde estuvo la serie. Con el eje desde cero,
               un libro que vive entre 90 y 100 dibujaba una raya pegada al
               borde: 95 constante y una caída a 88 se ven idénticos, y el
               gráfico deja de contestar la única pregunta que tiene («¿esto
               empeora?»). La ventana nunca baja de 20 puntos, así que tampoco
               exagera un movimiento chico. */
            yDomain={[piso, 100]}
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
          </>
        )}
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
      <InfoTip
        title="Cómo viene el cumplimiento"
        what="Se guarda un punto por cada día que abres el libro: los días que nadie entra no tienen punto, y la línea se corta ahí."
        affects="Compara la medición de hoy contra la anterior, y dice qué categoría movió el número."
        example="85/100 hoy contra 70/100 hace tres semanas: subió porque bajaron los ingresos fuera de plazo."
      />
    </div>
  );
}
