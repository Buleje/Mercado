"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search, Plus, Minus, Trash2, ShoppingBasket, ScanBarcode,
  Banknote, CreditCard, Smartphone, X, Check, Loader2,
  User, Calculator, Receipt, Package, Maximize2, Minimize2,
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { categories } from "@/data/products";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import dynamic from "next/dynamic";

const BarcodeScanner = dynamic(() => import("@/components/admin/BarcodeScanner"), { ssr: false });

// ── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: number; name: string; category: string; price: number;
  costPrice?: number; image: string; unit: string; badge?: string;
  barcode?: string; stock?: number; stockMin?: number; active: boolean;
}

interface CartItem {
  product: Product;
  quantity: number;
}

type PaymentMethod = "efectivo" | "yape" | "plin" | "tarjeta";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return `S/${n.toFixed(2)}`; }

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
  const searchRef = useRef<HTMLInputElement>(null);
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
    fetchProducts();
    checkCashRegister();
  }, [fetchProducts, checkCashRegister]);

  // ── Cart operations ────────────────────────────────────────────────────────

  const addToCart = useCallback((product: Product) => {
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
  }, []);

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

  const cartTotal = cart.reduce((s, i) => s + i.product.price * i.quantity, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const paidAmount = amountPaid ? Number(amountPaid) : cartTotal;
  const change = Math.max(0, paidAmount - cartTotal);

  const handleCompleteSale = async () => {
    if (cart.length === 0 || processing) return;
    if (paymentMethod === "efectivo" && paidAmount < cartTotal) return;

    setProcessing(true);
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map(i => ({
            productId: i.product.id,
            name: i.product.name,
            price: i.product.price,
            quantity: i.quantity,
            unit: i.product.unit,
          })),
          payment: paymentMethod,
          amountPaid: paidAmount,
          customerPhone: customerPhone || undefined,
        }),
      });
      const sale = await res.json();
      if (res.ok) {
        setSaleComplete({ id: sale.id, change: sale.change });
        setCart([]);
        setAmountPaid("");
        setCustomerPhone("");
        fetchProducts(); // Refresh stock
      }
    } catch { /* ignore */ }
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={cn("font-extrabold text-gray-900 dark:text-foreground", expanded ? "text-2xl" : "text-xl")}>Punto de Venta</h2>
          <p className="text-sm text-gray-500 dark:text-muted">{products.length} productos disponibles</p>
        </div>
        <div className="flex items-center gap-2">
          {cashRegisterOpen === false && (
            <span className="text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200 px-2.5 py-1 rounded-lg">Sin caja</span>
          )}
          {cashRegisterOpen === true && (
            <span className="text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 px-2.5 py-1 rounded-lg">Caja abierta</span>
          )}
          <button
            onClick={() => setShowScanner(true)}
            className="flex items-center gap-1.5 text-sm font-bold text-primary border border-primary/30 hover:bg-primary/5 px-3 py-2 rounded-lg transition-colors"
          >
            <ScanBarcode className="h-4 w-4" /> Escanear
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-sm font-bold text-white bg-primary hover:bg-primary-dark px-3 py-2 rounded-lg transition-colors shadow-sm"
            title={expanded ? "Reducir" : "Expandir"}
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            <span className="hidden sm:inline">{expanded ? "Reducir" : "Expandir"}</span>
          </button>
        </div>
      </div>

      {/* Body: products + cart */}
      <div className="flex flex-col lg:flex-row gap-4">
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
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
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
          <div className="px-4 py-3 border-b border-gray-100 dark:border-card-border flex items-center justify-between">
            <h3 className="font-bold text-gray-900 dark:text-foreground text-sm flex items-center gap-2">
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
              cart.map(item => (
                <div key={item.product.id} className="flex items-center gap-2 rounded-lg p-2 hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                  <Image src={item.product.image} alt="" width={36} height={36} className="rounded-lg object-cover shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-900 dark:text-foreground truncate">{item.product.name}</p>
                    <p className="text-[11px] text-gray-400 dark:text-muted">{fmt(item.product.price)}</p>
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
                  <span className="text-sm font-bold text-gray-900 dark:text-foreground shrink-0 w-14 text-right">{fmt(item.product.price * item.quantity)}</span>
                  <button
                    onClick={() => removeFromCart(item.product.id)}
                    className="p-1 rounded text-gray-300 dark:text-muted hover:text-red-500 transition-colors shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
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
                className="w-full py-3 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary-dark transition-colors flex items-center justify-center gap-2"
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

      {/* ── Payment Modal ─────────────────────────────────────────────────── */}
      {showPayment && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowPayment(false)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Modal header — prominent total */}
            <div className="px-6 py-5 border-b border-gray-100 dark:border-card-border text-center">
              <p className="text-xs font-bold text-gray-400 dark:text-muted uppercase tracking-wider mb-1">Total a cobrar</p>
              <p className="text-3xl font-extrabold text-gray-900 dark:text-foreground">{fmt(cartTotal)}</p>
              <p className="text-xs text-gray-400 dark:text-muted mt-1">{cartCount} {cartCount === 1 ? "artículo" : "artículos"}</p>
              <button onClick={() => setShowPayment(false)} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                <X className="h-4 w-4 text-gray-400 dark:text-muted" />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Cash register warning */}
              {cashRegisterOpen === false && (
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 flex items-start gap-2">
                  <Calculator className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-600">Sin caja abierta. La venta se registrará sin movimiento de caja.</p>
                </div>
              )}

              {/* Payment method */}
              <div>
                <p className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wider mb-2.5">Método de pago</p>
                <div className="grid grid-cols-4 gap-2">
                  {([
                    { id: "efectivo" as const, label: "Efectivo", icon: Banknote, color: "emerald" },
                    { id: "yape" as const, label: "Yape", icon: Smartphone, color: "purple" },
                    { id: "plin" as const, label: "Plin", icon: Smartphone, color: "teal" },
                    { id: "tarjeta" as const, label: "Tarjeta", icon: CreditCard, color: "blue" },
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
              </div>

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
                      <p className="text-2xl font-extrabold text-emerald-700 mt-0.5">{fmt(change)}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Customer phone */}
              <div>
                <p className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wider mb-2.5">Cliente (opcional)</p>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-muted" />
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                    placeholder="999 999 999"
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 dark:border-card-border text-sm text-gray-900 dark:text-foreground outline-none focus:border-primary transition-colors"
                  />
                </div>
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
            <div className="px-6 py-4 border-t border-gray-100 dark:border-card-border">
              <button
                onClick={handleCompleteSale}
                disabled={processing || cart.length === 0 || (paymentMethod === "efectivo" && paidAmount < cartTotal)}
                className="w-full py-3.5 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                {processing ? "Procesando..." : `Cobrar ${fmt(cartTotal)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sale Complete Modal ────────────────────────────────────────────── */}
      {saleComplete && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-card rounded-2xl shadow-xl max-w-sm w-full p-6 text-center">
            <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
              <Check className="h-6 w-6 text-emerald-600" />
            </div>
            <h3 className="text-lg font-extrabold text-gray-900 dark:text-foreground mb-0.5">¡Venta completada!</h3>
            <p className="text-xs text-gray-400 dark:text-muted mb-4">ID: {saleComplete.id}</p>
            {saleComplete.change > 0 && (
              <div className="bg-amber-50 rounded-lg p-3 mb-4">
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Vuelto</p>
                <p className="text-2xl font-extrabold text-amber-600">{fmt(saleComplete.change)}</p>
              </div>
            )}
            <div className="flex gap-2">
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
