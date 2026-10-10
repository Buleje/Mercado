/**
 * GraficoPorHora — lo vendido en cada hora de Lima, con la marca de ayer a la
 * misma hora. La hora actual va en ámbar. Sin interactividad: el detalle de
 * cada barra va en su `title` y en el texto para lector de pantalla.
 */
import { CardTitle } from "@buleje/design-system";
import { TrendingUp } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TramoVenta } from "@/lib/metas/logros-reglas";
import { etiquetaHora } from "./hoy-calculos";

const pct = (v: number, max: number) => (max > 0 ? (v / max) * 100 : 0);

export function GraficoPorHora({
  horas,
  horasAyer,
  visibles,
  horaActual,
}: {
  horas: readonly TramoVenta[];
  horasAyer: readonly TramoVenta[];
  /** Las horas que se dibujan, en orden. */
  visibles: readonly number[];
  horaActual: number;
}) {
  const max = Math.max(
    1,
    ...visibles.map((h) => Math.max(horas[h]?.total ?? 0, horasAyer[h]?.total ?? 0)),
  );
  return (
    <section
      aria-labelledby="metas-hoy-por-hora"
      className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4"
    >
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <TrendingUp
          aria-hidden="true"
          className="h-4 w-4 text-[var(--accent-ink)] dark:text-[var(--accent)]"
        />
        <CardTitle id="metas-hoy-por-hora" className="text-sm font-bold">
          Ventas por hora
        </CardTitle>
        <InfoTip
          title="Ventas por hora"
          what="Lo que entró en cada hora de Lima: ventas del POS más pedidos confirmados, en camino o entregados."
          body="La raya gris es lo que vendiste ayer a esa misma hora; la barra ámbar es la hora en que estás."
        />
        <span className="ml-auto flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-[var(--accent)]" /> Hoy
          </span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="h-0.5 w-3 rounded-full bg-[var(--text-tertiary)]" />{" "}
            Ayer
          </span>
        </span>
      </div>
      <ol className="flex items-end gap-0.5 sm:gap-1" aria-label="Ventas de hoy por hora">
        {visibles.map((h, i) => {
          const hoy = horas[h] ?? { total: 0, n: 0 };
          const ayer = horasAyer[h] ?? { total: 0, n: 0 };
          const actual = h === horaActual;
          const futura = h > horaActual;
          const texto = `${etiquetaHora(h)}: ${formatCurrency(hoy.total)} (${hoy.n} ${hoy.n === 1 ? "venta" : "ventas"}) · ayer ${formatCurrency(ayer.total)}`;
          return (
            <li key={h} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={texto}>
              <span className="sr-only">{texto}</span>
              <span
                aria-hidden="true"
                className="relative flex h-[4.5rem] w-full items-end sm:h-28"
              >
                <span
                  className={cn(
                    "w-full rounded-t transition-[height] duration-[var(--dur-slow)]",
                    actual
                      ? "bg-[var(--data-warning)]"
                      : hoy.total > 0
                        ? "bg-[var(--accent)]"
                        : futura
                          ? "bg-transparent"
                          : "bg-[var(--surface-sunken)]",
                  )}
                  style={{ height: `${Math.max(pct(hoy.total, max), hoy.total > 0 ? 6 : 3)}%` }}
                />
                {ayer.total > 0 && (
                  <span
                    className="absolute inset-x-0 h-0.5 rounded-full bg-[var(--text-tertiary)]"
                    style={{ bottom: `${pct(ayer.total, max)}%` }}
                  />
                )}
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "text-[length:var(--ts-2xs)] leading-none tabular-nums",
                  actual
                    ? "font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                    : "text-[var(--text-tertiary)]",
                  i % 2 === 1 && !actual && "invisible sm:visible",
                )}
              >
                {etiquetaHora(h)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
