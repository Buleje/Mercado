"use client";

import { ChevronDown, Package } from "@buleje/design-system/icons";
import EnlacePanel from "@/components/admin/shared/EnlacePanel";
import { cn } from "@/lib/utils";
import type { SinRotacion } from "./tipos";

interface Props {
  items: SinRotacion[];
  ventanaDias: number;
  abierto: boolean;
  onAlternar: () => void;
}

/**
 * Lo que NO conviene comprar: la otra mitad de la decisión. Antes estos
 * productos salían mezclados entre las sugerencias sólo por estar debajo de su
 * `stockMax`: en el tenant real eran 52, con cero ventas en 30 días.
 * Reponerlos es inmovilizar plata.
 */
export default function SugerenciasSinRotacion({ items, ventanaDias, abierto, onAlternar }: Props) {
  if (items.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)]">
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierto}
        className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-[var(--surface-raised)]"
      >
        <Package className="h-5 w-5 shrink-0 text-[var(--text-secondary)]" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-extrabold text-[var(--text-primary)]">
            {items.length} {items.length === 1 ? "producto no se vendió" : "productos no se vendieron"} en {ventanaDias} días
          </span>
          <span className="block text-sm text-[var(--text-secondary)]">No entran en la lista de compra. Revisa si conviene liquidarlos antes de reponer.</span>
        </span>
        <ChevronDown className={cn("h-5 w-5 shrink-0 transition-transform", abierto && "rotate-180")} aria-hidden />
      </button>

      {abierto && (
        <ul className="divide-y divide-[var(--rule-soft)] border-t border-[var(--rule-base)] bg-[var(--surface-raised)]">
          {items.slice(0, 40).map((s) => (
            <li key={s.productId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <span className="min-w-0 flex-1 truncate font-bold text-[var(--text-primary)]">
                <EnlacePanel cosa="producto" id={String(s.productId)} apariencia="heredada">{s.productName}</EnlacePanel>
              </span>
              <span className="text-sm text-[var(--text-secondary)]">{s.motivo}</span>
              <span className="text-sm tabular-nums text-[var(--text-secondary)]">
                stock {s.currentStock} · mínimo {s.stockMin}
              </span>
              {s.excesoSobreMinimo > 0 && (
                <span className="text-sm font-bold tabular-nums text-[var(--data-warning-ink)]">+{s.excesoSobreMinimo} de más</span>
              )}
            </li>
          ))}
          {items.length > 40 && <li className="px-4 py-3 text-sm text-[var(--text-secondary)]">Y {items.length - 40} más.</li>}
        </ul>
      )}
    </section>
  );
}
