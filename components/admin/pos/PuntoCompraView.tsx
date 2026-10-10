"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ScanLine, ShoppingBasket } from "@buleje/design-system/icons";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { formatCurrency } from "@/lib/format";
import type { PurchaseProduct as Product, PurchaseSupplier as Supplier } from "@/lib/types/purchases";
import { usePOSSound } from "./usePOSSound";
import { conCostoEfectivo } from "@/components/admin/compra/costo-compra";
import { useCompraCatalogo } from "@/components/admin/compra/use-compra-catalogo";
import { useCompraCarrito } from "@/components/admin/compra/use-compra-carrito";
import { useConfirmarCompra } from "@/components/admin/compra/use-confirmar-compra";
import { useGastosFijos } from "@/components/admin/compra/use-gastos-fijos";
import { usePlantillasCompra } from "@/components/admin/compra/use-plantillas-compra";
import { useNuevoProveedor } from "@/components/admin/compra/use-nuevo-proveedor";
import { useFacturaEscaneada } from "@/components/admin/compra/use-factura-escaneada";
import CompraBarraControles from "@/components/admin/compra/CompraBarraControles";
import CompraGastosFijos from "@/components/admin/compra/CompraGastosFijos";
import CompraInventarioFiltros from "@/components/admin/compra/CompraInventarioFiltros";
import CompraPromosBanner from "@/components/admin/compra/CompraPromosBanner";
import CompraFacturaLeida from "@/components/admin/compra/CompraFacturaLeida";
import CompraProductos from "@/components/admin/compra/CompraProductos";
import CompraCanasta from "@/components/admin/compra/CompraCanasta";
import NuevoProveedorModal from "@/components/admin/compra/NuevoProveedorModal";

const OCPrintPreviewModal = dynamic(() => import("./OCPrintPreviewModal"), { ssr: false });
const InvoiceScannerModal = dynamic(() => import("./InvoiceScannerModal"), { ssr: false });
const PuntoCompraOrderCreator = dynamic(() => import("./PuntoCompraOrderCreator"), { ssr: false });
const PuntoCompraLotSelector = dynamic(() => import("./PuntoCompraLotSelector"), { ssr: false });

/**
 * Punto de compra (Compras › Punto de compra). Partido el 09-10 de un archivo
 * de 2.455 líneas: la lógica vive en `components/admin/compra/use-*` y cada
 * bloque de la vista en `components/admin/compra/Compra*`.
 */
