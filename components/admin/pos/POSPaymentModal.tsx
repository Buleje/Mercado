"use client";

import { useState, useCallback, useEffect } from "react";
import QRCode from "qrcode";
import AdminModal from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
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
  Volume2,
  VolumeX,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import POSCustomerSearch from "./POSCustomerSearch";
import POSSplitPayment from "./POSSplitPayment";
import { csrfHeaders } from "@/lib/csrf-client";

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

// Colores reales de billetes/monedas peruanos para que cada denominación
// se distinga a simple vista, independiente del brand del tenant.
const DENOM_VISUAL: Record<number, { color: string; shape: "rect" | "circle"; label: string }> = {
  200: { color: "bg-indigo-700 text-white",  shape: "rect",   label: "S/200" },
  100: { color: "bg-emerald-600 text-white", shape: "rect",   label: "S/100" },
  50:  { color: "bg-violet-600 text-white",  shape: "rect",   label: "S/50"  },
  20:  { color: "bg-orange-500 text-white",  shape: "rect",   label: "S/20"  },
  10:  { color: "bg-sky-500 text-white",     shape: "rect",   label: "S/10"  },
  5:   { color: "bg-yellow-400 text-yellow-900", shape: "circle", label: "S/5"   },
  2:   { color: "bg-gray-300 text-gray-800", shape: "circle", label: "S/2"   },
  1:   { color: "bg-gray-400 text-white",    shape: "circle", label: "S/1"   },
  0.5: { color: "bg-amber-700 text-white",   shape: "circle", label: "S/.50" },
  0.2: { color: "bg-amber-800 text-white",   shape: "circle", label: "S/.20" },
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
              "flex items-center justify-center text-[length:var(--ts-2xs)] font-bold",
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
    <div className="absolute inset-0 z-10 bg-[var(--surface-raised)] rounded-2xl flex flex-col">
      {/* Header grande */}
      <div className="px-6 py-5 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h4 className="text-lg font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Todos los clientes</h4>
            <p className="text-sm text-[var(--text-tertiary)] dark:text-muted">Selecciona un cliente existente</p>
          </div>
        </div>
        <button onClick={onClose} aria-label="Cerrar" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors">
          <X className="h-5 w-5 text-[var(--text-tertiary)] dark:text-muted" />
        </button>
      </div>

      {/* Search — input grande */}
      <div className="px-6 py-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Buscar por nombre o teléfono..."
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-base text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            autoFocus
          />
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-[var(--text-tertiary)] dark:text-muted">
            <Loader2 className="h-7 w-7 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-[var(--text-tertiary)] dark:text-muted gap-2">
            <User className="h-10 w-10 opacity-40" />
            <p className="text-base font-semibold">Sin resultados</p>
            <p className="text-sm">Prueba con otro nombre o teléfono</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-card-border">
            {filtered.map(c => (
              <button
                key={c.phone}
                onClick={() => {
                  onSelect(c.phone, c.name);
                  onClose();
                }}
                className="w-full flex items-center gap-4 px-6 py-4 hover:bg-gray-50 dark:hover:bg-surface transition-colors text-left"
              >
                <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">{c.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Phone className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                    <p className="text-sm text-[var(--text-tertiary)] dark:text-muted tabular-nums">{c.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {c.categoria && (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 dark:bg-primary/15 text-primary">
                      {c.categoria}
                    </span>
                  )}
                  {c.creditBalance != null && c.creditBalance > 0 ? (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--data-error-50)] dark:bg-red-950/20 text-[var(--data-error-500)]">
                      Fiado S/{Number(c.creditBalance).toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--data-success-500)]/10 dark:bg-[var(--data-success-500)]/15 text-[var(--data-success-500)]">
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
      <div className="px-6 py-3 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] text-center bg-gray-50/50 dark:bg-surface/30">
        <p className="text-sm text-[var(--text-tertiary)] dark:text-muted">
          <span className="font-semibold text-[var(--text-secondary)]">{filtered.length}</span> de {customers.length} clientes
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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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

  const canConfirm =
    (isFiado ? !!customerPhone : pendiente <= 0.01) &&
    !processing &&
    (comprobanteTipo !== "factura" || isValidRuc(comprobanteRuc));

  if (!mounted) return null;

  return (
    <AdminModal
      open
      onClose={() => { if (!processing) onCancel(); }}
      variant="pos"
      hideCloseButton
    >
      <div className="relative flex flex-col h-full bg-linear-to-br from-[var(--surface-sunken)] to-[var(--surface-raised)] dark:from-surface dark:to-[var(--surface-raised)]">
        {/* Customer list overlay */}
        {showCustomerList && (
          <CustomerListPanel
            onSelect={(phone, name) => {
              setCustomerPhone(phone);
              setCustomerName(name);
            }}
            onClose={() => setShowCustomerList(false)}
          />
        )}

        {/*
          Brandon 2026-05-17 — Header hero neutro del proyecto Buleje
          (independiente del brand naranja del tenant mi-pollo).
          Fondo surface elegante + primary teal para el acento + glow
          radial sutil del primary. Total display gigante intacto.
        */}
        <div className="shrink-0 relative overflow-hidden border-b border-[var(--rule-base)] bg-linear-to-b from-[var(--surface-raised)] to-[var(--surface-sunken)] dark:from-[var(--surface-raised)] dark:to-surface">
          {/* Glow decorativo de fondo (sutil, primary del proyecto) */}
          <div className="absolute inset-0 pointer-events-none opacity-60 bg-[radial-gradient(ellipse_at_top_left,rgba(0, 160, 160,0.10),transparent_60%)] dark:bg-[radial-gradient(ellipse_at_top_left,rgba(20, 194, 194,0.10),transparent_60%)]" />

          <div className="relative px-5 sm:px-6 py-4 flex items-center gap-4">
            {/* Voice toggle (izquierda) */}
            <button
              onClick={() => { const next = !voiceEnabled; setVoiceEnabled(next); try { localStorage.setItem("pos-voice-total", String(next)); } catch {} }}
              className="shrink-0 h-10 w-10 rounded-full flex items-center justify-center bg-[var(--surface-raised)] border border-[var(--rule-soft)] hover:border-primary/40 shadow-sm transition-colors text-[var(--text-secondary)] hover:text-primary"
              title={voiceEnabled ? "Desactivar voz" : "Activar voz"}
              aria-label="Toggle voz"
            >
              {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>

            {/* Centro: label + total + chip items */}
            <div className="flex-1 min-w-0 flex flex-col">
              <p className="text-[length:var(--ts-2xs)] font-extrabold text-primary uppercase tracking-[var(--tracking-eyebrow)] mb-0.5">
                Total a cobrar
              </p>
              <div className="flex items-baseline gap-3 flex-wrap">
                <p className="text-4xl lg:text-5xl font-extrabold text-[var(--text-primary)] tabular-nums leading-none">
                  {fmt(total)}
                </p>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/20 shadow-sm">
                    <Receipt className="h-3.5 w-3.5" />
                    {cartCount} {cartCount === 1 ? "articulo" : "articulos"}
                  </span>
                  {discountAmount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--data-error-500)]/15 text-[var(--data-error-500)] text-xs font-extrabold shadow-sm">
                      <Percent className="h-3 w-3" />
                      −{fmt(discountAmount)} dto
                    </span>
                  )}
                </div>
                {/* Redondeo chips inline */}
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
                    <div className="hidden lg:flex items-center gap-1">
                      <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-bold uppercase tracking-wide">Redondear:</span>
                      {uniq.map(o => (
                        <button key={o.val} onClick={() => { setDiscountValue(String((total - o.val).toFixed(2))); setDiscountMode("fixed"); setShowDiscount(true); }}
                          className="px-2 py-0.5 rounded-md text-xs font-extrabold bg-[var(--surface-raised)] border border-[var(--rule-soft)] hover:bg-primary hover:text-white hover:border-primary shadow-sm transition-colors">
                          S/{o.val}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Cerrar (derecha) */}
            <button
              onClick={onCancel}
              aria-label="Cerrar"
              className="shrink-0 h-10 w-10 rounded-full flex items-center justify-center bg-[var(--surface-raised)] border border-[var(--rule-soft)] hover:bg-[var(--data-error-500)] hover:text-white hover:border-[var(--data-error-500)] text-[var(--text-secondary)] shadow-sm transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/*
          v3 body: cada columna es un CARD elegante (rounded-2xl + shadow)
          con header de sección (icono circular + título). Cards separados
          por gap-4. Padding interno generoso.

          Col 1 (lg:5) — 💳 Pago
          Col 2 (lg:3) — 👤 Cliente
          Col 3 (lg:4) — 🧾 Comprobante
        */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 sm:px-5 py-4 grid grid-cols-1 lg:grid-cols-12 gap-4">

            {/* COL 1 — Card Pago */}
            <div className="lg:col-span-5 min-w-0 rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--rule-soft)] flex items-center gap-2.5">
                <span className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Banknote className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-extrabold text-[var(--text-primary)] uppercase tracking-wide">Pago</h3>
              </div>
              <div className="px-4 py-3 space-y-3 min-w-0">

          {/* Descuento — collapsible */}
          <div>
            <button
              onClick={() => setShowDiscount(!showDiscount)}
              className="flex items-center justify-between w-full text-sm font-semibold text-[var(--text-secondary)] dark:text-muted mb-3"
            >
              <span className="flex items-center gap-2">
                <Percent className="h-4 w-4" />
                Descuento
                {discountAmount > 0 && (
                  <span className="text-[var(--data-error-500)] font-bold">
                    (-{fmt(discountAmount)})
                  </span>
                )}
              </span>
              {showDiscount ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {showDiscount && (
              <div className="space-y-3 bg-gray-50 dark:bg-surface rounded-xl p-4 border border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                <div className="flex items-center gap-3">
                  <div className="flex bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg overflow-hidden">
                    <button
                      onClick={() => {
                        setDiscountMode("percent");
                        setDiscountValue("");
                      }}
                      className={cn(
                        "px-3 py-2 text-sm font-semibold transition-colors flex items-center gap-1",
                        discountMode === "percent"
                          ? "bg-primary text-white"
                          : "text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-secondary)]"
                      )}
                    >
                      <Percent className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        setDiscountMode("fixed");
                        setDiscountValue("");
                      }}
                      className={cn(
                        "px-3 py-2 text-sm font-semibold transition-colors flex items-center gap-1",
                        discountMode === "fixed"
                          ? "bg-primary text-white"
                          : "text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-secondary)]"
                      )}
                    >
                      <DollarSign className="h-3.5 w-3.5" />
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
                    className="w-24 px-3 py-2 text-sm font-semibold border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary text-center"
                  />
                  {discountAmount > 0 && (
                    <button
                      onClick={() => {
                        setDiscountValue("");
                        setShowDiscount(false);
                      }}
                      className="text-sm font-semibold text-[var(--data-error-500)] hover:underline"
                    >
                      Quitar
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {quickDiscountValues.map((q) => (
                    <button
                      key={q}
                      onClick={() => applyQuickDiscount(q)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors",
                        Number(discountValue) === q
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:bg-gray-100"
                      )}
                    >
                      {discountMode === "percent" ? `${q}%` : `S/${q}`}
                    </button>
                  ))}
                </div>

                {discountAmount > 0 && (
                  <div className="text-sm space-y-1.5 pt-2">
                    <div className="flex justify-between text-[var(--text-tertiary)] dark:text-muted">
                      <span>Subtotal</span>
                      <span className="tabular-nums">{fmt(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-[var(--data-error-500)] font-semibold">
                      <span>Descuento {discountMode === "percent" ? `${discountPercent.toFixed(0)}%` : ""}</span>
                      <span className="tabular-nums">-{fmt(discountAmount)}</span>
                    </div>
                    <div className="flex justify-between text-[var(--text-primary)] dark:text-[var(--text-primary)] font-extrabold border-t border-[var(--rule-base)] dark:border-[var(--rule-base)] pt-2 text-base">
                      <span>Total</span>
                      <span className="tabular-nums">{fmt(total)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Payment lines */}
          <div>
            <p className="text-sm font-semibold text-[var(--text-secondary)] dark:text-muted mb-3">
              {isSinglePayment ? "Metodo de pago" : "Pago mixto"}
            </p>

            {/* Fiado warning banner */}
            {isFiado && (
              <div className="mb-4 p-4 rounded-xl bg-[var(--data-warning-50)] dark:bg-amber-950/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/30 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-[var(--data-warning-500)] shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">Modo Fiado</p>
                  <p className="text-sm text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] mt-1">
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
                {/* Single payment - method selector grid (v3 visual) */}
                {isSinglePayment && (
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3">
                    {METHODS.map((m) => {
                      const selected = paymentLines[0].method === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => updateMethod(0, m.id)}
                          className={cn(
                            "group relative flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border-2 text-xs font-extrabold transition-all overflow-hidden",
                            selected
                              ? "border-primary bg-primary/10 text-primary shadow-md"
                              : "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:border-primary/40 hover:bg-[var(--surface-raised)] hover:-translate-y-0.5"
                          )}
                        >
                          <span className={cn(
                            "h-9 w-9 rounded-full flex items-center justify-center transition-colors",
                            selected
                              ? "bg-primary text-white"
                              : "bg-[var(--surface-raised)] text-[var(--text-secondary)] group-hover:bg-primary/10 group-hover:text-primary",
                          )}>
                            <m.icon className="h-4 w-4" />
                          </span>
                          <span className="uppercase tracking-wide">{m.label}</span>
                        </button>
                      );
                    })}
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
                    // SECURITY 2026-05-17 (audit C4): validar formato estricto antes
                    // de imprimir. localStorage puede contener payloads contaminados
                    // de sesiones previas (legacy sin sanitize). Si el número no es
                    // 100% dígitos opcional con + inicial → abortar impresión.
                    if (!/^\+?\d{6,15}$/.test(savedNumber)) {
                      alert("Número inválido para QR. Solo dígitos (opcional + al inicio).");
                      return;
                    }
                    const w = window.open("", "_blank", "width=400,height=500");
                    if (!w) return;
                    // DOM API en lugar de document.write con interpolación —
                    // textContent escapa automáticamente cualquier markup.
                    const doc = w.document;
                    doc.title = `QR ${isYape ? "Yape" : "Plin"}`;
                    const style = doc.createElement("style");
                    style.textContent = `body{text-align:center;font-family:sans-serif;padding:40px}h2{color:${isYape ? "#7c3aed" : "#0891b2"}}img{margin:20px auto}`;
                    doc.head.appendChild(style);
                    const h2 = doc.createElement("h2");
                    h2.textContent = `Paga con ${isYape ? "Yape" : "Plin"}`;
                    const img = doc.createElement("img");
                    if (qrDataUrl) img.src = qrDataUrl;
                    img.width = 250;
                    img.height = 250;
                    img.alt = "QR";
                    const numP = doc.createElement("p");
                    numP.style.fontSize = "18px";
                    numP.style.fontWeight = "bold";
                    numP.textContent = savedNumber;
                    const totP = doc.createElement("p");
                    totP.style.fontSize = "14px";
                    totP.style.color = "#666";
                    totP.textContent = `Total: ${fmt(total)}`;
                    doc.body.appendChild(h2);
                    doc.body.appendChild(img);
                    doc.body.appendChild(numP);
                    doc.body.appendChild(totP);
                    w.print();
                  };

                  return (
                    <div className={cn(
                      "rounded-xl p-3 mb-3 border",
                      isYape
                        ? "bg-purple-50 dark:bg-purple-950/20 border-purple-100 dark:border-purple-800/30"
                        : "bg-cyan-50 dark:bg-cyan-950/20 border-cyan-100 dark:border-cyan-800/30"
                    )}>
                      <p className={cn(
                        "text-xs font-bold mb-2 text-center",
                        isYape ? "text-purple-700 dark:text-purple-300" : "text-cyan-700 dark:text-cyan-300"
                      )}>
                        {isYape ? "Yape" : "Plin"} &middot; {fmt(total)}
                      </p>

                      {/* Input para configurar el número */}
                      <div className="flex gap-2 items-center mb-2">
                        <input
                          value={savedNumber}
                          onChange={e => {
                            const v = e.target.value.replace(/[^\d+]/g, "").slice(0, 15);
                            setSavedNumber(v);
                            try { localStorage.setItem(storageKey, v); } catch { /* ignore */ }
                          }}
                          placeholder={`Número ${isYape ? "Yape" : "Plin"} del negocio`}
                          className="flex-1 px-3 py-2 text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary"
                        />
                        {savedNumber && (
                          <button
                            onClick={handlePrintQR}
                            className={cn(
                              "px-3 py-2 text-xs font-bold rounded-lg hover:opacity-80 transition-opacity",
                              isYape
                                ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                                : "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300"
                            )}
                            title="Imprimir QR"
                          >
                            &#128424; QR
                          </button>
                        )}
                      </div>

                      {/* QR basado en el número guardado (generado localmente) */}
                      {savedNumber && qrDataUrl ? (
                        <div className="text-center">
                          {/* eslint-disable-next-line @next/next/no-img-element -- data URL local, next/image no aplica */}
                          <img
                            src={qrDataUrl}
                            alt={`QR ${currentMethod}`}
                            width={180}
                            height={180}
                            className="mx-auto rounded-lg bg-white p-1"
                          />
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">Muestrale este QR al cliente</p>
                        </div>
                      ) : (
                        <p className="text-xs text-[var(--text-tertiary)] text-center py-2">
                          Ingresa el número para generar el QR
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
                      className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-surface border border-[var(--rule-soft)] dark:border-[var(--rule-base)]"
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
                          className="flex-1 min-w-24 px-2 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-xs font-semibold bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none"
                        >
                          {METHODS.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      )}
                      <div className="relative flex-1 min-w-28">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] text-xs font-bold">
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
                            "w-full pl-7 pr-2 py-2 rounded-lg border text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary",
                            isFiado
                              ? "border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-amber-950/20 text-[var(--data-warning-500)] cursor-not-allowed"
                              : "border-[var(--rule-base)] dark:border-[var(--rule-base)]"
                          )}
                          autoFocus={idx === 0 && !isFiado}
                        />
                      </div>
                      {paymentLines.length > 1 && (
                        <button
                          onClick={() => removeLine(idx)}
                          className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors"
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
                    <div className="flex flex-wrap gap-2 mt-3">
                      {quickAmounts
                        .filter((a) => a >= total)
                        .slice(0, 4)
                        .map((a) => (
                          <button
                            key={a}
                            onClick={() => updateAmount(0, a)}
                            className={cn(
                              "px-4 py-2 rounded-lg text-sm font-semibold border transition-colors",
                              paymentLines[0].amount === a
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-surface"
                            )}
                          >
                            S/{a}
                          </button>
                        ))}
                      <button
                        onClick={() => updateAmount(0, total)}
                        className={cn(
                          "px-4 py-2 rounded-lg text-sm font-semibold border transition-colors",
                          paymentLines[0].amount === total
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-surface"
                        )}
                      >
                        Exacto
                      </button>
                    </div>
                  )}

                {/* Contador de billetes */}
                {isSinglePayment && paymentLines[0].method === "efectivo" && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-[var(--text-tertiary)]">Billetes recibidos</span>
                      {billetes.length > 0 && (
                        <button onClick={limpiarBilletes} className="text-sm font-semibold text-[var(--data-error-500)] hover:underline">Limpiar</button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[200, 100, 50, 20, 10].map(b => (
                        <button key={b} onClick={() => addBillete(b)}
                          className="px-3 py-1.5 rounded-lg bg-[var(--data-success-500)]/10 dark:bg-[var(--data-success-500)]/15 text-[var(--data-success-500)] dark:text-[var(--data-success-500)] text-sm font-semibold cursor-pointer hover:bg-[var(--data-success-500)]/20 dark:hover:bg-[var(--data-success-500)]/25 transition-colors border border-[var(--data-success-500)]/20">
                          S/{b}
                        </button>
                      ))}
                    </div>
                    {billetes.length > 0 && (
                      <p className="text-sm text-[var(--text-tertiary)] dark:text-muted">
                        {billetes.map(b => `S/${b}`).join(" + ")} = <span className="font-bold text-[var(--text-secondary)]">S/{totalBilletes}</span>
                      </p>
                    )}
                  </div>
                )}

                {/* Fiado info */}
                {isFiado && (
                  <p className="text-sm text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] mt-3 text-center">
                    Deuda: {fmt(total)} — se registrará a nombre del cliente
                  </p>
                )}

                {/* Add method + Split + totals */}
                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center gap-4">
                    {!isFiado && (
                      <>
                        <button
                          onClick={addLine}
                          className="text-sm font-semibold text-primary hover:underline flex items-center gap-1.5"
                        >
                          <Plus className="h-4 w-4" /> Agregar metodo
                        </button>
                        <button
                          onClick={() => setShowSplit(true)}
                          className="text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:text-primary flex items-center gap-1.5 transition-colors"
                        >
                          <Users className="h-4 w-4" /> Dividir cuenta
                        </button>
                      </>
                    )}
                  </div>
                  {paymentLines.length > 1 && (
                    <div className="text-sm">
                      <span
                        className={cn(
                          "font-bold",
                          pendiente <= 0.01
                            ? "text-[var(--data-success-500)]"
                            : "text-[var(--data-error-500)]"
                        )}
                      >
                        {fmt(linesTotal)}
                      </span>
                      <span className="text-[var(--text-tertiary)]">
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
            <div className="bg-[var(--data-success-500)]/10 dark:bg-[var(--data-success-500)]/15 border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 rounded-xl p-4 text-center">
              <p className="text-sm text-[var(--data-success-500)] font-semibold uppercase tracking-wide">
                Vuelto
              </p>
              <p className="text-3xl sm:text-4xl font-extrabold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] mt-1 tabular-nums">
                {fmt(vuelto)}
              </p>
              {vuelto >= 0.2 && (
                <>
                  <VueltoVisual monto={vuelto} />
                  <p className="text-sm text-[var(--data-success-500)]/80 dark:text-[var(--data-success-500)]/80 mt-2 flex items-center justify-center gap-1">
                    <span>{calcularVuelto(vuelto)}</span>
                  </p>
                </>
              )}
            </div>
          )}

          {/* Pendiente warning */}
          {pendiente > 0.01 && (
            <div className="bg-[var(--data-warning-50)] dark:bg-amber-950/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/30 rounded-lg p-3 text-center">
              <span className="text-sm font-bold text-[var(--data-warning-500)]">
                Falta: {fmt(pendiente)}
              </span>
            </div>
          )}

              </div>{/* fin contenido card Pago */}
            </div>{/* fin Card Pago */}

            {/* COL 2 — Card Cliente */}
            <div className="lg:col-span-3 min-w-0 rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--rule-soft)] flex items-center gap-2.5">
                <span className="h-8 w-8 rounded-full bg-[var(--data-success-500)]/15 flex items-center justify-center text-[var(--data-success-500)]">
                  <User className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-extrabold text-[var(--text-primary)] uppercase tracking-wide">Cliente</h3>
                {isFiado && <span className="ml-auto text-[length:var(--ts-2xs)] font-extrabold text-[var(--data-error-500)] uppercase">Requerido</span>}
              </div>
              <div className="px-4 py-3 space-y-3 min-w-0">

          {/* Customer search */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className={cn(
                "text-sm font-semibold",
                isFiado
                  ? "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]"
                  : "text-[var(--text-secondary)] dark:text-muted"
              )}>
                Cliente {isFiado ? (
                  <span className="font-extrabold text-[var(--data-error-500)]">* requerido</span>
                ) : (
                  "(opcional)"
                )}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowNewCustomer(!showNewCustomer)}
                  className="text-sm font-semibold text-[var(--data-success-500)] hover:bg-[var(--data-success-500)]/10 dark:hover:bg-[var(--data-success-500)]/15 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Nuevo
                </button>
                <button
                  onClick={() => setShowCustomerList(true)}
                  className="text-sm font-semibold text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <ClipboardList className="h-4 w-4" />
                  Ver clientes
                </button>
              </div>
            </div>

            {/* Formulario inline nuevo cliente — grande y legible */}
            {showNewCustomer && (
              <div className="mb-3 p-5 rounded-2xl bg-[var(--data-success-500)]/8 dark:bg-[var(--data-success-500)]/12 border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-[var(--data-success-500)]/15 flex items-center justify-center">
                    <Plus className="h-5 w-5 text-[var(--data-success-500)]" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">Nuevo cliente</p>
                    <p className="text-sm text-[var(--data-success-500)]/80 dark:text-[var(--data-success-500)]/80">Nombre + celular, y listo</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <Field label="Nombre completo" labelClassName="text-sm font-semibold text-[var(--text-secondary)] dark:text-muted mb-1.5 block">
                    <input
                      type="text"
                      value={newCustName}
                      onChange={e => setNewCustName(e.target.value)}
                      placeholder="Ej: Maria Rodriguez"
                      className="w-full px-4 py-3 text-base border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] transition-all"
                    />
                  </Field>
                  <Field label="Celular (9 dígitos)" labelClassName="text-sm font-semibold text-[var(--text-secondary)] dark:text-muted mb-1.5 block">
                    {(id) => (
                    <>
                    <input
                      id={id}
                      type="tel"
                      value={newCustPhone}
                      onChange={e => setNewCustPhone(e.target.value.replace(/\D/g, "").slice(0, 9))}
                      placeholder="9XX XXX XXX"
                      className="w-full px-4 py-3 text-base tabular-nums border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] transition-all"
                    />
                    {newCustPhone.length > 0 && newCustPhone.length < 9 && (
                      <p className="text-sm text-[var(--text-tertiary)] mt-1.5">Faltan {9 - newCustPhone.length} dígitos</p>
                    )}
                    </>
                    )}
                  </Field>
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    disabled={!newCustName.trim() || newCustPhone.length < 9 || savingCustomer}
                    onClick={async () => {
                      setSavingCustomer(true);
                      try {
                        const res = await fetch("/api/customers", {
                          method: "POST",
                          headers: csrfHeaders({ "Content-Type": "application/json" }),
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
                    className="flex-1 py-3 rounded-xl bg-[var(--data-success-500)] text-white text-base font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--data-success-500)]/90 transition-colors flex items-center justify-center gap-2"
                  >
                    {savingCustomer ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      <>
                        <Plus className="h-5 w-5" />
                        Guardar y seleccionar
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => { setShowNewCustomer(false); setNewCustName(""); setNewCustPhone(""); }}
                    className="px-5 py-3 rounded-xl text-base font-semibold text-[var(--text-secondary)] hover:bg-white dark:hover:bg-[var(--surface-raised)] transition-colors"
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

              </div>{/* fin contenido card Cliente */}
            </div>{/* fin Card Cliente */}

            {/* COL 3 — Card Comprobante */}
            <div className="lg:col-span-4 min-w-0 rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--rule-soft)] flex items-center gap-2.5">
                <span className="h-8 w-8 rounded-full bg-[var(--data-warning-500)]/15 flex items-center justify-center text-[var(--data-warning-500)]">
                  <Receipt className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-extrabold text-[var(--text-primary)] uppercase tracking-wide">Comprobante</h3>
              </div>
              <div className="px-4 py-3 space-y-3 min-w-0">

          {/* Tipo de comprobante */}
          <div>
            <p className="text-sm font-semibold text-[var(--text-secondary)] dark:text-muted mb-2">
              Comprobante
            </p>
            {/*
              Brandon 2026-05-16 v2: grid 3 columnas fijo en lugar de
              flex-wrap, así los chips Ticket/Boleta/Factura quedan
              en la primera fila y Cotización/Proforma en la segunda,
              sin solaparse aunque la columna sea estrecha.
            */}
            <div className="grid grid-cols-3 gap-1.5">
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
                        "py-2 rounded-lg text-xs font-semibold border transition-all truncate",
                        comprobanteTipo === tipo
                          ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/20"
                          : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:border-gray-300 hover:text-[var(--text-primary)]"
                      )}
                    >
                      {labels[tipo]}
                    </button>
                  );
                }
              )}
            </div>
            {(comprobanteTipo === "cotizacion" || comprobanteTipo === "proforma") && (
              <p className="text-sm text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] mt-2 font-medium">
                Se generará {comprobanteTipo === "cotizacion" ? "cotización" : "proforma"} con los items del carrito
              </p>
            )}
            {comprobanteTipo === "factura" && (
              <div className="mt-3">
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
                    "w-full px-3 py-3 rounded-lg border text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none transition-colors",
                    rucError
                      ? "border-[var(--data-error-500)] focus:border-[var(--data-error-500)]"
                      : "border-[var(--rule-base)] dark:border-[var(--rule-base)] focus:border-primary"
                  )}
                />
                {rucError && (
                  <p className="text-sm text-[var(--data-error-500)] mt-1.5">{rucError}</p>
                )}
                {comprobanteRuc.length > 0 &&
                  comprobanteRuc.length < 11 && (
                    <p className="text-sm text-[var(--text-tertiary)] mt-1.5">
                      {11 - comprobanteRuc.length} digitos restantes
                    </p>
                  )}
              </div>
            )}
          </div>
              </div>{/* fin contenido card Comprobante */}
            </div>{/* fin Card Comprobante */}
          </div>{/* fin grid 12 cols */}
        </div>{/* fin body scroll */}

        {/*
          Footer premium: shadow superior + gradient sutil + CTA con
          glow accent. Botón Confirmar imponente con icon grande +
          monto destacado.
        */}
        <div className="shrink-0 px-5 sm:px-6 py-3.5 border-t border-[var(--rule-soft)] bg-[var(--surface-raised)] shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.06)]">
          {isFiado && !customerPhone && (
            <p className="text-sm text-[var(--data-error-500)] font-semibold text-center mb-3">
              Selecciona un cliente para continuar
            </p>
          )}
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={cn(
              "group relative w-full py-4 rounded-2xl font-extrabold text-base transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-between px-6 text-white overflow-hidden",
              isFiado
                ? "bg-[var(--data-warning-500)] hover:brightness-110 shadow-lg"
                : "bg-linear-to-r from-primary to-[var(--color-primary-dark)] hover:brightness-110 shadow-lg"
            )}
          >
            <span className="flex items-center gap-2.5">
              {processing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isFiado ? (
                <HandCoins className="h-5 w-5" />
              ) : (
                <Receipt className="h-5 w-5" />
              )}
              <span>
                {processing
                  ? "Procesando..."
                  : isFiado
                  ? "Registrar fiado"
                  : "Confirmar venta"}
              </span>
            </span>
            {!processing && (
              <span className="text-2xl tabular-nums tracking-tight">
                {fmt(total)}
              </span>
            )}
          </button>
        </div>
      </div>
    </AdminModal>
  );
}
