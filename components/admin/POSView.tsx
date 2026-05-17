"use client";

import { CardTitle, LoadingState } from "@buleje/design-system";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, Minus, ShoppingBasket, ScanBarcode,
  Banknote, X, Check, Loader2,
  Receipt, Package, Maximize2, Minimize2,
  Star, Clock, History, Percent, Info, Printer,
  Volume2, VolumeX, MessageCircle, Send, RotateCcw,
  ChevronDown, ChevronRight, ShoppingCart, Settings,
  Leaf, UtensilsCrossed, Boxes, Droplets, Sparkles,
  Smartphone, CreditCard, HandCoins,
  Camera, Lightbulb, Timer, ClipboardList, RefreshCcw,
} from "@buleje/design-system/icons";

// Mapeo de id de categoria → icono Lucide. Reemplaza los emojis originales
// por iconografia profesional coherente con el resto del admin.
const CATEGORY_ICONS: Record<string, typeof Package> = {
  "todos": ShoppingBasket,
  "frutas-verduras": Leaf,
  "abarrotes": Package,
  "carnes": UtensilsCrossed,
  "lacteos": Boxes,
  "bebidas": Droplets,
  "limpieza": Sparkles,
};
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
import { csrfHeaders } from "@/lib/csrf-client";

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
      <div className="px-3 py-2 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-gray-50/50 dark:bg-surface/30">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Mis Rapidos</span>
          <button onClick={() => setConfigMode(true)} className="text-[length:var(--ts-2xs)] font-bold text-primary hover:underline">Configurar</button>
        </div>
        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted italic">Configura tus 12 productos rapidos para atender mas rápido</p>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-gray-50/50 dark:bg-surface/30">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Mis Rapidos ({favIds.length}/12)</span>
        <button
          onClick={() => setConfigMode(!configMode)}
          className={cn("text-[length:var(--ts-2xs)] font-bold transition-colors", configMode ? "text-[var(--data-success-500)]" : "text-primary hover:underline")}
        >
          {configMode ? "Listo" : "Configurar"}
        </button>
      </div>
      {configMode && (
        <p className="text-[length:var(--ts-2xs)] text-[var(--data-warning-500)] mb-1.5">Haz click en productos del catalogo para agregarlos aqui (max 12)</p>
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
                "bg-[var(--surface-raised)] border text-left px-1.5 rounded-lg transition-all flex items-center gap-1",
                configMode ? "border-[var(--data-error-500)] hover:bg-[var(--data-error-50)]" : "border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:bg-gray-50 dark:hover:bg-surface"
              )}
              style={{ height: 48 }}
              title={configMode ? `Quitar ${p.name}` : p.name}
            >
              <div className="flex-1 min-w-0">
                <p className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate leading-tight">{p.name.slice(0, 15)}</p>
                <p className="text-[length:var(--ts-2xs)] font-bold text-primary">{fmt(p.price)}</p>
              </div>
              {configMode && <X className="h-3 w-3 text-[var(--data-error-500)] shrink-0" />}
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
        <div className="absolute left-6 top-0 z-50 w-80 bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 text-xs leading-relaxed pointer-events-none">
          <p className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm mb-2 inline-flex items-center gap-1.5"><ShoppingCart className="h-4 w-4 text-primary" aria-hidden /> Punto de Venta (POS)</p>
          <p className="text-[var(--text-secondary)] dark:text-muted mb-3">Registra ventas en mostrador: busca productos, agrégalos al carrito, elige cómo cobrar y confirma la venta.</p>
          <div className="space-y-1.5">
            <p><span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Catálogo:</span> <span className="text-[var(--text-secondary)] dark:text-muted">busca por nombre, filtra por categoría o escanea código de barras.</span></p>
            <p><span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Carrito:</span> <span className="text-[var(--text-secondary)] dark:text-muted">ajusta cantidades y aplica descuentos por ítem.</span></p>
            <p><span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Cobro:</span> <span className="text-[var(--text-secondary)] dark:text-muted">efectivo, Yape, Plin, tarjeta o fiado. Pago dividido también.</span></p>
          </div>
          <div className="mt-3 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-xl p-2">
            <p className="text-[var(--data-success-500)] dark:text-[var(--data-success-500)] font-semibold inline-flex items-center gap-1.5"><Lightbulb className="h-3.5 w-3.5" aria-hidden /> Ejemplo</p>
            <p className="text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">Carlos busca “Leche”, agrega 2 unidades al carrito, el cliente paga S/10 en efectivo y el sistema le dice el vuelto.</p>
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
    <span className={cn("text-[length:var(--ts-2xs)] font-bold px-1 py-0.5 rounded", applied ? "bg-[var(--accent-soft)] text-[var(--data-success-500)]" : "bg-[var(--accent-soft)] text-[var(--data-success-500)]")}>
      {promo.buyQty}xS/{Number(promo.payPrice).toFixed(0)}{saving > 0 ? ` (ahorro S/${saving.toFixed(0)})` : ""}
    </span>
  );
}

// ── Sale History Item (Mejora 2: expandable) ─────────────────────────────────

