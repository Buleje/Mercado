"use client";

/**
 * ChartTooltip — EL tooltip de los gráficos del panel (contrato de diseño, ADR-489).
 *
 * Uso: `<Tooltip content={<ChartTooltip formato={soles} />} />` (recharts le
 * inyecta `active`, `payload` y `label`).
 * - Título: un `label` «AAAA-MM-DD» se lee «jueves 01/10»; `titulo(fila)` lo pisa.
 * - Cifras: `formato(valor, nombre)`; sin formato, el número en es-PE.
 * - `detalle(fila)`: una línea extra («3 órdenes · S/ 600 sin pagar»).
 * - Colores: los de cada serie (salen de `chart-palette.ts`, nunca hex).
 *
 * Base: el tooltip del Resumen del Inicio (`inicio/resumen/graficos-resumen.tsx`),
 * el último que revisó Brandon (09-10). Reemplaza en la ola 5 a los ~33
 * tooltips propios y a los 3 genéricos que conviven (ui-system/charts,
 * lib/chart-tooltip, inicio/_shared/ChartCard).
 */
import { fechaConDia } from "@/lib/admin/inicio/formato-tablero";
import { formatNumber } from "@/lib/format";

type Fila = Record<string, unknown>;

interface EntradaTooltip {
  name?: unknown;
  value?: unknown;
  color?: string;
  fill?: string;
  dataKey?: unknown;
  payload?: unknown;
}

export interface ChartTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<EntradaTooltip>;
  label?: unknown;
  /** Cómo se escribe cada cifra (p. ej. `soles` de formato-tablero). */
  formato?: (valor: number, nombre: string) => string;
  /** Título a partir de la fila (p. ej. «jueves 01/10 · 18 ventas»). */
  titulo?: (fila: Fila) => string;
  /** Línea extra bajo las cifras; `null` no dibuja nada. */
  detalle?: (fila: Fila) => React.ReactNode;
  /** Sin las series que valen 0 (gráficos apilados con muchas series). */
  ocultarCeros?: boolean;
}

const ES_DIA = /^\d{4}-\d{2}-\d{2}$/;

function tituloDe(label: unknown): string {
  if (label == null || label === "") return "";
  const texto = String(label);
  return ES_DIA.test(texto) ? fechaConDia(texto) : texto;
}

function cifra(valor: unknown, nombre: string, formato?: ChartTooltipProps["formato"]): string {
  const n = typeof valor === "number" ? valor : typeof valor === "string" && valor.trim() !== "" ? Number(valor) : NaN;
  if (!Number.isFinite(n)) return valor == null ? "—" : String(valor);
  return formato ? formato(n, nombre) : formatNumber(n);
}

export function ChartTooltip({ active, payload, label, formato, titulo, detalle, ocultarCeros }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const fila = (payload[0]?.payload ?? {}) as Fila;
  const cabeza = titulo ? titulo(fila) : tituloDe(label);
  const series = ocultarCeros ? payload.filter((p) => Number(p.value) !== 0) : payload;
  const extra = detalle?.(fila);

  return (
    <div className="min-w-[11rem] border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-sm shadow-[var(--shadow-md)]">
      {cabeza && <p className="mb-1 font-bold text-[var(--text-primary)]">{cabeza}</p>}
      {series.map((p, i) => {
        const nombre = String(p.name ?? p.dataKey ?? "");
        return (
          <div key={`${nombre}-${i}`} className="flex items-center gap-2 py-0.5">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: p.color ?? p.fill ?? "var(--data-3)" }}
            />
            <span className="font-medium text-[var(--text-secondary)]">{nombre}</span>
            <span className="ml-auto pl-3 font-extrabold tabular-nums text-[var(--text-primary)]">
              {cifra(p.value, nombre, formato)}
            </span>
          </div>
        );
      })}
      {extra != null && extra !== "" && (
        <p className="mt-1 text-xs font-medium text-[var(--text-tertiary)]">{extra}</p>
      )}
    </div>
  );
}

export default ChartTooltip;
