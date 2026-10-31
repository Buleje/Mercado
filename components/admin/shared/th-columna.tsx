"use client";

import type { ReactNode } from "react";
import { FiltroEnCabecera, type FiltrosTabla } from "@/components/admin/forestal/filtros-tabla-forestal";
import { IconoOrden } from "@/components/admin/adelantos/lista/tabla-controles";

/** El orden de la tabla tal como lo arma `shared/use-orden-columna` u otro hook con la misma forma. */
export interface OrdenDeColumnas {
  alternar: (id: string) => void;
  activa: string | null;
  direccion: "asc" | "desc";
  ariaSort: (id: string) => "ascending" | "descending" | "none";
}

/**
 * El título de columna de las tablas de Mi Plata (Brandon 25-10: «todas las
 * tablas como Adelantos, en su encabezado filtros tipo Excel»): el título
 * arriba —clicable para ordenar si se pasa `orden`— y debajo el embudo de cada
 * filtro que vive bajo esa columna, como en Adelantos › Lista. Una sola pieza
 * para que todas las tablas se vean iguales. `data-label`: a 400 px la fila
 * pasa a tarjeta y el rótulo sale de ahí, no del texto del `<th>`.
 */
export function ThColumna<T>({
  label,
  ids = [],
  f,
  derecha = false,
  className = "",
  orden,
  ordenId,
  dataCol,
  title,
  children,
}: {
  label: string;
  /** Una o más columnas de filtro que viven bajo este título. */
  ids?: readonly string[];
  f?: FiltrosTabla<T>;
  derecha?: boolean;
  className?: string;
  orden?: OrdenDeColumnas;
  ordenId?: string;
  /** Columnas movibles (`EnOrden` busca `th[data-col]`). */
  dataCol?: string;
  title?: string;
  /** Embudos propios, conectados a un estado que no es `FiltrosTabla`. */
  children?: ReactNode;
}) {
  const ordena = orden && ordenId;
  return (
    <th
      data-col={dataCol}
      data-label={label}
      title={title}
      className={`${derecha ? "text-right" : "text-left"} ${className}`.trim()}
      aria-sort={ordena ? orden.ariaSort(ordenId) : undefined}
    >
      <span className={`inline-flex flex-col gap-1 [&>span]:ml-0 ${derecha ? "items-end" : "items-start"}`}>
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
        {f && ids.length > 0 && (
          <span className="inline-flex items-center gap-1">
            {ids.map((id) => (
              <FiltroEnCabecera key={id} id={id} f={f} compacto />
            ))}
            {/* Con embudos, lo propio va en su misma fila: un renglón más hacía
                el encabezado de 78 a 98 px (Personas › «Tope», 30-10). */}
            {children}
          </span>
        )}
        {children && !(f && ids.length > 0) && <span className="inline-flex items-center gap-1 [&>span]:ml-0">{children}</span>}
      </span>
    </th>
  );
}
