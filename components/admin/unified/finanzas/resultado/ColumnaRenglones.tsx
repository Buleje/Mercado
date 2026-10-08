"use client";

/**
 * Una columna de cifras (Ingresos / Costos del resultado, Entró / Salió de la
 * caja): su total arriba, sus renglones, y los que están en cero plegados en
 * «+N sin movimiento». Plegar no es esconder: el total ya los incluye, y un
 * clic los muestra.
 *
 * El ⓘ de cada renglón va AFUERA de su botón (un botón dentro de otro plegaría
 * o abriría el detalle con cada clic en el ícono — test infotip-no-anidado).
 */

import { useId, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { ChevronRight } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import type { FuenteDetalle } from "@/lib/finance/resultado-del-negocio";
import { cuantosTexto, etiquetaFuente, montoTexto } from "./fuentes";

/** Un renglón listo para pintar: todo viene del servidor, acá no se calcula. */
export interface FilaDeCifra {
  fuente: FuenteDetalle;
  /** `null` = no se sabe → «—». */
  monto: number | null;
  aproximado: boolean;
  cuantos: number;
  /** «1,234 pt · 5.20 m³», o null. */
  medida: string | null;
  faltan: { cuantos: number; motivo: string } | null;
  /** De dónde sale (va al ⓘ). */
  nota: string;
}

/** Cero y sin nada pendiente = «sin movimiento». Un «—» o un faltante NO se pliega. */
export const sinMovimiento = (f: FilaDeCifra): boolean => f.monto === 0 && f.cuantos === 0 && !f.faltan;

function RenglonFila({ fila, onAbrir }: { fila: FilaDeCifra; onAbrir: (f: FuenteDetalle) => void }) {
  const label = etiquetaFuente(fila.fuente);
  const partes = [fila.medida, fila.cuantos > 0 ? cuantosTexto(fila.fuente, fila.cuantos) : null].filter(Boolean);
  const contenido = (
    <>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[var(--text-primary)]">{label}</span>
        {partes.length > 0 && (
          <span className="block text-xs text-[var(--text-secondary)] tabular-nums">{partes.join(" · ")}</span>
        )}
        {fila.faltan && (
          <span className="block text-xs font-medium text-[var(--data-warning-ink)]">Falta: {fila.faltan.motivo}</span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1 text-sm font-bold tabular-nums text-[var(--text-primary)]">
        {montoTexto(fila.monto, { aproximado: fila.aproximado })}
        {fila.cuantos > 0 && (
          <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)] transition-transform group-hover:translate-x-0.5" aria-hidden />
        )}
      </span>
    </>
  );
  const caja = "flex min-h-11 flex-1 items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left";
  return (
    <li className="flex items-center gap-1">
      {fila.cuantos > 0 ? (
        <button
          type="button"
          onClick={() => onAbrir(fila.fuente)}
          className={cn(
            caja,
            "group transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
          )}
          aria-label={`${label}: ${montoTexto(fila.monto, { aproximado: fila.aproximado })}. Ver el detalle`}
        >
          {contenido}
        </button>
      ) : (
        <div className={caja}>{contenido}</div>
      )}
      <InfoTip title={label} what={fila.nota} side="left" ariaLabel={`De dónde sale: ${label}`} />
    </li>
  );
}

export default function ColumnaRenglones({
  titulo,
  total,
  aproximado,
  filas,
  vacio,
  onAbrir,
}: {
  titulo: string;
  /** El total del servidor (no se suma acá). */
  total: number;
  aproximado: boolean;
  filas: FilaDeCifra[];
  /** Una frase para cuando no hay nada con movimiento. */
  vacio: string;
  onAbrir: (f: FuenteDetalle) => void;
}) {
  const id = useId();
  const [verTodos, setVerTodos] = useState(false);
  const plegadas = filas.filter(sinMovimiento).length;
  const visibles = verTodos ? filas : filas.filter((f) => !sinMovimiento(f));

  return (
    <section aria-labelledby={id} className="min-w-0">
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--rule-base)] px-2 pb-2">
        <CardTitle className="text-sm font-bold" as="h4" id={id}>
          {titulo}
        </CardTitle>
        <span className="text-base font-extrabold tabular-nums text-[var(--text-primary)]">
          {montoTexto(total, { aproximado })}
        </span>
      </div>
      {visibles.length > 0 ? (
        <ul className="mt-1 divide-y divide-[var(--rule-soft)]">
          {visibles.map((f) => (
            <RenglonFila key={f.fuente} fila={f} onAbrir={onAbrir} />
          ))}
        </ul>
      ) : (
        <p className="px-2 py-3 text-sm text-[var(--text-secondary)]">{vacio}</p>
      )}
      {plegadas > 0 && (
        <button
          type="button"
          onClick={() => setVerTodos((v) => !v)}
          aria-expanded={verTodos}
          className="mt-1 min-h-9 rounded-lg px-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {verTodos ? "Ocultar los que están en cero" : `+${plegadas} sin movimiento`}
        </button>
      )}
    </section>
  );
}
