import { useState, useCallback, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { useBilleteraNegocio, tieneQR, type Billetera } from "@/components/admin/pos/pago/useBilleteraNegocio";
import { useFiadoResumen } from "@/components/admin/pos/pago/useFiadoResumen";
import { isValidRuc, type PaymentLine, type PaymentLineMethod, type ComprobanteTipo, type POSPaymentModalProps } from "@/components/admin/pos/pago/pago-shared";

/** Estado del modal de cobro del POS (pago, descuento, cliente, comprobante, billetes). */
export function usePagoModal({
  total: subtotal, cartCount, onConfirm, onCancel, processing = false, onRepeatOrder,
  customerPhone, customerName, onCustomerPhone: setCustomerPhone, onCustomerName: setCustomerName,
}: POSPaymentModalProps) {
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([
    { method: "efectivo", amount: subtotal },
  ]);

  // Mejora QW-10a: Auto-seleccionar método de pago frecuente del cliente
  useEffect(() => {
    if (!customerPhone) return;
    try {
      const pref = localStorage.getItem(`customer-payment-pref-${customerPhone}`);
      if (pref && ["efectivo", "yape", "plin", "tarjeta"].includes(pref)) {
        setPaymentLines(prev => prev.length === 1 ? [{ method: pref as PaymentLineMethod, amount: prev[0].amount }] : prev);
      }
    } catch { /* ignore */ }
  }, [customerPhone]);

  // Tipo de comprobante
  const [comprobanteTipo, setComprobanteTipo] = useState<ComprobanteTipo>("ticket");
  const [comprobanteRuc, setComprobanteRuc] = useState("");
  const [rucError, setRucError] = useState("");

  // Split payment mode
  const [showSplit, setShowSplit] = useState(false);

  // Mejora QW-10c: Resumen vocal del total
  const [voiceEnabled, setVoiceEnabled] = useState(() => {
    try { return localStorage.getItem("pos-voice-total") !== "false"; } catch { return true; }
  });
  useEffect(() => {
    if (subtotal > 0 && voiceEnabled && "speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(`Total: ${subtotal.toFixed(2)} soles`);
      u.lang = "es-PE"; u.rate = 0.9; u.volume = 0.7;
      speechSynthesis.speak(u);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // UX Mejora 13: Escape ahora lo provee AdminModal vía Radix Dialog.
  // Bloqueamos el cierre durante `processing` gateando onClose abajo.

  // Mejora 2: Discount inside modal
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountMode, setDiscountMode] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState("");

  // Mejora 3: Customer list panel
  const [showCustomerList, setShowCustomerList] = useState(false);

  // ── Discount calculations ──────────────────────────────────────────
  const numDiscountValue = Number(discountValue) || 0;
  const discountAmount = showDiscount
    ? discountMode === "percent"
      ? subtotal * (Math.min(numDiscountValue, 100) / 100)
      : Math.min(numDiscountValue, subtotal)
    : 0;
  const discountPercent = showDiscount
    ? discountMode === "percent"
      ? Math.min(numDiscountValue, 100)
      : subtotal > 0 ? (Math.min(numDiscountValue, subtotal) / subtotal) * 100 : 0
    : 0;
  const total = Math.max(0, subtotal - discountAmount);

  // Update payment amount when discount changes
  useEffect(() => {
    if (paymentLines.length === 1) {
      setPaymentLines([{ method: paymentLines[0].method, amount: total }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  const linesTotal = paymentLines.reduce((s, l) => s + l.amount, 0);
  const pendiente = total - linesTotal;

  // Change: only if last method is efectivo and overpaid
  const lastLine = paymentLines[paymentLines.length - 1];
  const vuelto =
    lastLine?.method === "efectivo" && linesTotal > total
      ? linesTotal - total
      : 0;

  // Detect Yape/Plin for QR display
  const currentMethod = paymentLines.length === 1 ? paymentLines[0].method : null;
  const showQR = currentMethod === "yape" || currentMethod === "plin";

  // QR configurable: números guardados para Yape y Plin
  const [yapeNumber, setYapeNumber] = useState(() => {
    try { return localStorage.getItem("yape-number") || ""; } catch { return ""; }
  });
  const [plinNumber, setPlinNumber] = useState(() => {
    try { return localStorage.getItem("plin-number") || ""; } catch { return ""; }
  });

  // QR generado localmente (chart.googleapis.com está muerto desde 2019).
  // Se recalcula cuando cambia el método activo o el número guardado.
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  useEffect(() => {
    const num = currentMethod === "yape" ? yapeNumber : plinNumber;
    if (!showQR || !/^\+?\d{6,15}$/.test(num)) { setQrDataUrl(null); return; }
    QRCode.toDataURL(num, { width: 256, margin: 1, color: { dark: "#1a3d2e", light: "#ffffff" } })
      .then(setQrDataUrl).catch(() => setQrDataUrl(null));
  }, [showQR, currentMethod, yapeNumber, plinNumber]);

  // Estado para nuevo cliente inline
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [savingCustomer, setSavingCustomer] = useState(false);


  const addLine = useCallback(() => {
    setPaymentLines((prev) => [
      ...prev,
      {
        method: "efectivo",
        amount: Math.max(
          0,
          total - prev.reduce((s, l) => s + l.amount, 0)
        ),
      },
    ]);
  }, [total]);

  const removeLine = useCallback((idx: number) => {
    setPaymentLines((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const updateMethod = useCallback(
    (idx: number, method: PaymentLineMethod) => {
      setPaymentLines((prev) =>
        prev.map((l, i) => (i === idx ? { ...l, method } : l))
      );
    },
    []
  );

  const updateAmount = useCallback(
    (idx: number, amount: number) => {
      setPaymentLines((prev) =>
        prev.map((l, i) => (i === idx ? { ...l, amount } : l))
      );
    },
    []
  );

  const handleConfirm = () => {
    if (!canConfirm) return;
    // Mejora QW-10a: Guardar método de pago frecuente del cliente
    if (customerPhone && paymentLines.length === 1 && paymentLines[0].method !== "fiado") {
      try { localStorage.setItem(`customer-payment-pref-${customerPhone}`, paymentLines[0].method); } catch { /* ignore */ }
    }
    // For fiado: force amountPaid = 0
    const confirmedPayments = isFiado
      ? [{ method: "fiado" as PaymentLineMethod, amount: 0 }]
      : paymentLines;
    onConfirm(confirmedPayments, customerPhone || undefined, {
      comprobanteTipo,
      comprobanteRuc: comprobanteTipo === "factura" ? comprobanteRuc : undefined,
      customerName: customerName || undefined,
      discountAmount: discountAmount > 0 ? discountAmount : undefined,
      discountPercent: discountPercent > 0 ? discountPercent : undefined,
    });
  };

  // Split payment handler
  const handleSplitConfirm = (splitPayments: PaymentLine[]) => {
    setPaymentLines(splitPayments);
    setShowSplit(false);
  };

  // Discount quick values
  const quickPercent = [5, 10, 15];
  const quickFixed = [5, 10, 50];
  const quickDiscountValues = discountMode === "percent" ? quickPercent : quickFixed;

  const applyQuickDiscount = (val: number) => {
    setDiscountValue(String(val));
  };

  // Mejora QW-1: Contador de billetes recibidos
  const [billetes, setBilletes] = useState<number[]>([]);
  const totalBilletes = billetes.reduce((s, b) => s + b, 0);

  const addBillete = (valor: number) => {
    const next = [...billetes, valor];
    setBilletes(next);
    const nuevoTotal = next.reduce((s, b) => s + b, 0);
    if (paymentLines.length === 1 && paymentLines[0].method === "efectivo") {
      updateAmount(0, nuevoTotal);
    }
  };

  const limpiarBilletes = () => {
    setBilletes([]);
    if (paymentLines.length === 1 && paymentLines[0].method === "efectivo") {
      updateAmount(0, total);
    }
  };

  const quickAmounts = [5, 10, 20, 50, 100];
  const isSinglePayment = paymentLines.length === 1;
  const isFiado = isSinglePayment && paymentLines[0].method === "fiado";

  // Yape/Plin con el QR que el negocio subió en Ajustes › Cobros: al elegirlo se abre en grande.
  const billeteras = useBilleteraNegocio();
  const [qrAbierto, setQrAbierto] = useState<Billetera | null>(null);
  // Si tocan Yape antes de que llegue Ajustes, se abre apenas llega (si siguen en Yape).
  const qrPorAbrir = useRef<Billetera | null>(null);
  const elegirMetodo = (method: PaymentLineMethod) => {
    updateMethod(0, method);
    const billetera = method === "yape" || method === "plin" ? method : null;
    qrPorAbrir.current = billetera && !billeteras ? billetera : null;
    if (billetera && tieneQR(billeteras?.[billetera])) setQrAbierto(billetera);
  };
  useEffect(() => {
    const b = qrPorAbrir.current;
    if (!b || !billeteras) return;
    qrPorAbrir.current = null;
    if (currentMethod === b && tieneQR(billeteras[b])) setQrAbierto(b);
  }, [billeteras, currentMethod]);

  // Lo que el cliente ya debe: el aviso de Fiado dice en cuánto quedaría con esta venta.
  const deuda = useFiadoResumen(customerPhone);

  const canConfirm =
    (isFiado ? !!customerPhone : pendiente <= 0.01) &&
    !processing &&
    (comprobanteTipo !== "factura" || isValidRuc(comprobanteRuc));

  return {
    subtotal, cartCount, onCancel, processing, onRepeatOrder, paymentLines, setPaymentLines, customerPhone, setCustomerPhone, customerName, setCustomerName, comprobanteTipo, setComprobanteTipo, comprobanteRuc, setComprobanteRuc, rucError, setRucError, showSplit, setShowSplit, voiceEnabled, setVoiceEnabled, showDiscount, setShowDiscount, discountMode, setDiscountMode, discountValue, setDiscountValue, showCustomerList, setShowCustomerList, yapeNumber, setYapeNumber, plinNumber, setPlinNumber, qrDataUrl, setQrDataUrl, showNewCustomer, setShowNewCustomer, newCustName, setNewCustName, newCustPhone, setNewCustPhone, savingCustomer, setSavingCustomer, billetes, setBilletes, numDiscountValue, discountAmount, discountPercent, total, linesTotal, pendiente, lastLine, vuelto, currentMethod, showQR, addLine, removeLine, updateMethod, updateAmount, handleConfirm, handleSplitConfirm, quickPercent, quickFixed, quickDiscountValues, applyQuickDiscount, totalBilletes, addBillete, limpiarBilletes, quickAmounts, isSinglePayment, isFiado, canConfirm,
    billeteras, qrAbierto, setQrAbierto, elegirMetodo, deuda,
  };
}

export type PagoModal = ReturnType<typeof usePagoModal>;
