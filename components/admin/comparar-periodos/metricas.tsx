"use client";

/**
 * Las métricas de Comparar períodos y cómo se pintan (tabla en pantalla
 * ancha, lista en el celular). Partido de `PeriodComparatorTab.tsx` para
 * quedar bajo 300 líneas.
 */
import { Minus, TrendingDown, TrendingUp } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/format";
import { variacion, type PeriodoDeComparacion } from "@/lib/finance/comparativo-periodos";

export type Clave = Exclude<keyof PeriodoDeComparacion, "desde" | "hasta" | "etiqueta">;
export type Tipo = "plata" | "numero" | "pct";
/** Qué dirección es buena. «neutro»: el costo sube con las ventas, no es ni bueno ni malo. */
export type Sentido = "subir" | "bajar" | "neutro";

export const METRICAS: { key: Clave; label: string; tipo: Tipo; sentido: Sentido }[] = [
  { key: "ventas", label: "Ventas", tipo: "plata", sentido: "subir" },
  { key: "transacciones", label: "Ventas y pedidos", tipo: "numero", sentido: "subir" },
  { key: "ticketPromedio", label: "Ticket promedio", tipo: "plata", sentido: "subir" },
  { key: "margen", label: "Margen bruto", tipo: "pct", sentido: "subir" },
  { key: "costoDeVentas", label: "Costo de lo vendido", tipo: "plata", sentido: "neutro" },
  { key: "clientesUnicos", label: "Clientes únicos", tipo: "numero", sentido: "subir" },
  { key: "clientesNuevos", label: "Clientes nuevos", tipo: "numero", sentido: "subir" },
  { key: "fiadoDado", label: "Fiado dado", tipo: "plata", sentido: "bajar" },
  { key: "devoluciones", label: "Devoluciones", tipo: "plata", sentido: "bajar" },
];

export function valor(tipo: Tipo, v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (tipo === "plata") return formatCurrency(v);
  if (tipo === "pct") return `${v.toFixed(1)} %`;
  return formatNumber(v);
}

/** El margen ya es un %: su cambio va en puntos (40 % → 50 % = +10 pts, no «+25 %»). */
export function cambioDe(tipo: Tipo, a: number | null, b: number | null): number | null {
  if (tipo !== "pct") return variacion(a, b);
  return a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)
    ? null
    : Math.round((a - b) * 10) / 10;
}
export const unidad = (tipo: Tipo) => (tipo === "pct" ? "pts" : "%");

export function esMejora(cambio: number | null, sentido: Sentido): boolean | null {
  if (cambio == null || sentido === "neutro" || Math.abs(cambio) < 0.5) return null;
  return sentido === "subir" ? cambio > 0 : cambio < 0;
}

export function Cambio({
  cambio,
  sentido,
  tipo,
}: {
  cambio: number | null;
  sentido: Sentido;
  tipo: Tipo;
}) {
  if (cambio == null) {
    return (
      <span
        className="text-sm text-[var(--text-tertiary)]"
        title="Sin base para comparar: el otro período está en cero o sin dato"
      >
        —
      </span>
    );
  }
  const mejora = esMejora(cambio, sentido);
  const Icono = Math.abs(cambio) < 0.5 ? Minus : cambio > 0 ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-sm font-bold tabular-nums",
        mejora == null
          ? "text-[var(--text-secondary)]"
          : mejora
            ? "text-[var(--data-success-ink)]"
            : "text-[var(--data-error-ink)]",
      )}
    >
      <Icono className="h-4 w-4" aria-hidden />
      {cambio > 0 ? "+" : ""}
      {cambio.toFixed(1)} {unidad(tipo)}
    </span>
  );
}

/** Una métrica ya con sus dos valores y el cambio. */
export type Fila = (typeof METRICAS)[number] & {
  a: number | null;
  b: number | null;
  cambio: number | null;
};

/**
 * En el celular, una fila por métrica (nombre y cifra; debajo, el otro
 * período y el cambio): las tarjetas automáticas de `.admin-mobile-cards`
 * daban 9 tarjetas de 185 px y se perdía la comparación lado a lado.
 */
export function ListaMovil({
  filas,
  etiquetaActual,
  etiquetaBase,
}: {
  filas: Fila[];
  etiquetaActual: string;
  etiquetaBase: string;
}) {
  return (
    <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] sm:hidden">
      <li className="px-4 py-2 text-sm font-bold text-[var(--text-primary)]">
        {etiquetaActual}{" "}
        <span className="font-semibold text-[var(--text-secondary)]">contra {etiquetaBase}</span>
      </li>
      {filas.map((f) => (
        <li key={f.key} className="px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold text-[var(--text-primary)]">{f.label}</span>
            <span className="text-base font-bold tabular-nums text-[var(--text-primary)]">
              {valor(f.tipo, f.a)}
            </span>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-3">
            <span className="text-sm tabular-nums text-[var(--text-secondary)]">
              {etiquetaBase}: {valor(f.tipo, f.b)}
            </span>
            <Cambio cambio={f.cambio} sentido={f.sentido} tipo={f.tipo} />
          </div>
        </li>
      ))}
    </ul>
  );
}
