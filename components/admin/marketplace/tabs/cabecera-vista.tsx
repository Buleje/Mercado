"use client";

/**
 * Piezas comunes de las vistas Comisiones, Precios, Cupones, Reseñas y
 * Fidelidad del Marketplace (patrón del panel, 11-10).
 *
 * El título de la vista es la pestaña del hub y «⋯ Más» es el del hub
 * (`useAccionesDeVista`): la vista no repite ninguno de los dos. Arriba de la
 * tabla va UNA fila — ⓘ con lo que la distingue de sus hermanas · filtros ·
 * (a la derecha) Indicadores y la acción principal —, como Órdenes.
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "@buleje/design-system/icons";
import { CAMPO_EN_FILA } from "@/components/admin/marketplace/shared";
import { diaConNombre } from "@/components/admin/inventario/movimientos/tipos";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn, limaDateKey } from "@/lib/utils";

interface Ayuda {
  what: ReactNode;
  affects?: ReactNode;
  example?: ReactNode;
}

/**
 * La fila de la vista: filtros (children) · (ml-auto) ⓘ · Indicadores · acción
 * principal. La ⓘ va con el grupo de la derecha: sola al principio, a 400 px
 * quedaba en una línea propia (el buscador ocupa la fila entera).
 */
export function FilaDeVista({ titulo, ayuda, children, derecha }: { titulo: string; ayuda: Ayuda; children?: ReactNode; derecha?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {children}
      <div className="ml-auto flex min-w-0 items-center gap-2">
        <span className="inline-flex h-12 w-8 shrink-0 items-center justify-center">
          <InfoTip title={titulo} what={ayuda.what} affects={ayuda.affects} example={ayuda.example} side="bottom" />
        </span>
        {derecha}
      </div>
    </div>
  );
}

export interface OpcionFiltro<T extends string> {
  valor: T;
  rotulo: string;
  cuenta?: number;
}

/** Un filtro de una sola elección en la fila (como Estado en Órdenes), con la cuenta de cada opción. */
export function SelectFiltro<T extends string>({ opciones, activo, onCambiar, etiqueta }: { opciones: OpcionFiltro<T>[]; activo: T; onCambiar: (v: T) => void; etiqueta: string }) {
  return (
    <select value={activo} onChange={(e) => onCambiar(e.target.value as T)} aria-label={etiqueta} className={cn(CAMPO_EN_FILA, "shrink-0 px-3")}>
      {opciones.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.rotulo}
          {o.cuenta !== undefined ? ` (${o.cuenta})` : ""}
        </option>
      ))}
    </select>
  );
}

/** Una cifra del panel de Indicadores. */
export function TarjetaCifra({ rotulo, valor, icono: Icono, ayuda, destacado }: { rotulo: string; valor: ReactNode; icono: LucideIcon; ayuda?: ReactNode; destacado?: boolean }) {
  return (
    <div className={cn("rounded-xl border bg-[var(--surface-raised)] p-3", destacado ? "border-primary/40 ring-1 ring-primary/20" : "border-[var(--rule-base)]")}>
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
          <Icono className="h-4 w-4" aria-hidden />
        </span>
        <span className="text-sm font-semibold text-[var(--text-secondary)]">{rotulo}</span>
        {ayuda && <InfoTip what={ayuda} />}
      </div>
      <p className={cn("text-lg font-extrabold tabular-nums", destacado ? "text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-primary)]")}>{valor}</p>
    </div>
  );
}

/** Estado vacío de una frase. */
export function VacioDeUnaFrase({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-4 py-10 text-center text-sm text-[var(--text-secondary)]">{children}</p>;
}

/** El aviso de error de la carga, en una línea, con Reintentar. */
export function ErrorDeCarga({ mensaje, onReintentar }: { mensaje: string; onReintentar: () => void }) {
  return (
    <div role="alert" className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-1">
      <span className="text-sm font-semibold text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">{mensaje}</span>
      <button type="button" onClick={onReintentar} className="ml-auto min-h-12 rounded-xl px-3 text-sm font-semibold text-[var(--data-error-ink)] hover:underline dark:text-[var(--data-error-500)]">
        Reintentar
      </button>
    </div>
  );
}

/** «jueves 10/09» de un instante ISO, en el día de Lima. */
export function diaDe(iso: string | null | undefined): string {
  const clave = iso ? limaDateKey(iso) : "";
  return clave ? diaConNombre(clave) : "—";
}

/**
 * Encabezados de la `DataTable` a 14 px en caja normal, como la tabla de
 * Órdenes: el DS los pone a 12 px en versalitas. Con `!` porque el selector
 * del DS (`[&_thead_th]:text-…`) empata en especificidad y Tailwind decide el
 * orden, no la lista de clases.
 */
export const ENCABEZADOS_14 = "[&_thead_th]:text-sm! [&_thead_th]:normal-case! [&_thead_th]:tracking-normal!";