function SaleHistoryItem({ sale }: { sale: SaleRecord }) {
  const [expanded, setExpanded] = useState(false);
  const time = new Date(sale.createdAt).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  const itemCount = sale.items.reduce((sum, i) => sum + i.quantity, 0);
  return (
    <div className="bg-gray-50 dark:bg-surface rounded-lg border border-[var(--rule-soft)] dark:border-[var(--rule-base)] hover:border-primary transition-colors">
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left p-3">
        <div className="flex items-start justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-[var(--text-tertiary)] dark:text-muted" />
            <span className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">{time}</span>
          </div>
          <span className="text-sm font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(sale.total)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">{itemCount} {itemCount === 1 ? "articulo" : "articulos"}</span>
          <span className={cn(
            "text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full",
            sale.payment === "efectivo" ? "bg-[var(--accent-soft)] text-[var(--data-success-500)]" :
            sale.payment === "yape" ? "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" :
            sale.payment === "plin" ? "bg-teal-50 text-[var(--accent-dark)]" :
            sale.payment === "tarjeta" ? "bg-[var(--accent-soft)] text-[var(--data-success-500)]" :
            sale.payment === "fiado" ? "bg-[var(--data-warning-50)] text-[var(--data-warning-500)]" :
            "bg-gray-50 text-[var(--text-secondary)]"
          )}>
            {sale.payment}
          </span>
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] pt-2 space-y-1.5">
          {(sale as SaleRecord & { items: { name?: string; quantity: number }[] }).items.map((item, idx) => (
            <div key={idx} className="flex justify-between text-[length:var(--ts-xs)]">
              <span className="text-[var(--text-secondary)] dark:text-muted truncate max-w-[140px]">
                {(item as { name?: string }).name || `Item ${idx + 1}`} x{item.quantity}
              </span>
            </div>
          ))}
          <div className="flex gap-1.5 pt-1">
            <a href={`/venta/${sale.id}/recibo`} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] dark:text-muted px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:bg-gray-100 dark:hover:bg-accent transition-colors">
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
  const colors = ["var(--accent)", "#f97316", "#2dd4bf", "#e63946"];
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
      await fetch(`/api/fiados/${fiado.id}/pagar`, { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ monto }) });
      setDone(true);
    } catch { /* silent */ }
    setPaying(false);
  };

  if (!fiado || done) return done ? (
    <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success-500)]/30">
      <Check className="h-5 w-5 text-[var(--data-success-500)]" strokeWidth={3} />
      <span className="text-base font-semibold text-[var(--data-success-500)]">Abono registrado</span>
    </div>
  ) : null;

  const quickAmounts = [10, 20, 50].filter(a => a <= fiado.saldo);
  return (
    <div className="border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] pt-4 space-y-3">
      <p className="text-sm font-semibold text-[var(--data-warning-500)]">
        {customerName || customerPhone} tiene fiado de <span className="font-bold">S/{Number(fiado.saldo).toFixed(2)}</span>. ¿Abonar?
      </p>
      <div className="flex flex-wrap gap-2">
        {quickAmounts.map(a => (
          <button key={a} onClick={() => abonar(a)} disabled={paying}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--data-warning-100)] text-[var(--data-warning-500)] hover:bg-[var(--data-warning-500)] hover:text-white transition-colors disabled:opacity-50">
            S/{a}
          </button>
        ))}
        <button onClick={() => abonar(fiado.saldo)} disabled={paying}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--accent-soft)] text-[var(--data-success-500)] hover:bg-[var(--data-success-500)] hover:text-white transition-colors disabled:opacity-50">
          Todo S/{Number(fiado.saldo).toFixed(2)}
        </button>
        <button onClick={() => setFiado(null)} className="px-4 py-2 rounded-lg text-sm font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-gray-50 dark:hover:bg-surface transition-colors">No, gracias</button>
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
  onClose,
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
  onClose: () => void;
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

  // Payment method → icono Lucide (no emojis). Consistente con el design system.
  const method = (lastSaleDetails?.payment || paymentMethod || "efectivo").toLowerCase();
  const MethodIcon: Record<string, typeof Banknote> = {
    efectivo: Banknote,
    yape: Smartphone,
    plin: Smartphone,
    tarjeta: CreditCard,
    mixto: HandCoins,
    fiado: HandCoins,
  };
  const PayIcon = MethodIcon[method] ?? Banknote;

  const comprobanteLabel = (t?: string) =>
    t === "boleta" ? "Boleta"
    : t === "factura" ? "Factura"
    : t === "cotizacion" ? "Cotización"
    : t === "proforma" ? "Proforma"
    : "Ticket";

  return (
    <div className="modal-backdrop p-4">
      <div className="bg-[var(--surface-raised)] rounded-2xl shadow-[var(--shadow-xl)] ring-1 ring-[var(--rule-base)] max-w-md w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-[var(--dur-fast)]">
        {/* Header — success + titulo + total */}
        <div className="px-6 pt-8 pb-6 text-center relative overflow-hidden">
          <SaleConfetti />

          {/* Boton cerrar (X) */}
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute top-4 right-4 z-30 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors"
          >
            <X className="h-5 w-5 text-[var(--text-tertiary)] dark:text-muted" />
          </button>

          <m.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className="h-20 w-20 rounded-full bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] flex items-center justify-center mx-auto mb-4 relative z-20"
          >
            <Check className="h-10 w-10 text-[var(--data-success-500)]" strokeWidth={3} />
          </m.div>
          <m.h3
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="text-2xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-4"
          >
            ¡Venta completada!
          </m.h3>
          <m.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="text-4xl sm:text-5xl font-extrabold text-primary tabular-nums"
          >
            {fmt(animatedTotal)}
          </m.p>
          <div className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-full bg-gray-50 dark:bg-surface border border-[var(--rule-soft)]">
            <PayIcon className="h-4 w-4 text-[var(--text-secondary)]" />
            <span className="text-sm font-semibold text-[var(--text-secondary)] dark:text-muted">
              Pagado con <span className="capitalize">{method}</span>
            </span>
          </div>
        </div>

        {/* Body scrollable */}
        <div className="flex-1 overflow-y-auto px-6 pb-5 space-y-4">
          {saleComplete.change === -1 ? (
            <div className="bg-[var(--data-warning-50)] dark:bg-amber-950/20 border border-[var(--data-warning-500)]/30 rounded-xl p-4 text-center">
              <p className="text-sm font-semibold text-[var(--data-warning-500)] uppercase tracking-wide mb-1">Venta al fiado</p>
              <p className="text-base text-[var(--data-warning-500)]">El cliente queda debiendo</p>
            </div>
          ) : saleComplete.change > 0 ? (
            <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success-500)]/30 rounded-xl p-5 text-center">
              <p className="text-sm font-semibold text-[var(--data-success-500)] uppercase tracking-wide mb-1">Dar de vuelto</p>
              <p className="text-4xl font-extrabold text-[var(--data-success-500)] tabular-nums">{fmt(saleComplete.change)}</p>
            </div>
          ) : null}

          {lastSaleDetails?.comprobanteNumero ? (
            <div className="bg-white dark:bg-surface border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Receipt className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">Comprobante</p>
                <p className="text-base font-mono font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                  {comprobanteLabel(lastSaleDetails.comprobanteTipo)} #{lastSaleDetails.comprobanteNumero}
                </p>
              </div>
            </div>
          ) : null}

          <QuickAbonoFromSale customerPhone={lastSaleDetails?.customerPhone} customerName={lastSaleDetails?.customerName} />

          <div className="border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] pt-4">
            <p className="text-sm font-semibold text-[var(--text-secondary)] dark:text-muted mb-3">
              Enviar por WhatsApp
            </p>
            {hasCustomerPhone ? (
              <a
                href={buildWhatsAppUrl(hasCustomerPhone)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 rounded-xl bg-[var(--data-success-500)] hover:bg-[var(--data-success-500)]/90 text-white font-semibold text-base transition-colors flex items-center justify-center gap-2"
              >
                <MessageCircle className="h-5 w-5" />
                <span className="truncate">Enviar a {customerName || hasCustomerPhone}</span>
              </a>
            ) : (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] text-sm font-semibold">+51</span>
                  <input
                    type="tel"
                    value={manualPhone}
                    onChange={(e) => setManualPhone(e.target.value.replace(/\D/g, "").slice(0, 9))}
                    placeholder="Número del cliente"
                    className="w-full pl-12 pr-3 py-3 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-base text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
                {manualPhone.length >= 9 ? (
                  <a
                    href={buildWhatsAppUrl(manualPhone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-5 py-3 rounded-xl bg-[var(--data-success-500)] text-white font-semibold text-base hover:bg-[var(--data-success-500)]/90 transition-colors flex items-center gap-2 shrink-0"
                  >
                    <Send className="h-4 w-4" />
                    Enviar
                  </a>
                ) : (
                  <button
                    disabled
                    className="px-5 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-[var(--text-tertiary)] font-semibold text-base cursor-not-allowed flex items-center gap-2 shrink-0"
                  >
                    <Send className="h-4 w-4" />
                    Enviar
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer — acciones principales */}
        <div className="px-6 py-5 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-gray-50/50 dark:bg-surface/30 space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <a
              href={`/venta/${saleComplete.id}/recibo`}
              target="_blank"
              rel="noopener noreferrer"
              className="py-3 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] font-semibold text-base hover:bg-gray-50 dark:hover:bg-surface transition-colors flex items-center justify-center gap-2"
            >
              <Printer className="h-5 w-5" />
              Imprimir
            </a>
            <button
              onClick={onNewSale}
              className="py-3 rounded-xl bg-primary text-white font-bold text-base hover:bg-primary-dark transition-colors flex items-center justify-center gap-2"
            >
              Nueva venta
              <span aria-hidden>&rarr;</span>
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
              className="w-full py-2.5 rounded-xl text-[var(--text-secondary)] dark:text-muted font-semibold text-sm hover:bg-gray-100 dark:hover:bg-surface transition-colors flex items-center justify-center gap-2"
            >
              <Printer className="h-4 w-4" /> Ticket térmico (ESC/POS)
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
      className="fixed bottom-4 left-4 z-40 bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] cursor-pointer select-none transition-all"
      style={{ borderRadius: expanded ? 16 : 9999 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      <div className="px-4 py-2 flex items-center gap-3 text-xs">
        <span className="text-[var(--text-secondary)] dark:text-muted inline-flex items-center gap-1.5">
          <Timer className="h-3.5 w-3.5" aria-hidden /> {timeStr}
        </span>
        <span className="font-bold text-primary" style={{ color: "var(--accent)" }}>S/{(data.totalVentas ?? 0).toFixed(0)}</span>
        <span className="text-[var(--text-secondary)] dark:text-muted inline-flex items-center gap-1.5">
          <ClipboardList className="h-3.5 w-3.5" aria-hidden /> {data.cantidadVentas ?? 0}
        </span>
      </div>
      {expanded && (
        <m.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="px-4 pb-3 pt-1 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] space-y-1"
        >
          <div className="flex justify-between text-[length:var(--ts-xs)]">
            <span className="text-[var(--text-secondary)] dark:text-muted">Ticket promedio</span>
            <span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">S/{(data.ticketPromedio ?? 0).toFixed(1)}</span>
          </div>
          <div className="flex justify-between text-[length:var(--ts-xs)]">
            <span className="text-[var(--text-secondary)] dark:text-muted">Ventas/hora</span>
            <span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
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
  // Mejora 4: Devolucion rápida
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
          // Sin número: "cebollas" -> qty 1
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

  // Mejora 9: Frequent products refresh key (aún usado por handleAddFromSearch
  // para invalidar la caché cuando se elimina el accordion de "Más vendidos").
  const [frequentRefreshKey, setFrequentRefreshKey] = useState(0);

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

  // Mejora P-1: Último producto agregado parpadea verde
  const [lastAddedId, setLastAddedId] = useState<number | null>(null);
  const lastAddedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(salePayload),
      });
      const sale = await res.json();
      if (res.ok) {
        playSaleComplete(effectiveTotal);
        // Cerrar el modal de pago ANTES de abrir el de exito — evita stacking
        setShowPayment(false);
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
                headers: csrfHeaders({ "Content-Type": "application/json" }),
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
        setShowPayment(false);
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
        <div className="flex flex-wrap items-center gap-2 p-2.5 mb-3 rounded-lg bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/30">
          <Info className="h-4 w-4 text-[var(--data-error-500)] shrink-0" />
          <p className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)] flex-1">{saleError}</p>
          <button onClick={() => setSaleError(null)} className="p-0.5 text-[var(--data-error-500)] hover:text-[var(--data-error-500)]"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}


      {/* Body: products + cart */}
      <div className="flex flex-col lg:flex-row gap-2 sm:gap-4">
        {/* Left: Products */}
        <div className={cn(
          "flex-1 bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl  overflow-hidden flex flex-col",
          expanded ? "min-h-[calc(100vh-12rem)]" : ""
        )} style={expanded ? undefined : { minHeight: "28rem", maxHeight: "calc(100vh - 14rem)" }}>
          {/* Search + Actions + Categories — acciones a la derecha de la search bar
              para compactar verticalmente (antes ocupaban una fila entera). */}
          <div className="p-3 space-y-2 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] relative">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <div className="flex-1 min-w-[200px]">
                <POSSearchBar
                  products={products as { id: number; name: string; price: number; image?: string; barcode?: string; stock?: number }[]}
                  onAddToCart={handleAddFromSearch}
                />
              </div>
              <POSVoiceInput
                products={products.map(p => ({ id: p.id, name: p.name, price: p.price }))}
                onAddToCart={handleAddFromSearch}
              />

              {/* Acciones POS — badge caja + entrada + opciones + expandir */}
              {cashRegisterOpen === false && (
                <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-semibold bg-[var(--surface-raised)] text-[var(--data-warning-500)] border border-[var(--data-warning-500)]/30 px-2.5 py-1.5 rounded-lg">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--data-warning-500)]" />
                  Sin caja
                </span>
              )}
              {cashRegisterOpen === true && (
                <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-semibold bg-[var(--surface-raised)] text-[var(--data-success-500)] border border-[var(--data-success-500)]/30 px-2.5 py-1.5 rounded-lg">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--data-success-500)] animate-pulse" />
                  Caja abierta
                </span>
              )}
              {lastSaleInfo && (
                <a
                  href={`/venta/${lastSaleInfo.id}/recibo`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden md:inline-flex items-center gap-1 text-xs bg-gray-100 dark:bg-accent text-[var(--text-secondary)] dark:text-muted rounded-full px-2 py-1 hover:bg-gray-200 dark:hover:bg-surface transition-colors"
                  title="Reimprimir última venta"
                >
                  Última: {fmt(lastSaleInfo.total)} · {Math.max(1, lastSaleInfo.minutesAgo)}m
                  <Printer className="h-3 w-3" />
                </a>
              )}

              <POSExpressMode
                products={products as { id: number; name: string; price: number; barcode?: string | null; stock?: number | null }[]}
                onAddToCart={handleAddFromSearch}
              />
              <button
                onClick={() => setShowScanner(true)}
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[var(--text-primary)] border border-[var(--rule-base)] bg-[var(--surface-raised)] hover:bg-[var(--surface-sunken)] px-3 py-2 rounded-lg transition-colors"
                title="Escanear codigo de barras"
              >
                <ScanBarcode className="h-4 w-4 text-primary" /> <span className="hidden sm:inline">Escanear</span>
              </button>
              <label
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[var(--text-primary)] border border-[var(--rule-base)] bg-[var(--surface-raised)] hover:bg-[var(--surface-sunken)] px-3 py-2 rounded-lg transition-colors cursor-pointer"
                title="Escanear producto con camara"
              >
                <Camera className="h-4 w-4 text-primary" aria-hidden /> <span className="hidden sm:inline">Foto</span>
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

              {/* Dropdown "Opciones" — acciones secundarias + preferencias */}
              <div className="relative">
                <button
                  onClick={() => setShowMoreTools(v => !v)}
                  className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[var(--text-secondary)] dark:text-muted border border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:bg-gray-50 dark:hover:bg-accent px-3 py-2 rounded-lg transition-colors"
                  title="Opciones del POS"
                >
                  <Settings className="h-4 w-4" /> <span className="hidden sm:inline">Opciones</span>
                </button>
                {showMoreTools && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowMoreTools(false)} />
                    <div className="absolute right-0 top-full mt-1 bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-2 z-20 min-w-[220px] space-y-1 shadow-[var(--shadow-lg)]">
                      <button
                        onClick={() => { setShowWhatsAppOrder(true); setShowMoreTools(false); }}
                        className="w-full flex items-center gap-2 text-xs font-bold text-[var(--data-success-500)] hover:bg-[var(--accent-soft)] px-3 py-2 rounded-lg transition-colors"
                      >
                        <MessageCircle className="h-4 w-4" /> Pedido por WhatsApp
                      </button>
                      <button
                        onClick={() => { setShowHistory(!showHistory); setShowMoreTools(false); }}
                        className="w-full flex items-center gap-2 text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] hover:bg-gray-50 dark:hover:bg-accent px-3 py-2 rounded-lg transition-colors"
                      >
                        <History className="h-4 w-4" /> Historial de ventas
                        <kbd className="ml-auto text-[length:var(--ts-2xs)] bg-gray-200 dark:bg-gray-700 px-1 rounded">F4</kbd>
                      </button>
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
                              setShowMoreTools(false);
                            }}
                            className="w-full flex items-center gap-2 text-xs font-bold text-primary hover:bg-primary/5 px-3 py-2 rounded-lg transition-colors"
                          >
                            <RotateCcw className="h-4 w-4" /> Repetir última venta
                          </button>
                        );
                      })()}
                      <button
                        onClick={() => { setShowReturn(true); setShowMoreTools(false); }}
                        className="w-full flex items-center gap-2 text-xs font-bold text-[var(--data-warning-500)] hover:bg-[var(--data-warning-500)]/5 px-3 py-2 rounded-lg transition-colors"
                      >
                        <History className="h-4 w-4 rotate-180" /> Devolucion
                      </button>

                      <div className="h-px bg-[var(--rule-soft)] my-1.5" />

                      <div className="w-full flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] dark:text-muted px-3 py-1">
                        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] uppercase tracking-wider">Tamano fuente</span>
                      </div>
                      <div className="flex bg-gray-100 dark:bg-accent rounded-lg p-0.5 mx-2">
                        {(["normal", "large", "xlarge"] as const).map(size => (
                          <button
                            key={size}
                            onClick={() => changeFontSize(size)}
                            className={cn(
                              "flex-1 px-1.5 py-1 rounded-md text-xs font-bold transition-colors",
                              fontSize === size ? "bg-[var(--surface-raised)] text-primary " : "text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-secondary)]"
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
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[var(--text-primary)] border border-[var(--rule-base)] bg-[var(--surface-raised)] hover:bg-[var(--surface-sunken)] px-3 py-2 rounded-lg transition-colors"
                title={expanded ? "Reducir" : "Expandir"}
              >
                {expanded ? <Minimize2 className="h-4 w-4 text-[var(--text-secondary)]" /> : <Maximize2 className="h-4 w-4 text-[var(--text-secondary)]" />}
                <span className="hidden min-[390px]:inline sm:inline">{expanded ? "Reducir" : "Expandir"}</span>
              </button>
            </div>
            {/* Categorias — cards grandes, sin emojis, iconos Lucide.
                Reemplaza chips pequeños + acordeones "Más vendidos/Rápidos/Favoritos"
                que generaban ruido visual. El selector de categoría es la
                herramienta principal para filtrar el grid. */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide scroll-smooth snap-x pt-1 pb-1">
              {categories
                // Brandon mayo 2026 v7: ocultar categorías sin productos
                // visibles. "todos" siempre se muestra (es el catch-all).
                // Las demás aparecen solo si tienen al menos un producto
                // activo en el inventario actual.
                .filter((c) => {
                  if (c.id === "todos") return true;
                  return products.some((p) => p.category === c.id);
                })
                .map((c) => {
                const Icon = CATEGORY_ICONS[c.id] ?? Package;
                const active = category === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setCategory(c.id)}
                    aria-pressed={active}
                    className={cn(
                      "snap-start shrink-0 flex flex-col items-center justify-center gap-1.5 w-[92px] h-[80px] rounded-xl border transition-all duration-[var(--dur-fast)]",
                      active
                        ? "bg-primary text-white border-primary shadow-[var(--shadow-sm)]"
                        : "bg-[var(--surface-raised)] text-[var(--text-secondary)] dark:text-muted border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary/40 hover:text-primary hover:bg-primary/5 dark:hover:bg-primary/10"
                    )}
                  >
                    <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
                    <span className="text-[length:var(--ts-2xs)] font-semibold leading-tight text-center px-1 truncate max-w-full">
                      {c.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

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
                "grid gap-1.5",
                expanded
                  ? "grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8"
                  : "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-5"
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
                        "bg-[var(--surface-raised)] rounded-lg border p-1.5 text-left transition-all hover:shadow-[var(--shadow-sm)] relative",
                        inCart ? "border-primary ring-1 ring-primary/20" : "border-[var(--rule-soft)] hover:border-[var(--rule-base)]",
                        outOfStock && "opacity-40 cursor-not-allowed"
                      )}
                    >
                      <div className="aspect-[5/4] rounded-md overflow-hidden bg-gray-50 dark:bg-surface mb-1 relative">
                        <Image src={p.image || "/products/placeholder.svg"} alt={p.name} fill sizes="(max-width:768px) 25vw, 160px" className="object-cover" loading="lazy" />
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(p.id); }}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); toggleFavorite(p.id); } }}
                          className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white/90 dark:bg-[var(--surface-raised)]/90 backdrop-blur-sm flex items-center justify-center hover:bg-white dark:hover:bg-[var(--surface-raised)] transition-colors z-10 cursor-pointer"
                        >
                          <Star className={cn("h-3 w-3", favorites.includes(p.id) ? "fill-[var(--data-warning-500)] text-[var(--data-warning-500)]" : "text-[var(--text-tertiary)] dark:text-muted")} />
                        </span>
                        {inCart && (
                          <div className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-primary text-white text-[length:var(--ts-2xs)] font-bold flex items-center justify-center">
                            {inCart.quantity}
                          </div>
                        )}
                        {outOfStock && (
                          <div className="absolute inset-0 bg-[var(--surface-raised)]/60 flex items-center justify-center">
                            <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-500)] bg-[var(--data-error-50)] px-1.5 py-0.5 rounded">Agotado</span>
                          </div>
                        )}
                      </div>
                      <p className="text-xs font-semibold leading-tight text-[var(--text-primary)] dark:text-[var(--text-primary)] line-clamp-2 min-h-[2.2em]">{p.name}</p>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-xs font-extrabold text-primary tabular-nums">{fmt(p.price)}</span>
                        {p.stock != null && (
                          <span className={cn("text-[length:var(--ts-2xs)] tabular-nums", p.stock <= (p.stockMin || 5) ? "text-[var(--data-warning-500)] font-semibold" : "text-[var(--text-tertiary)] dark:text-muted")}>
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

        {/* Right: Cart
            Brandon mayo 2026 v7: en modo expanded el carrito mantenía
            `lg:w-96 xl:w-md` (clase inválida) y CRECÍA verticalmente sin
            límite, comiendo la pantalla. Ahora ancho compacto fijo + altura
            limitada en ambos modos para que la grilla de productos respire. */}
        <div className={cn(
          "bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl flex flex-col shrink-0 min-h-0",
          "lg:w-80 xl:w-[22rem]"
        )} style={{ minHeight: "28rem", maxHeight: expanded ? "calc(100vh - 8rem)" : "calc(100vh - 14rem)" }}>
          {/* Cart header */}
          <div className="px-2 sm:px-4 py-2 sm:py-3 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
            <div className="flex items-center justify-between">
              <CardTitle className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm flex flex-wrap items-center gap-2">
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
                  className="text-xs font-bold text-[var(--data-success-500)] hover:text-[var(--data-success-500)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
                      <div className="absolute right-0 top-7 z-50 w-56 bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-2 space-y-1">
                        {clientQueues.map((q, idx) => {
                          const qTotal = q.reduce((s, i) => s + i.product.price * i.quantity, 0);
                          const qItems = q.reduce((s, i) => s + i.quantity, 0);
                          return (
                            <div key={idx} className="flex items-center gap-2 text-xs p-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-surface">
                              <button onClick={() => loadFromQueue(idx)} className="flex-1 text-left">
                                <span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Cliente {idx + 1}</span>
                                <span className="text-[var(--text-tertiary)] dark:text-muted ml-1">{qItems} items · {fmt(qTotal)}</span>
                              </button>
                              <button onClick={() => removeFromQueue(idx)} className="p-0.5 text-[var(--text-tertiary)] hover:text-[var(--data-error-500)]"><X className="h-3 w-3" /></button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                {cart.length > 0 && (
                  <button onClick={clearCart} className="text-xs font-semibold text-[var(--data-error-500)] hover:text-[var(--data-error-500)] transition-colors flex items-center gap-1">
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
                  <div key={item.product.id} className={cn("rounded-lg border border-[var(--rule-soft)] dark:border-[var(--rule-base)] p-2 hover:bg-gray-50 dark:hover:bg-surface transition-all duration-[var(--dur-base)]", lastAddedId === item.product.id && "ring-2 ring-[var(--data-success-500)]/40 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]")}>
                    <div className="flex flex-wrap items-center gap-2">
                      {item.product.image ? (
                        <Image src={item.product.image} alt={item.product.name} width={48} height={48} className="rounded-lg object-cover shrink-0 w-12 h-12" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-accent flex items-center justify-center shrink-0">
                          <Package className="h-5 w-5 text-[var(--text-tertiary)] dark:text-muted" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">{item.product.name}</p>
                        <div className="flex items-center gap-1.5">
                          <p className={cn("text-[length:var(--ts-xs)]", item.discount ? "line-through text-[var(--text-tertiary)] dark:text-muted" : "text-[var(--text-tertiary)] dark:text-muted")}>
                            {fmt(item.product.price)}
                          </p>
                          {item.discount && item.discount > 0 && (
                            <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-500)] bg-[var(--accent-soft)] px-1 py-0.5 rounded">
                              -{item.discount}%
                            </span>
                          )}
                          {/* Mejora 7: Stock bajo badge */}
                          {item.product.stock != null && item.product.stock > 0 && item.product.stock <= (item.product.stockMin || 5) && (
                            <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-1 py-0.5 rounded">
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
                        <span className="w-6 text-center text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.product.id, 1)}
                          className="h-6 w-6 rounded-md bg-gray-100 dark:bg-accent flex items-center justify-center hover:bg-gray-200 transition-colors"
                        >
                          <Plus className="h-3 w-3 text-[var(--text-secondary)] dark:text-muted" />
                        </button>
                      </div>
                      <span className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] shrink-0 w-14 text-right">{fmt(itemTotal)}</span>
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
                        className="p-1 rounded text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--data-error-500)] transition-colors shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {editingDiscount === item.product.id && (
                      <div className="mt-2 pt-2 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex flex-wrap items-center gap-2">
                        <label className="text-xs text-[var(--text-secondary)] dark:text-muted font-medium">Descuento:</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={item.discount || 0}
                          onChange={e => updateDiscount(item.product.id, Number(e.target.value))}
                          className="flex-1 px-2 py-1 text-xs border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-primary outline-none"
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
            <div className="shrink-0 border-t border-[var(--rule-base)] dark:border-[var(--rule-base)] p-3 space-y-2 bg-[var(--surface-raised)] rounded-b-2xl shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
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
                <span className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(cartTotal)}</span>
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
                  className="px-4 py-3 rounded-lg border-2 border-[var(--data-warning-500)] text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] font-bold text-sm hover:bg-[var(--data-warning-50)] dark:hover:bg-amber-950/20 transition-colors flex items-center gap-1.5"
                  title="Trueque Digital"
                >
                  <RefreshCcw className="h-4 w-4" aria-hidden /> Trueque
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
              <span className="text-sm font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)]">{cartCount} items</span>
              <span className="text-lg font-bold font-mono ml-2 text-[var(--text-primary)] dark:text-[var(--text-primary)]">S/ {cartTotal.toFixed(2)}</span>
            </div>
            <button onClick={() => setShowPayment(true)} className="bg-primary text-white px-6 py-2.5 rounded-lg font-semibold text-sm">
              Cobrar
            </button>
          </div>
        </div>
      )}

      {/* IDEA 6: Modal Pedido WhatsApp */}
      {showWhatsAppOrder && (
        <div className="modal-backdrop p-4" onClick={() => setShowWhatsAppOrder(false)}>
          <div className="bg-[var(--surface-raised)] rounded-xl max-w-md w-full max-h-[80vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-[var(--data-success-500)]" />
                <CardTitle className="text-base font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Pedido por WhatsApp</CardTitle>
              </div>
              <button onClick={() => setShowWhatsAppOrder(false)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"><X className="h-4 w-4" /></button>
            </div>

            <p className="text-xs text-[var(--text-secondary)] mb-3">Pega aqui el mensaje del cliente y el sistema encontrara los productos:</p>

            <textarea
              value={waText}
              onChange={e => { setWaText(e.target.value); parseWhatsAppOrder(e.target.value); }}
              placeholder={"Ej: 2 arroz, 3 leche gloria, 1 aceite\no: dame 5 huevos y 2 gaseosas"}
              rows={4}
              className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-gray-50 dark:bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-[var(--data-success-500)]/40 resize-none font-mono"
              autoFocus
            />

            {waParsedItems.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-bold text-[var(--text-secondary)]">Productos encontrados</p>
                {waParsedItems.map((item, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-gray-50 dark:bg-surface border border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                    {item.selected || item.matches.length === 1 ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[var(--data-success-500)] font-bold text-xs shrink-0">x{item.qty}</span>
                          <span className="text-sm font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">{(item.selected || item.matches[0]).name}</span>
                        </div>
                        <span className="text-sm font-bold text-primary shrink-0">S/{((item.selected || item.matches[0]).price * item.qty).toFixed(2)}</span>
                      </div>
                    ) : item.matches.length > 1 ? (
                      <div>
                        <p className="text-xs text-[var(--data-warning-500)] font-bold mb-1.5">&quot;{item.search}&quot; — {item.matches.length} opciones:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {item.matches.map(m => (
                            <button
                              key={m.id}
                              onClick={() => {
                                setWaParsedItems(prev => prev.map((p, i) => i === idx ? { ...p, selected: m } : p));
                              }}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[var(--surface-raised)] border border-[var(--rule-base)] hover:border-primary hover:text-primary transition-colors"
                            >
                              {m.name} · S/{Number(m.price).toFixed(2)}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--data-error-500)] font-bold">&quot;{item.search}&quot; — No encontrado</p>
                    )}
                  </div>
                ))}

                {(() => {
                  const resolved = waParsedItems.filter(i => i.selected || i.matches.length === 1);
                  const total = resolved.reduce((s, i) => s + ((i.selected || i.matches[0])?.price ?? 0) * i.qty, 0);
                  return (
                    <div className="pt-3 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-bold text-[var(--text-primary)]">Total estimado: <span className="text-primary">S/{total.toFixed(2)}</span></span>
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
                        className="w-full py-3 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
        <div className="fixed inset-y-0 right-0 z-40 w-80 bg-[var(--surface-raised)] border-l border-[var(--rule-base)] dark:border-[var(--rule-base)] flex flex-col">
          {/* Header */}
          <div className="px-2 sm:px-4 py-2 sm:py-3 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex items-center justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              <CardTitle className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm">Historial del Turno</CardTitle>
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
            <div className="px-2 sm:px-4 py-2 sm:py-3 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-b border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30">
              <p className="text-xs font-bold text-[var(--data-success-500)]">Total Ventas del Turno</p>
              <p className="text-xl sm:text-2xl font-extrabold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
                {fmt(salesHistory.reduce((sum, s) => sum + s.total, 0))}
              </p>
              <p className="text-xs text-[var(--data-success-500)] mt-0.5">{salesHistory.length} {salesHistory.length === 1 ? "venta" : "ventas"}</p>
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
        <div className="modal-backdrop p-4" onClick={() => setShowTrueque(false)}>
          <div className="bg-[var(--surface-raised)] rounded-xl max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <RefreshCcw className="h-6 w-6 text-[var(--data-warning-500)]" aria-hidden />
              <CardTitle className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Trueque Digital</CardTitle>
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
                  className="w-full text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-gray-50 dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
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
                  className="w-32 text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-gray-50 dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              {Number(truequeValor) > 0 && cartTotal > 0 && (
                <div className={cn("rounded-lg p-3 text-sm font-bold", Number(truequeValor) >= cartTotal ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)]" : "bg-[var(--data-warning-50)] dark:bg-amber-950/20 text-[var(--data-warning-500)]")}>
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
                <button onClick={() => setShowTrueque(false)} className="px-4 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm font-bold text-[var(--text-secondary)] hover:bg-gray-50 transition-colors">
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

      {/* ── Sale Complete Modal ───────────────────────────────────────── */}
      {saleComplete && (
        <SaleCompleteModal
          saleComplete={saleComplete}
          lastSaleDetails={lastSaleDetails}
          cartTotal={cartTotal}
          paymentMethod={paymentMethod}
          cart={cart}
          onNewSale={handleNewSale}
          onClose={() => { setSaleComplete(null); setLastSaleDetails(null); }}
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
              ? "bg-[var(--data-warning-500)] text-white"
              : "bg-[var(--data-error-500)] text-white"
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
        <div className="modal-backdrop p-4">
          <div className="bg-[var(--surface-raised)] rounded-xl max-w-xs w-full p-4 sm:p-6 text-center">
            <div className="h-10 w-10 rounded-full bg-[var(--data-error-50)] flex items-center justify-center mx-auto mb-3">
              <Package className="h-5 w-5 text-[var(--data-error-500)]" />
            </div>
            <CardTitle className="text-sm font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-1">Sin stock</CardTitle>
            <p className="text-xs text-[var(--text-secondary)] dark:text-muted mb-4">
              <span className="font-semibold">{showZeroStockConfirm.name}</span> no tiene stock disponible. Agregar de todos modos?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowZeroStockConfirm(null)}
                className="flex-1 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-xs font-bold text-[var(--text-secondary)] hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => forceAddZeroStock(showZeroStockConfirm)}
                className="flex-1 py-2 rounded-lg bg-[var(--data-warning-500)] text-white text-xs font-bold hover:bg-[var(--data-warning-500)] transition-colors"
              >
                Agregar igual
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mejora 4: Devolucion rápida modal */}
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

