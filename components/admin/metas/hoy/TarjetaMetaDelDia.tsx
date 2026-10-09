/**
 * TarjetaMetaDelDia — lo vendido hoy contra la meta diaria de ventas de la base
 * (la misma que la tarjeta de «Metas»), con la marca del ritmo según la hora y
 * una línea de cómo va. Sin meta: sólo lo vendido.
 */
import { BarraAvance } from "@/components/admin/metas/BarraAvance";
import { TEXTO_TONO } from "@/components/admin/metas/clases-meta";
import { estadoDeMeta } from "@/lib/admin/metas-periodo";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fraccionDelHorario, HORA_APERTURA, lineaDelDia } from "./hoy-calculos";

const soles = (n: number) =>
  formatCurrency(n, { decimals: Number.isInteger(n) || Math.abs(n) >= 1000 ? 0 : 2 });

export function TarjetaMetaDelDia({
  total,
  meta,
  horaActual,
  cargando,
}: {
  total: number;
  /** El objetivo de la meta diaria de ventas; `null` si no hay. */
  meta: number | null;
  horaActual: number;
  cargando: boolean;
}) {
  if (cargando) {
    return (
      <div
        className="space-y-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5"
        aria-busy="true"
      >
        <div className="mx-auto h-10 w-1/2 animate-pulse rounded bg-[var(--surface-sunken)]" />
        <div className="h-2.5 w-full animate-pulse rounded-full bg-[var(--surface-sunken)]" />
      </div>
    );
  }
  const conMeta = meta !== null && meta > 0;
  const estado = conMeta
    ? estadoDeMeta({ avance: total, target: meta, esperado: null, sentido: "sube", cerrada: false })
    : null;
  const linea = conMeta ? lineaDelDia(total, meta, horaActual, soles) : null;
  const cumplida = estado === "cumplida";
  return (
    <div
      className={cn(
        "rounded-xl border p-5",
        cumplida
          ? "border-[var(--data-success)]/40 bg-[var(--data-success)]/10"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)]",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-center gap-x-2 text-center">
        <span className="text-4xl font-black leading-none tracking-tight tabular-nums text-[var(--text-primary)] sm:text-5xl">
          {formatCurrency(total)}
        </span>
        <span className="text-sm font-medium text-[var(--text-secondary)]">
          {conMeta ? (
            <>
              de <b className="tabular-nums">{soles(meta)}</b> · meta del día
            </>
          ) : (
            "vendido hoy"
          )}
        </span>
      </div>
      {conMeta && estado && linea && (
        <div className="mt-4 space-y-2">
          <BarraAvance
            avance={total}
            target={meta}
            esperado={horaActual < HORA_APERTURA ? null : meta * fraccionDelHorario(horaActual)}
            estado={estado}
            etiqueta={`${formatCurrency(total)} de ${soles(meta)}`}
            ritmo={soles(meta * fraccionDelHorario(horaActual))}
          />
          <p className={cn("text-center text-sm font-semibold", TEXTO_TONO[linea.tono])}>
            {linea.texto}
          </p>
        </div>
      )}
    </div>
  );
}
