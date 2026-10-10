"use client";

import { StatCard } from "@buleje/design-system";
import { Package, AlertTriangle, Layers, ChevronRight, Clock, Wallet } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { cn } from "@/lib/utils";
import { fmt } from "@/components/admin/inventario/inventario-compartido";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";

/** Categorías, indicadores, duplicados y margen por categoría. Pieza de InventoryTab: recibe `useInventario` entero. */
export default function InventarioResumen({ inv }: { inv: Inventario }) {
  const {
    products, catFilter, setCatFilter, totalProducts, activeProducts, lowStockCount, expiringSoonCount,
    totalStockValue, duplicateWarning, categoryMargins, dynamicCategories, chipsVisibles, chipsEnMenu,
    filteredProducts,
  } = inv;
  return (
    <>
      {/* Category chips — derivadas dinámicamente del inventario real, sin emojis */}
      {dynamicCategories.length > 1 && (
        <div className="-mx-2 px-2 overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-2 min-w-fit">
            {chipsVisibles.map(c => {
              // "Todos" está activo con la selección vacía; cualquier otra
              // pastilla se puede combinar con otras (multi, 2026-09-22):
              // clic para sumarla, clic de nuevo para sacarla — el mismo
              // estado que el autofiltro de la columna Categoría.
              const active = c.id === "todos" ? catFilter.length === 0 : catFilter.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    if (c.id === "todos") { setCatFilter([]); return; }
                    setCatFilter(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id]);
                  }}
                  aria-pressed={active}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border-2 text-sm font-bold transition-all whitespace-nowrap",
                    active
                      ? "border-primary bg-primary text-white shadow-[var(--shadow-sm)]"
                      : "border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] dark:text-muted hover:border-primary/40 hover:bg-primary/5"
                  )}
                >
                  <span>{c.label}</span>
                  <span className={cn(
                    "inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-[length:var(--ts-2xs)] font-bold",
                    active ? "bg-white/20 text-white" : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] dark:text-muted"
                  )}>
                    {c.count}
                  </span>
                </button>
              );
            })}
            {chipsEnMenu.length > 0 && (
              <ActionMenu
                label={`Más categorías (${chipsEnMenu.length})`}
                size="sm"
                actions={chipsEnMenu.map(c => ({
                  id: c.id,
                  label: c.label,
                  icon: Layers,
                  meta: String(c.count),
                  activo: catFilter.includes(c.id),
                  onSelect: () => setCatFilter(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id]),
                }))}
              />
            )}
          </div>
        </div>
      )}

      {/* KPIs.
          Eran cinco y dos decían lo mismo: «Productos 57 · 56 activos» al lado
          de «Activos 56 · 1 inactivo». Ahora el estado del catálogo va en una
          sola tarjeta y el resto son las tres cifras que se miran para decidir
          algo: qué reponer, qué se vence, cuánto vale lo que hay.

          Compactas a propósito: esta franja empujaba el primer producto de la
          tabla fuera de la pantalla, y a Inventario se entra a ver productos. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Productos"
          value={totalProducts}
          subValue={
            <>
              {activeProducts} activos
              {totalProducts - activeProducts > 0 && ` · ${totalProducts - activeProducts} inactivo${totalProducts - activeProducts === 1 ? "" : "s"}`}
            </>
          }
          icon={Package}
          density="compact"
        />
        <StatCard
          label="Bajo stock"
          value={lowStockCount}
          subValue={lowStockCount > 0 ? "Requieren reposición" : "Stock saludable"}
          icon={AlertTriangle}
          emphasis={lowStockCount > 0 ? "warning" : "neutral"}
          density="compact"
        />
        <StatCard
          label="Próx. a vencer"
          value={expiringSoonCount}
          subValue="Próximos 30 días"
          icon={Clock}
          emphasis={expiringSoonCount > 0 ? "warning" : "neutral"}
          density="compact"
        />
        <StatCard
          label="Valor inventario"
          value={fmt(totalStockValue)}
          subValue="Valuado a costo"
          icon={Wallet}
          density="compact"
        />
      </div>

      {/* Mejora P-7: Duplicados detectados */}
      {duplicateWarning.length > 0 && (
        <div className="rounded-xl border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/30 bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 px-4 py-2.5 flex flex-wrap items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] shrink-0" />
          <span className="text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">
            Posibles duplicados: <span className="font-bold">{duplicateWarning[0].a}</span> y <span className="font-bold">{duplicateWarning[0].b}</span>
            {duplicateWarning.length > 1 && <span className="text-[var(--data-warning-500)]"> (y {duplicateWarning.length - 1} mas)</span>}
          </span>
        </div>
      )}

      {/* Margen por categoría: se mira de vez en cuando y no se puede clickear
          —no filtra nada—, así que ocupaba una fila entera para informar. Va
          plegado: el que lo busca lo abre. */}
      {/* Meta-información en una línea: cuántos se están viendo y el margen
          plegado. Sin nada que decir, la fila no existe —un contenedor vacío
          sigue costando su separación. */}
      {(filteredProducts.length !== products.length || categoryMargins.length > 0) && (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {filteredProducts.length !== products.length && (
        <p className="text-xs text-[var(--text-tertiary)]">
          Mostrando {filteredProducts.length} de {products.length} productos
        </p>
      )}
      {categoryMargins.length > 0 && (
        <details className="group">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-secondary)]">
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" aria-hidden />
            Margen por categoría ({categoryMargins.length})
          </summary>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {categoryMargins.map(cm => (
            <span
              key={cm.cat}
              className={cn(
                "text-xs font-mono font-bold px-2 py-0.5 rounded-full",
                cm.margin > 25 ? "bg-[var(--data-success-100)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/30 dark:text-[var(--data-success-500)]"
                : cm.margin >= 15 ? "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/30 dark:text-[var(--data-warning-500)]"
                : "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/30 dark:text-[var(--data-error-500)]"
              )}
            >
              {cm.cat}: {Number(cm.margin).toFixed(0)}%
            </span>
          ))}
          </div>
        </details>
      )}
      </div>
      )}
    </>
  );
}
