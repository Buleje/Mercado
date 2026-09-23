"use client";

/**
 * Las piezas del detalle flotante de un día (`CtpDetalleDeJornada`): un bloque
 * con título, un renglón con nombre y cifras, y la franja de dueño · permiso ·
 * línea. Viven aparte para que el panel quede en lo que decide (dónde se
 * dibuja, en cuántas columnas, qué botón va último).
 */

import type { ReactNode } from "react";
import { Kicker } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { SIN_DUENO, type DetalleDeJornada } from "@/lib/forestal/detalle-de-jornada";

export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function Bloque({
  titulo,
  children,
  listaClassName,
}: {
  titulo: string;
  children: ReactNode;
  listaClassName?: string;
}) {
  return (
    <section className="mt-2 border-t border-[var(--rule-soft)] pt-1.5">
      <Kicker as="h5" className="block">
        {titulo}
      </Kicker>
      <ul className={cn("mt-0.5 flex flex-col", listaClassName)}>{children}</ul>
    </section>
  );
}

/** Un dato de la franja (dueño, permiso, línea): rótulo chico y valor en la misma línea. */
export function DatoDeFranja({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <Kicker as="dt" className="shrink-0">
        {rotulo}
      </Kicker>
      <dd className="min-w-0 text-sm text-[var(--text-primary)]">{children}</dd>
    </div>
  );
}

export function Renglon({
  nombre,
  cifras,
  titulo,
  apagado = false,
}: {
  nombre: ReactNode;
  cifras?: string;
  titulo?: string;
  apagado?: boolean;
}) {
  return (
    <li
      className="flex min-w-0 items-baseline justify-between gap-2 text-sm leading-5"
      title={titulo}
    >
      <span
        className={cn(
          "min-w-0 truncate",
          apagado ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]",
        )}
      >
        {nombre}
      </span>
      {cifras && (
        <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-secondary)]">
          {cifras}
        </span>
      )}
    </li>
  );
}

/**
 * Dueño, permiso y línea: un dato cada uno, en UNA franja. Antes eran tres
 * bloques con título para un renglón cada uno (2026-09-23).
 */
export function FranjaDelDia({
  detalle,
}: {
  detalle: Pick<DetalleDeJornada, "duenos" | "permisos" | "lineas">;
}) {
  return (
    <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--rule-soft)] pt-1.5">
      <DatoDeFranja rotulo={detalle.duenos.length === 1 ? "Dueño" : "Dueños"}>
        {detalle.duenos.map((d, i) => (
          <span key={d.etiqueta}>
            {i > 0 && <span className="text-[var(--text-tertiary)]"> · </span>}
            <span className={d.etiqueta === SIN_DUENO ? "text-[var(--text-tertiary)]" : undefined}>
              {d.etiqueta}
            </span>
            {/* Con un solo dueño, sus corridas son las del día (arriba). */}
            {detalle.duenos.length > 1 && (
              <span className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                {" "}
                ({plural(d.corridas, "corrida", "corridas")})
              </span>
            )}
          </span>
        ))}
      </DatoDeFranja>
      {detalle.permisos.length > 0 && (
        <DatoDeFranja rotulo={detalle.permisos.length === 1 ? "Permiso" : "Permisos"}>
          {detalle.permisos.map((p, i) => (
            <span key={p}>
              {i > 0 && <span className="text-[var(--text-tertiary)]"> · </span>}
              <span className="font-mono text-xs" title={p}>
                {p}
              </span>
            </span>
          ))}
        </DatoDeFranja>
      )}
      {detalle.lineas.length > 0 && (
        <DatoDeFranja rotulo={detalle.lineas.length === 1 ? "Línea" : "Líneas"}>
          {detalle.lineas.join(" · ")}
        </DatoDeFranja>
      )}
    </dl>
  );
}
