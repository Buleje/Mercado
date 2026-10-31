import { cantidad, soles } from "@/lib/admin/inicio/formato-tablero";

/**
 * Ranking del tablero del Resumen (2026-10-29): una fila por producto,
 * proveedor o categoría con la cifra exacta a la derecha, su detalle debajo y
 * una barra de datos de fondo proporcional al primero. Reemplaza al gráfico de
 * barras horizontales en las tarjetas angostas: allí el nombre se cortaba en
 * dos líneas («Shampoo Matizad…») y la cifra exacta sólo salía al pasar el mouse.
 */
export function RankingTablero<T>({
  data,
  nombre,
  valor,
  formato,
  color,
  detalle,
  max = 7,
}: {
  data: readonly T[];
  nombre: (fila: T) => string;
  valor: (fila: T) => number;
  formato: "soles" | "cantidad";
  /** Color de la barra de fondo (token del concepto). */
  color: string;
  detalle?: (fila: T) => string | null | undefined;
  max?: number;
}) {
  const filas = data.slice(0, max);
  const tope = Math.max(0, ...filas.map((f) => valor(f)));
  const fmt = (v: number) => (formato === "soles" ? soles(v) : cantidad(v));
  return (
    <ol className="space-y-1">
      {filas.map((f, i) => {
        const n = nombre(f);
        const v = valor(f);
        const d = detalle?.(f) ?? null;
        const ancho = tope > 0 ? Math.max(2, (v / tope) * 100) : 0;
        return (
          <li
            key={`${n}-${i}`}
            title={`${n} · ${fmt(v)}${d ? ` · ${d}` : ""}`}
            className="relative isolate overflow-hidden rounded-[3px] px-2 py-1"
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 -z-10 opacity-20"
              style={{ width: `${ancho}%`, backgroundColor: color }}
            />
            <div className="flex items-baseline gap-2 text-sm">
              <span className="w-4 shrink-0 text-right font-bold tabular-nums text-[var(--text-tertiary)]">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-semibold text-[var(--text-primary)]">{n}</span>
              <span className="shrink-0 font-extrabold tabular-nums text-[var(--text-primary)]">{fmt(v)}</span>
            </div>
            {d && <p className="truncate pl-6 text-sm font-medium text-[var(--text-secondary)]">{d}</p>}
          </li>
        );
      })}
    </ol>
  );
}
