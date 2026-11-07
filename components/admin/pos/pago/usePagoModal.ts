import { useState, useCallback, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { useBilleteraNegocio, tieneQR, type Billetera } from "@/components/admin/pos/pago/useBilleteraNegocio";
import { useFiadoResumen } from "@/components/admin/pos/pago/useFiadoResumen";
import { boletaPideDni, esDni, faltaDniEnBoleta } from "@/lib/sunat/boleta-dni";
import { isValidRuc, type PaymentLine, type PaymentLineMethod, type ComprobanteTipo, type POSPaymentModalProps } from "@/components/admin/pos/pago/pago-shared";

/** Estado del modal de cobro del POS (pago, descuento, cliente, comprobante, billetes). */
export function usePagoModal({
  total: totalDelCarrito, cartCount, onConfirm, onCancel, processing = false, onRepeatOrder,
  customerPhone, customerName, onCustomerPhone: setCustomerPhone, onCustomerName: setCustomerName,
  precioCliente = null, cargandoPrecio = false,
}: POSPaymentModalProps) {
  // Revendedora con su precio vigente: la base del cobro es su total (el servidor
  // lo recalcula al cobrar y no usa el precio ni el descuento por ítem del carrito).
  const subtotal = precioCliente?.aplica ? precioCliente.total : totalDelCarrito;
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([
    { method: "efectivo", amount: subtotal },
  ]);

  // Mejora QW-10a: Auto-seleccionar método de pago frecuente del cliente
  useEffect(() => {
    if (!customerPhone) return;
    try {
      const pref = localStorage.getItem(`customer-payment-pref-${customerPhone}`);
      if (pref && ["efectivo", "yape", "plin", "tarjeta"].includes(pref)) {
        // Lo tipeado como «Recibido» es efectivo: con Yape/Plin/Tarjeta el monto es el total.
        setPaymentLines(prev => prev.length === 1 ? [{ method: pref as PaymentLineMethod, amount: pref === "efectivo" ? prev[0].amount : total }] : prev);
      }
    } catch { /* ignore */ }
    // Sólo al cambiar de cliente: el total de ese momento basta (el efecto de `total` lo sigue).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerPhone]);

  // Tipo de comprobante
  const [comprobanteTipo, setComprobanteTipo] = useState<ComprobanteTipo>("ticket");
  const [comprobanteRuc, setComprobanteRuc] = useState("");
  const [rucError, setRucError] = useState("");
  /** DNI del cliente: sólo se pide (y se manda) en una boleta de más de S/ 700. */
  const [comprobanteDni, setComprobanteDni] = useState("");

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
  // Nunca negativo: `/api/sales` sólo acepta descuentos (descuentoMonto ≥ 0) y uno
  // negativo no viaja — se veía S/ 42 y se registraba S/ 41,60 (17-10).
  // Plegar el panel sólo lo oculta; lo anula «Quitar» (antes plegar lo borraba sin aviso).
  const numDiscountValue = Math.max(0, Number(discountValue) || 0);
  const discountAmount =
    discountMode === "percent"
      ? subtotal * (Math.min(numDiscountValue, 100) / 100)
      : Math.min(numDiscountValue, subtotal);
  const discountPercent =
    discountMode === "percent"
      ? Math.min(numDiscountValue, 100)
      : subtotal > 0 ? (Math.min(numDiscountValue, subtotal) / subtotal) * 100 : 0;
  // En céntimos: 24,90 −10 % daba 22.409999… en «Recibido» y en el amountPaid enviado.
  const total = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);

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

  const cobrarAlSaberPrecio = useRef(false);
  const handleConfirm = () => {
    if (!canConfirm) {
      if (esperandoPrecio) cobrarAlSaberPrecio.current = true;
      return;
    }
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
      // El documento del comprobante: el RUC de la factura o el DNI de la boleta grande.
      comprobanteRuc: comprobanteTipo === "factura" ? comprobanteRuc : pideDni && esDni(comprobanteDni) ? comprobanteDni.trim() : undefined,
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
    // Yape/Plin/Tarjeta no dan vuelto: lo recibido en efectivo no viaja con ellos (un Yape de
    // S/ 50 sobre S/ 41,60 se guardaba con vuelto S/ 8,40 y la caja lo mandaba a «Dar de vuelto»).
    if (method === "efectivo") updateMethod(0, method);
    else {
      setPaymentLines((prev) => prev.map((l, i) => (i === 0 ? { method, amount: total } : l)));
      setBilletes([]);
    }
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

  // SUNAT: la boleta de más de S/ 700 lleva el DNI del cliente (con el descuento ya aplicado).
  const pideDni = boletaPideDni(comprobanteTipo, total);
  const faltaDni = faltaDniEnBoleta(comprobanteTipo, total, comprobanteDni);

  // Todo listo salvo el precio de la clienta, que se está consultando: «Cobrar» sigue prendido
  // y cobra apenas llega si el total no cambió (20-10: tipear el celular e ir directo a
  // «Cobrar» se tragaba el clic). Si cambió (revendedora), se ve el total nuevo y se vuelve a cobrar.
  const listoSalvoPrecio =
    (isFiado ? !!customerPhone : pendiente <= 0.01) &&
    !processing &&
    (comprobanteTipo !== "factura" || isValidRuc(comprobanteRuc)) &&
    !faltaDni;
  const canConfirm = listoSalvoPrecio && !cargandoPrecio;
  const esperandoPrecio = listoSalvoPrecio && cargandoPrecio;
  useEffect(() => {
    if (cargandoPrecio || !cobrarAlSaberPrecio.current) return;
    cobrarAlSaberPrecio.current = false;
    if (!precioCliente?.aplica) handleConfirm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargandoPrecio]);

  return {
    subtotal, cartCount, onCancel, processing, onRepeatOrder, paymentLines, setPaymentLines, customerPhone, setCustomerPhone, customerName, setCustomerName, comprobanteTipo, setComprobanteTipo, comprobanteRuc, setComprobanteRuc, rucError, setRucError, showSplit, setShowSplit, voiceEnabled, setVoiceEnabled, showDiscount, setShowDiscount, discountMode, setDiscountMode, discountValue, setDiscountValue, showCustomerList, setShowCustomerList, yapeNumber, setYapeNumber, plinNumber, setPlinNumber, qrDataUrl, setQrDataUrl, showNewCustomer, setShowNewCustomer, newCustName, setNewCustName, newCustPhone, setNewCustPhone, savingCustomer, setSavingCustomer, billetes, setBilletes, numDiscountValue, discountAmount, discountPercent, total, linesTotal, pendiente, lastLine, vuelto, currentMethod, showQR, addLine, removeLine, updateMethod, updateAmount, handleConfirm, handleSplitConfirm, quickPercent, quickFixed, quickDiscountValues, applyQuickDiscount, totalBilletes, addBillete, limpiarBilletes, quickAmounts, isSinglePayment, isFiado, canConfirm,
    billeteras, qrAbierto, setQrAbierto, elegirMetodo, deuda,
    comprobanteDni, setComprobanteDni, pideDni, faltaDni,
    precioCliente, cargandoPrecio, esperandoPrecio,
  };
}

export type PagoModal = ReturnType<typeof usePagoModal>;
