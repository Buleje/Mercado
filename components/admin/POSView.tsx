"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search, Plus, Minus, ShoppingBasket, ScanBarcode,
  Banknote, CreditCard, Smartphone, X, Check, Loader2,
  User, Calculator, Receipt, Package, Maximize2, Minimize2,
  Star, Clock, HandCoins, History, Percent, Info, Printer,
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { categories } from "@/data/products";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import dynamic from "next/dynamic";
import { ChangeCalculator } from "@/components/ChangeCalculator";
import { enqueue, syncPendingSales, pendingCount } from "@/lib/pos-offline-queue";
import { isThermalPrintSupported, printThermal } from "@/lib/thermal-printer";
import type { Product as BaseProduct, Sale, Customer } from "@/types/erp";
type Product = Omit<BaseProduct, "id"> & { id: number; stock?: number; stockMin?: number };

const BarcodeScanner = dynamic(() => import("@/components/admin/BarcodeScanner"), { ssr: false });

// ── Types ────────────────────────────────────────────────────────────────────


interface CartItem {
  product: Product;
  quantity: number;
  discount?: number; // percentage 0-100
}

type PaymentMethod = "efectivo" | "yape" | "plin" | "tarjeta" | "fiado";

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

function ModuleTooltip() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button type="button" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        className="text-gray-400 hover:text-primary transition-colors focus:outline-none" aria-label="Ayuda sobre POS">
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute left-6 top-0 z-50 w-80 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-xl p-4 text-xs leading-relaxed pointer-events-none">
          <p className="font-extrabold text-gray-900 dark:text-foreground text-sm mb-2">🛍️ Punto de Venta (POS)</p>
          <p className="text-gray-600 dark:text-muted mb-3">Registra ventas en mostrador: busca productos, agrégalos al carrito, elige cómo cobrar y confirma la venta.</p>
          <div className="space-y-1.5">
            <p><span className="font-bold text-gray-800 dark:text-foreground">Catálogo:</span> <span className="text-gray-500 dark:text-muted">busca por nombre, filtra por categoría o escanea código de barras.</span></p>
            <p><span className="font-bold text-gray-800 dark:text-foreground">Carrito:</span> <span className="text-gray-500 dark:text-muted">ajusta cantidades y aplica descuentos por ítem.</span></p>
            <p><span className="font-bold text-gray-800 dark:text-foreground">Cobro:</span> <span className="text-gray-500 dark:text-muted">efectivo, Yape, Plin, tarjeta o fiado. Pago dividido también.</span></p>
          </div>
          <div className="mt-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl p-2">
            <p className="text-emerald-700 dark:text-emerald-400 font-semibold">💡 Ejemplo</p>
            <p className="text-emerald-600 dark:text-emerald-300">Carlos busca “Leche”, agrega 2 unidades al carrito, el cliente paga S/10 en efectivo y el sistema le dice el vuelto.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function POSView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("todos");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showScanner, setShowScanner] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("efectivo");
  const [amountPaid, setAmountPaid] = useState("");
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
  const [splitMode, setSplitMode] = useState(false);
  const [splitPayments, setSplitPayments] = useState<SplitEntry[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  /* ── Offline mode ─────────────────────────────────────── */
  const [isOnline, setIsOnline] = useState(true);
  const [offlinePending, setOfflinePending] = useState(0);
  const [saleError, setSaleError] = useState<string | null>(null);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const goOnline = () => { setIsOnline(true); syncPendingSales().then(n => { if (n > 0) pendingCount().then(setOfflinePending); }).catch(() => {}); };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    pendingCount().then(setOfflinePending).catch(() => {});
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, []);
  useScrollLock(showPayment || !!saleComplete || expanded);

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
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) {
        // Check stock
        if (product.stock != null && existing.quantity >= product.stock) return prev;
        return prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      if (product.stock != null && product.stock <= 0) return prev;
      return [...prev, { product, quantity: 1 }];
    });
  }, [addToRecents]);

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

  // ── Payment ────────────────────────────────────────────────────────────────

  const cartTotal = cart.reduce((s, i) => {
    const discountMultiplier = 1 - (i.discount || 0) / 100;
    return s + i.product.price * i.quantity * discountMultiplier;
  }, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const splitTotal = splitPayments.reduce((s, e) => s + e.amount, 0);
  const paidAmount = splitMode ? splitTotal : paymentMethod === "fiado" ? 0 : (amountPaid ? Number(amountPaid) : cartTotal);
  const change = splitMode ? Math.max(0, splitTotal - cartTotal) : Math.max(0, paidAmount - cartTotal);

  const handleCompleteSale = async () => {
    if (cart.length === 0 || processing) return;
    if (splitMode && splitTotal < cartTotal) return;
    if (!splitMode && paymentMethod === "efectivo" && paidAmount < cartTotal) return;
    if (!splitMode && paymentMethod === "fiado" && !customerPhone.trim()) return;

    setProcessing(true);
    setSaleError(null);

    const effectivePayment = splitMode ? splitPayments.map(s => s.method).join("+") : paymentMethod;
    const effectivePaid = splitMode ? splitTotal : paidAmount;
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
      customerPhone: customerPhone || undefined,
      deuda: !splitMode && paymentMethod === "fiado" ? true : undefined,
    };

    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(salePayload),
      });
      const sale = await res.json();
      if (res.ok) {
        setSaleComplete({ id: sale.id, change: !splitMode && paymentMethod === "fiado" ? -1 : sale.change ?? change });
        setCart([]);
        setAmountPaid("");
        setCustomerPhone("");
        setSplitMode(false);
        setSplitPayments([]);
        fetchProducts(); // Refresh stock
      } else {
        setSaleError(sale.error ?? "Error al registrar la venta");
      }
    } catch {
      // Offline fallback — queue for later sync
      try {
        const offlineId = await enqueue(salePayload);
        setSaleComplete({ id: offlineId, change: !splitMode && paymentMethod === "fiado" ? -1 : change });
        setCart([]);
        setAmountPaid("");
        setCustomerPhone("");
        setSplitMode(false);
        setSplitPayments([]);
        const count = await pendingCount();
        setOfflinePending(count);
      } catch {
        setSaleError("Error al guardar la venta offline");
      }
    }
    setProcessing(false);
  };

  const handleNewSale = () => {
    setSaleComplete(null);
    setShowPayment(false);
    searchRef.current?.focus();
  };

  // ── Product filtering ──────────────────────────────────────────────────────

  const filtered = products.filter(p => {
    if (category !== "todos" && p.category !== category) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.barcode?.includes(q);
    }
    return true;
  });

  // ── Quick amount buttons ───────────────────────────────────────────────────

  const quickAmounts = [5, 10, 20, 50, 100];

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400 dark:text-muted">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const posContent = (
    <>
      {/* Offline indicator */}
      {!isOnline && (
        <div className="flex flex-wrap items-center gap-2 p-2.5 mb-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 flex-1">
            Sin conexión — Las ventas se guardan localmente y se sincronizan al reconectar
          </p>
          {offlinePending > 0 && (
            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{offlinePending} pendientes</span>
          )}
        </div>
      )}
      {isOnline && offlinePending > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-2.5 mb-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/30">
          <Loader2 className="h-4 w-4 text-blue-500 animate-spin shrink-0" />
          <p className="text-xs text-blue-700 dark:text-blue-300">Sincronizando {offlinePending} ventas pendientes...</p>
        </div>
      )}
      {saleError && (
        <div className="flex flex-wrap items-center gap-2 p-2.5 mb-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30">
          <Info className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-xs text-red-700 dark:text-red-300 flex-1">{saleError}</p>
          <button onClick={() => setSaleError(null)} className="p-0.5 text-red-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className={cn("font-extrabold text-gray-900 dark:text-foreground", expanded ? "text-xl sm:text-2xl" : "text-lg sm:text-xl")}>Punto de Venta</h2>
            <ModuleTooltip />
          </div>
          <p className="text-sm text-gray-500 dark:text-muted">{products.length} productos disponibles</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {cashRegisterOpen === false && (
            <span className="text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200 px-2.5 py-1 rounded-lg">Sin caja</span>
          )}
          {cashRegisterOpen === true && (
            <span className="text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 px-2.5 py-1 rounded-lg">Caja abierta</span>
          )}
          <button
            onClick={() => setShowScanner(true)}
            className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-primary border border-primary/30 hover:bg-primary/5 px-3 py-2 rounded-xl transition-colors"
          >
            <ScanBarcode className="h-4 w-4" /> Escanear
          </button>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-gray-700 dark:text-foreground border border-gray-200 dark:border-card-border hover:bg-gray-50 dark:hover:bg-accent px-3 py-2 rounded-xl transition-colors"
          >
            <History className="h-4 w-4" />
            <span className="hidden min-[390px]:inline sm:inline">Historial</span>
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-white bg-primary hover:bg-primary-dark px-3 py-2 rounded-xl transition-colors shadow-sm"
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
          "flex-1 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-sm overflow-hidden flex flex-col",
          expanded ? "min-h-[calc(100vh-12rem)]" : ""
        )} style={expanded ? undefined : { minHeight: "28rem", maxHeight: "calc(100vh - 14rem)" }}>
          {/* Search + Categories */}
          <div className="p-3 space-y-2 border-b border-gray-100 dark:border-card-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-muted" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar producto o código..."
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-card-border text-sm text-gray-900 dark:text-foreground outline-none focus:border-primary transition-colors"
                autoFocus
              />
            </div>
            <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
              {categories.map(c => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className={cn(
                    "shrink-0 px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap",
                    category === c.id
                      ? "bg-primary text-white"
                      : "bg-gray-50 dark:bg-surface text-gray-500 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
                  )}
                >
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Favorites & Recents */}
          {(favorites.length > 0 || recentProducts.length > 0) && (
            <div className="px-3 py-2 space-y-2 border-b border-gray-100 dark:border-card-border bg-gray-50/50 dark:bg-surface/30">
              {favorites.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Star className="h-3.5 w-3.5 text-yellow-500" />
                    <span className="text-xs font-bold text-gray-600 dark:text-muted">Favoritos</span>
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
                              ? "bg-gray-100 dark:bg-surface text-gray-400 dark:text-muted cursor-not-allowed"
                              : "bg-white dark:bg-card border border-gray-200 dark:border-card-border text-gray-700 dark:text-foreground hover:border-primary hover:bg-primary/5"
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
                            <X className="h-3 w-3 text-gray-400 hover:text-red-500" />
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
                    <Clock className="h-3.5 w-3.5 text-blue-500" />
                    <span className="text-xs font-bold text-gray-600 dark:text-muted">Recientes</span>
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
                              ? "bg-gray-100 dark:bg-surface text-gray-400 dark:text-muted cursor-not-allowed"
                              : "bg-white dark:bg-card border border-gray-200 dark:border-card-border text-gray-700 dark:text-foreground hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-500/10"
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

          {/* Product grid */}
          <div className="flex-1 overflow-y-auto p-3">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-400 dark:text-muted">
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
                        inCart ? "border-primary ring-1 ring-primary/20" : "border-gray-100 hover:border-gray-200 dark:border-card-border",
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
                          <Star className={cn("h-3.5 w-3.5", favorites.includes(p.id) ? "fill-yellow-400 text-yellow-400" : "text-gray-400 dark:text-muted")} />
                        </span>
                        {inCart && (
                          <div className="absolute top-1 right-1 h-5 w-5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center">
                            {inCart.quantity}
                          </div>
                        )}
                        {outOfStock && (
                          <div className="absolute inset-0 bg-white dark:bg-card/60 flex items-center justify-center">
                            <span className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Agotado</span>
                          </div>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-gray-900 dark:text-foreground truncate">{p.name}</p>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-sm font-extrabold text-primary">{fmt(p.price)}</span>
                        {p.stock != null && (
                          <span className={cn("text-[10px]", p.stock <= (p.stockMin || 5) ? "text-amber-500" : "text-gray-400 dark:text-muted")}>
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
          "bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-sm flex flex-col shrink-0",
          expanded ? "lg:w-96 xl:w-md" : "lg:w-80 xl:w-96"
        )} style={expanded ? undefined : { minHeight: "28rem", maxHeight: "calc(100vh - 14rem)" }}>
          {/* Cart header */}
          <div className="px-2 sm:px-4 py-2 sm:py-3 border-b border-gray-100 dark:border-card-border flex items-center justify-between">
            <h3 className="font-bold text-gray-900 dark:text-foreground text-sm flex flex-wrap items-center gap-2">
              <ShoppingBasket className="h-4 w-4 text-primary" />
              Carrito
              {cartCount > 0 && (
                <span className="bg-primary/10 text-primary text-xs font-bold px-2 py-0.5 rounded-full">{cartCount}</span>
              )}
            </h3>
            {cart.length > 0 && (
              <button onClick={clearCart} className="text-xs font-semibold text-red-400 hover:text-red-500 transition-colors">
                Vaciar
              </button>
            )}
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-300 dark:text-muted">
                <ShoppingBasket className="h-6 w-6 mb-1.5" />
                <p className="text-xs">Carrito vacío</p>
              </div>
            ) : (
              cart.map(item => {
                const discountMultiplier = 1 - (item.discount || 0) / 100;
                const itemTotal = item.product.price * item.quantity * discountMultiplier;
                return (
                  <div key={item.product.id} className="rounded-lg border border-gray-100 dark:border-card-border p-2 hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                    <div className="flex flex-wrap items-center gap-2">
                      <Image src={item.product.image} alt="" width={36} height={36} className="rounded-lg object-cover shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-900 dark:text-foreground truncate">{item.product.name}</p>
                        <div className="flex items-center gap-1.5">
                          <p className={cn("text-[11px]", item.discount ? "line-through text-gray-300 dark:text-muted" : "text-gray-400 dark:text-muted")}>
                            {fmt(item.product.price)}
                          </p>
                          {item.discount && item.discount > 0 && (
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded">
                              -{item.discount}%
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => updateQuantity(item.product.id, -1)}
                          className="h-6 w-6 rounded-md bg-gray-100 dark:bg-accent flex items-center justify-center hover:bg-gray-200 transition-colors"
                        >
                          <Minus className="h-3 w-3 text-gray-500 dark:text-muted" />
                        </button>
                        <span className="w-6 text-center text-xs font-bold text-gray-900 dark:text-foreground">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.product.id, 1)}
                          className="h-6 w-6 rounded-md bg-gray-100 dark:bg-accent flex items-center justify-center hover:bg-gray-200 transition-colors"
                        >
                          <Plus className="h-3 w-3 text-gray-500 dark:text-muted" />
                        </button>
                      </div>
                      <span className="text-sm font-bold text-gray-900 dark:text-foreground shrink-0 w-14 text-right">{fmt(itemTotal)}</span>
                      <button
                        onClick={() => setEditingDiscount(editingDiscount === item.product.id ? null : item.product.id)}
                        className={cn(
                          "p-1 rounded transition-colors shrink-0",
                          editingDiscount === item.product.id ? "text-primary bg-primary/10" : "text-gray-400 dark:text-muted hover:text-primary"
                        )}
                        title="Aplicar descuento"
                      >
                        <Percent className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => removeFromCart(item.product.id)}
                        className="p-1 rounded text-gray-300 dark:text-muted hover:text-red-500 transition-colors shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {editingDiscount === item.product.id && (
                      <div className="mt-2 pt-2 border-t border-gray-100 dark:border-card-border flex flex-wrap items-center gap-2">
                        <label className="text-xs text-gray-500 dark:text-muted font-medium">Descuento:</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={item.discount || 0}
                          onChange={e => updateDiscount(item.product.id, Number(e.target.value))}
                          className="flex-1 px-2 py-1 text-xs border border-gray-200 dark:border-card-border rounded text-gray-900 dark:text-foreground focus:border-primary outline-none"
                          placeholder="0"
                        />
                        <span className="text-xs text-gray-400 dark:text-muted">%</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Cart total + pay button */}
          {cart.length > 0 && (
            <div className="border-t border-gray-100 dark:border-card-border p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500 dark:text-muted">{cartCount} artículos</span>
                <span className="text-lg font-extrabold text-gray-900 dark:text-foreground">{fmt(cartTotal)}</span>
              </div>
              <button
                onClick={() => setShowPayment(true)}
                className="w-full py-3 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary-dark transition-colors flex flex-wrap items-center justify-center gap-2"
              >
                <Banknote className="h-4 w-4" />
                Cobrar {fmt(cartTotal)}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Barcode scanner overlay */}
      {showScanner && (
        <BarcodeScanner onDetected={handleBarcode} onClose={() => setShowScanner(false)} />
      )}

      {/* ── Sales History Sidebar ──────────────────────────────────────────── */}
      {showHistory && (
        <div className="fixed inset-y-0 right-0 z-40 w-80 bg-white dark:bg-card border-l border-gray-200 dark:border-card-border shadow-2xl flex flex-col">
          {/* Header */}
          <div className="px-2 sm:px-4 py-2 sm:py-3 border-b border-gray-100 dark:border-card-border flex items-center justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              <h3 className="font-bold text-gray-900 dark:text-foreground text-sm">Historial del Turno</h3>
            </div>
            <button
              onClick={() => setShowHistory(false)}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors"
            >
              <X className="h-4 w-4 text-gray-400 dark:text-muted" />
            </button>
          </div>

          {/* Total */}
          {!loadingHistory && salesHistory.length > 0 && (
            <div className="px-2 sm:px-4 py-2 sm:py-3 bg-emerald-50 dark:bg-emerald-900/10 border-b border-emerald-100 dark:border-emerald-900/20">
              <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Total Ventas del Turno</p>
              <p className="text-xl sm:text-2xl font-extrabold text-emerald-700 dark:text-emerald-500">
                {fmt(salesHistory.reduce((sum, s) => sum + s.total, 0))}
              </p>
              <p className="text-xs text-emerald-600 mt-0.5">{salesHistory.length} {salesHistory.length === 1 ? "venta" : "ventas"}</p>
            </div>
          )}

          {/* List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loadingHistory ? (
              <div className="flex items-center justify-center h-32 text-gray-400 dark:text-muted">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : salesHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-300 dark:text-muted">
                <Receipt className="h-6 w-6 mb-1.5" />
                <p className="text-xs">Sin ventas hoy</p>
              </div>
            ) : (
              salesHistory.map(sale => {
                const time = new Date(sale.createdAt).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
                const itemCount = sale.items.reduce((sum, i) => sum + i.quantity, 0);
                return (
                  <div key={sale.id} className="bg-gray-50 dark:bg-surface rounded-lg p-3 border border-gray-100 dark:border-card-border hover:border-primary transition-colors">
                    <div className="flex items-start justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-gray-400 dark:text-muted" />
                        <span className="text-xs font-semibold text-gray-500 dark:text-muted">{time}</span>
                      </div>
                      <span className="text-sm font-extrabold text-gray-900 dark:text-foreground">{fmt(sale.total)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-400 dark:text-muted">{itemCount} {itemCount === 1 ? "artículo" : "artículos"}</span>
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-full",
                        sale.payment === "efectivo" ? "bg-emerald-50 text-emerald-600" :
                        sale.payment === "yape" ? "bg-purple-50 text-purple-600" :
                        sale.payment === "plin" ? "bg-teal-50 text-teal-600" :
                        sale.payment === "tarjeta" ? "bg-blue-50 text-blue-600" :
                        sale.payment === "fiado" ? "bg-amber-50 text-amber-600" :
                        "bg-gray-50 text-gray-600"
                      )}>
                        {sale.payment}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── Payment Modal ─────────────────────────────────────────────────── */}
      {showPayment && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowPayment(false)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Modal header — prominent total */}
            <div className="px-3 sm:px-6 py-5 border-b border-gray-100 dark:border-card-border text-center">
              <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wider mb-1">Total a cobrar</p>
              <p className="text-xl sm:text-3xl font-extrabold text-gray-900 dark:text-foreground">{fmt(cartTotal)}</p>
              <p className="text-xs text-gray-400 dark:text-muted mt-1">{cartCount} {cartCount === 1 ? "artículo" : "artículos"}</p>
              <button onClick={() => setShowPayment(false)} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                <X className="h-4 w-4 text-gray-400 dark:text-muted" />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-5 space-y-5">
              {/* Cash register warning */}
              {cashRegisterOpen === false && (
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 flex flex-wrap items-start gap-2">
                  <Calculator className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-600">Sin caja abierta. La venta se registrará sin movimiento de caja.</p>
                </div>
              )}

              {/* Payment method */}
              <div>
                <p className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wider mb-2.5">Método de pago</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {([
                    { id: "efectivo" as const, label: "Efectivo", icon: Banknote, color: "emerald" },
                    { id: "yape" as const, label: "Yape", icon: Smartphone, color: "purple" },
                    { id: "plin" as const, label: "Plin", icon: Smartphone, color: "teal" },
                    { id: "tarjeta" as const, label: "Tarjeta", icon: CreditCard, color: "blue" },
                    { id: "fiado" as const, label: "Fiado", icon: HandCoins, color: "amber" },
                  ]).map(m => (
                    <button
                      key={m.id}
                      onClick={() => { setPaymentMethod(m.id); setAmountPaid(""); }}
                      className={cn(
                        "flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border text-xs font-semibold transition-all",
                        paymentMethod === m.id
                          ? "border-primary bg-primary/5 text-primary ring-1 ring-primary/20"
                          : "border-gray-200 dark:border-card-border text-gray-400 dark:text-muted hover:border-gray-300 hover:text-gray-600"
                      )}
                    >
                      <m.icon className="h-5 w-5" />
                      {m.label}
                    </button>
                  ))}
                </div>
                {/* Split payment toggle */}
                <button
                  onClick={() => {
                    setSplitMode(v => !v);
                    if (!splitMode) setSplitPayments([{ method: "efectivo", amount: 0 }, { method: "yape", amount: 0 }]);
                    else setSplitPayments([]);
                  }}
                  className={cn(
                    "mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all",
                    splitMode ? "border-primary bg-primary/10 text-primary" : "border-gray-200 dark:border-card-border text-gray-400 dark:text-muted hover:text-gray-600"
                  )}
                >
                  <CreditCard className="h-3 w-3" /> Pago dividido
                </button>
              </div>

              {/* Split payment entries */}
              {splitMode && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wider">Pagos divididos</p>
                  {splitPayments.map((entry, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-2">
                      <select
                        value={entry.method}
                        onChange={e => {
                          const next = [...splitPayments];
                          next[idx] = { ...next[idx], method: e.target.value as PaymentMethod };
                          setSplitPayments(next);
                        }}
                        className="flex-1 px-2 py-2 rounded-lg border border-gray-200 dark:border-card-border text-xs font-semibold bg-white dark:bg-surface text-gray-700 dark:text-foreground outline-none"
                      >
                        {["efectivo","yape","plin","tarjeta"].map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase()+m.slice(1)}</option>)}
                      </select>
                      <div className="relative flex-1">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">S/</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.10"
                          value={entry.amount || ""}
                          onChange={e => {
                            const next = [...splitPayments];
                            next[idx] = { ...next[idx], amount: Number(e.target.value) || 0 };
                            setSplitPayments(next);
                          }}
                          placeholder="0.00"
                          className="w-full pl-7 pr-2 py-2 rounded-lg border border-gray-200 dark:border-card-border text-sm font-bold text-gray-900 dark:text-foreground outline-none focus:border-primary"
                        />
                      </div>
                      {splitPayments.length > 2 && (
                        <button onClick={() => setSplitPayments(splitPayments.filter((_, i) => i !== idx))} className="p-1 text-gray-400 hover:text-red-500">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setSplitPayments([...splitPayments, { method: "efectivo", amount: 0 }])}
                      className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" /> Agregar método
                    </button>
                    <div className="text-xs">
                      <span className={cn("font-bold", splitTotal >= cartTotal ? "text-emerald-600" : "text-red-500")}>
                        {fmt(splitTotal)}
                      </span>
                      <span className="text-gray-400"> / {fmt(cartTotal)}</span>
                    </div>
                  </div>
                  {splitTotal > cartTotal && (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2 text-center">
                      <span className="text-[10px] text-emerald-600 font-bold uppercase">Vuelto: </span>
                      <span className="text-sm font-extrabold text-emerald-700">{fmt(splitTotal - cartTotal)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Fiado info */}
              {paymentMethod === "fiado" && (
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 flex flex-wrap items-start gap-2">
                  <HandCoins className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-600">
                    <p className="font-bold mb-0.5">Venta a crédito</p>
                    <p>Se registrará como deuda pendiente del cliente. El teléfono es requerido.</p>
                  </div>
                </div>
              )}

              {/* Amount paid (only for cash) */}
              {paymentMethod === "efectivo" && (
                <div>
                  <p className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wider mb-2.5">Monto recibido</p>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-muted text-sm font-bold">S/</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.10"
                      value={amountPaid}
                      onChange={e => setAmountPaid(e.target.value)}
                      placeholder={cartTotal.toFixed(2)}
                      className="w-full pl-9 pr-4 py-3 rounded-lg border border-gray-200 dark:border-card-border text-lg font-bold text-gray-900 dark:text-foreground outline-none focus:border-primary transition-colors"
                      autoFocus
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {quickAmounts.filter(a => a >= cartTotal).slice(0, 4).map(a => (
                      <button
                        key={a}
                        onClick={() => setAmountPaid(String(a))}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors",
                          amountPaid === String(a) ? "border-primary bg-primary/10 text-primary" : "border-gray-200 dark:border-card-border text-gray-500 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface"
                        )}
                      >
                        S/{a}
                      </button>
                    ))}
                    <button
                      onClick={() => setAmountPaid(cartTotal.toFixed(2))}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors",
                        paidAmount === cartTotal ? "border-primary bg-primary/10 text-primary" : "border-gray-200 dark:border-card-border text-gray-500 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface"
                      )}
                    >
                      Exacto
                    </button>
                  </div>
                  {paidAmount >= cartTotal && paidAmount > 0 && (
                    <div className="mt-3 bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                      <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Vuelto</p>
                      <p className="text-xl sm:text-2xl font-extrabold text-emerald-700 mt-0.5">{fmt(change)}</p>
                      <ChangeCalculator change={change} />
                    </div>
                  )}
                </div>
              )}

              {/* Customer phone */}
              <div>
                <p className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wider mb-2.5">
                  Cliente {paymentMethod === "fiado" && <span className="text-red-500">*</span>}
                  {paymentMethod !== "fiado" && " (opcional)"}
                </p>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-muted" />
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                    placeholder="999 999 999"
                    className={cn(
                      "w-full pl-10 pr-4 py-2.5 rounded-lg border text-sm text-gray-900 dark:text-foreground outline-none focus:border-primary transition-colors",
                      paymentMethod === "fiado" && !customerPhone.trim() ? "border-red-300" : "border-gray-200 dark:border-card-border"
                    )}
                  />
                </div>
                {paymentMethod === "fiado" && !customerPhone.trim() && (
                  <p className="text-xs text-red-500 mt-1">Teléfono requerido para venta fiada</p>
                )}
              </div>

              {/* Order summary — collapsible */}
              <details className="group">
                <summary className="cursor-pointer flex items-center justify-between text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wider py-1 select-none">
                  <span>Resumen ({cartCount})</span>
                  <span className="text-gray-300 dark:text-muted group-open:rotate-180 transition-transform">▾</span>
                </summary>
                <div className="bg-gray-50 dark:bg-surface rounded-lg p-3 mt-2">
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {cart.map(i => (
                      <div key={i.product.id} className="flex justify-between text-xs">
                        <span className="text-gray-500 dark:text-muted truncate">{i.quantity}× {i.product.name}</span>
                        <span className="font-bold text-gray-900 dark:text-foreground shrink-0 ml-2">{fmt(i.product.price * i.quantity)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            </div>

            {/* Modal footer */}
            <div className="px-3 sm:px-6 py-4 border-t border-gray-100 dark:border-card-border">
              <button
                onClick={handleCompleteSale}
                disabled={processing || cart.length === 0 || (splitMode && splitTotal < cartTotal) || (!splitMode && paymentMethod === "efectivo" && paidAmount < cartTotal) || (!splitMode && paymentMethod === "fiado" && !customerPhone.trim())}
                className="w-full py-3.5 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex flex-wrap items-center justify-center gap-2"
              >
                {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                {processing ? "Procesando..." : splitMode ? `Cobrar dividido ${fmt(cartTotal)}` : paymentMethod === "fiado" ? `Registrar fiado ${fmt(cartTotal)}` : `Cobrar ${fmt(cartTotal)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sale Complete Modal ────────────────────────────────────────────── */}
      {saleComplete && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-card rounded-2xl shadow-xl max-w-sm w-full p-3 sm:p-6 text-center">
            <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
              <Check className="h-6 w-6 text-emerald-600" />
            </div>
            <h3 className="text-lg font-extrabold text-gray-900 dark:text-foreground mb-0.5">¡Venta completada!</h3>
            <p className="text-xs text-gray-400 dark:text-muted mb-4">ID: {saleComplete.id}</p>
            {saleComplete.change === -1 ? (
              <div className="bg-amber-50 rounded-lg p-3 mb-4">
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Fiado registrado</p>
                <p className="text-sm text-amber-600 font-semibold">Deuda pendiente del cliente</p>
              </div>
            ) : saleComplete.change > 0 ? (
              <div className="bg-amber-50 rounded-lg p-3 mb-4">
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Vuelto</p>
                <p className="text-xl sm:text-2xl font-extrabold text-amber-600">{fmt(saleComplete.change)}</p>
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/venta/${saleComplete.id}/recibo`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2.5 rounded-lg border border-gray-200 dark:border-card-border text-gray-700 dark:text-foreground font-bold text-sm hover:bg-gray-50 dark:hover:bg-surface transition-colors flex items-center justify-center gap-1.5"
                >
                  <Receipt className="h-3.5 w-3.5" /> Imprimir ticket
                </a>
                <button
                  onClick={handleNewSale}
                  className="flex-1 py-2.5 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary-dark transition-colors"
                >
                  Nueva venta
                </button>
              </div>
              {isThermalPrintSupported() && (
                <button
                  onClick={async () => {
                    try {
                      await printThermal({
                        businessName: "Bodega San Martín",
                        ticketId: saleComplete.id,
                        date: new Date(),
                        items: cart.map(i => ({ name: i.product.name, quantity: i.quantity, price: i.product.price, unit: i.product.unit })),
                        total: cartTotal,
                        payment: paymentMethod,
                        amountPaid: paidAmount,
                        change: saleComplete.change >= 0 ? saleComplete.change : undefined,
                      });
                    } catch (e) {
                      alert(e instanceof Error ? e.message : "Error al imprimir");
                    }
                  }}
                  className="w-full py-2 rounded-lg border border-gray-200 dark:border-card-border text-gray-600 dark:text-muted font-medium text-xs hover:bg-gray-50 dark:hover:bg-surface transition-colors flex items-center justify-center gap-1.5"
                >
                  <Printer className="h-3.5 w-3.5" /> Ticket térmico (ESC/POS)
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );

  // ── Expanded full-screen mode ──────────────────────────────────────────────

  if (expanded) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-50 dark:bg-surface overflow-y-auto">
        <div className="max-w-480 mx-auto px-4 sm:px-6 py-4 space-y-4">
          {posContent}
        </div>
      </div>
    );
  }

  return <div className="space-y-4">{posContent}</div>;
}

