import { useState, useEffect } from "react";
import { usePOSOffline } from "@/components/admin/pos/usePOSOffline";
import type { PaymentLine } from "@/components/admin/pos/POSPaymentModal";
import { csrfHeaders } from "@/lib/csrf-client";
import type { LastSaleDetails, ExtraCobro } from "@/components/admin/pos/pos-shared";
import type { POSCarrito } from "@/components/admin/pos/usePOSCarrito";

interface UsePOSCobroOpciones {
  carrito: POSCarrito;
  fetchProducts: () => Promise<void>;
  playSaleComplete: (amount: number) => void;
  playError: () => void;
  posOffline: ReturnType<typeof usePOSOffline>;
}

/** Cobro del POS: registra la venta (o la encola sin conexión) y guarda lo que muestra el ticket. */
export function usePOSCobro({ carrito, fetchProducts, playSaleComplete, playError, posOffline }: UsePOSCobroOpciones) {
  const { cart, setCart, cartSubtotal, globalDiscount, setGlobalDiscount } = carrito;
  const [showPayment, setShowPayment] = useState(false);
  const [customerPhone, setCustomerPhone] = useState("");
  const [processing, setProcessing] = useState(false);
  const [saleComplete, setSaleComplete] = useState<{ id: string; change: number } | null>(null);
  const [saleError, setSaleError] = useState<string | null>(null);
  // QA Brandon 2026-06-10 #3: key para refrescar métricas del turno post-venta.
  const [metricsRefreshKey, setMetricsRefreshKey] = useState(0);
  // Mejora P-3: Última venta rápida
  const [lastSaleInfo, setLastSaleInfo] = useState<{ total: number; time: Date; id: string; minutesAgo: number } | null>(null);

  // Mejora P-3: Actualizar minutesAgo cada 30s
  useEffect(() => {
    if (!lastSaleInfo) return;
    const iv = setInterval(() => {
      setLastSaleInfo(prev => prev ? { ...prev, minutesAgo: Math.floor((Date.now() - prev.time.getTime()) / 60000) } : null);
    }, 30000);
    return () => clearInterval(iv);
  }, [lastSaleInfo?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [lastSaleDetails, setLastSaleDetails] = useState<LastSaleDetails | null>(null);

  // ── New Payment Modal handler (Upgrade 3) ─────────────────────────────────

  const handlePaymentConfirm = async (payments: PaymentLine[], phone?: string, extra?: ExtraCobro) => {
    if (cart.length === 0 || processing) return;
    setProcessing(true);
    setSaleError(null);

    const effectiveDiscount = extra?.discountAmount || globalDiscount.monto;
    const effectiveDiscountPct = extra?.discountPercent || globalDiscount.porcentaje;
    const effectiveTotal = Math.max(0, cartSubtotal - effectiveDiscount);

    const effectivePayment = payments.length > 1
      ? "MIXTO"
      : payments[0].method;
    const effectivePaid = payments.reduce((s, p) => s + p.amount, 0);
    const effectiveChange = Math.max(0, effectivePaid - effectiveTotal);

    const salePayload = {
      items: cart.map(i => ({
        productId: i.product.id,
        name: i.product.name,
        price: i.product.price,
        quantity: i.quantity,
        unit: i.product.unit,
        discount: i.discount && i.discount > 0 ? i.discount : undefined,
      })),
      payment: effectivePayment,
      amountPaid: effectivePaid,
      customerPhone: phone || customerPhone || undefined,
      paymentDetails: payments.length > 1 ? JSON.stringify(payments) : undefined,
      // Comprobante
      comprobanteTipo: extra?.comprobanteTipo || "ticket",
      comprobanteRuc: extra?.comprobanteRuc || undefined,
      // Descuento global (ahora viene del modal de pago)
      descuentoMonto: effectiveDiscount > 0 ? effectiveDiscount : undefined,
      descuentoPorcentaje: effectiveDiscountPct > 0 ? effectiveDiscountPct : undefined,
    };

    // Save sale details for WhatsApp button
    const saleDetailsForWhatsApp: typeof lastSaleDetails = {
      items: cart.map(i => ({ name: i.product.name, quantity: i.quantity, price: i.product.price })),
      total: effectiveTotal,
      payment: effectivePayment,
      customerPhone: phone || customerPhone || undefined,
      customerName: extra?.customerName,
      discountAmount: effectiveDiscount > 0 ? effectiveDiscount : undefined,
      comprobanteTipo: extra?.comprobanteTipo || "ticket",
    };

    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(salePayload),
      });
      const sale = await res.json();
      if (res.ok) {
        playSaleComplete(effectiveTotal);
        // Cerrar el modal de pago ANTES de abrir el de exito — evita stacking
        setShowPayment(false);
        setSaleComplete({ id: sale.id, change: sale.change ?? effectiveChange });
        // QA Brandon 2026-06-10 #3: refrescar el strip de métricas del turno
        setMetricsRefreshKey((k) => k + 1);
        // Attach comprobanteNumero from API response
        if (sale.comprobanteNumero) {
          saleDetailsForWhatsApp.comprobanteNumero = sale.comprobanteNumero;
        } else {
          console.warn("[POS] La API /api/sales no retorno comprobanteNumero.", { saleId: sale.id, comprobanteTipo: extra?.comprobanteTipo });
        }
        setLastSaleDetails(saleDetailsForWhatsApp);
        setLastSaleInfo({ total: effectiveTotal, time: new Date(), id: sale.id, minutesAgo: 0 });

        // Audit 2026-05-17 (POS↔Fiado integration): la creación del Fiado
        // ahora vive server-side dentro de la misma transacción de Sale
        // (atómico). Antes este bloque hacía un POST /api/fiados separado
        // que podía fallar dejando deuda fantasma. Si payment==="fiado" el
        // backend devuelve `sale.fiadoId` y bloquea la venta con 400 si no
        // hay phone o si el scoring crediticio rechaza al cliente.
        if (sale.fiadoId && process.env.NODE_ENV === "development") {
          console.log("[POS] Fiado creado atómico:", sale.fiadoId);
        }

        // Mejora QW-11a: limpiar backup carrito
        sessionStorage.removeItem("pos-cart-backup");
        // Mejora QW-11c: guardar items para repetir venta
        try { localStorage.setItem("pos-last-sale-items", JSON.stringify(cart.map(i => ({ productId: i.product.id, name: i.product.name, quantity: i.quantity, price: i.product.price, stock: i.product.stock })))); } catch { /* ignore */ }
        setCart([]);
        setCustomerPhone("");
        setGlobalDiscount({ monto: 0, porcentaje: 0 });
        fetchProducts();
      } else {
        playError();
        setSaleError(sale.error ?? "Error al registrar la venta");
      }
    } catch {
      // Offline fallback
      try {
        posOffline.addToQueue(salePayload);
        playSaleComplete(effectiveTotal);
        setShowPayment(false);
        setSaleComplete({ id: `offline_${Date.now()}`, change: effectiveChange });
        setLastSaleDetails(saleDetailsForWhatsApp);
        setCart([]);
        setCustomerPhone("");
        setGlobalDiscount({ monto: 0, porcentaje: 0 });
      } catch {
        playError();
        setSaleError("Error al guardar la venta offline");
      }
    }
    setProcessing(false);
  };

  return {
    showPayment, setShowPayment, customerPhone, processing, saleComplete, setSaleComplete, saleError, setSaleError,
    metricsRefreshKey, lastSaleInfo, lastSaleDetails, setLastSaleDetails, handlePaymentConfirm,
  };
}
