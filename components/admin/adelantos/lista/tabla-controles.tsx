/** Controles chicos de la tabla de adelantos: orden de columnas y paginado. */

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "@buleje/design-system/icons";
import type { ColumnaOrden, Direccion } from "@/lib/adelantos/ordenar-lista";

export function ariaSort(
  orden: { columna: ColumnaOrden; direccion: Direccion },
  columna: ColumnaOrden,
): "ascending" | "descending" | "none" {
  if (orden.columna !== columna) return "none";
  return orden.direccion === "asc" ? "ascending" : "descending";
}

export function IconoOrden({ activo, direccion }: { activo: boolean; direccion: Direccion }) {
  if (!activo) return <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden />;
  return direccion === "asc" ? (
    <ArrowUp className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
  ) : (
    <ArrowDown className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
  );
}

export function BotonPagina({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--rule-base)] text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--accent-ink)] disabled:opacity-40 dark:hover:text-[var(--accent)]"
    >
      {children}
    </button>
  );
}
