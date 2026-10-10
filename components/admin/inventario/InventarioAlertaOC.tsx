"use client";

import { CardTitle } from "@buleje/design-system";
import { Package, AlertTriangle, PackagePlus, ChevronRight, ArrowRight } from "@buleje/design-system/icons";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { button } from "@/components/ui-system/button-variants";
import { LoadingSpinner } from "@/components/ui-system/LoadingSpinner";
import ImageWarningBadge from "@/components/admin/inventario/ImageWarningBadge";
import { fmt } from "@/components/admin/inventario/inventario-compartido";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
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
    expandedOC, setExpandedOC, generatingOC, lowStockProducts, generateOC, generateBulkOC,
  } = inv;
  return (
    <>
      {/* OC Alerts Section (IMPROVEMENT 1) */}
      {lowStockProducts.length > 0 && (
        <div className="bg-[var(--surface-sunken)] border border-[var(--data-warning-500)]/40 rounded-xl overflow-hidden ">
          <div className="px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-[var(--data-warning-500)]/15 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-5 w-5 text-[var(--data-warning-ink)]" aria-hidden />
                </div>
                <div className="min-w-0">
                  {/* Escala de bloque del panel (text-sm bold): antes iba a 20 px y
                      competía con el título de la vista. */}
                  <CardTitle className="text-sm font-bold text-[var(--text-primary)] flex flex-wrap items-center gap-2">
                    Alertas de orden de compra
                    {/* Fondo suave + tinta del mismo tono: antes fondo y texto eran el
                        mismo `--data-warning-500` y la cifra no se leía. */}
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--data-warning-100)] text-[var(--data-warning-ink)] ring-1 ring-inset ring-[var(--data-warning-500)]/40 text-xs font-bold tabular-nums">
                      {lowStockProducts.length}
                    </span>
                  </CardTitle>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    {lowStockProducts.length} producto{lowStockProducts.length > 1 ? "s necesitan" : " necesita"} reposición
                    <PermisoDe origen={ORIGEN_SUGERENCIAS}>
                      {" · "}
                      <EnlacePanel href={HREF_SUGERENCIAS} className="inline-flex items-center gap-0.5">
                        Ver qué reponer en Compras
                        <ArrowRight className="h-3 w-3" aria-hidden />
                      </EnlacePanel>
                    </PermisoDe>
                  </p>
                </div>
              </div>
              {/* Botones del DS a 48 px: el blanco sobre el ámbar de antes no se leía. */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={generateBulkOC}
                  disabled={generatingOC}
                  className={button({ variant: "primary", className: "rounded-xl" })}
                >
                  {generatingOC ? <LoadingSpinner size={16} className="text-current" /> : <PackagePlus className="h-4 w-4" aria-hidden />}
                  Generar OC para todos
                </button>
                <button
                  type="button"
                  onClick={() => setExpandedOC(!expandedOC)}
                  aria-expanded={expandedOC}
                  aria-label={expandedOC ? "Contraer productos con stock bajo" : "Expandir productos con stock bajo"}
                  className={button({ variant: "ghost", className: "w-12 rounded-xl px-0" })}
                >
                  <ChevronRight className={cn("h-4 w-4 transition-transform", expandedOC && "rotate-90")} aria-hidden />
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
                        <p className="text-xs text-[var(--text-secondary)]">
                          Stock: {p.stock} / Mín: {minStock} • Sugerido: <span className="font-bold text-[var(--data-warning-ink)]">{suggestedQty} {p.unit}</span>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-[var(--text-tertiary)]">Costo unit.</p>
                        <p className="text-sm font-bold text-[var(--text-primary)]">{fmt(unitCost)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => generateOC(p)}
                        disabled={generatingOC}
                        className={button({ variant: "secondary", className: "shrink-0 rounded-xl px-4" })}
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
