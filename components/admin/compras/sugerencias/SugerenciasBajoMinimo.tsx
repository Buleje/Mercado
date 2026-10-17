"use client";

import { AlertTriangle, ShoppingBasket } from "@buleje/design-system/icons";
import EnlacePanel from "@/components/admin/shared/EnlacePanel";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import type { SinRotacion } from "./tipos";

/** Comprar con el filtro «A reponer» puesto: ahí están estos mismos productos, con su cantidad sugerida. */
export const HREF_COMPRAR_REPONER = "/admin?tab=compras&vista=punto-compra&reponer=1";

const A_LA_VISTA = 8;

/**
 * Los productos en o bajo su mínimo que NO se vendieron en la ventana. Son los
 * que Productos y stock avisa como «necesitan reposición» y su «Pedir en
 * Compras» trae acá; este motor no los sugiere (sin venta no hay rotación),
 * así que antes quedaban plegados entre los «sin venta» y la pantalla decía
 * «Nada que reponer». A la vista y con el camino para pedirlos igual.
 */
export default function SugerenciasBajoMinimo({ items, ventanaDias }: { items: SinRotacion[]; ventanaDias: number }) {
  if (items.length === 0) return null;
  const n = items.length;
  return (
    <section aria-label="En o bajo su mínimo" className="rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10">
      <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1 sm:px-4">
        <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
        <p className="min-w-0 text-sm text-[var(--text-primary)]">
          <span className="font-bold tabular-nums">{n}</span> {n === 1 ? "producto está" : "productos están"} en o bajo su mínimo, sin venta en {ventanaDias} días
        </p>
        <InfoTip
          title="En o bajo su mínimo"
          what="Productos y stock los cuenta como «necesitan reposición». No entran en la lista de compra de abajo porque no se vendieron: sin venta no hay a qué ritmo reponerlos."
          example="Stock 3, mínimo 3 y nada vendido en 30 días: aparece acá. Si igual lo necesitas, ármalo en Comprar con «A reponer»."
        />
        <EnlacePanel
          href={HREF_COMPRAR_REPONER}
          apariencia="heredada"
          className={button({ variant: "secondary", className: "ml-auto shrink-0 gap-2 rounded-xl px-3 text-sm hover:no-underline" })}
        >
          <ShoppingBasket className="h-4 w-4" aria-hidden />
          Armar la compra
        </EnlacePanel>
      </div>
      <ul className="divide-y divide-[var(--rule-soft)] border-t border-[var(--data-warning-500)]/30 bg-[var(--surface-raised)]">
        {items.slice(0, A_LA_VISTA).map((s) => (
          <li key={s.productId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-sm sm:px-4">
            <span className="min-w-0 flex-1 truncate font-bold text-[var(--text-primary)]">
              <EnlacePanel cosa="producto" id={String(s.productId)} apariencia="heredada">{s.productName}</EnlacePanel>
            </span>
            {s.suggestedSupplier && (
              <span className="truncate text-[var(--text-secondary)]">
                <EnlacePanel cosa="proveedor" id={s.suggestedSupplier.id} apariencia="heredada">{s.suggestedSupplier.name}</EnlacePanel>
              </span>
            )}
            <span className="tabular-nums text-[var(--text-secondary)]">
              stock <strong className="text-[var(--data-warning-ink)]">{s.currentStock}</strong> · mínimo {s.stockMin}
            </span>
          </li>
        ))}
        {n > A_LA_VISTA && (
          <li className="px-3 py-2.5 text-sm text-[var(--text-secondary)] sm:px-4">Y {n - A_LA_VISTA} más: están en Comprar con «A reponer».</li>
        )}
      </ul>
    </section>
  );
}
