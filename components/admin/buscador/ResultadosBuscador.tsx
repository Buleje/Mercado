"use client";

/**
 * La lista de resultados del buscador de la cabecera (el desplegable pegado al
 * campo): grupos con su cabecera y filas como `role="option"` de un
 * `listbox`, para que el campo (`role="combobox"`) diga cuál está elegida con
 * `aria-activedescendant` mientras el foco sigue en el campo.
 */

import type { ElementType } from "react";
import {
  AlertTriangle, History, LayoutDashboard, Package, ShoppingCart, Users, Zap,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { FilaResultado, ResultSkeleton } from "./FilaResultado";
import type { GroupedResults, SearchResult } from "./indice-modulos";
import { hrefDe } from "./use-buscador-en-linea";

export const GROUP_META: Record<keyof GroupedResults, { label: string; icon: ElementType; color: string }> = {
  recientes: { label: "Abriste hace poco", icon: History,       color: "text-[var(--text-secondary)]" },
  modulos:   { label: "Módulos",           icon: LayoutDashboard, color: "text-primary" },
  productos: { label: "Productos",         icon: Package,       color: "text-[var(--data-success-500)]" },
  clientes:  { label: "Clientes",          icon: Users,         color: "text-[var(--text-secondary)]" },
  pedidos:   { label: "Pedidos",           icon: ShoppingCart,  color: "text-[var(--data-warning-500)]" },
  relacionados: { label: "Relacionados",  icon: LayoutDashboard, color: "text-[var(--text-secondary)]" },
  acciones:  { label: "Hacer",             icon: Zap,           color: "text-[var(--data-success-500)]" },
};

/** El `id` de la fila `i` (lo usa `aria-activedescendant`). */
export const idOpcion = (base: string, i: number) => `${base}-op-${i}`;

interface Props {
  idLista: string;
  query: string;
  grouped: GroupedResults;
  orden: (keyof GroupedResults)[];
  loading: boolean;
  activo: number;
  onElegir: (r: SearchResult) => void;
  onResaltar: (i: number) => void;
}

export function ResultadosBuscador({ idLista, query, grouped, orden, loading, activo, onElegir, onResaltar }: Props) {
  const total = orden.reduce((n, g) => n + grouped[g].length, 0);
  let i = 0;
  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        {loading ? "Buscando…" : total === 0 ? "Sin resultados" : `${total} ${total === 1 ? "resultado" : "resultados"}`}
      </p>
      {!loading && total === 0 && (
        <div className="flex items-center justify-center gap-3 px-4 py-8 text-sm text-[var(--text-secondary)]">
          <AlertTriangle className="h-5 w-5" aria-hidden />
          Sin resultados para &ldquo;{query.trim()}&rdquo;
        </div>
      )}
      <div id={idLista} role="listbox" aria-label="Resultados de la búsqueda" className={cn(total === 0 && "hidden")}>
        {/* Comandos, módulos y recientes salen al toque; productos, clientes y
            pedidos llegan del servidor (el esqueleto, abajo). */}
        {orden.map((g) => {
          const items = grouped[g];
          if (items.length === 0) return null;
          const meta = GROUP_META[g];
          const Icono = meta.icon;
          return (
            <div key={g} role="group" aria-label={meta.label}>
              <div
                aria-hidden
                className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-2 dark:border-[var(--rule-base)]"
              >
                <span className="flex items-center gap-2">
                  <Icono className={cn("h-3.5 w-3.5", meta.color)} strokeWidth={2.25} />
                  <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)]">
                    {meta.label}
                  </span>
                </span>
                <span className="text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--text-secondary)]">{items.length}</span>
              </div>
              {items.map((r) => {
                const indice = i++;
                return (
                  <FilaResultado
                    key={r.id}
                    r={r}
                    query={r.type === "accion" ? "" : query}
                    href={hrefDe(r)}
                    seleccionado={indice === activo}
                    iconoGrupo={meta.icon}
                    color={meta.color}
                    onElegir={() => onElegir(r)}
                    atributos={{
                      id: idOpcion(idLista, indice),
                      role: "option",
                      "aria-selected": indice === activo,
                      tabIndex: -1,
                      onMouseMove: () => {
                        if (indice !== activo) onResaltar(indice);
                      },
                    }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
      {loading && <ResultSkeleton />}
    </>
  );
}
