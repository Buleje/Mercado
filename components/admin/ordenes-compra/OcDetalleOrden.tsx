"use client";

import { Package } from "@buleje/design-system/icons";
import type { DbPurchaseOrder } from "@/lib/jsondb";
import { TIPOS_COMPROBANTE } from "@/lib/compras/estados-oc";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";
import SupplierPriceComparison from "@/components/admin/compras/SupplierPriceComparison";
import FleteTardio from "@/components/admin/ordenes-compra/FleteTardio";
import type { OrdenesCompra } from "@/components/admin/ordenes-compra/hooks/use-ordenes-compra";

/** Detalle desplegado de una orden. Pieza de PurchaseOrdersTab: recibe `useOrdenesCompra` entero. */
export default function OcDetalleOrden({ oc, o }: { oc: OrdenesCompra; o: DbPurchaseOrder }) {
  const {
    orders, expanded, avisar, load,
  } = oc;
  return (
    <>
      {/* Expanded details */}
      {expanded === o.id && (
        <div className="border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] px-2 sm:px-4 py-2 sm:py-3 bg-[var(--surface-alt)] ">
          <p className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted mb-2">Detalle de productos</p>
          <div className="space-y-1.5">
            {o.items.map((item, i) => {
              // Mejora 20: Buscar último precio del mismo producto + mismo proveedor
              const prevOC = orders.find(po =>
                po.id !== o.id &&
                po.supplierId === o.supplierId &&
                new Date(po.createdAt) < new Date(o.createdAt) &&
                po.items.some(pi => pi.productId === item.productId)
              );
              const prevItem = prevOC?.items.find(pi => pi.productId === item.productId);
              const prevPrice = prevItem?.unitCost;
              const diff = prevPrice != null ? item.unitCost - prevPrice : null;
              const prevDateRelative = prevOC ? (() => {
                const days = Math.floor((Date.now() - new Date(prevOC.createdAt).getTime()) / 86400000);
                if (days === 0) return "hoy";
                if (days < 30) return `hace ${days}d`;
                return `hace ${Math.floor(days / 30)}m`;
              })() : null;

              return (
                <div key={i}>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-[var(--text-primary)] dark:text-[var(--text-primary)] flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5 text-[var(--text-tertiary)] dark:text-muted" />
                      {item.quantity}x {item.name} <span className="text-[var(--text-tertiary)] dark:text-muted">({item.unit})</span>
                    </span>
                    <div className="text-right">
                      <span className="text-[var(--text-tertiary)] dark:text-muted text-xs mr-2">{formatCurrency(Number(item.unitCost))} c/u</span>
                      <span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{formatCurrency(item.quantity * item.unitCost)}</span>
                    </div>
                  </div>
                  {/* Mejora 20: Referencia de precio anterior */}
                  {prevPrice != null && (
                    <p className="text-xs text-[var(--text-tertiary)] pl-5 mt-0.5">
                      Última vez: {formatCurrency(prevPrice)} ({prevDateRelative})
                      {diff != null && diff > 0 && <span className="text-[var(--data-error-500)] ml-1">↑ {formatCurrency(diff)} mas caro</span>}
                      {diff != null && diff < 0 && <span className="text-[var(--data-success-500)] ml-1">↓ {formatCurrency(Math.abs(diff))} mas barato</span>}
                      {diff != null && diff === 0 && <span className="text-[var(--text-tertiary)] ml-1">= Mismo precio</span>}
                    </p>
                  )}
                </div>
              );
            })}
            <div className="flex justify-between items-center text-sm font-bold border-t border-[var(--rule-base)] dark:border-[var(--rule-base)] pt-1.5 mt-1">
              <span className="text-[var(--text-primary)] dark:text-[var(--text-primary)]">Total</span>
              <span className="text-primary">{formatCurrency(Number(o.total))}</span>
            </div>
          </div>
          {/* ADR-377: el papel, lo que costó traerla y quién la manejó. */}
          {(() => {
            const sobrecosto = (o.flete ?? 0) + (o.otrosCostos ?? 0);
            const datos: Array<{ etiqueta: string; valor: string }> = [];
            if (o.invoiceNumber) datos.push({ etiqueta: TIPOS_COMPROBANTE.find(t => t.id === o.invoiceType)?.label ?? "Comprobante", valor: o.invoiceNumber });
            if (sobrecosto > 0) datos.push({ etiqueta: "Costo de traerla", valor: `${formatCurrency(sobrecosto)}` });
            if (o.deliveryDate) datos.push({ etiqueta: "Prometida", valor: formatDate(o.deliveryDate) });
            if (o.receivedDate) datos.push({ etiqueta: "Llegó", valor: formatDate(o.receivedDate) });
            if (o.createdBy) datos.push({ etiqueta: "La pidió", valor: o.createdBy });
            if (o.receivedBy) datos.push({ etiqueta: "La recibió", valor: o.receivedBy });
            if (datos.length === 0) return null;
            return (
              <div className="mt-3 flex flex-wrap gap-2">
                {datos.map(d => (
                  <span key={d.etiqueta} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-[var(--surface-sunken)] border border-[var(--rule-base)] text-xs">
                    <span className="font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{d.etiqueta}</span>
                    <span className="font-extrabold text-[var(--text-primary)]">{d.valor}</span>
                  </span>
                ))}
              </div>
            );
          })()}

          {/* Entrega tarde: la promesa contra lo que pasó. */}
          {(() => {
            if (!o.deliveryDate || !o.receivedDate) return null;
            const dias = Math.round(
              (new Date(o.receivedDate).getTime() - new Date(o.deliveryDate).getTime()) / 86400000,
            );
            if (dias <= 0) return (
              <p className="mt-2 text-xs font-bold text-[var(--data-success-500)]">
                Llegó {dias === 0 ? "el día prometido" : `${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"} antes`}
              </p>
            );
            return (
              <p className="mt-2 text-xs font-bold text-[var(--data-warning-ink)]">
                Llegó {dias} día{dias === 1 ? "" : "s"} después de lo prometido
              </p>
            );
          })()}

          {/* Cargar el flete después de recibir: el costo de esos
              productos se calculó sin ese gasto (ADR-377). */}
          <FleteTardio orden={o} onGuardado={(msg) => { avisar(msg); load(); }} />

          <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mt-2">ID: {o.id}</p>

          {/* Mejora 14: Ahorro vs compra anterior del proveedor */}
          {(() => {
            const prevOCs = orders
              .filter(po => po.id !== o.id && po.supplierId === o.supplierId && new Date(po.createdAt) < new Date(o.createdAt) && po.status !== "cancelado")
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            const prevOC = prevOCs[0];
            if (!prevOC) return <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mt-1 italic">Primera compra a este proveedor</p>;
            const diff = o.total - prevOC.total;
            return (
              <div className={cn("mt-2 inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg",
                diff < 0
                  ? "bg-primary/10 dark:bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:text-[var(--data-success-500)]"
                  : diff > 0
                  ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/15 text-[var(--data-warning-ink)]"
                  : "bg-[var(--surface-alt)] text-[var(--text-secondary)]"
              )}>
                {diff < 0 ? `Ahorraste ${formatCurrency(Math.abs(diff))} vs última compra` :
                 diff > 0 ? `Pagaste ${formatCurrency(diff)} mas vs última compra` :
                 "Mismo total que la compra anterior"}
              </div>
            );
          })()}

          {/* Price comparison for each product */}
          {o.items.length > 0 && (
            <div className="mt-4 space-y-3">
              {o.items.map((item) => (
                <SupplierPriceComparison
                  key={item.productId}
                  productId={item.productId}
                  productName={item.name}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
