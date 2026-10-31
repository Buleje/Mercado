"use client";

import { Package } from "@buleje/design-system/icons";
import { TIPOS_COMPROBANTE } from "@/lib/compras/estados-oc";
import { claveDeDia, diaCorto, diasEntre, esperaEntrega, lineasDeSeguimiento } from "@/lib/compras/ciclo-oc";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import SupplierPriceComparison from "@/components/admin/compras/SupplierPriceComparison";
import EnlacePanel from "@/components/admin/shared/EnlacePanel";
import FleteTardio from "@/components/admin/ordenes-compra/FleteTardio";
import OcCicloOrden from "@/components/admin/ordenes-compra/OcCicloOrden";
import type { OrdenOC } from "@/components/admin/ordenes-compra/oc-compartido";
import type { OrdenesCompra } from "@/components/admin/ordenes-compra/hooks/use-ordenes-compra";

/** Detalle desplegado de una orden. Pieza de PurchaseOrdersTab: recibe `useOrdenesCompra` entero. */
export default function OcDetalleOrden({ oc, o }: { oc: OrdenesCompra; o: OrdenOC }) {
  const {
    orders, expanded, avisar, load,
  } = oc;
  /* Cuánto llegó de cada producto según las recepciones (C10): la orden dice lo pedido, esto lo que entró. */
  const lineas = new Map(lineasDeSeguimiento(o.items, o.seguimiento).map((l) => [l.productId, l]));
  const prometida = claveDeDia(o.deliveryDate);
  const llego = claveDeDia(o.receivedDate);
  return (
    <>
      {/* Expanded details */}
      {expanded === o.id && (
        <div className="border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] px-2 sm:px-4 py-2 sm:py-3 bg-[var(--surface-alt)] ">
          <OcCicloOrden oc={oc} o={o} />
          <p className="text-sm font-bold text-[var(--text-tertiary)] dark:text-muted mb-2">Detalle de productos</p>
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

              const l = o.seguimiento ? lineas.get(item.productId) : undefined;
              const mostrarLlegada = l && (l.llego > 0 || l.noLlegara > 0 || o.status === "parcial");
              return (
                <div key={i}>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-[var(--text-primary)] dark:text-[var(--text-primary)] flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5 text-[var(--text-tertiary)] dark:text-muted" />
                      {item.quantity}x{" "}
                      <EnlacePanel cosa="producto" id={String(item.productId)} apariencia="heredada">{item.name}</EnlacePanel>{" "}
                      <span className="text-[var(--text-tertiary)] dark:text-muted">({item.unit})</span>
                    </span>
                    <div className="text-right">
                      <span className="text-[var(--text-tertiary)] dark:text-muted text-sm mr-2">{formatCurrency(Number(item.unitCost))} c/u</span>
                      <span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{formatCurrency(item.quantity * item.unitCost)}</span>
                    </div>
                  </div>
                  {l && mostrarLlegada && (
                    <p data-qa="llegada-item" className={cn("text-sm font-semibold pl-5 mt-0.5", l.falta > 0 && esperaEntrega(o.status) ? "text-[var(--data-warning-ink)]" : "text-[var(--data-success-ink)]")}>
                      {l.llego >= l.pedido ? "Llegó todo" : `Llegó ${l.llego} de ${l.pedido}`}
                      {l.noLlegara > 0 ? ` · ${l.noLlegara} no llegará${l.noLlegara === 1 ? "" : "n"}` : ""}
                      {l.falta > 0 && esperaEntrega(o.status) ? ` · faltan ${l.falta}` : ""}
                    </p>
                  )}
                  {/* Mejora 20: Referencia de precio anterior */}
                  {prevPrice != null && (
                    <p className="text-sm text-[var(--text-tertiary)] pl-5 mt-0.5">
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
            // `deliveryDate` es medianoche UTC: con `formatDate` salía un día antes en Lima.
            if (prometida) datos.push({ etiqueta: "Prometida", valor: diaCorto(prometida) });
            if (llego) datos.push({ etiqueta: "Llegó", valor: diaCorto(llego) });
            if (o.createdBy) datos.push({ etiqueta: "La pidió", valor: o.createdBy });
            if (o.receivedBy) datos.push({ etiqueta: "La recibió", valor: o.receivedBy });
            if (datos.length === 0) return null;
            return (
              <div className="mt-3 flex flex-wrap gap-2">
                {datos.map(d => (
                  <span key={d.etiqueta} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-[var(--surface-sunken)] border border-[var(--rule-base)] text-sm">
                    <span className="font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{d.etiqueta}</span>
                    <span className="font-extrabold text-[var(--text-primary)]">{d.valor}</span>
                  </span>
                ))}
              </div>
            );
          })()}

          {/* Entrega tarde: la promesa contra lo que pasó. */}
          {(() => {
            if (!prometida || !llego) return null;
            const dias = diasEntre(prometida, llego);
            if (dias <= 0) return (
              <p className="mt-2 text-sm font-bold text-[var(--data-success-500)]">
                Llegó {dias === 0 ? "el día prometido" : `${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"} antes`}
              </p>
            );
            return (
              <p className="mt-2 text-sm font-bold text-[var(--data-warning-ink)]">
                Llegó {dias} día{dias === 1 ? "" : "s"} después de lo prometido
              </p>
            );
          })()}

          {/* Cargar el flete después de recibir: el costo de esos
              productos se calculó sin ese gasto (ADR-377). */}
          <FleteTardio orden={o} onGuardado={(msg) => { avisar(msg); load(); }} />

          {/* Mejora 14: Ahorro vs compra anterior del proveedor */}
          {(() => {
            const prevOCs = orders
              .filter(po => po.id !== o.id && po.supplierId === o.supplierId && new Date(po.createdAt) < new Date(o.createdAt) && po.status !== "cancelado")
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            const prevOC = prevOCs[0];
            if (!prevOC) return <p className="text-sm text-[var(--text-tertiary)] dark:text-muted mt-1 italic">Primera compra a este proveedor</p>;
            const diff = o.total - prevOC.total;
            return (
              <div className={cn("mt-2 inline-flex items-center gap-1.5 text-sm font-bold px-2.5 py-1 rounded-lg",
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
