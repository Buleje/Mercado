"use client";

import { CardTitle, LoadingState } from "@buleje/design-system";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, Minus, ShoppingBasket, ScanBarcode,
  Banknote, X, Check, Loader2,
  Receipt, Package, Maximize2, Minimize2,
  Star, Clock, History, Percent, Info, Printer,
  Volume2, VolumeX, MessageCircle, Send, RotateCcw,
  ChevronDown, ChevronRight, ShoppingCart,
} from "@buleje/design-system/icons";
import EmptyState from "@/components/admin/shared/EmptyState";
import Image from "next/image";
import { m } from "@/components/admin/providers";
import { cn } from "@/lib/utils";
import { categories } from "@/data/products";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import dynamic from "next/dynamic";
import { isThermalPrintSupported, printThermal } from "@/lib/thermal-printer";
import type { Product as BaseProduct } from "@/types/erp";
type Product = Omit<BaseProduct, "id"> & { id: number; stock?: number; stockMin?: number };

// POS Upgrades
import { usePOSKeyboard } from "@/components/admin/pos/usePOSKeyboard";
import { usePOSSound } from "@/components/admin/pos/usePOSSound";
import { usePOSOffline } from "@/components/admin/pos/usePOSOffline";
import POSMetricsStrip from "@/components/admin/pos/POSMetricsStrip";
import POSOfflineBar from "@/components/admin/pos/POSOfflineBar";
import POSFiadoPanel from "@/components/admin/pos/POSFiadoPanel";
import POSPaymentModal from "@/components/admin/pos/POSPaymentModal";
import type { PaymentLine, ComprobanteTipo } from "@/components/admin/pos/POSPaymentModal";
import POSSearchBar from "@/components/admin/pos/POSSearchBar";
import POSFrequentProducts from "@/components/admin/pos/POSFrequentProducts";
import POSExpressMode from "@/components/admin/pos/POSExpressMode";
import POSPausedCarts from "@/components/admin/pos/POSPausedCarts";
import POSCrossSell from "@/components/admin/pos/POSCrossSell";
import POSCartDetail from "@/components/admin/pos/POSCartDetail";
import POSVoiceInput from "@/components/admin/pos/POSVoiceInput";
import POSReturnModal from "@/components/admin/pos/POSReturnModal";

const BarcodeScanner = dynamic(() => import("@/components/admin/BarcodeScanner"), { ssr: false });
const YapeQRPayment = dynamic(() => import("@/components/admin/YapeQRPayment"), { ssr: false });

// ── Types ────────────────────────────────────────────────────────────────────


interface CartItem {
  product: Product;
  quantity: number;
  discount?: number; // percentage 0-100
}

type PaymentMethod = "efectivo" | "yape" | "plin" | "tarjeta" | "fiado" | "trueque";

interface SplitEntry { method: PaymentMethod; amount: number; }

interface SaleRecord {
  id: string;
  createdAt: string;
  total: number;
  payment: string;
  items: { quantity: number }[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return `S/${n.toFixed(2)}`; }

function readStoredIds(key: string) {
  if (typeof window === "undefined") return [] as number[];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [] as number[];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is number => typeof value === "number") : [];
  } catch {
    return [] as number[];
  }
}

