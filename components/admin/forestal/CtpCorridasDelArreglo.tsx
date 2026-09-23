"use client";

/**
 * Las corridas que cobra o recotiza un arreglo del trato, plegadas (ADR-430).
 * Lo comparten la ficha del cliente (`CtpTratoSinCobrar`) y la línea del trato
 * (`CtpLineaDelTrato`): el botón que cobra nunca va sin poder ver QUÉ cobra.
 * Las ya cobradas con la planta muestran el antes → después.
 */
import { formatCurrency, formatNumber } from "@/lib/format";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import type { ArregloDelTrato, CorridaAvisada } from "@/lib/forestal/trato-sin-cobrar";

function Fila({ c, hoy, antes }: { c: CorridaAvisada; hoy: string; antes?: boolean }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 tabular-nums">
      <span className="font-semibold text-[var(--text-primary)]">N° {c.lineNo ?? "—"}</span>
      <span>{etiquetaLarga(c.fecha, hoy)}</span>
      <span>{c.especie ?? "sin especie"}</span>
      <span className="font-mono">{formatNumber(c.pt, 2)} PT</span>
      <span className="font-mono text-[var(--text-primary)]">
        {antes && c.importeActual != null ? `${formatCurrency(c.importeActual)} → ` : ""}
        {formatCurrency(c.importeConTrato)}
      </span>
    </li>
  );
}

export default function CtpCorridasDelArreglo({
  a,
  hoy,
  className = "",
}: {
  a: Pick<ArregloDelTrato, "sinCobrar" | "cambian">;
  hoy: string;
  className?: string;
}) {
  const n = a.sinCobrar.length + a.cambian.length;
  if (n === 0) return null;
  return (
    <details className={`text-xs text-[var(--text-secondary)] ${className}`}>
      <summary className="cursor-pointer select-none font-medium text-[var(--text-primary)]">
        Ver {n === 1 ? "la corrida" : `las ${n} corridas`}
      </summary>
      <ul className="mt-1 space-y-0.5">
        {a.sinCobrar.map((c) => (
          <Fila key={c.id} c={c} hoy={hoy} />
        ))}
        {a.cambian.map((c) => (
          <Fila key={c.id} c={c} hoy={hoy} antes />
        ))}
      </ul>
    </details>
  );
}
