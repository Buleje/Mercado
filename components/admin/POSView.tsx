"use client";

import { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { LoadingState } from "@buleje/design-system";
import { Info, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import { usePOSKeyboard } from "@/components/admin/pos/usePOSKeyboard";
import { usePOSSound } from "@/components/admin/pos/usePOSSound";
import { usePOSOffline } from "@/components/admin/pos/usePOSOffline";
import { usePOSCatalogo } from "@/components/admin/pos/usePOSCatalogo";
import { usePOSCarrito } from "@/components/admin/pos/usePOSCarrito";
import { usePOSCobro } from "@/components/admin/pos/usePOSCobro";
import { usePOSLectorCodigo } from "@/components/admin/pos/usePOSLectorCodigo";
import POSIdleScreen, { usePOSIdle } from "@/components/admin/pos/POSIdleScreen";
import POSMetricsStrip from "@/components/admin/pos/POSMetricsStrip";
import POSOfflineBar from "@/components/admin/pos/POSOfflineBar";
import POSToolbar from "@/components/admin/pos/POSToolbar";
import POSProductGrid from "@/components/admin/pos/POSProductGrid";
import POSCartPanel, { POSBarraCobroMovil } from "@/components/admin/pos/POSCartPanel";
import POSNoCajaWarning from "@/components/admin/pos/POSNoCajaWarning";
import POSWhatsAppOrderModal from "@/components/admin/pos/POSWhatsAppOrderModal";
import POSSaleHistory from "@/components/admin/pos/POSSaleHistory";
import POSTruequeModal from "@/components/admin/pos/POSTruequeModal";
import POSPaymentModal from "@/components/admin/pos/POSPaymentModal";
import SaleCompleteModal from "@/components/admin/pos/POSSaleCompleteModal";
import POSStockAlerts from "@/components/admin/pos/POSStockAlerts";
import POSReturnModal from "@/components/admin/pos/POSReturnModal";
import ShiftSummaryWidget from "@/components/admin/pos/POSShiftSummary";
import type { PaymentMethod } from "@/components/admin/pos/pos-shared";
import { precargarBilleteras } from "@/components/admin/pos/pago/useBilleteraNegocio";

const BarcodeScanner = dynamic(() => import("@/components/admin/BarcodeScanner"), { ssr: false });

type TamanoLetra = "normal" | "large" | "xlarge";

/**
 * Vender (POS) — ?tab=ventas-caja&vista=pos.
 * Partido el 08-10 (2.727 → este orquestador): el estado vive en usePOSCatalogo / usePOSCarrito /
 * usePOSCobro / usePOSLectorCodigo y cada bloque en components/admin/pos/POS*.tsx.
 */
export default function POSView() {
  const sound = usePOSSound();
  const posOffline = usePOSOffline();
  const catalogo = usePOSCatalogo();
  const { products, loading, fetchProducts, cashRegisterOpen, turnoAbierto } = catalogo;
  const carrito = usePOSCarrito({ products, addToRecents: catalogo.addToRecents, playDing: sound.playDing, playError: sound.playError });
  const { cart, setCart, cartSubtotal, cartTotal, cartCount, updateQuantity, removeFromCart } = carrito;
  const cobro = usePOSCobro({ carrito, fetchProducts, playSaleComplete: sound.playSaleComplete, playError: sound.playError, posOffline });
  const { showPayment, setShowPayment, saleComplete, setSaleComplete, saleError, setSaleError, handlePaymentConfirm } = cobro;
  const { isIdle, setIsIdle } = usePOSIdle();

  const [category, setCategory] = useState("todos");
  const [showScanner, setShowScanner] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  // QA Brandon 2026-06-10 #2: advertencia fuerte al cobrar sin caja o sin turno abiertos.
  const [showNoCajaWarning, setShowNoCajaWarning] = useState(false);
  const [showWhatsAppOrder, setShowWhatsAppOrder] = useState(false);
  const [showTrueque, setShowTrueque] = useState(false);
  const [fontSize, setFontSize] = useState<TamanoLetra>(() => {
    if (typeof window === "undefined") return "normal";
    return (localStorage.getItem("pos-font-size") as TamanoLetra) || "normal";
  });
  const paymentMethod: PaymentMethod = "efectivo";

  useScrollLock(showPayment || !!saleComplete || expanded);
  // Yape/Plin del negocio (Ajustes › Cobros) listos antes de abrir el cobro.
  useEffect(() => { precargarBilleteras(); }, []);

  const { handleBarcode, handleAddTopResult } = usePOSLectorCodigo({
    products,
    addToCart: carrito.addToCart,
    playError: sound.playError,
  });

  // Gate de cobro: sin caja o sin turno, primero el aviso (null = no se sabe: no se traba).
  const openPaymentModal = useCallback(() => {
    if (cart.length === 0) return;
    if (cashRegisterOpen === false || turnoAbierto === false) {
      setShowNoCajaWarning(true);
      return;
    }
    setShowPayment(true);
  }, [cart.length, cashRegisterOpen, turnoAbierto, setShowPayment]);

  // +, −, Supr actúan sobre la primera línea del carrito (como antes: índice fijo 0).
  usePOSKeyboard({
    onOpenPayment: openPaymentModal,
    onClearCart: () => { setCart([]); },
    onOpenLastTicket: () => { setShowHistory(true); },
    // Escape del cobro es de AdminModal (Radix): cierra sólo la capa de arriba (QR de Yape) y respeta
    // «procesando». Este atajo además cerraba el cobro debajo del QR (09-10).
    onCancel: () => {},
    onIncrement: () => { if (cart[0]) updateQuantity(cart[0].product.id, 1); },
    onDecrement: () => { if (cart[0]) updateQuantity(cart[0].product.id, -1); },
    onRemoveSelected: () => { if (cart[0]) removeFromCart(cart[0].product.id); },
    onAddTopResult: handleAddTopResult,
    cartLength: cart.length,
  });

  const handleNewSale = () => {
    setSaleComplete(null);
    cobro.setLastSaleDetails(null);
    setShowPayment(false);
    // Auto-cargar el siguiente cliente de la cola
    if (carrito.clientQueues.length > 0) {
      const [next, ...rest] = carrito.clientQueues;
      setCart(next);
      carrito.setClientQueues(rest);
    }
    // Antes apuntaba a un ref que nunca se conectó: el foco no volvía al buscador.
    document.querySelector<HTMLInputElement>("[data-pos-search]")?.focus();
  };

  const changeFontSize = useCallback((size: TamanoLetra) => {
    setFontSize(size);
    localStorage.setItem("pos-font-size", size);
  }, []);

  // La grilla filtra sólo por categoría (la búsqueda vive en POSSearchBar).
  const filtered = category === "todos" ? products : products.filter((p) => p.category === category);

  if (loading) {
    return <LoadingState message="" size="sm" />;
  }

  const posContent = (
    <>
      <POSMetricsStrip refreshKey={cobro.metricsRefreshKey} />
      <POSOfflineBar
        isOnline={posOffline.isOnline}
        pendingCount={posOffline.pendingCount}
        errorCount={posOffline.errorCount}
        isSyncing={posOffline.isSyncing}
        lastSyncCount={posOffline.lastSyncCount}
        onSyncRun={posOffline.syncQueue}
        onClearErrors={posOffline.clearErrors}
        onClearQueue={posOffline.clearQueue}
      />
      {saleError && (
        <div role="alert" className="flex flex-wrap items-center gap-2 p-3 mb-3 rounded-lg bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/30">
          <Info className="h-4 w-4 text-[var(--data-error-500)] shrink-0" aria-hidden />
          <p className="text-xs text-[var(--data-error-500)] flex-1">{saleError}</p>
          <button aria-label="Quitar" onClick={() => setSaleError(null)} className="p-0.5 text-[var(--data-error-500)]"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-2 sm:gap-4">
        <div
          className={cn(
            "flex-1 bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl overflow-hidden flex flex-col",
            expanded ? "min-h-[calc(100vh-12rem)]" : "",
          )}
          style={expanded ? undefined : { minHeight: "28rem", maxHeight: "calc(100vh - 14rem)" }}
        >
          <POSToolbar
            products={products}
            carrito={carrito}
            category={category}
            setCategory={setCategory}
            cashRegisterOpen={cashRegisterOpen}
            catalogoGuardadoEn={catalogo.catalogoGuardadoEn}
            lastSaleInfo={cobro.lastSaleInfo}
            metricsRefreshKey={cobro.metricsRefreshKey}
            expanded={expanded}
            setExpanded={setExpanded}
            fontSize={fontSize}
            changeFontSize={changeFontSize}
            soundEnabled={sound.enabled}
            toggleSound={sound.toggle}
            handleBarcode={handleBarcode}
            setSaleError={setSaleError}
            onScan={() => setShowScanner(true)}
            onWhatsApp={() => setShowWhatsAppOrder(true)}
            onHistorial={() => setShowHistory(true)}
            onDevolucion={() => setShowReturn(true)}
            onTrueque={() => setShowTrueque(true)}
          />
          <POSProductGrid
            products={products}
            filtered={filtered}
            expanded={expanded}
            cart={cart}
            favorites={catalogo.favorites}
            addToCart={carrito.addToCart}
            toggleFavorite={catalogo.toggleFavorite}
          />
        </div>

        <POSCartPanel
          carrito={carrito}
          expanded={expanded}
          customerPhone={cobro.customerPhone}
          customerName={cobro.customerName}
          onQuitarCliente={() => { cobro.setCustomerPhone(""); cobro.setCustomerName(""); }}
          openPaymentModal={openPaymentModal}
        />
      </div>

      {showNoCajaWarning && (
        <POSNoCajaWarning turnoAbierto={turnoAbierto} cashRegisterOpen={cashRegisterOpen} setShowNoCajaWarning={setShowNoCajaWarning} setShowPayment={setShowPayment} />
      )}

      {isIdle && <POSIdleScreen onWake={() => setIsIdle(false)} />}

      {cart.length > 0 && <POSBarraCobroMovil cartCount={cartCount} cartTotal={cartTotal} onCobrar={openPaymentModal} />}

      <POSWhatsAppOrderModal
        showWhatsAppOrder={showWhatsAppOrder}
        setShowWhatsAppOrder={setShowWhatsAppOrder}
        products={products}
        handleAddFromSearch={carrito.handleAddFromSearch}
      />

      {showScanner && (
        <BarcodeScanner onDetected={(code: string) => { setShowScanner(false); void handleBarcode(code); }} onClose={() => setShowScanner(false)} />
      )}

      <POSSaleHistory showHistory={showHistory} setShowHistory={setShowHistory} />

      <POSTruequeModal
        showTrueque={showTrueque}
        setShowTrueque={setShowTrueque}
        cartTotal={cartTotal}
        processing={cobro.processing}
        customerPhone={cobro.customerPhone}
        handlePaymentConfirm={handlePaymentConfirm}
      />

      {showPayment && (
        <POSPaymentModal
          total={cartSubtotal}
          cartCount={cartCount}
          cartItems={cart.map((i) => ({ name: i.product.name, quantity: i.quantity, price: i.product.price, unit: i.product.unit }))}
          onConfirm={handlePaymentConfirm}
          onCancel={() => setShowPayment(false)}
          processing={cobro.processing}
          onRepeatOrder={(items) => { carrito.handleRepeatOrder(items); setShowPayment(false); }}
          customerPhone={cobro.customerPhone}
          customerName={cobro.customerName}
          onCustomerPhone={cobro.setCustomerPhone}
          onCustomerName={cobro.setCustomerName}
        />
      )}

      {saleComplete && (
        <SaleCompleteModal
          saleComplete={saleComplete}
          lastSaleDetails={cobro.lastSaleDetails}
          cartTotal={cartTotal}
          paymentMethod={paymentMethod}
          cart={cart}
          onNewSale={handleNewSale}
          onClose={() => { setSaleComplete(null); cobro.setLastSaleDetails(null); }}
        />
      )}

      <POSStockAlerts
        stockAlert={carrito.stockAlert}
        setStockAlert={carrito.setStockAlert}
        showZeroStockConfirm={carrito.showZeroStockConfirm}
        setShowZeroStockConfirm={carrito.setShowZeroStockConfirm}
        forceAddZeroStock={carrito.forceAddZeroStock}
      />

      <POSReturnModal isOpen={showReturn} onClose={() => setShowReturn(false)} onReturnComplete={() => fetchProducts()} />

      <ShiftSummaryWidget />
    </>
  );

  // Tamaño de letra del mostrador (menú «Más» › Pantalla)
  const fontSizeStyle = fontSize !== "normal" ? (
    <style>{`
      .pos-large { font-size: 16px; }
      .pos-large button { min-height: 48px; }
      .pos-xlarge { font-size: 18px; }
      .pos-xlarge button { min-height: 56px; }
    `}</style>
  ) : null;

  if (expanded) {
    return (
      <div className={cn("fixed inset-0 z-modal bg-[var(--surface-sunken)] overflow-y-auto", fontSize === "large" && "pos-large", fontSize === "xlarge" && "pos-xlarge")}>
        {fontSizeStyle}
        <div className="max-w-480 mx-auto px-4 sm:px-6 py-4 space-y-4">{posContent}</div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", fontSize === "large" && "pos-large", fontSize === "xlarge" && "pos-xlarge")}>
      {fontSizeStyle}
      {posContent}
    </div>
  );
}