export default function PuntoCompraView() {
  const { confirm, prompt } = useConfirm();
  const { playDing } = usePOSSound();
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [showInvoiceScanner, setShowInvoiceScanner] = useState(false);
  const [showOrderCreator, setShowOrderCreator] = useState(false);
  const [lotSelectorProduct, setLotSelectorProduct] = useState<Product | null>(null);

  const catalogo = useCompraCatalogo();
  const carrito = useCompraCarrito({ playDing, confirm });
  const gastos = useGastosFijos({ playDing, confirm, setToastMsg });
  const orden = useConfirmarCompra(carrito, setToastMsg);
  const plantillas = usePlantillasCompra({ carrito, products: catalogo.products, suppliers: catalogo.suppliers, confirm, prompt, setToastMsg });
  const factura = useFacturaEscaneada({ carrito, catalogo, setToastMsg });
  const { agregarProveedor } = catalogo;
  const { setSelectedSupplier } = carrito;
  const alCrearProveedor = useCallback((s: Supplier) => {
    agregarProveedor(s);
    setSelectedSupplier(s);
  }, [agregarProveedor, setSelectedSupplier]);
  const np = useNuevoProveedor({ alCrear: alCrearProveedor, setToastMsg });

  // Auto-limpiar toast después de 4 segundos
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 4000);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // Atajo F2 para el lector de código de barras
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "F2") { e.preventDefault(); setShowScanner((s) => !s); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const { cart, total, cartTotalQty } = carrito;

  return (
    <div className="print-area">
      {/* El header del módulo (Compras) lo da el padre ComprasModule. */}
      <CompraBarraControles
        catalogo={catalogo}
        carrito={carrito}
        processing={orden.processing}
        showScanner={showScanner}
        setShowScanner={setShowScanner}
        onEscanearFactura={() => setShowInvoiceScanner(true)}
        onNuevoProveedor={() => np.abrir()}
      />

      <CompraGastosFijos gastos={gastos} />

      <CompraInventarioFiltros
        catalogo={catalogo}
        carrito={carrito}
        showScanner={showScanner}
        setShowScanner={setShowScanner}
        setToastMsg={setToastMsg}
      />

      <CompraPromosBanner carrito={carrito} />

      <CompraFacturaLeida factura={factura} catalogo={catalogo} totalCanasta={total} onCrearProveedor={np.abrir} />

      {/* Layout principal */}
      <div className="flex flex-col lg:flex-row gap-4">
        <CompraProductos catalogo={catalogo} carrito={carrito} />

        {/* FAB scanner mobile */}
        <button
          type="button"
          onClick={() => setShowScanner((s) => !s)}
          className="fixed bottom-20 right-4 lg:hidden z-40 h-12 w-12 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary-dark transition-colors"
          aria-label="Escanear código de barras"
        >
          <ScanLine className="h-5 w-5" />
        </button>

        {/* FAB carrito mobile */}
        {cart.length > 0 && (
          <button
            type="button"
            onClick={() => document.getElementById("poc-cart")?.scrollIntoView({ behavior: "smooth" })}
            className="fixed bottom-20 left-4 lg:hidden z-40 h-12 px-4 rounded-full bg-primary text-white flex items-center gap-2 hover:bg-primary-dark transition-colors"
            aria-label="Ver carrito"
          >
            <ShoppingBasket className="h-4 w-4" />
            <span className="text-sm font-bold">{cartTotalQty}</span>
            <span className="text-xs opacity-80">{formatCurrency(total)}</span>
          </button>
        )}

        <CompraCanasta
          carrito={carrito}
          orden={orden}
          plantillas={plantillas}
          products={catalogo.products}
          onPdf={() => setShowPrintPreview(true)}
          onVenderACliente={() => setShowOrderCreator(true)}
        />
      </div>

      {/* Estilos de impresión */}
      <style jsx global>{`
        @media print {
          body > *:not(.print-area) {
            display: none !important;
          }
          .print-area {
            display: block !important;
          }
        }
      `}</style>

      {/* Toast flotante */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[var(--surface-sunken)] text-white px-4 py-2.5 rounded-lg text-sm font-medium animate-in fade-in slide-in-from-bottom-4 duration-[var(--dur-base)]">
          {toastMsg}
        </div>
      )}

      {showPrintPreview && (
        <OCPrintPreviewModal
          cart={conCostoEfectivo(cart, carrito.priceHistory)}
          subtotal={carrito.subtotal}
          discount={carrito.discount}
          discountAmount={carrito.discountAmount}
          total={total}
          selectedSupplier={carrito.selectedSupplier}
          deliveryDate={carrito.deliveryDate}
          paymentMethod={carrito.paymentMethod}
          notes={carrito.notes}
          lastOCId={carrito.lastOC?.id}
          onClose={() => setShowPrintPreview(false)}
        />
      )}

      {showInvoiceScanner && (
        <InvoiceScannerModal
          open={showInvoiceScanner}
          onClose={() => setShowInvoiceScanner(false)}
          onConfirm={(data) => {
            factura.aplicarFactura(data);
            setShowInvoiceScanner(false);
            requestAnimationFrame(() => document.getElementById("poc-factura")?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
          }}
        />
      )}

      {showOrderCreator && (
        <PuntoCompraOrderCreator open={showOrderCreator} onClose={() => setShowOrderCreator(false)} cartItems={cart} />
      )}

      {lotSelectorProduct && (
        <PuntoCompraLotSelector
          product={lotSelectorProduct}
          open={!!lotSelectorProduct}
          onClose={() => setLotSelectorProduct(null)}
          onSelect={(units) => {
            carrito.addToCart(lotSelectorProduct, units);
            setLotSelectorProduct(null);
          }}
        />
      )}

      <NuevoProveedorModal np={np} />
    </div>
  );
}
