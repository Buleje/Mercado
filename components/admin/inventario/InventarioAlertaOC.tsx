"use client";

import { Package, AlertTriangle, PackagePlus, ChevronRight } from "@buleje/design-system/icons";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { button } from "@/components/ui-system/button-variants";
import ImageWarningBadge from "@/components/admin/inventario/ImageWarningBadge";
import { fmt } from "@/components/admin/inventario/inventario-compartido";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { PermisoDe } from "@/components/admin/shared/PermisoDe";
import { origenesDeVista } from "@/lib/admin/permiso-vista";
import { vistasDelModulo } from "@/lib/admin/subvistas-modulos";
import type { Tab } from "@/app/admin/_lib/tabs.types";

/** Compras › Sugerencias: la casa única de «qué reponer» (plan «panel unificado» F5). */
const HREF_SUGERENCIAS = "/admin?tab=compras&vista=sugerencias";
/** El enlace se ve sólo para quien ve esa vista: su origen REGISTRADO, no el de esta pestaña. */
const ORIGEN_SUGERENCIAS = origenesDeVista(
  "compras",
  vistasDelModulo("compras").find((v) => v.key === "sugerencias") ?? {},
) as readonly Tab[];

/** Aviso de stock bajo con órdenes de compra. Pieza de InventoryTab: recibe `useInventario` entero. */
export default function InventarioAlertaOC({ inv }: { inv: Inventario }) {
  const {
    expandedOC, setExpandedOC, lowStockProducts,
  } = inv;
  if (lowStockProducts.length === 0) return null;
  const n = lowStockProducts.length;
  /* Una línea (10-10): antes era un bloque con título h3, chip, subtítulo y
     dos botones (~90 px) entre los indicadores y la tabla. La lista, plegada
     detrás de «Ver cuáles». */
  return (
    <div className="rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10">
      <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1 sm:px-4">
        <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
        <p className="min-w-0 text-sm text-[var(--text-primary)]">
          <span className="font-bold tabular-nums">{n}</span> producto{n > 1 ? "s necesitan" : " necesita"} reposición
        </p>
        <InfoTip
          what="Activos con stock en su mínimo o debajo. En Compras › Sugerencias armas la orden por proveedor con lo sugerido para llegar al máximo."
          example="Stock 3, mínimo 5, máximo 20 → se piden 17."
        />
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setExpandedOC(!expandedOC)}
            aria-expanded={expandedOC}
            className={button({ variant: "ghost", className: "rounded-xl px-3 text-sm" })}
          >
            {expandedOC ? "Ocultar" : "Ver cuáles"}
            <ChevronRight className={cn("h-4 w-4 transition-transform", expandedOC && "rotate-90")} aria-hidden />
          </button>
          {/* «Generar OC» nunca creó una orden: manda `supplierId: ""` y la orden
              exige proveedor (FK de PurchaseOrder), así que siempre terminaba en
              «No se pudo generar…». Compras › Sugerencias arma la orden POR
              proveedor: el botón lleva allá. */}
          <PermisoDe origen={ORIGEN_SUGERENCIAS}>
            <EnlacePanel href={HREF_SUGERENCIAS} apariencia="heredada" className={button({ variant: "secondary", className: "rounded-xl px-3 text-sm hover:no-underline" })}>
              <PackagePlus className="h-4 w-4" aria-hidden />
              Pedir en Compras
            </EnlacePanel>
          </PermisoDe>
        </div>
      </div>
            {expandedOC && (
              <div className="max-h-60 space-y-2 overflow-y-auto px-3 pb-3 sm:px-4">
                {lowStockProducts.map(p => {
                  const minStock = p.stockMin ?? 5;
                  const maxStock = p.stockMax ?? minStock * 2;
                  const suggestedQty = maxStock - (p.stock ?? 0);
                  const unitCost = p.costPrice ?? p.price * 0.7;
                  return (
                    <div key={p.id} className="bg-[var(--surface-raised)] border border-[var(--data-warning-500)]/40 rounded-xl p-3 flex flex-wrap items-center gap-3">
                      {p.image ? (
                        <span className="relative inline-block shrink-0">
                          <Image src={p.image} alt={p.name} width={40} height={40} unoptimized={p.image.startsWith("data:")} className="rounded-lg object-cover border border-[var(--rule-soft)] dark:border-[var(--rule-base)]" />
                          <ImageWarningBadge image={p.image} />
                        </span>
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Package className="h-5 w-5 text-primary/40" aria-hidden />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-[var(--text-primary)] truncate">{p.name}</p>
                        <p className="text-sm text-[var(--text-secondary)]">
                          Stock: {p.stock} / Mín: {minStock} • Sugerido: <span className="font-bold text-[var(--data-warning-ink)]">{suggestedQty} {p.unit}</span>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm text-[var(--text-tertiary)]">Costo unit.</p>
                        <p className="text-sm font-bold text-[var(--text-primary)]">{fmt(unitCost)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
    </div>
  );
}
