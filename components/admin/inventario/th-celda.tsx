"use client";

import type { ReactNode } from "react";
import { IconoOrden } from "@/components/admin/adelantos/lista/tabla-controles";
import type { OrdenDeColumnas } from "@/components/admin/shared/th-columna";

/**
 * El `<th>` de las tablas de Inventario cuyas columnas se pueden MOVER
 * (`EnOrden` busca `th[data-col]`): hace lo mismo que `ThColumna` (título que
 * ordena + embudo debajo) pero conserva el `data-col`. Los embudos van de
 * `children`, conectados al estado que ya tenía la tabla.
 */
export function ThCelda({ col, label, derecha = false, className = "", title, orden, ordenId, children }: {
  col: string;
  label: string;
  derecha?: boolean;
  className?: string;
  title?: string;
  orden?: OrdenDeColumnas;
  ordenId?: string;
  children?: ReactNode;
}) {
  const ordena = orden && ordenId;
  return (
    <th
      data-col={col}
      data-label={label}
      title={title}
      className={`${derecha ? "text-right" : "text-left"} ${className}`.trim()}
      aria-sort={ordena ? orden.ariaSort(ordenId) : undefined}
    >
      <span className={`inline-flex flex-col gap-1 ${derecha ? "items-end" : "items-start"}`}>
        {ordena ? (
          <button
            type="button"
            onClick={() => orden.alternar(ordenId)}
            className={`inline-flex items-center gap-1 font-bold transition-colors hover:text-[var(--text-primary)] ${orden.activa === ordenId ? "text-[var(--text-primary)]" : ""}`}
          >
            {label}
            <IconoOrden activo={orden.activa === ordenId} direccion={orden.direccion} />
          </button>
        ) : (
          label
        )}
        {children && <span className="inline-flex items-center gap-1 [&>span]:ml-0">{children}</span>}
      </span>
    </th>
  );
}
