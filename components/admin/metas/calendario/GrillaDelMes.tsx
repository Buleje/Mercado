/**
 * GrillaDelMes — los días del mes de Lima, de lunes a domingo, pintados según
 * la meta diaria de ventas (o la intensidad de lo vendido si no hay meta).
 * Cada día dice su venta en el `title` y para el lector de pantalla.
 */
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { VentasPorDia } from "@/lib/metas/logros-reglas";
import {
  CLASE_TONO,
  INICIALES_SEMANA,
  diasDelMes,
  montoCorto,
  tonoDelDia,
} from "./calendario-calculos";

export function GrillaDelMes({
  mes,
  dias,
  hoy,
  metaDiaria,
  maximo,
}: {
  mes: string;
  dias: VentasPorDia;
  hoy: string;
  metaDiaria: number | null;
  maximo: number;
}) {
  const { dias: fechas, huecos } = diasDelMes(mes);
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 pb-1" aria-hidden="true">
        {INICIALES_SEMANA.map((d, i) => (
          <span key={i} className="text-center text-xs font-bold text-[var(--text-tertiary)]">
            {d}
          </span>
        ))}
      </div>
      <ol className="grid grid-cols-7 gap-1" aria-label="Ventas de cada día del mes">
        {Array.from({ length: huecos }, (_, i) => (
          <li key={`hueco-${i}`} aria-hidden="true" />
        ))}
        {fechas.map((f) => {
          const t = dias[f];
          const tono = tonoDelDia(f, t, hoy, metaDiaria, maximo);
          const total = t?.total ?? 0;
          const texto = `${f.slice(8, 10)}/${f.slice(5, 7)}: ${formatCurrency(total)}${t ? ` · ${t.n} ${t.n === 1 ? "venta" : "ventas"}` : ""}`;
          return (
            <li
              key={f}
              title={texto}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center rounded-lg px-0.5 py-1 text-xs sm:min-h-14",
                CLASE_TONO[tono],
                f === hoy && "outline outline-2 outline-offset-1 outline-[var(--accent)]",
              )}
            >
              <span className="sr-only">{texto}</span>
              <span aria-hidden="true" className="font-bold tabular-nums">
                {Number(f.slice(8, 10))}
              </span>
              {total > 0 && (
                <span
                  aria-hidden="true"
                  className="hidden text-[length:var(--ts-2xs)] tabular-nums opacity-90 sm:block"
                >
                  {montoCorto(total)}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
