"use client";

import { CardTitle, LoadingState } from "@buleje/design-system";
import { ArrowRight, RefreshCw, TrendingDown, TrendingUp } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { montoTexto, nombreMes } from "@/components/admin/unified/finanzas/resultado/fuentes";
import { useResultadoDelMes, useVeLaPlataDelNegocio } from "@/hooks/use-resultado-del-mes";
import { cn, limaDateKey } from "@/lib/utils";
import { irEnElPanel } from "@/lib/admin/ir-en-el-panel";
import { margenDelResultado } from "@/lib/admin/margen-del-resultado";

/**
 * «Resultado del mes» en los Resúmenes automáticos de Mi Plata.
 *
 * Es el MISMO número que «Ganancias y pérdidas» (`useResultadoDelMes` → GET
 * /api/finanzas/resultado): el servidor suma ingresos y costos con sus reglas
 * (costo real de lo vendido, gastos, planilla, madera) y esta tarjeta sólo lo
 * pinta. Antes bajaba TODAS las ventas de /api/sales, las sumaba en el
 * navegador, estimaba el costo al 60 % y restaba un total de gastos sin fecha:
 * dos «ganancias» distintas en el mismo módulo.
 */
export default function ProfitLossAutoCard() {
  const mes = limaDateKey().slice(0, 7);
  const ve = useVeLaPlataDelNegocio();
  const { datos, cargando, error, sinPermiso, recargar } = useResultadoDelMes(ve === "si" ? mes : null, 1);
  const actual = datos && datos.actual.mes === mes ? datos.actual : null;
  const noLoVe = ve === "no" || sinPermiso;
  const aprox = actual?.estimado ?? false;
  // Margen = resultado ÷ ingresos, sobre los dos totales del servidor (no se suma nada acá).
  // Con ingresos casi en cero el margen se dispara (S/ 0,10 vendidos y S/ 18 de costo = −18 190 %):
  // pasado ±999 % no dice nada y no se muestra.
  const margen = actual ? margenDelResultado(actual.resultado, actual.totalIngresos) : null;

  return (
    <section
      className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5"
      aria-labelledby="resultado-auto-titulo"
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <CardTitle as="h3" id="resultado-auto-titulo" className="text-sm font-bold">
            Resultado de {nombreMes(mes)}
          </CardTitle>
          <InfoTip
            title="Resultado del mes"
            what="Lo que entró menos lo que costó, con el mismo cálculo de Ganancias y pérdidas."
            affects="Si algún costo es estimado o le falta un dato, la cifra sale con ≈."
            example="Ingresos S/ 4,000 − costos S/ 3,100 = resultado S/ 900."
          />
        </div>
        <button
          type="button"
          onClick={recargar}
          disabled={cargando || ve !== "si"}
          aria-label="Actualizar el resultado"
          title="Actualizar"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", cargando && "animate-spin")} aria-hidden />
        </button>
      </header>

      <div className="mt-3">
        {noLoVe ? (
          <p className="py-4 text-sm text-[var(--text-secondary)]">El resultado del negocio lo ve sólo el dueño.</p>
        ) : error ? (
          <p className="py-4 text-sm text-[var(--data-error-500)]">{error}</p>
        ) : !actual ? (
          <LoadingState />
        ) : (
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between border-b border-[var(--rule-soft)] py-2">
              <dt className="text-[var(--text-secondary)]">Ingresos</dt>
              <dd className="font-semibold tabular-nums text-[var(--text-primary)]">{montoTexto(actual.totalIngresos)}</dd>
            </div>
            <div className="flex items-center justify-between border-b border-[var(--rule-soft)] py-2">
              <dt className="pl-3 text-[var(--text-tertiary)]">− Costos y gastos</dt>
              <dd className="font-semibold tabular-nums text-[var(--data-error-500)]">
                {montoTexto(actual.totalCostos, { aproximado: aprox })}
              </dd>
            </div>
            <div className="flex items-center justify-between pt-2">
              <dt className="font-bold text-[var(--text-primary)]">Resultado</dt>
              <dd
                className={cn(
                  "text-base font-bold tabular-nums",
                  actual.resultado >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]",
                )}
              >
                {montoTexto(actual.resultado, { aproximado: aprox, signo: true })}
              </dd>
            </div>
            {margen != null && (
              <div className="flex items-center justify-between border-t border-[var(--rule-soft)] pt-2">
                <dt className="text-xs text-[var(--text-tertiary)]">Margen</dt>
                <dd
                  className={cn(
                    "inline-flex items-center gap-1 text-sm font-bold tabular-nums",
                    margen >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]",
                  )}
                >
                  {margen >= 0 ? <TrendingUp className="h-4 w-4" aria-hidden /> : <TrendingDown className="h-4 w-4" aria-hidden />}
                  {aprox ? "≈ " : ""}
                  {margen >= 0 ? "+" : ""}
                  {margen.toFixed(1)}%
                </dd>
              </div>
            )}
          </dl>
        )}
      </div>

      {!noLoVe && (
        <a
          href="/admin?tab=plata&vista=pl"
          onClick={irEnElPanel}
          className="mt-3 inline-flex min-h-9 items-center gap-1 text-sm font-bold text-[var(--accent-dark)] hover:underline dark:text-[var(--accent)]"
        >
          Ver de dónde sale <ArrowRight className="h-4 w-4" aria-hidden />
        </a>
      )}
    </section>
  );
}
