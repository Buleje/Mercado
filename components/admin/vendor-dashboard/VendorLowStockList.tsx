"use client";

/**
 * Stock bajo (pestaña Marketplace del Inicio): qué reponer, al lado de los
 * pedidos sin atender (mismo marco que esa tarjeta).
 *
 * 2026-10-09: sin productos no se dibuja (la tarjeta «Stock bajo 0 · Todo en
 * buen nivel» de arriba ya lo dice); muestra 5 y el resto queda en «Ver
 * inventario»; el contador ya no es blanco sobre ámbar (no se leía).
 */

import Image from "next/image";
import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, Package } from "@buleje/design-system/icons";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { cantidad } from "@/lib/admin/inicio/formato-tablero";
import type { VendorLowStockProduct } from "./vendor-dashboard.types";

type Props = {
  products: VendorLowStockProduct[];
};

const A_LA_VISTA = 5;

function urgencia(stock: number | undefined): { clase: string; texto: string | null } {
  if (stock === undefined || stock === null) return { clase: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]", texto: null };
  if (stock <= 0)
    return {
      clase: "bg-[var(--data-error-500)]/15 text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/25 dark:text-[var(--data-error-500)]",
      texto: "Agotado",
    };
  if (stock <= 2)
    return {
      clase: "bg-[var(--data-error-500)]/10 text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]",
      texto: null,
    };
  return {
    clase: "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/20 dark:text-[var(--data-warning-500)]",
    texto: null,
  };
}

export function VendorLowStockList({ products }: Props) {
  if (products.length === 0) return null;
  const visibles = products.slice(0, A_LA_VISTA);
  const resto = products.length - visibles.length;

  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <AlertTriangle className="h-5 w-5 text-[var(--data-warning-500)]" aria-hidden />
          Stock bajo
          <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-1.5 text-xs font-bold tabular-nums text-[var(--text-primary)]">
            {products.length}
          </span>
        </CardTitle>
        <EnlacePanel apariencia="heredada" href="/admin?tab=inventario" className="text-xs font-semibold text-[var(--accent-ink)] hover:underline">
          {resto > 0 ? `Ver ${resto} más` : "Ver inventario"}
        </EnlacePanel>
      </div>

      <ul className="divide-y divide-[var(--rule-soft)]">
        {visibles.map((p) => {
          const u = urgencia(p.stock);
          return (
            <li key={p.id} className="flex items-center gap-3 py-3">
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-[var(--surface-sunken)]">
                {typeof p.image === "string" && p.image.trim().length > 0 ? (
                  <Image src={p.image} alt="" fill sizes="40px" className="object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[var(--text-tertiary)]">
                    <Package className="h-4 w-4" aria-hidden />
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{p.name}</p>
                {p.category && <p className="truncate text-xs text-[var(--text-secondary)]">{p.category}</p>}
              </div>
              <div className="shrink-0 text-right">
                <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-bold tabular-nums ${u.clase}`}>
                  {u.texto ?? `Quedan ${cantidad(p.stock ?? 0)} ${p.unit}`}
                </span>
                {p.stockMin !== undefined && p.stockMin !== null && (
                  <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">mínimo {cantidad(p.stockMin)}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
