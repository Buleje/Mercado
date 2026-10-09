"use client";

import { CardTitle } from "@buleje/design-system";
import { Package, AlertTriangle, Loader2, PackagePlus, ChevronRight } from "@buleje/design-system/icons";
import Image from "next/image";
import { cn } from "@/lib/utils";
import ImageWarningBadge from "@/components/admin/inventario/ImageWarningBadge";
import { fmt } from "@/components/admin/inventario/inventario-compartido";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";

/** Aviso de stock bajo con órdenes de compra. Pieza de InventoryTab: recibe `useInventario` entero. */
export default function InventarioAlertaOC({ inv }: { inv: Inventario }) {
  const {
    expandedOC, setExpandedOC, generatingOC, lowStockProducts, generateOC, generateBulkOC,
  } = inv;
  return (
    <>
      {/* OC Alerts Section (IMPROVEMENT 1) */}
      {lowStockProducts.length > 0 && (
        <div className="bg-[var(--surface-sunken)] border border-[var(--data-warning-500)]/40 rounded-xl overflow-hidden ">
          <div className="px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/50 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-5 w-5 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]" />
                </div>
                <div>
                  <CardTitle className="text-[length:var(--ts-xl)] font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2">
                    Alertas de Orden de Compra
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)] text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] text-xs font-bold">
                      {lowStockProducts.length}
                    </span>
                  </CardTitle>
                  <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-0.5">
                    {lowStockProducts.length} producto{lowStockProducts.length > 1 ? "s necesitan" : " necesita"} reposición
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={generateBulkOC}
                  disabled={generatingOC}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--data-warning-500)] hover:bg-[var(--data-warning-500)] text-white text-xs font-bold transition-colors disabled:opacity-60 "
                >
                  {generatingOC ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackagePlus className="h-3.5 w-3.5" />}
                  Generar OC para todos
                </button>
                <button
                  onClick={() => setExpandedOC(!expandedOC)}
                  aria-expanded={expandedOC}
                  aria-label={expandedOC ? "Contraer productos con stock bajo" : "Expandir productos con stock bajo"}
                  className="p-2 rounded-xl hover:bg-[var(--data-warning-100)] dark:hover:bg-[var(--data-warning-500)]/30 transition-colors"
                >
                  <ChevronRight className={cn("h-4 w-4 text-[var(--text-secondary)] dark:text-muted transition-transform", expandedOC && "rotate-90")} />
                </button>
              </div>
            </div>

            {expandedOC && (
              <div className="mt-4 space-y-2 max-h-60 overflow-y-auto">
                {lowStockProducts.map(p => {
                  const minStock = p.stockMin ?? 5;
                  const maxStock = p.stockMax ?? minStock * 2;
                  const suggestedQty = maxStock - (p.stock ?? 0);
                  const unitCost = p.costPrice ?? p.price * 0.7;
                  return (
                    <div key={p.id} className="bg-[var(--surface-raised)] border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)] rounded-xl p-3 flex flex-wrap items-center gap-3">
                      {p.image ? (
                        <span className="relative inline-block shrink-0">
                          <Image src={p.image} alt={p.name} width={40} height={40} unoptimized={p.image.startsWith("data:")} className="rounded-lg object-cover border border-[var(--rule-soft)] dark:border-[var(--rule-base)]" />
                          <ImageWarningBadge image={p.image} />
                        </span>
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Package className="h-5 w-5 text-primary/40" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">{p.name}</p>
                        <p className="text-xs text-[var(--text-secondary)] dark:text-muted">
                          Stock: {p.stock} / Mín: {minStock} • Sugerido: <span className="font-bold text-[var(--data-warning-500)]">{suggestedQty} {p.unit}</span>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">Costo unit.</p>
                        <p className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(unitCost)}</p>
                      </div>
                      <button
                        onClick={() => generateOC(p)}
                        disabled={generatingOC}
                        className="px-3 py-1.5 rounded-lg bg-[var(--data-warning-500)] hover:bg-[var(--data-warning-500)] text-white text-xs font-bold transition-colors disabled:opacity-60 shrink-0"
                      >
                        Generar OC
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
