"use client";
 

import { LoadingState, SectionTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search, Plus, Minus, X, ShoppingCart, Maximize, Minimize,
  Phone, Banknote, Smartphone, CheckCircle, Loader2, Package,
} from "@buleje/design-system/icons";
import Image from "next/image";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Product {
  id: number;
  name: string;
  price: number;
  unit?: string;
  stock?: number;
  imageUrl?: string;
  category?: string;
}

interface CartItem {
  product: Product;
  quantity: number;
}

type PaymentMethod = "yape" | "efectivo";
type KioskStep = "browse" | "cart" | "payment" | "success";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function KioskMode() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [filtered, setFiltered] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [step, setStep] = useState<KioskStep>("browse");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("yape");
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [callingStaff, setCallingStaff] = useState(false);
  const _audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch products
  useEffect(() => {
    const load = async () => {
      setLoadingProducts(true);
      try {
        const res = await fetch("/api/products?limit=60&active=true");
        if (!res.ok) throw new Error("fail");
        const data = await res.json();
        const list: Product[] = Array.isArray(data) ? data : (data.data ?? data.products ?? []);
        setProducts(list);
        setFiltered(list);
      } catch {
        setProducts([]);
        setFiltered([]);
      } finally {
        setLoadingProducts(false);
      }
    };
    load();
  }, []);

  // Filter by search
  useEffect(() => {
    if (!search.trim()) {
      setFiltered(products);
      return;
    }
    const q = search.toLowerCase();
    setFiltered(products.filter((p) => p.name.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q)));
  }, [search, products]);

  // Fullscreen API
  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Cart operations
  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) return prev.map((i) => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQty = (id: number, delta: number) => {
    setCart((prev) =>
      prev.map((i) => i.product.id === id ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i)
        .filter((i) => i.quantity > 0)
    );
  };

  const removeFromCart = (id: number) => setCart((prev) => prev.filter((i) => i.product.id !== id));

  const cartTotal = cart.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  // Call staff
  const callStaff = () => {
    setCallingStaff(true);
    // Beep using Web Audio API
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 1.5);
    } catch { /* no audio support */ }
    setTimeout(() => setCallingStaff(false), 3000);
  };

  // Process payment
  const handlePayment = async () => {
    setProcessingPayment(true);
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          items: cart.map((i) => ({
            productId: i.product.id,
            name: i.product.name,
            price: i.product.price,
            quantity: i.quantity,
            unit: i.product.unit ?? "",
          })),
          payment: paymentMethod,
        }),
      });
      if (!res.ok) throw new Error("fail");
      setStep("success");
      setTimeout(() => {
        setCart([]);
        setStep("browse");
        setSearch("");
      }, 4000);
    } catch {
      // show error inline
    } finally {
      setProcessingPayment(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col h-screen bg-[var(--surface-canvas)] overflow-hidden select-none"
    >
      {/* ── Top bar ── */}
      <header className="flex items-center justify-between px-6 py-4 bg-white dark:bg-card border-b border-[var(--rule-base)] dark:border-card-border ">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
            <Package className="h-4 w-4 text-white" />
          </div>
          <span className="text-xl font-bold text-[var(--text-primary)] dark:text-foreground">Buleje</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={callStaff}
            disabled={callingStaff}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all",
              callingStaff
                ? "bg-[var(--data-warning-500)] text-white animate-pulse"
                : "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)] hover:bg-[var(--data-warning-100)]"
            )}
          >
            <Phone className="h-4 w-4" />
            {callingStaff ? "Llamando..." : "Llamar al cajero"}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] dark:text-muted dark:hover:text-foreground border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card"
            aria-label="Pantalla completa"
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Product catalog */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Search */}
          <div className="px-6 py-4 bg-white dark:bg-card border-b border-[var(--rule-soft)] dark:border-card-border">
            <div className="relative max-w-2xl mx-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Busca un producto..."
                className="w-full pl-12 pr-4 py-4 text-lg rounded-xl border-2 border-[var(--rule-base)] dark:border-card-border bg-[var(--surface-canvas)] text-[var(--text-primary)] dark:text-foreground focus:outline-none focus:border-primary transition-colors"
              />
              {search && (
                <button type="button" onClick={() => setSearch("")} className="absolute right-4 top-1/2 -translate-y-1/2">
                  <X className="h-5 w-5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]" />
                </button>
              )}
            </div>
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loadingProducts ? (
              <LoadingState message="" />
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-[var(--text-tertiary)]">
                <Package className="h-10 w-10 mb-2 opacity-30" />
                <p>No se encontraron productos</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {filtered.map((product) => {
                  const inCart = cart.find((i) => i.product.id === product.id);
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addToCart(product)}
                      className={cn(
                        "flex flex-col items-center rounded-xl border-2 p-3 bg-white dark:bg-card text-left transition-all hover:shadow-sm hover:border-primary active:scale-95 focus:outline-none focus:border-primary",
                        inCart ? "border-primary" : "border-[var(--rule-soft)] dark:border-card-border"
                      )}
                    >
                      <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-[var(--surface-canvas)] mb-2">
                        {product.imageUrl ? (
                          <Image src={product.imageUrl} alt={product.name} fill className="object-contain p-1" />
                        ) : (
                          <div className="flex items-center justify-center w-full h-full">
                            <Package className="h-8 w-8 text-gray-200 dark:text-[var(--text-primary)]" />
                          </div>
                        )}
                        {inCart && (
                          <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary text-white text-xs flex items-center justify-center font-bold">
                            {inCart.quantity}
                          </div>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-[var(--text-primary)] dark:text-foreground text-center leading-tight line-clamp-2 w-full">{product.name}</p>
                      <p className="text-sm font-bold text-primary mt-1">{fmt(product.price)}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </main>

        {/* ── Cart sidebar ── */}
        <aside className="w-80 flex flex-col border-l border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card">
          <div className="flex items-center gap-2 px-4 py-4 border-b border-[var(--rule-soft)] dark:border-card-border">
            <ShoppingCart className="h-5 w-5 text-primary" />
            <span className="font-bold text-[var(--text-primary)] dark:text-foreground">Tu pedido</span>
            {cartCount > 0 && (
              <span className="ml-auto bg-primary text-white text-xs font-bold px-2 py-0.5 rounded-full">{cartCount}</span>
            )}
          </div>

          {/* Items */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">
                <ShoppingCart className="h-8 w-8 mb-2" />
                <p className="text-sm">Sin productos</p>
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.product.id} className="flex items-center gap-2 py-2 border-b border-gray-50 dark:border-card-border last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] dark:text-foreground truncate">{item.product.name}</p>
                    <p className="text-xs text-primary font-semibold">{fmt(item.product.price * item.quantity)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => updateQty(item.product.id, -1)}
                      className="w-7 h-7 rounded-lg bg-[var(--surface-sunken)] flex items-center justify-center text-[var(--text-secondary)] dark:text-foreground hover:bg-[var(--rule-soft)]">
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-6 text-center text-sm font-bold text-[var(--text-primary)] dark:text-foreground">{item.quantity}</span>
                    <button type="button" onClick={() => updateQty(item.product.id, 1)}
                      className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20">
                      <Plus className="h-3 w-3" />
                    </button>
                    <button type="button" onClick={() => removeFromCart(item.product.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--data-error-500)]">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {cart.length > 0 && (
            <div className="px-4 py-4 border-t border-[var(--rule-soft)] dark:border-card-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold text-[var(--text-primary)] dark:text-foreground">Total</span>
                <span className="text-xl font-bold text-primary">{fmt(cartTotal)}</span>
              </div>

              {/* Payment method */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("yape")}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 text-xs font-semibold transition-all",
                    paymentMethod === "yape"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-[var(--rule-soft)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted hover:border-gray-300"
                  )}
                >
                  <Smartphone className="h-5 w-5" />
                  Yape QR
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("efectivo")}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 text-xs font-semibold transition-all",
                    paymentMethod === "efectivo"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-[var(--rule-soft)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted hover:border-gray-300"
                  )}
                >
                  <Banknote className="h-5 w-5" />
                  Efectivo
                </button>
              </div>

              <button
                type="button"
                onClick={handlePayment}
                disabled={processingPayment}
                className="w-full py-3 rounded-xl bg-primary text-white font-bold text-base hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {processingPayment ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                Pagar {fmt(cartTotal)}
              </button>
            </div>
          )}
        </aside>
      </div>

      {/* ── Success overlay ── */}
      {step === "success" && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/95 dark:bg-gray-950/95 z-50">
          <div className="text-center space-y-4">
            <div className="w-24 h-24 rounded-full bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] flex items-center justify-center mx-auto">
              <CheckCircle className="h-12 w-12 text-[var(--data-success-500)]" />
            </div>
            <SectionTitle className="text-3xl font-bold text-[var(--text-primary)] dark:text-foreground">Pago registrado</SectionTitle>
            <p className="text-[var(--text-secondary)] dark:text-muted text-lg">Gracias por tu compra</p>
            <p className="text-sm text-[var(--text-tertiary)]">Volviendo en unos segundos...</p>
          </div>
        </div>
      )}
    </div>
  );
}
