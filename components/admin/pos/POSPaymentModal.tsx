"use client";

import { useState, useCallback, useEffect } from "react";
import {
  X,
  Plus,
  Banknote,
  Smartphone,
  CreditCard,
  Receipt,
  Loader2,
  Trash2,
  Users,
  Percent,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Search,
  User,
  Phone,
  ClipboardList,
  HandCoins,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import POSCustomerSearch from "./POSCustomerSearch";
import POSSplitPayment from "./POSSplitPayment";

// ── Types ──────────────────────────────────────────────────────────────

export type PaymentLineMethod = "efectivo" | "yape" | "plin" | "tarjeta" | "fiado";

export interface PaymentLine {
  method: PaymentLineMethod;
  amount: number;
}

export type ComprobanteTipo = "ticket" | "boleta" | "factura" | "cotizacion" | "proforma";

export interface PaymentResult {
  payments: PaymentLine[];
  customerPhone?: string;
  customerName?: string;
  comprobanteTipo: ComprobanteTipo;
  comprobanteRuc?: string;
}

interface POSPaymentModalProps {
  total: number;
  cartCount: number;
  cartItems?: { name: string; quantity: number; price: number; unit: string }[];
  onConfirm: (payments: PaymentLine[], customerPhone?: string, extra?: { comprobanteTipo: ComprobanteTipo; comprobanteRuc?: string; customerName?: string; discountAmount?: number; discountPercent?: number }) => void;
  onCancel: () => void;
  processing?: boolean;
  onRepeatOrder?: (items: { productId: number; name: string; quantity: number; price: number }[]) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/${n.toFixed(2)}`;
}

function isValidRuc(ruc: string): boolean {
  if (ruc.length !== 11) return false;
  return ruc.startsWith("10") || ruc.startsWith("20");
}

// ── Mejora 4: Vuelto visual con billetes ──────────────────────────────────────
function calcularVuelto(monto: number): string {
  const denominaciones = [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2];
  const result: string[] = [];
  let restante = monto;
  for (const d of denominaciones) {
    const count = Math.floor(restante / d);
    if (count > 0) {
      result.push(`${count}xS/${d % 1 === 0 ? d : d.toFixed(1)}`);
      restante = Math.round((restante - count * d) * 100) / 100;
    }
  }
  return result.join(" + ");
}

const DENOM_VISUAL: Record<number, { color: string; shape: "rect" | "circle"; label: string }> = {
  200: { color: "bg-emerald-800 text-white", shape: "rect", label: "S/200" },
  100: { color: "bg-emerald-600 text-white", shape: "rect", label: "S/100" },
  50:  { color: "bg-[#f97316] text-white", shape: "rect", label: "S/50" },
  20:  { color: "bg-blue-500 text-white", shape: "rect", label: "S/20" },
  10:  { color: "bg-amber-800 text-white", shape: "rect", label: "S/10" },
  5:   { color: "bg-yellow-400 text-yellow-900", shape: "circle", label: "S/5" },
  2:   { color: "bg-gray-300 text-gray-700", shape: "circle", label: "S/2" },
  1:   { color: "bg-amber-600 text-white", shape: "circle", label: "S/1" },
  0.5: { color: "bg-gray-400 text-white", shape: "circle", label: "S/.50" },
  0.2: { color: "bg-gray-500 text-white", shape: "circle", label: "S/.20" },
};

function VueltoVisual({ monto }: { monto: number }) {
  const denominaciones = [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2];
  const pieces: { denom: number; count: number }[] = [];
  let restante = monto;
  for (const d of denominaciones) {
    const count = Math.floor(restante / d);
    if (count > 0) {
      pieces.push({ denom: d, count });
      restante = Math.round((restante - count * d) * 100) / 100;
    }
  }
  if (pieces.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 justify-center mt-2">
      {pieces.flatMap(({ denom, count }) => {
        const visual = DENOM_VISUAL[denom];
        if (!visual) return [];
        return Array.from({ length: count }, (_, i) => (
          <div
            key={`${denom}-${i}`}
            className={cn(
              "flex items-center justify-center text-[9px] font-bold",
              visual.color,
              visual.shape === "rect"
                ? "w-10 h-5 rounded"
                : "w-7 h-7 rounded-full"
            )}
          >
            {visual.label}
          </div>
        ));
      })}
    </div>
  );
}

const METHODS: {
  id: PaymentLineMethod;
  label: string;
  icon: typeof Banknote;
  color: string;
}[] = [
  { id: "efectivo", label: "Efectivo", icon: Banknote, color: "emerald" },
  { id: "yape", label: "Yape", icon: Smartphone, color: "purple" },
  { id: "plin", label: "Plin", icon: Smartphone, color: "teal" },
  { id: "tarjeta", label: "Tarjeta", icon: CreditCard, color: "blue" },
  { id: "fiado", label: "Fiado", icon: HandCoins, color: "amber" },
];

// ── Customer list sub-panel ──────────────────────────────────────────

interface CustomerListItem {
  phone: string;
  name: string;
  creditBalance?: number;
  categoria?: string;
}

function CustomerListPanel({ onSelect, onClose }: { onSelect: (phone: string, name: string) => void; onClose: () => void }) {
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const res = await fetch("/api/customers?limit=500");
        const data = await res.json();
        setCustomers(Array.isArray(data) ? data : []);
      } catch {
        setCustomers([]);
      }
      setLoading(false);
    };
    fetchCustomers();
  }, []);

  const filtered = filter.trim()
    ? customers.filter(c =>
        c.name.toLowerCase().includes(filter.toLowerCase()) ||
        c.phone.includes(filter)
      )
    : customers;

  return (
    <div className="absolute inset-0 z-10 bg-white dark:bg-card rounded-2xl flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-card-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-bold text-gray-900 dark:text-foreground">Todos los clientes</h4>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors">
          <X className="h-4 w-4 text-gray-400 dark:text-muted" />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b border-gray-100 dark:border-card-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filtrar por nombre o telefono..."
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-xs text-gray-900 dark:text-foreground outline-none focus:border-primary transition-colors"
            autoFocus
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-400 dark:text-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-300 dark:text-muted">
            <User className="h-6 w-6 mb-1.5" />
            <p className="text-xs">Sin resultados</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-card-border">
            {filtered.map(c => (
              <button
                key={c.phone}
                onClick={() => {
                  onSelect(c.phone, c.name);
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-surface transition-colors text-left"
              >
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-900 dark:text-foreground truncate">{c.name}</p>
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-2.5 w-2.5 text-gray-400" />
                    <p className="text-[10px] text-gray-400 dark:text-muted">{c.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {c.categoria && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/20 text-blue-500">
                      {c.categoria}
                    </span>
                  )}
                  {c.creditBalance != null && c.creditBalance > 0 ? (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 dark:bg-red-950/20 text-red-500">
                      Fiado: S/{c.creditBalance.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500">
                      Sin deuda
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer count */}
      <div className="px-4 py-2 border-t border-gray-100 dark:border-card-border text-center">
        <p className="text-[10px] text-gray-400 dark:text-muted">
          {filtered.length} de {customers.length} clientes
        </p>
      </div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────

export default function POSPaymentModal({
  total: subtotal,
  cartCount,
  cartItems: _cartItems,
  onConfirm,
  onCancel,
  processing = false,
  onRepeatOrder,
}: POSPaymentModalProps) {
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([
    { method: "efectivo", amount: subtotal },
  ]);
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerName, setCustomerName] = useState("");

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

  // UX Mejora 13: Cerrar modal con Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !processing) onCancel();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onCancel, processing]);

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

  const canConfirm =
    (isFiado ? !!customerPhone : pendiente <= 0.01) &&
    !processing &&
    (comprobanteTipo !== "factura" || isValidRuc(comprobanteRuc));

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="relative bg-white dark:bg-card rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Customer list overlay (Mejora 3) */}
        {showCustomerList && (
          <CustomerListPanel
            onSelect={(phone, name) => {
              setCustomerPhone(phone);
              setCustomerName(name);
            }}
            onClose={() => setShowCustomerList(false)}
          />
        )}

        {/* Header */}
        <div className="px-3 sm:px-6 py-5 border-b border-gray-100 dark:border-card-border text-center relative">
          <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wider mb-1">
            Total a cobrar
          </p>
          <p className="text-xl sm:text-3xl font-extrabold text-gray-900 dark:text-foreground">
            {fmt(total)}
          </p>
          {discountAmount > 0 && (
            <p className="text-[10px] text-red-500 font-semibold mt-0.5">
              Subtotal: {fmt(subtotal)} &mdash; Desc {discountMode === "percent" ? `${discountPercent.toFixed(0)}%` : ""}: -{fmt(discountAmount)}
            </p>
          )}
          <p className="text-xs text-gray-400 dark:text-muted mt-1">
            {cartCount} {cartCount === 1 ? "articulo" : "articulos"}
          </p>
          {/* Mejora QW-10b: Sugerencia de redondeo */}
          {total % 1 !== 0 && (() => {
            const bajo = Math.floor(total);
            const alto = Math.ceil(total);
            const a5 = Math.ceil(total / 5) * 5;
            const opciones = [
              { val: bajo, diff: total - bajo },
              { val: alto, diff: alto - total },
              ...(total > 10 && a5 !== alto ? [{ val: a5, diff: a5 - total }] : []),
            ].filter(o => Math.abs(o.diff) < 3 && o.val > 0);
            const uniq = [...new Map(opciones.map(o => [o.val, o])).values()];
            if (uniq.length === 0) return null;
            return (
              <div className="flex items-center justify-center gap-1 mt-1.5">
                <span className="text-[10px] text-gray-400">Redondear:</span>
                {uniq.map(o => (
                  <button key={o.val} onClick={() => { setDiscountValue(String((total - o.val).toFixed(2))); setDiscountMode("fixed"); setShowDiscount(true); }}
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted hover:bg-[#0f766e] hover:text-white transition-colors">
                    S/{o.val}
                  </button>
                ))}
              </div>
            );
          })()}
          <button
            onClick={onCancel}
            className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4 text-gray-400 dark:text-muted" />
          </button>
          <kbd className="absolute top-4 left-4 text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded font-mono">
            F2
          </kbd>
          <button onClick={() => { const next = !voiceEnabled; setVoiceEnabled(next); try { localStorage.setItem("pos-voice-total", String(next)); } catch {} }}
            className="absolute top-4 left-14 text-sm opacity-60 hover:opacity-100 transition-opacity" title={voiceEnabled ? "Desactivar voz" : "Activar voz"}>
            {voiceEnabled ? "\uD83D\uDD0A" : "\uD83D\uDD07"}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-5 space-y-5">

          {/* ── Mejora 2: Discount section (collapsible, BEFORE payment methods) ── */}
          <div>
            <button
              onClick={() => setShowDiscount(!showDiscount)}
              className="flex items-center justify-between w-full text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wider mb-2"
            >
              <span className="flex items-center gap-1.5">
                <Percent className="h-3.5 w-3.5" />
                Descuento
                {discountAmount > 0 && (
                  <span className="text-red-500 normal-case font-bold">
                    (-{fmt(discountAmount)})
                  </span>
                )}
              </span>
              {showDiscount ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>

            {showDiscount && (
              <div className="space-y-2 bg-gray-50 dark:bg-surface rounded-xl p-2.5 border border-gray-100 dark:border-card-border">
                <div className="flex items-center gap-2">
                  {/* Toggle % / S/ */}
                  <div className="flex bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-lg overflow-hidden">
                    <button
                      onClick={() => {
                        setDiscountMode("percent");
                        setDiscountValue("");
                      }}
                      className={cn(
                        "px-2 py-1 text-xs font-bold transition-colors flex items-center gap-0.5",
                        discountMode === "percent"
                          ? "bg-primary text-white"
                          : "text-gray-400 dark:text-muted hover:text-gray-600"
                      )}
                    >
                      <Percent className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => {
                        setDiscountMode("fixed");
                        setDiscountValue("");
                      }}
                      className={cn(
                        "px-2 py-1 text-xs font-bold transition-colors flex items-center gap-0.5",
                        discountMode === "fixed"
                          ? "bg-primary text-white"
                          : "text-gray-400 dark:text-muted hover:text-gray-600"
                      )}
                    >
                      <DollarSign className="h-3 w-3" />
                    </button>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max={discountMode === "percent" ? 100 : subtotal}
                    step={discountMode === "percent" ? 1 : 0.5}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder="0"
                    className="w-20 px-2 py-1 text-xs font-bold border border-gray-200 dark:border-card-border rounded-lg text-gray-900 dark:text-foreground outline-none focus:border-primary text-center"
                  />
                  {discountAmount > 0 && (
                    <button
                      onClick={() => {
                        setDiscountValue("");
                        setShowDiscount(false);
                      }}
                      className="text-[10px] font-bold text-red-500 hover:underline"
                    >
                      Quitar
                    </button>
                  )}
                </div>

                {/* Quick buttons */}
                <div className="flex flex-wrap gap-1">
                  {quickDiscountValues.map((q) => (
                    <button
                      key={q}
                      onClick={() => applyQuickDiscount(q)}
                      className={cn(
                        "px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors",
                        Number(discountValue) === q
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-gray-200 dark:border-card-border text-gray-500 dark:text-muted hover:bg-gray-100"
                      )}
                    >
                      {discountMode === "percent" ? `${q}%` : `S/${q}`}
                    </button>
                  ))}
                </div>

                {/* Summary */}
                {discountAmount > 0 && (
                  <div className="text-xs space-y-0.5 pt-1">
                    <div className="flex justify-between text-gray-400 dark:text-muted">
                      <span>Subtotal</span>
                      <span>{fmt(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-red-500 font-semibold">
                      <span>Desc. {discountMode === "percent" ? `${discountPercent.toFixed(0)}%` : ""}</span>
                      <span>-{fmt(discountAmount)}</span>
                    </div>
                    <div className="flex justify-between text-gray-900 dark:text-foreground font-extrabold border-t border-gray-200 dark:border-card-border pt-1">
                      <span>Total</span>
                      <span>{fmt(total)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Payment lines */}
          <div>
            <p className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wider mb-2.5">
              {isSinglePayment ? "Metodo de pago" : "Pago mixto"}
            </p>

            {/* Fiado warning banner */}
            {isFiado && (
              <div className="mb-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-400">Modo Fiado</p>
                  <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-0.5">
                    La venta se registra como deuda. El cliente debe estar seleccionado.
                  </p>
                </div>
              </div>
            )}

            {/* Split payment mode */}
            {showSplit ? (
              <POSSplitPayment
                total={total}
                onSplitPayments={handleSplitConfirm}
                onCancel={() => setShowSplit(false)}
              />
            ) : (
              <>
                {/* Single payment - method selector grid */}
                {isSinglePayment && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                    {METHODS.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => updateMethod(0, m.id)}
                        className={cn(
                          "flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border text-xs font-semibold transition-all",
                          paymentLines[0].method === m.id
                            ? "border-primary bg-primary/5 text-primary ring-1 ring-primary/20"
                            : "border-gray-200 dark:border-card-border text-gray-400 dark:text-muted hover:border-gray-300 hover:text-gray-600"
                        )}
                      >
                        <m.icon className="h-5 w-5" />
                        {m.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* QR configurable para Yape/Plin */}
                {showQR && (() => {
                  const isYape = currentMethod === "yape";
                  const savedNumber = isYape ? yapeNumber : plinNumber;
                  const setSavedNumber = isYape ? setYapeNumber : setPlinNumber;
                  const storageKey = isYape ? "yape-number" : "plin-number";

                  const handlePrintQR = () => {
                    if (!savedNumber) return;
                    const w = window.open("", "_blank", "width=400,height=500");
                    if (!w) return;
                    w.document.write(`
                      <html><head><title>QR ${isYape ? "Yape" : "Plin"}</title>
                      <style>body{text-align:center;font-family:sans-serif;padding:40px}h2{color:${isYape ? "#7c3aed" : "#0d9488"}}img{margin:20px auto}</style>
                      </head><body>
                      <h2>Paga con ${isYape ? "Yape" : "Plin"}</h2>
                      <img src="https://chart.googleapis.com/chart?chs=250x250&cht=qr&chl=${encodeURIComponent(savedNumber)}&choe=UTF-8" width="250" height="250" />
                      <p style="font-size:18px;font-weight:bold">${savedNumber}</p>
                      <p style="font-size:14px;color:#666">Total: ${fmt(total)}</p>
                      </body></html>
                    `);
                    w.document.close();
                    w.print();
                  };

                  return (
                    <div className={cn(
                      "rounded-xl p-3 mb-3 border",
                      isYape
                        ? "bg-purple-50 dark:bg-purple-950/20 border-purple-100 dark:border-purple-800/30"
                        : "bg-teal-50 dark:bg-teal-950/20 border-teal-100 dark:border-teal-800/30"
                    )}>
                      <p className={cn(
                        "text-xs font-bold mb-2 text-center",
                        isYape ? "text-purple-700 dark:text-purple-400" : "text-teal-700 dark:text-teal-400"
                      )}>
                        {isYape ? "Yape" : "Plin"} &middot; {fmt(total)}
                      </p>

                      {/* Input para configurar el numero */}
                      <div className="flex gap-2 items-center mb-2">
                        <input
                          value={savedNumber}
                          onChange={e => {
                            const v = e.target.value.replace(/[^\d+]/g, "").slice(0, 15);
                            setSavedNumber(v);
                            try { localStorage.setItem(storageKey, v); } catch { /* ignore */ }
                          }}
                          placeholder={`Numero ${isYape ? "Yape" : "Plin"} del negocio`}
                          className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-card-border rounded-lg bg-white dark:bg-card text-gray-900 dark:text-foreground outline-none focus:border-primary"
                        />
                        {savedNumber && (
                          <button
                            onClick={handlePrintQR}
                            className={cn(
                              "px-3 py-2 text-xs font-bold rounded-lg hover:opacity-80 transition-opacity",
                              isYape
                                ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                                : "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300"
                            )}
                            title="Imprimir QR"
                          >
                            &#128424; QR
                          </button>
                        )}
                      </div>

                      {/* QR basado en el numero guardado */}
                      {savedNumber ? (
                        <div className="text-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`https://chart.googleapis.com/chart?chs=180x180&cht=qr&chl=${encodeURIComponent(savedNumber)}&choe=UTF-8`}
                            alt={`QR ${currentMethod}`}
                            width={180}
                            height={180}
                            className="mx-auto rounded-lg"
                          />
                          <p className="text-xs text-gray-400 mt-1">Muestrale este QR al cliente</p>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 text-center py-2">
                          Ingresa el numero para generar el QR
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Payment lines list */}
                <div className="space-y-2">
                  {paymentLines.map((line, idx) => (
                    <div
                      key={idx}
                      className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-surface border border-gray-100 dark:border-card-border"
                    >
                      {!isSinglePayment && (
                        <select
                          value={line.method}
                          onChange={(e) =>
                            updateMethod(
                              idx,
                              e.target.value as PaymentLineMethod
                            )
                          }
                          className="flex-1 min-w-24 px-2 py-2 rounded-lg border border-gray-200 dark:border-card-border text-xs font-semibold bg-white dark:bg-card text-gray-700 dark:text-foreground outline-none"
                        >
                          {METHODS.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      )}
                      <div className="relative flex-1 min-w-28">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">
                          S/
                        </span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.10"
                          value={isFiado ? "0.00" : (line.amount || "")}
                          onChange={(e) =>
                            !isFiado && updateAmount(idx, Number(e.target.value) || 0)
                          }
                          readOnly={isFiado}
                          placeholder={total.toFixed(2)}
                          className={cn(
                            "w-full pl-7 pr-2 py-2 rounded-lg border text-sm font-bold text-gray-900 dark:text-foreground outline-none focus:border-primary",
                            isFiado
                              ? "border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20 text-amber-600 cursor-not-allowed"
                              : "border-gray-200 dark:border-card-border"
                          )}
                          autoFocus={idx === 0 && !isFiado}
                        />
                      </div>
                      {paymentLines.length > 1 && (
                        <button
                          onClick={() => removeLine(idx)}
                          className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Quick amounts for single efectivo */}
                {isSinglePayment &&
                  paymentLines[0].method === "efectivo" && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {quickAmounts
                        .filter((a) => a >= total)
                        .slice(0, 4)
                        .map((a) => (
                          <button
                            key={a}
                            onClick={() => updateAmount(0, a)}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors",
                              paymentLines[0].amount === a
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-gray-200 dark:border-card-border text-gray-500 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface"
                            )}
                          >
                            S/{a}
                          </button>
                        ))}
                      <button
                        onClick={() => updateAmount(0, total)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors",
                          paymentLines[0].amount === total
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-gray-200 dark:border-card-border text-gray-500 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface"
                        )}
                      >
                        Exacto
                      </button>
                    </div>
                  )}

                {/* Mejora QW-1: Contador de billetes */}
                {isSinglePayment && paymentLines[0].method === "efectivo" && (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Billetes recibidos</span>
                      {billetes.length > 0 && (
                        <button onClick={limpiarBilletes} className="text-[10px] font-bold text-red-500 hover:underline">Limpiar</button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[200, 100, 50, 20, 10].map(b => (
                        <button key={b} onClick={() => addBillete(b)}
                          className="px-2 py-1 rounded-md bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 text-xs font-bold cursor-pointer hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors">
                          S/{b}
                        </button>
                      ))}
                    </div>
                    {billetes.length > 0 && (
                      <p className="text-xs text-gray-400 dark:text-muted">
                        {billetes.map(b => `S/${b}`).join(" + ")} = <span className="font-bold text-gray-600 dark:text-gray-300">S/{totalBilletes}</span>
                      </p>
                    )}
                  </div>
                )}

                {/* Fiado info */}
                {isFiado && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-2 text-center">
                    Deuda: {fmt(total)} — se registrará a nombre del cliente
                  </p>
                )}

                {/* Add method + Split + totals */}
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-3">
                    {!isFiado && (
                      <>
                        <button
                          onClick={addLine}
                          className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                        >
                          <Plus className="h-3 w-3" /> Agregar metodo
                        </button>
                        {/* Split button */}
                        <button
                          onClick={() => setShowSplit(true)}
                          className="text-xs font-bold text-gray-500 dark:text-muted hover:text-primary flex items-center gap-1 transition-colors"
                        >
                          <Users className="h-3 w-3" /> Dividir cuenta
                        </button>
                      </>
                    )}
                  </div>
                  {paymentLines.length > 1 && (
                    <div className="text-xs">
                      <span
                        className={cn(
                          "font-bold",
                          pendiente <= 0.01
                            ? "text-emerald-600"
                            : "text-red-500"
                        )}
                      >
                        {fmt(linesTotal)}
                      </span>
                      <span className="text-gray-400">
                        {" "}
                        / {fmt(total)}
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Change display */}
          {vuelto > 0 && (
            <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-800/30 rounded-xl p-3 text-center">
              <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">
                Vuelto
              </p>
              <p className="text-xl sm:text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-0.5">
                {fmt(vuelto)}
              </p>
              {vuelto >= 0.2 && (
                <>
                  <VueltoVisual monto={vuelto} />
                  <p className="text-[11px] text-emerald-600/70 dark:text-emerald-500/70 mt-1.5 flex items-center justify-center gap-1">
                    <span>{calcularVuelto(vuelto)}</span>
                  </p>
                </>
              )}
            </div>
          )}

          {/* Pendiente warning */}
          {pendiente > 0.01 && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-800/30 rounded-lg p-2 text-center">
              <span className="text-xs font-bold text-amber-600">
                Falta: {fmt(pendiente)}
              </span>
            </div>
          )}

          {/* Customer search + Ver todos (Mejora 3) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className={cn(
                "text-xs font-bold uppercase tracking-wider",
                isFiado
                  ? "text-amber-600 dark:text-amber-500"
                  : "text-gray-500 dark:text-muted"
              )}>
                Cliente {isFiado ? (
                  <span className="normal-case font-extrabold text-red-500">* requerido</span>
                ) : (
                  "(opcional)"
                )}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowNewCustomer(!showNewCustomer)}
                  className="text-[10px] font-bold text-emerald-600 hover:underline flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" />
                  Nuevo
                </button>
                <button
                  onClick={() => setShowCustomerList(true)}
                  className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                >
                  <ClipboardList className="h-3 w-3" />
                  Ver clientes
                </button>
              </div>
            </div>

            {/* Formulario inline para nuevo cliente */}
            {showNewCustomer && (
              <div className="mb-2 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-800/30 space-y-2">
                <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Nuevo cliente rapido</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCustName}
                    onChange={e => setNewCustName(e.target.value)}
                    placeholder="Nombre"
                    className="flex-1 px-2 py-1.5 text-xs border border-gray-200 dark:border-card-border rounded-lg outline-none focus:border-primary text-gray-900 dark:text-foreground"
                  />
                  <input
                    type="tel"
                    value={newCustPhone}
                    onChange={e => setNewCustPhone(e.target.value.replace(/\D/g, "").slice(0, 9))}
                    placeholder="Celular (9 dig)"
                    className="w-28 px-2 py-1.5 text-xs border border-gray-200 dark:border-card-border rounded-lg outline-none focus:border-primary text-gray-900 dark:text-foreground"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={!newCustName.trim() || newCustPhone.length < 9 || savingCustomer}
                    onClick={async () => {
                      setSavingCustomer(true);
                      try {
                        const res = await fetch("/api/customers", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ name: newCustName.trim(), phone: newCustPhone }),
                        });
                        if (res.ok) {
                          setCustomerPhone(newCustPhone);
                          setCustomerName(newCustName.trim());
                          setShowNewCustomer(false);
                          setNewCustName("");
                          setNewCustPhone("");
                        }
                      } catch { /* ignore */ }
                      setSavingCustomer(false);
                    }}
                    className="flex-1 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-700 transition-colors"
                  >
                    {savingCustomer ? "Guardando..." : "Guardar y seleccionar"}
                  </button>
                  <button
                    onClick={() => { setShowNewCustomer(false); setNewCustName(""); setNewCustPhone(""); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            <POSCustomerSearch
              selectedPhone={customerPhone}
              selectedName={customerName}
              onSelect={(phone, name) => {
                setCustomerPhone(phone);
                setCustomerName(name);
              }}
              onClear={() => {
                setCustomerPhone("");
                setCustomerName("");
              }}
              onRepeatOrder={onRepeatOrder}
            />
          </div>

          {/* Tipo de comprobante */}
          <div>
            <p className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wider mb-2">
              Comprobante
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(["ticket", "boleta", "factura", "cotizacion", "proforma"] as ComprobanteTipo[]).map(
                (tipo) => {
                  const labels: Record<ComprobanteTipo, string> = {
                    ticket: "Ticket",
                    boleta: "Boleta",
                    factura: "Factura",
                    cotizacion: "Cotización",
                    proforma: "Proforma",
                  };
                  return (
                    <button
                      key={tipo}
                      onClick={() => {
                        setComprobanteTipo(tipo);
                        if (tipo !== "factura") {
                          setComprobanteRuc("");
                          setRucError("");
                        }
                      }}
                      className={cn(
                        "flex-1 min-w-[calc(33%-6px)] py-2 rounded-lg text-xs font-bold border transition-all",
                        comprobanteTipo === tipo
                          ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/20"
                          : "border-gray-200 dark:border-card-border text-gray-400 dark:text-muted hover:border-gray-300"
                      )}
                    >
                      {labels[tipo]}
                    </button>
                  );
                }
              )}
            </div>
            {(comprobanteTipo === "cotizacion" || comprobanteTipo === "proforma") && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1.5 font-medium">
                Se generará {comprobanteTipo === "cotizacion" ? "cotización" : "proforma"} con los items del carrito
              </p>
            )}
            {comprobanteTipo === "factura" && (
              <div className="mt-2">
                <input
                  type="text"
                  value={comprobanteRuc}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 11);
                    setComprobanteRuc(v);
                    if (v.length === 11 && !isValidRuc(v)) {
                      setRucError(
                        "RUC debe empezar con 10 (persona) o 20 (empresa)"
                      );
                    } else {
                      setRucError("");
                    }
                  }}
                  placeholder="RUC (11 digitos)"
                  maxLength={11}
                  className={cn(
                    "w-full px-3 py-2.5 rounded-lg border text-sm text-gray-900 dark:text-foreground outline-none transition-colors",
                    rucError
                      ? "border-red-300 focus:border-red-500"
                      : "border-gray-200 dark:border-card-border focus:border-primary"
                  )}
                />
                {rucError && (
                  <p className="text-[10px] text-red-500 mt-1">{rucError}</p>
                )}
                {comprobanteRuc.length > 0 &&
                  comprobanteRuc.length < 11 && (
                    <p className="text-[10px] text-gray-400 mt-1">
                      {11 - comprobanteRuc.length} digitos restantes
                    </p>
                  )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-3 sm:px-6 py-4 border-t border-gray-100 dark:border-card-border">
          {isFiado && !customerPhone && (
            <p className="text-[11px] text-red-500 font-semibold text-center mb-2">
              Selecciona un cliente para continuar
            </p>
          )}
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={cn(
              "w-full py-3.5 rounded-xl font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-white",
              isFiado
                ? "bg-amber-500 hover:bg-amber-600"
                : "bg-primary hover:bg-primary-dark"
            )}
          >
            {processing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isFiado ? (
              <HandCoins className="h-4 w-4" />
            ) : (
              <Receipt className="h-4 w-4" />
            )}
            {processing
              ? "Procesando..."
              : isFiado
              ? `Registrar Fiado ${fmt(total)}`
              : `Confirmar venta ${fmt(total)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
