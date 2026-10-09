"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Package, ShoppingBasket } from "@buleje/design-system/icons";
import AdminTabBar, { type AdminTab } from "@/components/admin/shared/AdminTabBar";
import { formatCurrency, formatDateShort } from "@/lib/format";
import type { PurchaseProduct as Product } from "@/lib/types/purchases";
import CompraCanastaItem from "./CompraCanastaItem";
import CompraCanastaTotales from "./CompraCanastaTotales";
import type { CompraCarrito } from "./use-compra-carrito";
import type { ConfirmarCompra } from "./use-confirmar-compra";
import type { PlantillasCompra } from "./use-plantillas-compra";

const PuntoCompraFrequentItems = dynamic(() => import("@/components/admin/pos/PuntoCompraFrequentItems"), { ssr: false });
const PuntoCompraBundles = dynamic(() => import("@/components/admin/pos/PuntoCompraBundles"), { ssr: false });

const PUNTOCOMPRA_MODULE_ID = "punto-compra";
const CART_TAB_ITEMS: AdminTab[] = [
  { id: "carrito", label: "Carrito" },
  { id: "frecuentes", label: "Frecuentes" },
  { id: "paquetes", label: "Paquetes" },
];
type PestanaCanasta = "carrito" | "frecuentes" | "paquetes";

interface Props {
  carrito: CompraCarrito;
  orden: ConfirmarCompra;
  plantillas: PlantillasCompra;
  products: Product[];
  onPdf: () => void;
  onVenderACliente: () => void;
}

/** Sidebar de la canasta: pestañas, últimas OC del proveedor, ítems con costo y totales. */
export default function CompraCanasta({ carrito, orden, plantillas, products, onPdf, onVenderACliente }: Props) {
  const { cart, hasDraft, cartTotalQty, clearCart, selectedSupplier, supplierHistory, addToCart } = carrito;
  const { processing } = orden;
  const [cartTab, setCartTab] = useState<PestanaCanasta>("carrito");

  return (
    <aside id="poc-cart" aria-label="Canasta de compra" className="w-full lg:w-80 xl:w-96 shrink-0">
      <div className="sticky top-4 bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl overflow-hidden">
        {/* Header carrito */}
        <div className="p-4 border-b border-[var(--rule-soft)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBasket aria-hidden="true" className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm text-[var(--text-primary)]">Canasta</span>
            {hasDraft && cart.length === 0 && (
              <span className="text-xs bg-[var(--data-warning-100)] text-[var(--data-warning-500)] px-1.5 py-0.5 rounded-full font-medium">
                Borrador
              </span>
            )}
            {cart.length > 0 && (
              <span
                role="img"
                aria-label={`${cartTotalQty} unidades en canasta`}
                className="h-5 w-5 rounded-full bg-primary text-white text-xs flex items-center justify-center font-bold"
              >
                {cartTotalQty > 99 ? "99+" : cartTotalQty}
              </span>
            )}
          </div>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={clearCart}
              disabled={processing}
              className="text-xs text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Limpiar
            </button>
          )}
        </div>

        {/* Tabs: Carrito | Frecuentes | Paquetes */}
        <AdminTabBar
          tabs={CART_TAB_ITEMS}
          activeTab={cartTab}
          onTabChange={(id) => setCartTab(id as PestanaCanasta)}
          moduleId={PUNTOCOMPRA_MODULE_ID}
          draggable={false}
        />

        {cartTab === "frecuentes" && (
          <PuntoCompraFrequentItems
            onAddToCart={(productId: number, quantity: number) => {
              const product = products.find((p) => p.id === productId);
              if (product) {
                addToCart(product, quantity);
                setCartTab("carrito");
              }
            }}
          />
        )}

        {cartTab === "paquetes" && (
          <PuntoCompraBundles
            onAddBundle={(items: Array<{ productId: number; quantity: number }>) => {
              items.forEach((item) => {
                const product = products.find((p) => p.id === item.productId);
                if (product) addToCart(product, item.quantity);
              });
              setCartTab("carrito");
            }}
          />
        )}

        {cartTab === "carrito" && (
          <>
            {/* Historial del proveedor */}
            {selectedSupplier && supplierHistory.length > 0 && (
              <div className="px-3 pt-2 pb-1 border-b border-[var(--rule-soft)]">
                <p className="text-xs font-semibold text-[var(--text-tertiary)] mb-1.5">Últimas OC a {selectedSupplier.name}</p>
                <div className="space-y-1">
                  {supplierHistory.map((h) => (
                    <div key={h.id} className="flex items-center justify-between text-xs">
                      <span className="text-[var(--text-secondary)] truncate">{h.id.slice(0, 15)}...</span>
                      <span className="font-mono font-medium text-[var(--text-primary)]">{formatCurrency(Number(h.total))}</span>
                      <span className="text-[var(--text-tertiary)]">{h.date ? formatDateShort(h.date) : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Items del carrito */}
            <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
              {cart.length === 0 ? (
                <div className="text-center py-8 text-[var(--text-tertiary)] text-sm">
                  <Package aria-hidden="true" className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p>Selecciona productos del catálogo</p>
                </div>
              ) : (
                cart.map((item) => (
                  <CompraCanastaItem key={item.product.id} item={item} carrito={carrito} processing={processing} />
                ))
              )}
            </div>
          </>
        )}

        <CompraCanastaTotales carrito={carrito} orden={orden} plantillas={plantillas} onPdf={onPdf} onVenderACliente={onVenderACliente} />
      </div>
    </aside>
  );
}