// ── Mejora 4R2: Total en palabras ────────────────────────────────────────────
function numeroAPalabras(n: number): string {
  const unidades = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
  const decenas = ['', 'diez', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  const especiales: Record<number, string> = { 11: 'once', 12: 'doce', 13: 'trece', 14: 'catorce', 15: 'quince' };

  const entero = Math.floor(n);
  const centavos = Math.round((n - entero) * 100);

  let texto = '';
  if (entero === 0) texto = 'cero';
  else if (entero < 10) texto = unidades[entero];
  else if (especiales[entero]) texto = especiales[entero];
  else if (entero < 20) texto = `dieci${unidades[entero - 10]}`;
  else if (entero < 100) {
    const d = Math.floor(entero / 10);
    const u = entero % 10;
    texto = u === 0 ? decenas[d] : `${decenas[d]} y ${unidades[u]}`;
  } else if (entero < 1000) {
    const c = Math.floor(entero / 100);
    const resto = entero % 100;
    const centena = c === 1 ? (resto === 0 ? 'cien' : 'ciento') : `${unidades[c]}cientos`;
    texto = resto === 0 ? centena : `${centena} ${numeroAPalabras(resto)}`;
  } else {
    texto = `${Math.floor(entero / 1000)} mil ${entero % 1000 > 0 ? numeroAPalabras(entero % 1000) : ''}`;
  }

  return centavos > 0
    ? `${texto} soles con ${numeroAPalabras(centavos)} centimos`
    : `${texto} soles`;
}

// ── Mejora 1R2: Atajos rapidos del cajero ────────────────────────────────────
function POSCajeroFavorites({ products, onAddToCart }: { products: Product[]; onAddToCart: (p: Product) => void }) {
  const [favIds, setFavIds] = useState<number[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem("pos-cajero-favorites");
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [configMode, setConfigMode] = useState(false);

  const saveFavs = (ids: number[]) => {
    setFavIds(ids);
    localStorage.setItem("pos-cajero-favorites", JSON.stringify(ids));
  };

  const toggleFav = (id: number) => {
    if (favIds.includes(id)) {
      saveFavs(favIds.filter(f => f !== id));
    } else if (favIds.length < 12) {
      saveFavs([...favIds, id]);
    }
  };

  if (favIds.length === 0 && !configMode) {
    return (
      <div className="px-3 py-2 border-b border-[var(--rule-soft)] dark:border-card-border bg-gray-50/50 dark:bg-surface/30">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Mis Rapidos</span>
          <button onClick={() => setConfigMode(true)} className="text-[length:var(--ts-2xs)] font-bold text-primary hover:underline">Configurar</button>
        </div>
        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted italic">Configura tus 12 productos rapidos para atender mas rapido</p>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 border-b border-[var(--rule-soft)] dark:border-card-border bg-gray-50/50 dark:bg-surface/30">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Mis Rapidos ({favIds.length}/12)</span>
        <button
          onClick={() => setConfigMode(!configMode)}
          className={cn("text-[length:var(--ts-2xs)] font-bold transition-colors", configMode ? "text-[var(--data-success)]" : "text-primary hover:underline")}
        >
          {configMode ? "Listo" : "Configurar"}
        </button>
      </div>
      {configMode && (
        <p className="text-[length:var(--ts-2xs)] text-[var(--data-warning)] mb-1.5">Haz click en productos del catalogo para agregarlos aqui (max 12)</p>
      )}
      <div className="grid grid-cols-4 gap-1.5">
        {favIds.map(id => {
          const p = products.find(pr => pr.id === id);
          if (!p) return null;
          return (
            <button
              key={id}
              onClick={() => configMode ? toggleFav(id) : onAddToCart(p)}
              className={cn(
                "bg-white dark:bg-card border text-left px-1.5 rounded-lg transition-all flex items-center gap-1",
                configMode ? "border-[var(--data-error)] hover:bg-[var(--data-error-50)]" : "border-[var(--rule-base)] dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface"
              )}
              style={{ height: 48 }}
              title={configMode ? `Quitar ${p.name}` : p.name}
            >
              <div className="flex-1 min-w-0">
                <p className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-primary)] dark:text-foreground truncate leading-tight">{p.name.slice(0, 15)}</p>
                <p className="text-[length:var(--ts-2xs)] font-bold text-primary">{fmt(p.price)}</p>
              </div>
              {configMode && <X className="h-3 w-3 text-[var(--data-error)] shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ModuleTooltip() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button type="button" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        className="text-[var(--text-tertiary)] hover:text-primary transition-colors focus:outline-none" aria-label="Ayuda sobre POS">
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute left-6 top-0 z-50 w-80 bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 text-xs leading-relaxed pointer-events-none">
          <p className="font-extrabold text-[var(--text-primary)] dark:text-foreground text-sm mb-2">🛍️ Punto de Venta (POS)</p>
          <p className="text-[var(--text-secondary)] dark:text-muted mb-3">Registra ventas en mostrador: busca productos, agrégalos al carrito, elige cómo cobrar y confirma la venta.</p>
          <div className="space-y-1.5">
            <p><span className="font-bold text-[var(--text-primary)] dark:text-foreground">Catálogo:</span> <span className="text-[var(--text-secondary)] dark:text-muted">busca por nombre, filtra por categoría o escanea código de barras.</span></p>
            <p><span className="font-bold text-[var(--text-primary)] dark:text-foreground">Carrito:</span> <span className="text-[var(--text-secondary)] dark:text-muted">ajusta cantidades y aplica descuentos por ítem.</span></p>
            <p><span className="font-bold text-[var(--text-primary)] dark:text-foreground">Cobro:</span> <span className="text-[var(--text-secondary)] dark:text-muted">efectivo, Yape, Plin, tarjeta o fiado. Pago dividido también.</span></p>
          </div>
          <div className="mt-3 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-xl p-2">
            <p className="text-[var(--data-success)] dark:text-[var(--data-success)] font-semibold">💡 Ejemplo</p>
            <p className="text-[var(--data-success)] dark:text-[var(--data-success)]">Carlos busca “Leche”, agrega 2 unidades al carrito, el cliente paga S/10 en efectivo y el sistema le dice el vuelto.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Promo Badge (Mejora 3: precio por cantidad) ──────────────────────────────

function PromoBadge({ productId, quantity, unitPrice }: { productId: number; quantity: number; unitPrice: number }) {
  const [promo, setPromo] = useState<{ type: string; buyQty: number; payPrice: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/promotions?productId=${productId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled) return;
        if (Array.isArray(data) && data.length > 0) {
          const p = data[0];
          if (p.buyQty && p.payPrice) setPromo({ type: p.type || "NxM", buyQty: p.buyQty, payPrice: p.payPrice });
          else setPromo(null);
        } else {
          setPromo(null);
        }
      })
      .catch(() => { /* ignore silently */ });
    return () => { cancelled = true; };
  }, [productId]);

  if (!promo) return null;
  const normalPrice = promo.buyQty * unitPrice;
  const saving = normalPrice - promo.payPrice;
  const applied = quantity >= promo.buyQty;
  return (
    <span className={cn("text-[length:var(--ts-2xs)] font-bold px-1 py-0.5 rounded", applied ? "bg-[var(--accent-soft)] text-[var(--data-success)]" : "bg-[var(--accent-soft)] text-[var(--data-success)]")}>
      {promo.buyQty}xS/{promo.payPrice.toFixed(0)}{saving > 0 ? ` (ahorro S/${saving.toFixed(0)})` : ""}
    </span>
  );
}

// ── Sale History Item (Mejora 2: expandable) ─────────────────────────────────

function SaleHistoryItem({ sale }: { sale: SaleRecord }) {
  const [expanded, setExpanded] = useState(false);
  const time = new Date(sale.createdAt).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  const itemCount = sale.items.reduce((sum, i) => sum + i.quantity, 0);
  return (
    <div className="bg-gray-50 dark:bg-surface rounded-lg border border-[var(--rule-soft)] dark:border-card-border hover:border-primary transition-colors">
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left p-3">
        <div className="flex items-start justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-[var(--text-tertiary)] dark:text-muted" />
            <span className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">{time}</span>
          </div>
          <span className="text-sm font-extrabold text-[var(--text-primary)] dark:text-foreground">{fmt(sale.total)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">{itemCount} {itemCount === 1 ? "articulo" : "articulos"}</span>
          <span className={cn(
            "text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full",
            sale.payment === "efectivo" ? "bg-[var(--accent-soft)] text-[var(--data-success)]" :
            sale.payment === "yape" ? "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" :
            sale.payment === "plin" ? "bg-teal-50 text-teal-600" :
            sale.payment === "tarjeta" ? "bg-[var(--accent-soft)] text-[var(--data-success)]" :
            sale.payment === "fiado" ? "bg-[var(--data-warning-50)] text-[var(--data-warning)]" :
            "bg-gray-50 text-[var(--text-secondary)]"
          )}>
            {sale.payment}
          </span>
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-[var(--rule-soft)] dark:border-card-border pt-2 space-y-1.5">
          {(sale as SaleRecord & { items: { name?: string; quantity: number }[] }).items.map((item, idx) => (
            <div key={idx} className="flex justify-between text-[length:var(--ts-xs)]">
              <span className="text-[var(--text-secondary)] dark:text-muted truncate max-w-[140px]">
                {(item as { name?: string }).name || `Item ${idx + 1}`} x{item.quantity}
              </span>
            </div>
          ))}
          <div className="flex gap-1.5 pt-1">
            <a href={`/venta/${sale.id}/recibo`} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] dark:text-muted px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border hover:bg-gray-100 dark:hover:bg-accent transition-colors">
              <Printer className="h-3 w-3" /> Reimprimir
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Confetti animation for sale complete ──────────────────────────────────────

function SaleConfetti() {
  const colors = ["#00B4A6", "#f97316", "#2dd4bf", "#e63946"];
  // Pre-compute random values to avoid impure function calls during render
  const pieces = useState(() =>
    Array.from({ length: 20 }).map((_, i) => ({
      color: colors[i % colors.length],
      left: ((i * 37 + 13) % 100),
      delay: (i * 0.025),
      size: 6 + (i % 3) * 3,
      rotation: (i * 47) % 360,
      drift: i % 2 === 0 ? 40 : -40,
    }))
  )[0];

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      {pieces.map((p, i) => (
        <div
          key={i}
          className="absolute rounded-sm"
          style={{
            backgroundColor: p.color,
            width: p.size,
            height: p.size,
            left: `${p.left}%`,
            top: -10,
            transform: `rotate(${p.rotation}deg)`,
            animation: `confetti-fall-${i % 2} 2s ${p.delay}s ease-out forwards`,
            opacity: 0,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-fall-0 {
          0% { opacity: 1; top: -10px; transform: rotate(0deg) translateX(0); }
          100% { opacity: 0; top: 100%; transform: rotate(720deg) translateX(40px); }
        }
        @keyframes confetti-fall-1 {
          0% { opacity: 1; top: -10px; transform: rotate(0deg) translateX(0); }
          100% { opacity: 0; top: 100%; transform: rotate(720deg) translateX(-40px); }
        }
      `}</style>
    </div>
  );
}

// ── Count-up hook ──────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 1000) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let startTime: number | null = null;
    let frame: number;
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      setValue(eased * target);
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}

// ── Mejora QW-10g: Abono rápido desde la venta ──────────────────────────────
function QuickAbonoFromSale({ customerPhone, customerName }: { customerPhone?: string; customerName?: string }) {
  const [fiado, setFiado] = useState<{ id: string; saldo: number } | null>(null);
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!customerPhone) return;
    (async () => {
      try {
        const res = await fetch(`/api/fiados?customerPhone=${encodeURIComponent(customerPhone)}&status=ACTIVO`);
        if (!res.ok) return;
        const data = await res.json();
        const fiados = Array.isArray(data) ? data : data.fiados ?? [];
        const activo = fiados.find((f: { saldo: number; status: string }) => f.saldo > 0 && (f.status === "ACTIVO" || f.status === "VENCIDO"));
        if (activo) setFiado({ id: activo.id, saldo: activo.saldo });
      } catch { /* silent */ }
    })();
  }, [customerPhone]);

  const abonar = async (monto: number) => {
    if (!fiado || paying) return;
    setPaying(true);
    try {
      await fetch(`/api/fiados/${fiado.id}/pagar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ monto }) });
      setDone(true);
    } catch { /* silent */ }
    setPaying(false);
  };

  if (!fiado || done) return done ? <p className="text-xs text-[var(--data-success)] font-bold text-center py-1">Abono registrado</p> : null;

  const quickAmounts = [10, 20, 50].filter(a => a <= fiado.saldo);
  return (
    <div className="border-t border-[var(--rule-soft)] dark:border-card-border pt-3 mb-2">
      <p className="text-xs font-bold text-[var(--data-warning)] mb-2">
        {customerName || customerPhone} tiene fiado de S/{fiado.saldo.toFixed(2)}. Abonar?
      </p>
      <div className="flex flex-wrap gap-1.5">
        {quickAmounts.map(a => (
          <button key={a} onClick={() => abonar(a)} disabled={paying}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--data-warning-100)] text-[var(--data-warning)] hover:bg-[var(--data-warning)] transition-colors disabled:opacity-50">
            S/{a}
          </button>
        ))}
        <button onClick={() => abonar(fiado.saldo)} disabled={paying}
          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--accent-soft)] text-[var(--data-success)] hover:bg-[var(--accent-soft)] transition-colors disabled:opacity-50">
          Todo S/{fiado.saldo.toFixed(2)}
        </button>
        <button onClick={() => setFiado(null)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">No, gracias</button>
      </div>
    </div>
  );
}

// ── Sale Complete Modal (Mejora 4: WhatsApp mejorado + Mejora 1: animaciones) ──

function SaleCompleteModal({
  saleComplete,
  lastSaleDetails,
  cartTotal,
  paymentMethod,
  cart,
  onNewSale,
}: {
  saleComplete: { id: string; change: number };
  lastSaleDetails: {
    items: { name: string; quantity: number; price: number }[];
    total: number;
    payment: string;
    customerPhone?: string;
    customerName?: string;
    discountAmount?: number;
    comprobanteTipo?: string;
    comprobanteNumero?: string;
  } | null;
  cartTotal: number;
  paymentMethod: string;
  cart: CartItem[];
  onNewSale: () => void;
}) {
  const [manualPhone, setManualPhone] = useState("");
  const displayTotal = lastSaleDetails?.total ?? cartTotal;
  const animatedTotal = useCountUp(displayTotal, 1000);

  function buildWhatsAppUrl(phone: string) {
    const now = new Date();
    const dateStr = now.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
    const timeStr = now.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: true });

    const details = lastSaleDetails;
    const items = details?.items || cart.map(i => ({ name: i.product.name, quantity: i.quantity, price: i.product.price }));
    const total = details?.total || cartTotal;
    const payment = details?.payment || paymentMethod;
    const discount = details?.discountAmount;
    const comprobante = details?.comprobanteTipo || "ticket";

    const comprobanteLabel = comprobante === "boleta" ? "Boleta"
      : comprobante === "factura" ? "Factura"
      : comprobante === "cotizacion" ? "Cotización"
      : comprobante === "proforma" ? "Proforma"
      : "Ticket";
    const comprobanteNum = details?.comprobanteNumero;

    const itemsText = items
      .map(i => `  ${i.name} x${i.quantity} — S/${(i.price * i.quantity).toFixed(2)}`)
      .join("\n");

    const lines = [
      `🧾 *${comprobanteLabel} Buleje*`,
      ...(comprobanteNum ? [`📋 N° ${comprobanteNum}`] : []),
      `📅 ${dateStr} ${timeStr}`,
      `─────────`,
      itemsText,
      `─────────`,
      `💰 *Total: S/${total.toFixed(2)}*`,
    ];

    if (discount && discount > 0) {
      lines.push(`🏷 Descuento: -S/${discount.toFixed(2)}`);
    }

    lines.push(
      `💳 Pagado con: ${payment}`,
      `─────────`,
      `¡Gracias por su compra! 😊`,
      `Buleje — Pucallpa`
    );

    const text = lines.join("\n");
    const cleanPhone = phone.replace(/\D/g, "");
    const fullPhone = cleanPhone.startsWith("51") ? cleanPhone : "51" + cleanPhone;
    return `https://wa.me/${fullPhone}?text=${encodeURIComponent(text)}`;
  }

  const hasCustomerPhone = lastSaleDetails?.customerPhone;
  const customerName = lastSaleDetails?.customerName;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-card rounded-xl max-w-sm w-full p-3 sm:p-6 text-center relative overflow-hidden">
        {/* Confetti */}
        <SaleConfetti />

        {/* Mejora M-4: Icono grande del metodo de pago */}
        {(() => {
          const method = (lastSaleDetails?.payment || paymentMethod || "").toLowerCase();
          const map: Record<string, { emoji: string; bg: string }> = {
            efectivo: { emoji: "\uD83D\uDCB5", bg: "bg-[var(--surface-sunken)]" },
            yape: { emoji: "\uD83D\uDCF1", bg: "bg-[var(--surface-sunken)]" },
            plin: { emoji: "\uD83D\uDCF2", bg: "bg-[var(--surface-sunken)]" },
            tarjeta: { emoji: "\uD83D\uDCB3", bg: "bg-[var(--surface-sunken)]" },
            mixto: { emoji: "\uD83D\uDD00", bg: "bg-[var(--surface-sunken)]" },
          };
          const info = map[method] || map["efectivo"];
          return (
            <m.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.05 }}
              className={cn("w-20 h-20 rounded-xl flex flex-col items-center justify-center mx-auto mb-2 relative z-20", info.bg)}
            >
              <span className="text-4xl leading-none">{info.emoji}</span>
              <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] dark:text-muted mt-1 capitalize">{method || "efectivo"}</span>
            </m.div>
          );
        })()}

        {/* Animated success icon */}
        <m.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.1 }}
          className="h-14 w-14 rounded-full bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] flex items-center justify-center mx-auto mb-3 relative z-20"
        >
          <Check className="h-7 w-7 text-[var(--data-success)]" />
        </m.div>
        <m.h3
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-lg font-extrabold text-[var(--text-primary)] dark:text-foreground mb-0.5"
        >
          Venta completada!
        </m.h3>
        <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mb-1">ID: {saleComplete.id}</p>

        {/* Sale summary with count-up */}
        <m.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-xs text-[var(--text-secondary)] dark:text-muted mb-3 space-y-0.5"
        >
          <p className="font-extrabold text-[var(--text-primary)] dark:text-foreground text-xl text-[#00B4A6]" style={{ color: "#00B4A6" }}>
            {fmt(animatedTotal)}
          </p>
          {lastSaleDetails && (
            <>
              <p className="text-[var(--text-secondary)] dark:text-muted">
                Pagado con: {lastSaleDetails.payment}
              </p>
              {lastSaleDetails.comprobanteNumero ? (
                <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30 rounded-xl p-3 mt-1.5">
                  <p className="text-[length:var(--ts-2xs)] text-[var(--data-success)] dark:text-[var(--data-success)] font-bold">Documento generado</p>
                  <p className="text-base font-mono font-bold text-[var(--data-success)] dark:text-[var(--data-success)]">
                    {lastSaleDetails.comprobanteTipo === "boleta" ? "Boleta"
                      : lastSaleDetails.comprobanteTipo === "factura" ? "Factura"
                      : lastSaleDetails.comprobanteTipo === "cotizacion" ? "Cotizacion"
                      : lastSaleDetails.comprobanteTipo === "proforma" ? "Proforma"
                      : "Ticket"} #{lastSaleDetails.comprobanteNumero}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mt-0.5">Ticket de venta</p>
              )}
            </>
          )}
        </m.div>

        {/* Change */}
        {saleComplete.change === -1 ? (
          <div className="bg-[var(--data-warning-50)] rounded-lg p-3 mb-4">
            <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning)]">Fiado registrado</p>
            <p className="text-sm text-[var(--data-warning)] font-semibold">Deuda pendiente del cliente</p>
          </div>
        ) : saleComplete.change > 0 ? (
          <div className="bg-[var(--data-warning-50)] rounded-lg p-3 mb-4">
            <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning)]">Vuelto</p>
            <p className="text-xl sm:text-2xl font-extrabold text-[var(--data-warning)]">{fmt(saleComplete.change)}</p>
          </div>
        ) : null}

        {/* Mejora QW-10g: Abono rápido desde la venta */}
        <QuickAbonoFromSale customerPhone={lastSaleDetails?.customerPhone} customerName={lastSaleDetails?.customerName} />

        {/* WhatsApp section */}
        <div className="border-t border-[var(--rule-soft)] dark:border-card-border pt-3 mb-3">
          <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] dark:text-muted mb-2.5">
            Enviar comprobante
          </p>

          {/* If customer has phone */}
          {hasCustomerPhone ? (
            <a
              href={buildWhatsAppUrl(hasCustomerPhone)}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 rounded-lg bg-[var(--accent-soft)] text-white font-bold text-xs hover:bg-[var(--accent-soft)] transition-colors flex items-center justify-center gap-2 mb-2"
            >
              <MessageCircle className="h-4 w-4" />
              Enviar a {customerName || hasCustomerPhone} ({hasCustomerPhone})
            </a>
          ) : (
            /* Manual phone input */
            <div className="flex gap-2 mb-2">
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] text-xs">+51</span>
                <input
                  type="tel"
                  value={manualPhone}
                  onChange={(e) => setManualPhone(e.target.value.replace(/\D/g, "").slice(0, 9))}
                  placeholder="N° WhatsApp"
                  className="w-full pl-9 pr-2 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-xs font-medium text-[var(--text-primary)] dark:text-foreground outline-none focus:border-[var(--data-success)]/30 transition-colors"
                />
              </div>
              {manualPhone.length >= 9 ? (
                <a
                  href={buildWhatsAppUrl(manualPhone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2.5 rounded-lg bg-[var(--accent-soft)] text-white font-bold text-xs hover:bg-[var(--accent-soft)] transition-colors flex items-center gap-1.5 shrink-0"
                >
                  <Send className="h-3.5 w-3.5" />
                  Enviar
                </a>
              ) : (
                <button
                  disabled
                  className="px-3 py-2.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-[var(--text-tertiary)] font-bold text-xs cursor-not-allowed flex items-center gap-1.5 shrink-0"
                >
                  <Send className="h-3.5 w-3.5" />
                  Enviar
                </button>
              )}
            </div>
          )}
        </div>

        {/* Documento generado automaticamente */}
        {lastSaleDetails?.comprobanteNumero ? (
          <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30 rounded-xl p-4 text-center mb-3">
            <p className="text-xs text-[var(--data-success)] dark:text-[var(--data-success)] font-bold">Documento generado</p>
            <p className="text-lg font-mono font-bold text-[var(--data-success)] dark:text-[var(--data-success)]">
              {lastSaleDetails.comprobanteTipo === "boleta" ? "Boleta"
                : lastSaleDetails.comprobanteTipo === "factura" ? "Factura"
                : lastSaleDetails.comprobanteTipo === "cotizacion" ? "Cotizacion"
                : lastSaleDetails.comprobanteTipo === "proforma" ? "Proforma"
                : "Ticket"} #{lastSaleDetails.comprobanteNumero}
            </p>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted text-center mb-3">Ticket de venta</p>
        )}

        {/* Action buttons */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <a
              href={`/venta/${saleComplete.id}/recibo`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground font-bold text-sm hover:bg-gray-50 dark:hover:bg-surface transition-colors flex items-center justify-center gap-1.5"
            >
              <Printer className="h-3.5 w-3.5" /> Imprimir ticket
            </a>
            <button
              onClick={onNewSale}
              className="flex-1 py-2.5 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary-dark transition-colors flex items-center justify-center gap-1.5"
            >
              Nueva venta →
            </button>
          </div>
          {isThermalPrintSupported() && (
            <button
              onClick={async () => {
                try {
                  await printThermal({
                    businessName: "Buleje",
                    ticketId: saleComplete.id,
                    date: new Date(),
                    items: cart.map(i => ({ name: i.product.name, quantity: i.quantity, price: i.product.price, unit: i.product.unit })),
                    total: cartTotal,
                    payment: paymentMethod,
                    amountPaid: cartTotal,
                    change: saleComplete.change >= 0 ? saleComplete.change : undefined,
                  });
                } catch (e) {
                  alert(e instanceof Error ? e.message : "Error al imprimir");
                }
              }}
              className="w-full py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted font-medium text-xs hover:bg-gray-50 dark:hover:bg-surface transition-colors flex items-center justify-center gap-1.5"
            >
              <Printer className="h-3.5 w-3.5" /> Ticket térmico (ESC/POS)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Mejora 3: Shift Summary Widget ────────────────────────────────────────────

function ShiftSummaryWidget() {
  const [data, setData] = useState<{
    turnoActivo: boolean;
    turnoMinutos?: number;
    totalVentas?: number;
    cantidadVentas?: number;
    ticketPromedio?: number;
    metodosPago?: Record<string, number>;
  } | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const res = await fetch("/api/pos/metrics");
        if (res.ok && !cancelled) {
          const json = await res.json();
          setData(json);
        }
      } catch { /* non-critical */ }
    };
    void fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (!data?.turnoActivo) return null;

  const h = Math.floor((data.turnoMinutos ?? 0) / 60);
  const mins = (data.turnoMinutos ?? 0) % 60;
  const timeStr = h > 0 ? `${h}h ${mins}m` : `${mins}m`;

  return (
    <m.div
      layout
      onClick={() => setExpanded(e => !e)}
      className="fixed bottom-4 left-4 z-40 bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-card-border cursor-pointer select-none transition-all"
      style={{ borderRadius: expanded ? 16 : 9999 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      <div className="px-4 py-2 flex items-center gap-3 text-xs">
        <span className="text-[var(--text-secondary)] dark:text-muted">&#9201; {timeStr}</span>
        <span className="font-bold text-[#00B4A6]" style={{ color: "#00B4A6" }}>S/{(data.totalVentas ?? 0).toFixed(0)}</span>
        <span className="text-[var(--text-secondary)] dark:text-muted">&#128203; {data.cantidadVentas ?? 0}</span>
      </div>
      {expanded && (
        <m.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="px-4 pb-3 pt-1 border-t border-[var(--rule-soft)] dark:border-card-border space-y-1"
        >
          <div className="flex justify-between text-[length:var(--ts-xs)]">
            <span className="text-[var(--text-secondary)] dark:text-muted">Ticket promedio</span>
            <span className="font-bold text-[var(--text-primary)] dark:text-foreground">S/{(data.ticketPromedio ?? 0).toFixed(1)}</span>
          </div>
          <div className="flex justify-between text-[length:var(--ts-xs)]">
            <span className="text-[var(--text-secondary)] dark:text-muted">Ventas/hora</span>
            <span className="font-bold text-[var(--text-primary)] dark:text-foreground">
              {(data.turnoMinutos ?? 0) > 0 ? ((data.cantidadVentas ?? 0) / ((data.turnoMinutos ?? 1) / 60)).toFixed(1) : "0"}
            </span>
          </div>
        </m.div>
      )}
    </m.div>
  );
}

// ── Mejora Idle Screen ───────────────────────────────────────────────────────

function POSIdleScreen({ onWake }: { onWake: () => void }) {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const iv = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center cursor-pointer select-none"
      onClick={onWake}
      onKeyDown={onWake}
      onTouchStart={onWake}
      role="button"
      tabIndex={0}
    >
      <p className="text-6xl font-mono text-white tabular-nums">
        {time.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
      </p>
      <p className="text-xl font-bold text-white mt-4">Buleje</p>
      <p className="text-[var(--text-tertiary)] mt-6 text-sm animate-pulse">Toca para continuar</p>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function POSView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("todos");
  const [cart, setCart] = useState<CartItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = sessionStorage.getItem("pos-cart-backup");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Toast de recuperacion se muestra via efecto abajo
          return parsed;
        }
      }
    } catch { /* ignore */ }
    return [];
  });
  const [showScanner, setShowScanner] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod] = useState<PaymentMethod>("efectivo");
  const [_amountPaid, setAmountPaid] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [processing, setProcessing] = useState(false);
  const [saleComplete, setSaleComplete] = useState<{ id: string; change: number } | null>(null);
  const [cashRegisterOpen, setCashRegisterOpen] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [favorites, setFavorites] = useState<number[]>(() => readStoredIds("pos-favorites"));
  const [recentProducts, setRecentProducts] = useState<number[]>(() => readStoredIds("pos-recents"));
  const [showHistory, setShowHistory] = useState(false);
  const [salesHistory, setSalesHistory] = useState<SaleRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<number | null>(null);
  const [_splitMode, setSplitMode] = useState(false);
  const [_splitPayments, setSplitPayments] = useState<SplitEntry[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const [showYapeQR, setShowYapeQR] = useState<"yape" | "plin" | null>(null);
  const [saleError, setSaleError] = useState<string | null>(null);
  // Mejora 4: Devolucion rapida
  const [showReturn, setShowReturn] = useState(false);
  const [showMoreTools, setShowMoreTools] = useState(false);

  // IDEA 6: Pedido WhatsApp — parser de mensajes de clientes
  const [showWhatsAppOrder, setShowWhatsAppOrder] = useState(false);
  const [waText, setWaText] = useState("");
  const [waParsedItems, setWaParsedItems] = useState<{ raw: string; qty: number; search: string; matches: Product[]; selected: Product | null }[]>([]);

  const parseWhatsAppOrder = useCallback((text: string) => {
    if (!text.trim()) { setWaParsedItems([]); return; }

    // Limpiar frases peruanas comunes
    const cleaned = text
      .replace(/quiero\s+pedir/gi, "")
      .replace(/mándame|mandame|necesito|ponme|dame|envíame|enviame/gi, "")
      .replace(/por\s+favor|porfa|porfavor/gi, "")
      .replace(/también|tambien/gi, ",")
      .replace(/\s+y\s+/gi, ", ");

    // Dividir por comas, puntos y comas, saltos de linea, puntos
    const lines = cleaned.split(/[,;.\n]+/).map(l => l.trim()).filter(l => l.length > 2);
    const results: typeof waParsedItems = [];

    // Fuzzy match: cada char de query existe en orden en text
    const fuzzyMatch = (query: string, text: string): boolean => {
      const q = query.replace(/\s+/g, "").toLowerCase();
      const t = text.toLowerCase();
      let qi = 0;
      for (let ti = 0; ti < t.length && qi < q.length; ti++) {
        if (t[ti] === q[qi]) qi++;
      }
      return qi === q.length && q.length >= 3;
    };

    for (const line of lines) {
      // Extraer cantidad con unidad opcional
      const match = line.match(
        /^(\d+\.?\d*)\s*(kilos?|kg|litros?|l|unid(?:ades?)?|packs?|cajas?|docenas?|bolsas?|botellas?|latas?|sobres?|paquetes?)?\s*(?:de\s+)?(.+)$/i
      );
      let qty = 1;
      let searchTerm = line;

      if (match) {
        qty = parseFloat(match[1]) || 1;
        searchTerm = match[3]?.trim() || line;
      } else {
        // Intentar formato inverso: "arroz x 3"
        const matchInv = line.match(/^(.+?)\s*[x×]\s*(\d+\.?\d*)$/i);
        if (matchInv) {
          searchTerm = matchInv[1].trim();
          qty = parseFloat(matchInv[2]) || 1;
        } else {
          // Sin numero: "cebollas" -> qty 1
          searchTerm = line.replace(/^\d+\s*/, "").trim() || line;
        }
      }

      // Buscar producto en catalogo (incluye fuzzy)
      const searchLower = searchTerm.toLowerCase();
      const matches = products.filter(p => {
        const pName = p.name.toLowerCase();
        // Coincidencia directa
        if (pName.includes(searchLower) || searchLower.includes(pName)) return true;
        // Cada palabra del search aparece en el nombre
        if (searchLower.split(/\s+/).every(word => pName.includes(word))) return true;
        // Fuzzy match
        if (fuzzyMatch(searchLower, pName)) return true;
        return false;
      }).slice(0, 5);

      results.push({
        raw: line,
        qty,
        search: searchTerm,
        matches,
        selected: matches.length === 1 ? matches[0] : null,
      });
    }
    setWaParsedItems(results);
  }, [products]);

  // Mejora 4: Global discount
  const [globalDiscount, setGlobalDiscount] = useState<{ monto: number; porcentaje: number }>({ monto: 0, porcentaje: 0 });

  // Cola de clientes (Mejora 1 nueva)
  const [clientQueues, setClientQueues] = useState<CartItem[][]>([]);
  const [showQueueDropdown, setShowQueueDropdown] = useState(false);

  // Tamano de fuente POS (Mejora 2 nueva)
  const [fontSize, setFontSize] = useState<"normal" | "large" | "xlarge">(() => {
    if (typeof window === "undefined") return "normal";
    return (localStorage.getItem("pos-font-size") as "normal" | "large" | "xlarge") || "normal";
  });

  // Mejora 7: Stock alerts
  const [stockAlert, setStockAlert] = useState<{ message: string; type: "warning" | "danger"; actionLabel?: string; actionFn?: () => void } | null>(null);
  const [showZeroStockConfirm, setShowZeroStockConfirm] = useState<Product | null>(null);

  // Mejora 9: Frequent products refresh key
  const [frequentRefreshKey, setFrequentRefreshKey] = useState(0);

  // FIX 3: Secciones colapsables (minimizadas por defecto)
  const [showFrequent, setShowFrequent] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("pos-show-frequent") === "true";
  });
  const [showRapidos, setShowRapidos] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("pos-show-rapidos") === "true";
  });
  const [showRecientes, setShowRecientes] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("pos-show-recientes") === "true";
  });

  // Mejora: Idle screen
  const [isIdle, setIsIdle] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const idleMinutes = (() => { try { const v = localStorage.getItem("pos-idle-minutes"); return v ? Number(v) : 5; } catch { return 5; } })();
    const resetIdleTimer = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setIsIdle(true), idleMinutes * 60 * 1000);
    };
    resetIdleTimer();
    const events = ["click", "keydown", "touchstart"] as const;
    events.forEach(e => document.addEventListener(e, resetIdleTimer));
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      events.forEach(e => document.removeEventListener(e, resetIdleTimer));
    };
  }, []);

  // Mejora P-1: Ultimo producto agregado parpadea verde
  const [lastAddedId, setLastAddedId] = useState<number | null>(null);
  const lastAddedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mejora P-3: Ultima venta rapida
  const [lastSaleInfo, setLastSaleInfo] = useState<{ total: number; time: Date; id: string; minutesAgo: number } | null>(null);

  // Mejora P-3: Actualizar minutesAgo cada 30s
  useEffect(() => {
    if (!lastSaleInfo) return;
    const iv = setInterval(() => {
      setLastSaleInfo(prev => prev ? { ...prev, minutesAgo: Math.floor((Date.now() - prev.time.getTime()) / 60000) } : null);
    }, 30000);
    return () => clearInterval(iv);
  }, [lastSaleInfo?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // [REMOVIDO] Ventas por hora — ya existe en CashRegisterTab

  // ── Idea 12: Trueque Digital ──────────────────────────────────────────────
  const [showTrueque, setShowTrueque] = useState(false);
  const [truequeDesc, setTruequeDesc] = useState("");
  const [truequeValor, setTruequeValor] = useState("");


  // Mejora 6: Last sale details for WhatsApp
  const [lastSaleDetails, setLastSaleDetails] = useState<{
    items: { name: string; quantity: number; price: number }[];
    total: number;
    payment: string;
    customerPhone?: string;
    customerName?: string;
    discountAmount?: number;
    comprobanteTipo?: string;
    comprobanteNumero?: string;
  } | null>(null);

  useScrollLock(showPayment || !!saleComplete || expanded);

  // ── Mejora QW-11a: Persistir carrito en sessionStorage ───────────────────
  useEffect(() => {
    if (cart.length > 0) sessionStorage.setItem("pos-cart-backup", JSON.stringify(cart));
    else sessionStorage.removeItem("pos-cart-backup");
  }, [cart]);

  // Mostrar toast si se recupero carrito al montar
  const cartRecoveredRef = useRef(false);
  useEffect(() => {
    if (!cartRecoveredRef.current && cart.length > 0) {
      const had = sessionStorage.getItem("pos-cart-backup");
      if (had) cartRecoveredRef.current = true;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── POS Sound & Offline hooks ────────────────────────────────────────────
  const { playDing, playCashRegister: _playCashRegister, playError, playSaleComplete, toggle: toggleSound, enabled: soundEnabled } = usePOSSound();
  const posOffline = usePOSOffline();
  const [selectedCartIndex] = useState(0);

  // ── Data fetch ─────────────────────────────────────────────────────────────

  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/products");
      const data = await res.json();
      setProducts(data.filter((p: Product) => p.active));
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const checkCashRegister = useCallback(async () => {
    try {
      const res = await fetch("/api/cash-registers");
      const data = await res.json();
      const open = data.find((r: { status: string }) => r.status === "abierta");
      setCashRegisterOpen(!!open);
    } catch { setCashRegisterOpen(false); }
  }, []);

  // [REMOVIDO] fetchHourlySales — ya existe en CashRegisterTab

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchProducts();
      void checkCashRegister();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchProducts, checkCashRegister]);

  // ── Cart operations ────────────────────────────────────────────────────────

  const addToRecents = useCallback((productId: number) => {
    setRecentProducts(prev => {
      const filtered = prev.filter(id => id !== productId);
      const updated = [productId, ...filtered].slice(0, 10);
      localStorage.setItem("pos-recents", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const toggleFavorite = useCallback((productId: number) => {
    setFavorites(prev => {
      const updated = prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId].slice(0, 20);
      localStorage.setItem("pos-favorites", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const updateDiscount = useCallback((productId: number, discount: number) => {
    setCart(prev => prev.map(i => 
      i.product.id === productId ? { ...i, discount: Math.min(100, Math.max(0, discount)) } : i
    ));
  }, []);

  const fetchSalesHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/sales?today=1");
      const data = await res.json();
      setSalesHistory(Array.isArray(data) ? data : []);
    } catch { setSalesHistory([]); }
    setLoadingHistory(false);
  }, []);

  useEffect(() => {
    if (showHistory) {
      const timer = window.setTimeout(() => {
        void fetchSalesHistory();
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [showHistory, fetchSalesHistory]);

  const addToCart = useCallback((product: Product) => {
    addToRecents(product.id);

    // Mejora 7: Alerta de stock cero — pedir confirmacion
    if (product.stock != null && product.stock <= 0) {
      playError();
      setShowZeroStockConfirm(product);
      return;
    }

    // Mejora 7: Alerta de stock bajo
    const threshold = product.stockMin || 5;
    if (product.stock != null && product.stock <= threshold && product.stock > 0) {
      setStockAlert({
        message: `Ultimas ${product.stock} unidades de ${product.name}`,
        type: "warning",
      });
      setTimeout(() => setStockAlert(null), 3000);
    }

    // Mejora 3R2: Check expiry — fetch batches in background
    fetch(`/api/products/${product.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const expiry = data.expiryDate;
        if (!expiry) return;
        const expiryDate = new Date(expiry);
        const diffDays = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (diffDays > 0 && diffDays <= 5) {
          setStockAlert({
            message: `${product.name} vence en ${diffDays} dia${diffDays > 1 ? 's' : ''}. Aplicar descuento?`,
            type: "warning",
            actionLabel: "Aplicar -10%",
            actionFn: () => {
              setCart(prev => prev.map(i =>
                i.product.id === product.id ? { ...i, discount: 10 } : i
              ));
              setStockAlert(null);
            },
          });
          setTimeout(() => setStockAlert(curr => curr?.message?.includes('vence') ? null : curr), 8000);
        }
      })
      .catch(() => { /* ignore */ });

    playDing();
    // Mejora P-1: Flash verde al agregar
    if (lastAddedTimer.current) clearTimeout(lastAddedTimer.current);
    setLastAddedId(product.id);
    lastAddedTimer.current = setTimeout(() => setLastAddedId(null), 1500);

    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) {
        // Check stock
        if (product.stock != null && existing.quantity >= product.stock) return prev;
        return prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      // Mejora 4 nueva: Auto-completar cantidad por nombre del producto
      let defaultQty = 1;
      const packMatch = product.name.match(/x(\d+)|pack\s*(\d+)/i);
      if (packMatch) {
        const qty = parseInt(packMatch[1] || packMatch[2], 10);
        if (qty > 0 && qty <= 100) defaultQty = qty;
      } else if (/docena/i.test(product.name)) {
        defaultQty = 12;
      }
      if (product.stock != null && defaultQty > product.stock) defaultQty = Math.max(1, product.stock);
      return [...prev, { product, quantity: defaultQty }];
    });
  }, [addToRecents, playDing, playError]);

  // Mejora 7: Force-add zero stock product
  const forceAddZeroStock = useCallback((product: Product) => {
    playDing();
    addToRecents(product.id);
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) {
        return prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { product, quantity: 1 }];
    });
    setShowZeroStockConfirm(null);
  }, [playDing, addToRecents]);

  const updateQuantity = useCallback((productId: number, delta: number) => {
    setCart(prev => {
      return prev.map(i => {
        if (i.product.id !== productId) return i;
        const newQty = i.quantity + delta;
        if (newQty <= 0) return i;
        if (i.product.stock != null && newQty > i.product.stock) return i;
        return { ...i, quantity: newQty };
      });
    });
  }, []);

  const removeFromCart = useCallback((productId: number) => {
    setCart(prev => prev.filter(i => i.product.id !== productId));
  }, []);

  const clearCart = useCallback(() => { setCart([]); }, []);

  // ── Barcode scan ───────────────────────────────────────────────────────────

  const handleBarcode = useCallback(async (code: string) => {
    setShowScanner(false);
    // Search in local products first
    const local = products.find(p => p.barcode === code);
    if (local) { addToCart(local); return; }
    // Try API lookup
    try {
      const res = await fetch(`/api/barcode-lookup?code=${encodeURIComponent(code)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.productId) {
          const p = products.find(pr => pr.id === data.productId);
          if (p) addToCart(p);
        }
      }
    } catch { /* ignore */ }
  }, [products, addToCart]);

  // ── Keyboard shortcuts (Upgrade 1) ───────────────────────────────────────

  const handleAddTopResult = useCallback(() => {
    const searchInput = document.querySelector("[data-pos-search]") as HTMLInputElement;
    const q = searchInput?.value?.trim().toLowerCase();
    if (!q) return;
    const match = products.find(p => {
      if (p.stock != null && p.stock <= 0) return false;
      return p.name.toLowerCase().includes(q) || p.barcode?.includes(q);
    });
    if (match) addToCart(match);
  }, [products, addToCart]);

  usePOSKeyboard({
    onOpenPayment: () => { if (cart.length > 0) setShowPayment(true); },
    onClearCart: () => { setCart([]); },
    onOpenLastTicket: () => { setShowHistory(true); },
    onCancel: () => { setShowPayment(false); },
    onIncrement: () => {
      if (cart.length > 0) {
        const idx = Math.min(selectedCartIndex, cart.length - 1);
        updateQuantity(cart[idx].product.id, 1);
      }
    },
    onDecrement: () => {
      if (cart.length > 0) {
        const idx = Math.min(selectedCartIndex, cart.length - 1);
        updateQuantity(cart[idx].product.id, -1);
      }
    },
    onRemoveSelected: () => {
      if (cart.length > 0) {
        const idx = Math.min(selectedCartIndex, cart.length - 1);
        removeFromCart(cart[idx].product.id);
      }
    },
    onAddTopResult: handleAddTopResult,
    cartLength: cart.length,
  });

  // ── Payment ────────────────────────────────────────────────────────────────

  const cartSubtotal = cart.reduce((s, i) => {
    const discountMultiplier = 1 - (i.discount || 0) / 100;
    return s + i.product.price * i.quantity * discountMultiplier;
  }, 0);
  const cartTotal = Math.max(0, cartSubtotal - globalDiscount.monto);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  // ── New Payment Modal handler (Upgrade 3) ─────────────────────────────────

  const handlePaymentConfirm = async (payments: PaymentLine[], phone?: string, extra?: { comprobanteTipo: ComprobanteTipo; comprobanteRuc?: string; customerName?: string; discountAmount?: number; discountPercent?: number }) => {
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(salePayload),
      });
      const sale = await res.json();
      if (res.ok) {
        playSaleComplete(effectiveTotal);
        setSaleComplete({ id: sale.id, change: sale.change ?? effectiveChange });
        // Attach comprobanteNumero from API response
        if (sale.comprobanteNumero) {
          saleDetailsForWhatsApp.comprobanteNumero = sale.comprobanteNumero;
        } else {
          console.warn("[POS] La API /api/sales no retorno comprobanteNumero.", { saleId: sale.id, comprobanteTipo: extra?.comprobanteTipo });
        }
        setLastSaleDetails(saleDetailsForWhatsApp);
        setLastSaleInfo({ total: effectiveTotal, time: new Date(), id: sale.id, minutesAgo: 0 });

        // ── CREAR FIADO automáticamente si el pago fue "fiado" ──
        if (effectivePayment === "fiado") {
          const fiadoPhone = phone || customerPhone;
          if (fiadoPhone) {
            const itemNames = cart.map(i => `${i.product.name} x${i.quantity}`).join(", ");
            try {
              const fiadoRes = await fetch("/api/fiados", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  customerId: fiadoPhone,
                  total: effectiveTotal,
                  descripcion: itemNames,
                }),
              });
              if (fiadoRes.ok) {
                if (process.env.NODE_ENV === "development") console.log("[POS] Fiado registrado correctamente para", fiadoPhone);
              } else {
                const err = await fiadoRes.json().catch(() => ({}));
                console.warn("[POS] Error registrando fiado:", err.error || "Error desconocido");
              }
            } catch (fiadoErr) {
              console.warn("[POS] Error de red al crear fiado:", fiadoErr);
            }
          } else {
            console.warn("[POS] Venta con fiado SIN cliente — no se puede registrar deuda. Selecciona un cliente.");
          }
        }

        // Mejora QW-11a: limpiar backup carrito
        sessionStorage.removeItem("pos-cart-backup");
        // Mejora QW-11c: guardar items para repetir venta
        try { localStorage.setItem("pos-last-sale-items", JSON.stringify(cart.map(i => ({ productId: i.product.id, name: i.product.name, quantity: i.quantity, price: i.product.price, stock: i.product.stock })))); } catch { /* ignore */ }
        setCart([]);
        setAmountPaid("");
        setCustomerPhone("");
        setSplitMode(false);
        setSplitPayments([]);
        setGlobalDiscount({ monto: 0, porcentaje: 0 });
        setFrequentRefreshKey(k => k + 1);
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
        setSaleComplete({ id: `offline_${Date.now()}`, change: effectiveChange });
        setLastSaleDetails(saleDetailsForWhatsApp);
        setCart([]);
        setAmountPaid("");
        setCustomerPhone("");
        setSplitMode(false);
        setSplitPayments([]);
        setGlobalDiscount({ monto: 0, porcentaje: 0 });
      } catch {
        playError();
        setSaleError("Error al guardar la venta offline");
      }
    }
    setProcessing(false);
  };

  const handleNewSale = () => {
    setSaleComplete(null);
    setLastSaleDetails(null);
    setShowPayment(false);
    // Auto-cargar siguiente de la cola
    if (clientQueues.length > 0) {
      const [next, ...rest] = clientQueues;
      setCart(next);
      setClientQueues(rest);
    }
    searchRef.current?.focus();
  };

  // Cola de clientes helpers
  const enqueueClient = useCallback(() => {
    if (clientQueues.length >= 5) return;
    if (cart.length > 0) {
      setClientQueues(prev => [...prev, cart]);
    }
    setCart([]);
    setGlobalDiscount({ monto: 0, porcentaje: 0 });
  }, [cart, clientQueues.length]);

  const loadFromQueue = useCallback((index: number) => {
    const queued = clientQueues[index];
    if (!queued) return;
    // Guardar carrito actual si tiene items
    const newQueues = [...clientQueues];
    if (cart.length > 0) {
      newQueues[index] = cart;
    } else {
      newQueues.splice(index, 1);
    }
    setClientQueues(newQueues);
    setCart(queued);
    setShowQueueDropdown(false);
  }, [cart, clientQueues]);

  const removeFromQueue = useCallback((index: number) => {
    setClientQueues(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Cambiar tamano de fuente
  const changeFontSize = useCallback((size: "normal" | "large" | "xlarge") => {
    setFontSize(size);
    localStorage.setItem("pos-font-size", size);
  }, []);

  const handleAddFromSearch = useCallback((productId: number) => {
    const p = products.find(pr => pr.id === productId);
    if (p) addToCart(p);
  }, [products, addToCart]);

  // Mejora 10: Pause/Resume cart
  const handlePauseCart = useCallback(() => {
    setCart([]);
    setGlobalDiscount({ monto: 0, porcentaje: 0 });
  }, []);

  const handleResumeCart = useCallback((items: { productId: number; name: string; price: number; quantity: number; image?: string; unit: string; discount?: number }[]) => {
    const resumedItems: CartItem[] = items.map(i => {
      const found = products.find(p => p.id === i.productId);
      return {
        product: found || { id: i.productId, name: i.name, price: i.price, image: i.image || "", unit: i.unit, category: "", active: true, description: "" },
        quantity: i.quantity,
        discount: i.discount,
      };
    }).filter(Boolean) as CartItem[];
    setCart(resumedItems);
  }, [products]);

  // Mejora 10: Repeat order from last purchase
  const handleRepeatOrder = useCallback((items: { productId: number; name: string; quantity: number; price: number }[]) => {
    for (const item of items) {
      const found = products.find(p => p.id === item.productId);
      if (found) {
        for (let i = 0; i < item.quantity; i++) {
          addToCart(found);
        }
      }
    }
    setShowPayment(false);
  }, [products, addToCart]);

  // ── Product filtering ──────────────────────────────────────────────────────

  // Product grid: filter by category only (search is handled by POSSearchBar)
  const filtered = products.filter(p => {
    if (category !== "todos" && p.category !== category) return false;
    return true;
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return <LoadingState message="" size="sm" />;
  }

  const posContent = (
    <>
      {/* Metrics strip (Upgrade 4) */}
      <POSMetricsStrip />

      {/* Offline bar (Upgrade 7) */}
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
        <div className="flex flex-wrap items-center gap-2 p-2.5 mb-3 rounded-lg bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error)] dark:border-[var(--data-error)]/30">
          <Info className="h-4 w-4 text-[var(--data-error)] shrink-0" />
          <p className="text-xs text-[var(--data-error)] dark:text-[var(--data-error)] flex-1">{saleError}</p>
          <button onClick={() => setSaleError(null)} className="p-0.5 text-[var(--data-error)] hover:text-[var(--data-error)]"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* Mejora QW-3: Indicador de conexion sticky + Mejora QW-11b: Turno */}
      <div className="flex items-center gap-3 text-[length:var(--ts-2xs)] justify-end flex-wrap">
        <span className={cn("w-2 h-2 rounded-full", posOffline.isOnline ? "bg-[var(--accent-soft)]" : "bg-[var(--data-error)] animate-pulse")} />
        <span className={posOffline.isOnline ? "text-[var(--data-success)] dark:text-[var(--data-success)]" : "text-[var(--data-error)] dark:text-[var(--data-error)]"}>
          {posOffline.isOnline ? "En linea" : "Sin conexion"}
        </span>
        {cashRegisterOpen && (
          <span className="inline-flex items-center gap-1 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success)] dark:text-[var(--data-success)] rounded-full px-3 py-1 font-bold">
            <Clock className="h-3 w-3" /> Turno activo
          </span>
        )}
        {cashRegisterOpen === false && (
          <span className="inline-flex items-center gap-1 bg-gray-100 dark:bg-zinc-700 text-[var(--text-secondary)] dark:text-zinc-400 rounded-full px-3 py-1">
            Sin turno activo
          </span>
        )}
      </div>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className={cn("font-extrabold text-[var(--text-primary)] dark:text-foreground", expanded ? "text-xl sm:text-2xl" : "text-lg sm:text-xl")}>Punto de Venta</h2>
            <ModuleTooltip />
          </div>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted">{products.length} productos disponibles</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 sm:justify-end">
          {cashRegisterOpen === false && (
            <span className="text-[length:var(--ts-2xs)] font-bold bg-[var(--data-warning-50)] text-[var(--data-warning)] border border-[var(--data-warning)] px-2.5 py-1 rounded-lg">Sin caja</span>
          )}
          {cashRegisterOpen === true && (
            <span className="text-[length:var(--ts-2xs)] font-bold bg-[var(--accent-soft)] text-[var(--data-success)] border border-[var(--data-success)]/30 px-2.5 py-1 rounded-lg">Caja abierta</span>
          )}
          {/* Mejora P-3: Ultima venta rapida */}
          {lastSaleInfo && (
            <a
              href={`/venta/${lastSaleInfo.id}/recibo`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs bg-gray-100 dark:bg-accent text-[var(--text-secondary)] dark:text-muted rounded-full px-2 py-1 hover:bg-gray-200 dark:hover:bg-surface transition-colors"
              title="Reimprimir ultima venta"
            >
              Ultima: {fmt(lastSaleInfo.total)} · hace {Math.max(1, lastSaleInfo.minutesAgo)}m
              <Printer className="h-3 w-3" />
            </a>
          )}

          {/* ── Grupo 1: Entrada ── */}
          <POSExpressMode
            products={products as { id: number; name: string; price: number; barcode?: string | null; stock?: number | null }[]}
            onAddToCart={handleAddFromSearch}
          />
          <button
            onClick={() => setShowScanner(true)}
            className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-primary border border-primary/30 hover:bg-primary/5 px-3 py-2 rounded-lg transition-colors"
          >
            <ScanBarcode className="h-4 w-4" /> <span className="hidden sm:inline">Escanear</span>
          </button>
          <label
            className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-primary border border-primary/30 hover:bg-primary/5 px-3 py-2 rounded-lg transition-colors cursor-pointer"
            title="Escanear producto con camara"
          >
            &#128247; <span className="hidden sm:inline">Foto</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                e.target.value = "";
                try {
                  if ("BarcodeDetector" in window) {
                    const bitmap = await createImageBitmap(file);
                    const detector = new (window as unknown as { BarcodeDetector: new (opts?: { formats: string[] }) => { detect: (img: ImageBitmap) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector({ formats: ["ean_13", "ean_8", "code_128", "code_39", "qr_code", "upc_a", "upc_e"] });
                    const barcodes = await detector.detect(bitmap);
                    if (barcodes.length > 0) {
                      handleBarcode(barcodes[0].rawValue);
                      return;
                    }
                  }
                  setSaleError("No se detecto codigo de barras en la foto. Busca el producto por nombre.");
                } catch {
                  setSaleError("No se pudo procesar la imagen. Busca el producto por nombre.");
                }
              }}
            />
          </label>

          {/* ── Separador ── */}
          <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-0.5 hidden sm:block" />

          {/* ── Grupo 2: Acciones ── */}
          <button
            onClick={() => setShowWhatsAppOrder(true)}
            className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[var(--data-success)] border border-[var(--data-success)]/30 hover:bg-[var(--accent-soft)] px-3 py-2 rounded-lg transition-colors"
          >
            <MessageCircle className="h-4 w-4" /> <span className="hidden sm:inline">Pedido WA</span>
          </button>
          {/* Mejora QW-11c: Repetir ultima venta */}
          {(() => {
            try { const ls = localStorage.getItem("pos-last-sale-items"); if (!ls) return null; } catch { return null; }
            return (
              <button
                onClick={() => {
                  try {
                    const raw = localStorage.getItem("pos-last-sale-items");
                    if (!raw) return;
                    const items: { productId: number; name: string; quantity: number; price: number; stock?: number }[] = JSON.parse(raw);
                    if (cart.length > 0 && !window.confirm("Reemplazar carrito actual?")) return;
                    const newCart: CartItem[] = [];
                    const skipped: string[] = [];
                    for (const item of items) {
                      const found = products.find(p => p.id === item.productId);
                      if (!found || (found.stock != null && found.stock <= 0)) { skipped.push(item.name); continue; }
                      newCart.push({ product: found, quantity: item.quantity });
                    }
                    if (newCart.length > 0) setCart(newCart);
                    if (skipped.length > 0) setSaleError(`Sin stock: ${skipped.join(", ")}`);
                  } catch { /* ignore */ }
                }}
                className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-primary border border-primary/30 hover:bg-primary/5 px-3 py-2 rounded-lg transition-colors"
              >
                <RotateCcw className="h-4 w-4" /> <span className="hidden sm:inline">Repetir</span>
              </button>
            );
          })()}

          {/* ── Separador ── */}
          <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-0.5 hidden sm:block" />

          {/* ── Grupo 3: Vista ── */}
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[var(--text-primary)] dark:text-foreground border border-[var(--rule-base)] dark:border-card-border hover:bg-gray-50 dark:hover:bg-accent px-3 py-2 rounded-lg transition-colors"
            title="Atajos de teclado: F1=Buscar, F2=Cobrar, F3=Vaciar, F4=Historial"
          >
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">Historial</span>
            <kbd className="ml-0.5 text-[length:var(--ts-2xs)] bg-gray-200 dark:bg-gray-700 px-1 rounded hidden sm:inline">F4</kbd>
          </button>

          {/* ── Dropdown "Mas" para botones poco usados ── */}
          <div className="relative">
            <button
              onClick={() => setShowMoreTools(v => !v)}
              className="flex items-center gap-1 text-xs sm:text-sm font-bold text-[var(--text-secondary)] dark:text-muted border border-[var(--rule-base)] dark:border-card-border hover:bg-gray-50 dark:hover:bg-accent px-2.5 py-2 rounded-lg transition-colors"
              title="Mas herramientas"
            >
              &#8943; <span className="hidden sm:inline">Mas</span>
            </button>
            {showMoreTools && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMoreTools(false)} />
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-2 z-20 min-w-[180px] space-y-1">
                  <button
                    onClick={() => { setShowReturn(true); setShowMoreTools(false); }}
                    className="w-full flex items-center gap-2 text-xs font-bold text-[#f97316] hover:bg-[#f97316]/5 px-3 py-2 rounded-lg transition-colors"
                  >
                    <History className="h-4 w-4 rotate-180" /> Devolucion
                  </button>
                  <div className="w-full flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] dark:text-muted px-3 py-1.5">
                    <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Tamano fuente</span>
                  </div>
                  <div className="flex bg-gray-100 dark:bg-accent rounded-lg p-0.5 mx-2">
                    {(["normal", "large", "xlarge"] as const).map(size => (
                      <button
                        key={size}
                        onClick={() => changeFontSize(size)}
                        className={cn(
                          "flex-1 px-1.5 py-1 rounded-md text-xs font-bold transition-colors",
                          fontSize === size ? "bg-white dark:bg-card text-primary " : "text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-secondary)]"
                        )}
                        title={size === "normal" ? "Fuente normal" : size === "large" ? "Fuente grande" : "Fuente extra grande"}
                      >
                        {size === "normal" ? "A" : size === "large" ? "A+" : "A++"}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => { toggleSound(); setShowMoreTools(false); }}
                    className={cn(
                      "w-full flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-lg transition-colors",
                      soundEnabled ? "text-primary hover:bg-primary/5" : "text-[var(--text-tertiary)] dark:text-muted hover:bg-gray-50"
                    )}
                  >
                    {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                    {soundEnabled ? "Sonido ON" : "Sonido OFF"}
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-white bg-primary hover:bg-primary-dark px-3 py-2 rounded-lg transition-colors "
            title={expanded ? "Reducir" : "Expandir"}
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            <span className="hidden min-[390px]:inline sm:inline">{expanded ? "Reducir" : "Expandir"}</span>
          </button>
        </div>
      </div>

      {/* Body: products + cart */}
      <div className="flex flex-col lg:flex-row gap-2 sm:gap-4">
        {/* Left: Products */}
        <div className={cn(
          "flex-1 bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl  overflow-hidden flex flex-col",
          expanded ? "min-h-[calc(100vh-12rem)]" : ""
        )} style={expanded ? undefined : { minHeight: "28rem", maxHeight: "calc(100vh - 14rem)" }}>
          {/* Search + Categories (Upgrade 2) */}
          <div className="p-3 space-y-2 border-b border-[var(--rule-soft)] dark:border-card-border relative">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <POSSearchBar
                  products={products as { id: number; name: string; price: number; image?: string; barcode?: string; stock?: number }[]}
                  onAddToCart={handleAddFromSearch}
                  recentProductIds={recentProducts}
                />
              </div>
              <POSVoiceInput
                products={products.map(p => ({ id: p.id, name: p.name, price: p.price }))}
                onAddToCart={handleAddFromSearch}
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide scroll-smooth snap-x pb-1">
              {categories.map(c => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className={cn(
                    "snap-start shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
                    category === c.id
                      ? "bg-primary text-white "
                      : "bg-gray-50 dark:bg-surface text-[var(--text-secondary)] dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
                  )}
                >
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mejora 9: Frequent Products — colapsable */}
          <div className="px-3 pt-2 border-b border-[var(--rule-soft)] dark:border-card-border bg-gray-50/50 dark:bg-surface/30">
            <button
              onClick={() => { setShowFrequent(v => { const nv = !v; localStorage.setItem("pos-show-frequent", String(nv)); return nv; }); }}
              className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-foreground w-full pb-2"
            >
              {showFrequent ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <span>Mas vendidos hoy</span>
            </button>
            {showFrequent && (
              <div className="pb-2">
                <POSFrequentProducts
                  onAddToCart={handleAddFromSearch}
                  refreshKey={frequentRefreshKey}
                />
              </div>
            )}
          </div>

          {/* Mejora 1R2: Cajero Favorites grid — colapsable */}
          <div className="px-3 pt-2 border-b border-[var(--rule-soft)] dark:border-card-border bg-gray-50/50 dark:bg-surface/30">
            <button
              onClick={() => { setShowRapidos(v => { const nv = !v; localStorage.setItem("pos-show-rapidos", String(nv)); return nv; }); }}
              className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-foreground w-full pb-2"
            >
              {showRapidos ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <span>Mis Rapidos</span>
            </button>
            {showRapidos && (
              <div className="pb-2">
                <POSCajeroFavorites products={products} onAddToCart={addToCart} />
              </div>
            )}
          </div>

          {/* Favorites & Recents — colapsable */}
          {(favorites.length > 0 || recentProducts.length > 0) && (
            <div className="px-3 pt-2 border-b border-[var(--rule-soft)] dark:border-card-border bg-gray-50/50 dark:bg-surface/30">
              <button
                onClick={() => { setShowRecientes(v => { const nv = !v; localStorage.setItem("pos-show-recientes", String(nv)); return nv; }); }}
                className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-foreground w-full pb-2"
              >
                {showRecientes ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <span>Favoritos y Recientes</span>
                <span className="text-[var(--text-tertiary)] dark:text-muted">({favorites.length + recentProducts.length})</span>
              </button>
              {showRecientes && (
                <div className="pb-2 space-y-2">
                  {favorites.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Star className="h-3.5 w-3.5 text-[var(--data-warning)]" />
                        <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Favoritos</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
                        {favorites.map(id => {
                          const p = products.find(pr => pr.id === id);
                          if (!p) return null;
                          const outOfStock = p.stock != null && p.stock <= 0;
                          return (
                            <button
                              key={id}
                              onClick={() => !outOfStock && addToCart(p)}
                              disabled={outOfStock}
                              className={cn(
                                "group relative shrink-0 px-2 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5",
                                outOfStock
                                  ? "bg-gray-100 dark:bg-surface text-[var(--text-tertiary)] dark:text-muted cursor-not-allowed"
                                  : "bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground hover:border-primary hover:bg-primary/5"
                              )}
                            >
                              <span className="truncate max-w-24">{p.name}</span>
                              <span className="text-primary font-bold">{fmt(p.price)}</span>
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => { e.stopPropagation(); toggleFavorite(id); }}
                                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); toggleFavorite(id); } }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                              >
                                <X className="h-3 w-3 text-[var(--text-tertiary)] hover:text-[var(--data-error)]" />
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {recentProducts.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Clock className="h-3.5 w-3.5 text-[var(--data-success)]" />
                        <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Recientes</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
                        {recentProducts.slice(0, 6).map(id => {
                          const p = products.find(pr => pr.id === id);
                          if (!p) return null;
                          const outOfStock = p.stock != null && p.stock <= 0;
                          return (
                            <button
                              key={id}
                              onClick={() => !outOfStock && addToCart(p)}
                              disabled={outOfStock}
                              className={cn(
                                "shrink-0 px-2 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5",
                                outOfStock
                                  ? "bg-gray-100 dark:bg-surface text-[var(--text-tertiary)] dark:text-muted cursor-not-allowed"
                                  : "bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground hover:border-[var(--data-success)]/30 hover:bg-[var(--accent-soft)]/50 dark:hover:bg-[var(--accent-soft)]"
                              )}
                            >
                              <span className="truncate max-w-24">{p.name}</span>
                              <span className="text-primary font-bold">{fmt(p.price)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Product grid */}
          <div className="flex-1 overflow-y-auto p-3">
            {products.length === 0 ? (
              <EmptyState
                icon={ShoppingCart}
                title="Sin productos"
                description="Agrega productos desde el módulo de Productos & Precios para empezar a vender."
              />
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-[var(--text-tertiary)] dark:text-muted">
                <Package className="h-6 w-6 mb-2" />
                <p className="text-sm">No se encontraron productos</p>
              </div>
            ) : (
              <div className={cn(
                "grid gap-2",
                expanded
                  ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7"
                  : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4"
              )}>
                {filtered.map(p => {
                  const inCart = cart.find(i => i.product.id === p.id);
                  const outOfStock = p.stock != null && p.stock <= 0;
                  return (
                    <button
                      key={p.id}
                      onClick={() => !outOfStock && addToCart(p)}
                      disabled={outOfStock}
                      className={cn(
                        "bg-white dark:bg-card rounded-xl border p-2 text-left transition-all hover:shadow-sm relative",
                        inCart ? "border-primary ring-1 ring-primary/20" : "border-[var(--rule-soft)] hover:border-gray-200 dark:border-card-border",
                        outOfStock && "opacity-40 cursor-not-allowed"
                      )}
                    >
                      <div className="aspect-square rounded-lg overflow-hidden bg-gray-50 dark:bg-surface mb-1.5 relative">
                        <Image src={p.image} alt={p.name} fill sizes="120px" className="object-cover" loading="lazy" />
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(p.id); }}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); toggleFavorite(p.id); } }}
                          className="absolute top-1 left-1 h-6 w-6 rounded-full bg-white/90 dark:bg-card/90 backdrop-blur-sm flex items-center justify-center hover:bg-white dark:hover:bg-card transition-colors z-10 cursor-pointer"
                        >
                          <Star className={cn("h-3.5 w-3.5", favorites.includes(p.id) ? "fill-[var(--data-warning)] text-[var(--data-warning)]" : "text-[var(--text-tertiary)] dark:text-muted")} />
                        </span>
                        {inCart && (
                          <div className="absolute top-1 right-1 h-5 w-5 rounded-full bg-primary text-white text-[length:var(--ts-2xs)] font-bold flex items-center justify-center">
                            {inCart.quantity}
                          </div>
                        )}
                        {outOfStock && (
                          <div className="absolute inset-0 bg-white dark:bg-card/60 flex items-center justify-center">
                            <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-error)] bg-[var(--data-error-50)] px-2 py-0.5 rounded-full">Agotado</span>
                          </div>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-[var(--text-primary)] dark:text-foreground truncate">{p.name}</p>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-sm font-extrabold text-primary">{fmt(p.price)}</span>
                        {p.stock != null && (
                          <span className={cn("text-[length:var(--ts-2xs)]", p.stock <= (p.stockMin || 5) ? "text-[var(--data-warning)]" : "text-[var(--text-tertiary)] dark:text-muted")}>
                            {p.stock}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Cart */}
        <div className={cn(
          "bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl  flex flex-col shrink-0 min-h-0",
          expanded ? "lg:w-96 xl:w-md" : "lg:w-80 xl:w-96"
        )} style={expanded ? undefined : { minHeight: "28rem", maxHeight: "calc(100vh - 14rem)" }}>
          {/* Cart header */}
          <div className="px-2 sm:px-4 py-2 sm:py-3 border-b border-[var(--rule-soft)] dark:border-card-border">
            <div className="flex items-center justify-between">
              <CardTitle className="font-bold text-[var(--text-primary)] dark:text-foreground text-sm flex flex-wrap items-center gap-2">
                <ShoppingBasket className="h-4 w-4 text-primary" />
                Carrito
                {cartCount > 0 && (
                  <span className="bg-primary/10 text-primary text-xs font-bold px-2 py-0.5 rounded-full">{cartCount}</span>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                {/* Mejora 1 nueva: Cola de clientes */}
                <button
                  onClick={enqueueClient}
                  disabled={clientQueues.length >= 5}
                  className="text-xs font-bold text-[var(--data-success)] hover:text-[var(--data-success)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Guardar carrito y atender siguiente cliente"
                >
                  +Siguiente
                </button>
                {clientQueues.length > 0 && (
                  <div className="relative">
                    <button
                      onClick={() => setShowQueueDropdown(!showQueueDropdown)}
                      className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full hover:bg-primary/20 transition-colors"
                    >
                      Cola: {clientQueues.length}
                    </button>
                    {showQueueDropdown && (
                      <div className="absolute right-0 top-7 z-50 w-56 bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-2 space-y-1">
                        {clientQueues.map((q, idx) => {
                          const qTotal = q.reduce((s, i) => s + i.product.price * i.quantity, 0);
                          const qItems = q.reduce((s, i) => s + i.quantity, 0);
                          return (
                            <div key={idx} className="flex items-center gap-2 text-xs p-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-surface">
                              <button onClick={() => loadFromQueue(idx)} className="flex-1 text-left">
                                <span className="font-bold text-[var(--text-primary)] dark:text-foreground">Cliente {idx + 1}</span>
                                <span className="text-[var(--text-tertiary)] dark:text-muted ml-1">{qItems} items · {fmt(qTotal)}</span>
                              </button>
                              <button onClick={() => removeFromQueue(idx)} className="p-0.5 text-[var(--text-tertiary)] hover:text-[var(--data-error)]"><X className="h-3 w-3" /></button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                {cart.length > 0 && (
                  <button onClick={clearCart} className="text-xs font-semibold text-[var(--data-error)] hover:text-[var(--data-error)] transition-colors flex items-center gap-1">
                    Vaciar
                    <kbd className="text-[length:var(--ts-2xs)] bg-gray-200 dark:bg-gray-700 text-[var(--text-tertiary)] px-1 rounded">F3</kbd>
                  </button>
                )}
              </div>
            </div>
            {/* Mejora 10: Paused Carts */}
            <div className="mt-1.5">
              <POSPausedCarts
                currentCartItems={cart as { product: { id: number; name: string; price: number; unit: string; image?: string; [k: string]: unknown }; quantity: number; discount?: number }[]}
                currentTotal={cartTotal}
                onPause={handlePauseCart}
                onResume={handleResumeCart}
              />
            </div>
          </div>

          {/* Cart items + extras (scrollable) */}
          <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-1.5">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-[var(--text-tertiary)] dark:text-muted">
                <ShoppingBasket className="h-6 w-6 mb-1.5" />
                <p className="text-xs">Carrito vacío</p>
              </div>
            ) : (
              cart.map(item => {
                const discountMultiplier = 1 - (item.discount || 0) / 100;
                const itemTotal = item.product.price * item.quantity * discountMultiplier;
                return (
                  <div key={item.product.id} className={cn("rounded-lg border border-[var(--rule-soft)] dark:border-card-border p-2 hover:bg-gray-50 dark:hover:bg-surface transition-all duration-[var(--dur-base)]", lastAddedId === item.product.id && "ring-2 ring-[var(--data-success)]/40 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]")}>
                    <div className="flex flex-wrap items-center gap-2">
                      {item.product.image ? (
                        <Image src={item.product.image} alt="" width={48} height={48} className="rounded-lg object-cover shrink-0 w-12 h-12" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-accent flex items-center justify-center shrink-0">
                          <Package className="h-5 w-5 text-[var(--text-tertiary)] dark:text-muted" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[var(--text-primary)] dark:text-foreground truncate">{item.product.name}</p>
                        <div className="flex items-center gap-1.5">
                          <p className={cn("text-[length:var(--ts-xs)]", item.discount ? "line-through text-[var(--text-tertiary)] dark:text-muted" : "text-[var(--text-tertiary)] dark:text-muted")}>
                            {fmt(item.product.price)}
                          </p>
                          {item.discount && item.discount > 0 && (
                            <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-success)] bg-[var(--accent-soft)] px-1 py-0.5 rounded">
                              -{item.discount}%
                            </span>
                          )}
                          {/* Mejora 7: Stock bajo badge */}
                          {item.product.stock != null && item.product.stock > 0 && item.product.stock <= (item.product.stockMin || 5) && (
                            <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning)] bg-[var(--data-warning-50)] px-1 py-0.5 rounded">
                              Ultimas {item.product.stock}
                            </span>
                          )}
                          {/* Mejora 3: Promo badge */}
                          <PromoBadge productId={item.product.id} quantity={item.quantity} unitPrice={item.product.price} />
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => updateQuantity(item.product.id, -1)}
                          className="h-6 w-6 rounded-md bg-gray-100 dark:bg-accent flex items-center justify-center hover:bg-gray-200 transition-colors"
                        >
                          <Minus className="h-3 w-3 text-[var(--text-secondary)] dark:text-muted" />
                        </button>
                        <span className="w-6 text-center text-xs font-bold text-[var(--text-primary)] dark:text-foreground">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.product.id, 1)}
                          className="h-6 w-6 rounded-md bg-gray-100 dark:bg-accent flex items-center justify-center hover:bg-gray-200 transition-colors"
                        >
                          <Plus className="h-3 w-3 text-[var(--text-secondary)] dark:text-muted" />
                        </button>
                      </div>
                      <span className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground shrink-0 w-14 text-right">{fmt(itemTotal)}</span>
                      <button
                        onClick={() => setEditingDiscount(editingDiscount === item.product.id ? null : item.product.id)}
                        className={cn(
                          "p-1 rounded transition-colors shrink-0",
                          editingDiscount === item.product.id ? "text-primary bg-primary/10" : "text-[var(--text-tertiary)] dark:text-muted hover:text-primary"
                        )}
                        title="Aplicar descuento"
                      >
                        <Percent className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => removeFromCart(item.product.id)}
                        className="p-1 rounded text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--data-error)] transition-colors shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {editingDiscount === item.product.id && (
                      <div className="mt-2 pt-2 border-t border-[var(--rule-soft)] dark:border-card-border flex flex-wrap items-center gap-2">
                        <label className="text-xs text-[var(--text-secondary)] dark:text-muted font-medium">Descuento:</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={item.discount || 0}
                          onChange={e => updateDiscount(item.product.id, Number(e.target.value))}
                          className="flex-1 px-2 py-1 text-xs border border-[var(--rule-base)] dark:border-card-border rounded text-[var(--text-primary)] dark:text-foreground focus:border-primary outline-none"
                          placeholder="0"
                        />
                        <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">%</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Mejora P-2: Subtotal por categoria */}
            {cart.length > 0 && (() => {
              const categoryTotals = cart.reduce((acc, item) => {
                const cat = item.product.category || "Otros";
                acc[cat] = (acc[cat] || 0) + item.product.price * item.quantity * (1 - (item.discount || 0) / 100);
                return acc;
              }, {} as Record<string, number>);
              const cats = Object.entries(categoryTotals);
              if (cats.length < 2) return null;
              return (
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted px-3 pb-1">
                  {cats.map(([cat, total]) => `${cat}: S/${total.toFixed(0)}`).join(" · ")}
                </p>
              );
            })()}

            {/* Mejora 11: Cross-sell suggestion */}
            {cart.length > 0 && (
              <POSCrossSell
                cartProductIds={cart.map(i => i.product.id)}
                onAddToCart={handleAddFromSearch}
              />
            )}

            {/* Fiado panel (Upgrade 5) */}
            {customerPhone && (
              <div className="px-3 pb-1">
                <POSFiadoPanel customerPhone={customerPhone} cartTotal={cartTotal} />
              </div>
            )}
          </div>

          {/* Cart total + pay button — sticky bottom */}
          {cart.length > 0 && (
            <div className="shrink-0 border-t border-[var(--rule-base)] dark:border-card-border p-3 space-y-2 bg-white dark:bg-card rounded-b-2xl shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
              {/* Mejora 5: Expandable cart detail */}
              <div className="flex justify-between items-center">
                <POSCartDetail
                  items={cart.map(i => ({
                    name: i.product.name,
                    quantity: i.quantity,
                    price: i.product.price,
                    discount: i.discount,
                  }))}
                  count={cartCount}
                />
                <span className="text-lg font-extrabold text-[var(--text-primary)] dark:text-foreground">{fmt(cartTotal)}</span>
              </div>
              {/* Mejora 4R2: Total en palabras */}
              <p className="text-xs text-[var(--text-tertiary)] italic capitalize text-right">{numeroAPalabras(cartTotal)}</p>
              {/* Desglose IGV */}
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-mono text-right">Sub: S/{(cartTotal/1.18).toFixed(2)} · IGV: S/{(cartTotal - cartTotal/1.18).toFixed(2)}</p>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowPayment(true)}
                  className="flex-1 py-3 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary-dark transition-colors flex flex-wrap items-center justify-center gap-2"
                >
                  <Banknote className="h-4 w-4" />
                  Cobrar {fmt(cartTotal)}
                  <kbd className="ml-1 text-[length:var(--ts-2xs)] bg-white/20 px-1 rounded">F2</kbd>
                </button>
                {/* Idea 12: Trueque button */}
                <button
                  onClick={() => setShowTrueque(true)}
                  className="px-4 py-3 rounded-lg border-2 border-[var(--data-warning)] text-[var(--data-warning)] dark:text-[var(--data-warning)] font-bold text-sm hover:bg-[var(--data-warning-50)] dark:hover:bg-amber-950/20 transition-colors flex items-center gap-1.5"
                  title="Trueque Digital"
                >
                  &#128260; Trueque
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mejora 1: Idle Screen */}
      {isIdle && <POSIdleScreen onWake={() => setIsIdle(false)} />}

      {/* Mejora 2: Mobile cart summary bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-[var(--surface-raised)] border-t border-[var(--rule-base)] px-4 py-3 z-40 sm:hidden">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-[var(--text-primary)] dark:text-foreground">{cartCount} items</span>
              <span className="text-lg font-bold font-mono ml-2 text-[var(--text-primary)] dark:text-foreground">S/ {cartTotal.toFixed(2)}</span>
            </div>
            <button onClick={() => setShowPayment(true)} className="bg-[#00B4A6] text-white px-6 py-2.5 rounded-lg font-semibold text-sm">
              Cobrar
            </button>
          </div>
        </div>
      )}

      {/* IDEA 6: Modal Pedido WhatsApp */}
      {showWhatsAppOrder && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowWhatsAppOrder(false)}>
          <div className="bg-white dark:bg-card rounded-xl max-w-md w-full max-h-[80vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-[var(--data-success)]" />
                <CardTitle className="text-base font-bold text-[var(--text-primary)] dark:text-foreground">Pedido por WhatsApp</CardTitle>
              </div>
              <button onClick={() => setShowWhatsAppOrder(false)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"><X className="h-4 w-4" /></button>
            </div>

            <p className="text-xs text-[var(--text-secondary)] mb-3">Pega aqui el mensaje del cliente y el sistema encontrara los productos:</p>

            <textarea
              value={waText}
              onChange={e => { setWaText(e.target.value); parseWhatsAppOrder(e.target.value); }}
              placeholder={"Ej: 2 arroz, 3 leche gloria, 1 aceite\no: dame 5 huevos y 2 gaseosas"}
              rows={4}
              className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-gray-50 dark:bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-[var(--data-success)]/40 resize-none font-mono"
              autoFocus
            />

            {waParsedItems.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-bold text-[var(--text-secondary)]">Productos encontrados</p>
                {waParsedItems.map((item, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-gray-50 dark:bg-surface border border-[var(--rule-soft)] dark:border-card-border">
                    {item.selected || item.matches.length === 1 ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[var(--data-success)] font-bold text-xs shrink-0">x{item.qty}</span>
                          <span className="text-sm font-medium text-[var(--text-primary)] dark:text-foreground truncate">{(item.selected || item.matches[0]).name}</span>
                        </div>
                        <span className="text-sm font-bold text-[#00B4A6] shrink-0">S/{((item.selected || item.matches[0]).price * item.qty).toFixed(2)}</span>
                      </div>
                    ) : item.matches.length > 1 ? (
                      <div>
                        <p className="text-xs text-[var(--data-warning)] font-bold mb-1.5">&quot;{item.search}&quot; — {item.matches.length} opciones:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {item.matches.map(m => (
                            <button
                              key={m.id}
                              onClick={() => {
                                setWaParsedItems(prev => prev.map((p, i) => i === idx ? { ...p, selected: m } : p));
                              }}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-card border border-[var(--rule-base)] hover:border-[#00B4A6] hover:text-[#00B4A6] transition-colors"
                            >
                              {m.name} · S/{m.price.toFixed(2)}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--data-error)] font-bold">&quot;{item.search}&quot; — No encontrado</p>
                    )}
                  </div>
                ))}

                {(() => {
                  const resolved = waParsedItems.filter(i => i.selected || i.matches.length === 1);
                  const total = resolved.reduce((s, i) => s + ((i.selected || i.matches[0])?.price ?? 0) * i.qty, 0);
                  return (
                    <div className="pt-3 border-t border-[var(--rule-soft)] dark:border-card-border">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-bold text-[var(--text-primary)]">Total estimado: <span className="text-[#00B4A6]">S/{total.toFixed(2)}</span></span>
                        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{resolved.length}/{waParsedItems.length} items</span>
                      </div>
                      <button
                        onClick={() => {
                          for (const item of resolved) {
                            const product = item.selected || item.matches[0];
                            if (product) {
                              for (let i = 0; i < item.qty; i++) handleAddFromSearch(product.id);
                            }
                          }
                          setShowWhatsAppOrder(false);
                          setWaText("");
                          setWaParsedItems([]);
                        }}
                        disabled={resolved.length === 0}
                        className="w-full py-3 rounded-lg bg-[#00B4A6] text-white text-sm font-bold hover:bg-[#245a41] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <ShoppingBasket className="h-4 w-4" /> Agregar todo al carrito
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Barcode scanner overlay */}
      {showScanner && (
        <BarcodeScanner onDetected={handleBarcode} onClose={() => setShowScanner(false)} />
      )}

      {/* ── Sales History Sidebar ──────────────────────────────────────────── */}
      {showHistory && (
        <div className="fixed inset-y-0 right-0 z-40 w-80 bg-white dark:bg-card border-l border-[var(--rule-base)] dark:border-card-border flex flex-col">
          {/* Header */}
          <div className="px-2 sm:px-4 py-2 sm:py-3 border-b border-[var(--rule-soft)] dark:border-card-border flex items-center justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              <CardTitle className="font-bold text-[var(--text-primary)] dark:text-foreground text-sm">Historial del Turno</CardTitle>
            </div>
            <button
              onClick={() => setShowHistory(false)}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors"
            >
              <X className="h-4 w-4 text-[var(--text-tertiary)] dark:text-muted" />
            </button>
          </div>

          {/* Total */}
          {!loadingHistory && salesHistory.length > 0 && (
            <div className="px-2 sm:px-4 py-2 sm:py-3 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-b border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30">
              <p className="text-xs font-bold text-[var(--data-success)]">Total Ventas del Turno</p>
              <p className="text-xl sm:text-2xl font-extrabold text-[var(--data-success)] dark:text-[var(--data-success)]">
                {fmt(salesHistory.reduce((sum, s) => sum + s.total, 0))}
              </p>
              <p className="text-xs text-[var(--data-success)] mt-0.5">{salesHistory.length} {salesHistory.length === 1 ? "venta" : "ventas"}</p>
            </div>
          )}

          {/* List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loadingHistory ? (
              <div className="flex items-center justify-center h-32 text-[var(--text-tertiary)] dark:text-muted">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : salesHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-[var(--text-tertiary)] dark:text-muted">
                <Receipt className="h-6 w-6 mb-1.5" />
                <p className="text-xs">Sin ventas hoy</p>
              </div>
            ) : (
              salesHistory.map(sale => (
                <SaleHistoryItem key={sale.id} sale={sale} />
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Idea 12: Trueque Digital ──────────────────────────────────────── */}
      {showTrueque && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowTrueque(false)}>
          <div className="bg-white dark:bg-card rounded-xl max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">&#128260;</span>
              <CardTitle className="text-lg font-extrabold text-[var(--text-primary)] dark:text-foreground">Trueque Digital</CardTitle>
            </div>
            <p className="text-xs text-[var(--text-secondary)] dark:text-muted mb-3">El cliente intercambia productos por su compra (comun en zonas rurales de selva).</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted block mb-1">Que recibe a cambio?</label>
                <textarea
                  value={truequeDesc}
                  onChange={e => setTruequeDesc(e.target.value)}
                  placeholder="Ej: 5 kg de platano, 2 gallinas..."
                  rows={2}
                  className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-gray-50 dark:bg-surface text-[var(--text-primary)] dark:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted block mb-1">Valor estimado (S/)</label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={truequeValor}
                  onChange={e => setTruequeValor(e.target.value)}
                  placeholder="0.00"
                  className="w-32 text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-gray-50 dark:bg-surface text-[var(--text-primary)] dark:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              {Number(truequeValor) > 0 && cartTotal > 0 && (
                <div className={cn("rounded-lg p-3 text-sm font-bold", Number(truequeValor) >= cartTotal ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success)]" : "bg-[var(--data-warning-50)] dark:bg-amber-950/20 text-[var(--data-warning)]")}>
                  {Number(truequeValor) >= cartTotal ? (
                    <span>Sin pago adicional (valor trueque cubre el total)</span>
                  ) : (
                    <span>Diferencia a pagar: S/{(cartTotal - Number(truequeValor)).toFixed(2)}</span>
                  )}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  disabled={!truequeDesc.trim() || !truequeValor || Number(truequeValor) <= 0 || processing}
                  onClick={async () => {
                    const valorTrueque = Number(truequeValor);
                    const diferencia = Math.max(0, cartTotal - valorTrueque);
                    const _truequeDetails = JSON.stringify({ tipo: "TRUEQUE", descripcion: truequeDesc, valorEstimado: valorTrueque, diferenciaPagada: diferencia });
                    // Fire sale through normal flow with TRUEQUE payment
                    await handlePaymentConfirm(
                      [{ method: (diferencia > 0 ? "efectivo" : "efectivo") as "efectivo", amount: diferencia > 0 ? diferencia : cartTotal }],
                      customerPhone || undefined,
                      { comprobanteTipo: "ticket" as ComprobanteTipo, customerName: `TRUEQUE: ${truequeDesc} (S/${valorTrueque})`, discountAmount: 0, discountPercent: 0 }
                    );
                    setShowTrueque(false);
                    setTruequeDesc("");
                    setTruequeValor("");
                  }}
                  className="flex-1 py-2.5 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  Confirmar trueque
                </button>
                <button onClick={() => setShowTrueque(false)} className="px-4 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm font-bold text-[var(--text-secondary)] hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment Modal (Upgrade 3) ──────────────────────────────────────── */}
      {showPayment && (
        <POSPaymentModal
          total={cartSubtotal}
          cartCount={cartCount}
          cartItems={cart.map(i => ({ name: i.product.name, quantity: i.quantity, price: i.product.price, unit: i.product.unit }))}
          onConfirm={handlePaymentConfirm}
          onCancel={() => setShowPayment(false)}
          processing={processing}
          onRepeatOrder={handleRepeatOrder}
        />
      )}

      {/* ── Sale Complete Modal (Mejora 4: WhatsApp mejorado) ──────────── */}
      {saleComplete && (
        <SaleCompleteModal
          saleComplete={saleComplete}
          lastSaleDetails={lastSaleDetails}
          cartTotal={cartTotal}
          paymentMethod={paymentMethod}
          cart={cart}
          onNewSale={handleNewSale}
        />
      )}

      {/* ── Yape/Plin QR Payment Modal ─────────────────────────────────────── */}
      {showYapeQR && (
        <YapeQRPayment
          amount={cartTotal}
          onConfirm={() => {
            setShowYapeQR(null);
            handlePaymentConfirm([{ method: showYapeQR as "yape" | "plin", amount: cartTotal }]);
          }}
          onCancel={() => setShowYapeQR(null)}
        />
      )}

      {/* ── Mejora 7: Stock Alert Toast ──────────────────────────────────────── */}
      {stockAlert && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-[var(--dur-base)]">
          <div className={cn(
            "px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2",
            stockAlert.type === "warning"
              ? "bg-[var(--data-warning)] text-white"
              : "bg-[var(--data-error)] text-white"
          )}>
            {stockAlert.message}
            {stockAlert.actionLabel && stockAlert.actionFn && (
              <button onClick={stockAlert.actionFn} className="px-2 py-1 bg-white/20 hover:bg-white/30 rounded text-[length:var(--ts-2xs)] font-bold whitespace-nowrap">
                {stockAlert.actionLabel}
              </button>
            )}
            <button onClick={() => setStockAlert(null)} className="p-0.5 hover:bg-white/20 rounded">
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* ── Mejora 7: Zero Stock Confirmation ────────────────────────────────── */}
      {showZeroStockConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-card rounded-xl max-w-xs w-full p-4 sm:p-6 text-center">
            <div className="h-10 w-10 rounded-full bg-[var(--data-error-50)] flex items-center justify-center mx-auto mb-3">
              <Package className="h-5 w-5 text-[var(--data-error)]" />
            </div>
            <CardTitle className="text-sm font-extrabold text-[var(--text-primary)] dark:text-foreground mb-1">Sin stock</CardTitle>
            <p className="text-xs text-[var(--text-secondary)] dark:text-muted mb-4">
              <span className="font-semibold">{showZeroStockConfirm.name}</span> no tiene stock disponible. Agregar de todos modos?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowZeroStockConfirm(null)}
                className="flex-1 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-xs font-bold text-[var(--text-secondary)] hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => forceAddZeroStock(showZeroStockConfirm)}
                className="flex-1 py-2 rounded-lg bg-[var(--data-warning)] text-white text-xs font-bold hover:bg-[var(--data-warning)] transition-colors"
              >
                Agregar igual
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mejora 4: Devolucion rapida modal */}
      <POSReturnModal
        isOpen={showReturn}
        onClose={() => setShowReturn(false)}
        onReturnComplete={() => fetchProducts()}
      />

      {/* Mejora 3: Resumen de turno flotante */}
      <ShiftSummaryWidget />
    </>
  );

  // ── Expanded full-screen mode ──────────────────────────────────────────────

  // Mejora 2 nueva: CSS para tamano de fuente
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
      <div className={cn("fixed inset-0 z-50 bg-gray-50 dark:bg-surface overflow-y-auto", fontSize === "large" && "pos-large", fontSize === "xlarge" && "pos-xlarge")}>
        {fontSizeStyle}
        <div className="max-w-480 mx-auto px-4 sm:px-6 py-4 space-y-4">
          {posContent}
        </div>
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

