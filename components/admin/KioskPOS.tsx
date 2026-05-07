"use client";

import { LoadingState, SectionTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
/**
 * KioskPOS — Modo caja para tablets (1024x768+)
 * Layout 70/30: productos | carrito
 * Sin framer-motion para máximo rendimiento en tablets baratas.
 * Dark mode con fondo negro puro para contraste en cajas.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Search, Plus, Minus, X, ShoppingCart,
  Package, Loader2, CheckCircle2,
  Banknote, Smartphone, Users,
  ScanBarcode, Clock,
} from "@buleje/design-system/icons";
import Image from "next/image";
import Link from "next/link";
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
  barcode?: string;
}

interface CartItem {
  product: Product;
  quantity: number;
}

type PaymentMethod = "efectivo" | "yape" | "fiado";

type PosStep = "idle" | "paying" | "success" | "error";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function useClock(): string {
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })
  );
  useEffect(() => {
    const t = setInterval(() => {
      setTime(new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }));
    }, 10_000);
    return () => clearInterval(t);
  }, []);
  return time;
}

function playSuccessBeep() {
  try {
    const ctx = new AudioContext();
    [880, 1100].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
      gain.gain.setValueAtTime(0.18, ctx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.25);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.25);
    });
  } catch { /* no audio */ }
}

// ── Payment method button ─────────────────────────────────────────────────────

interface PayBtnProps {
  active: boolean;
  method: PaymentMethod;
  label: string;
  icon: React.ReactNode;
  color: string;
  onClick: () => void;
}

function PayBtn({ active, label, icon, color, onClick }: PayBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl border-2 font-bold text-sm transition-all min-h-[56px]",
        active
          ? `${color} border-transparent text-white scale-105`
          : "border-gray-700 text-[var(--text-tertiary)] bg-gray-800 hover:border-gray-500 hover:text-gray-200"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// ── Category pill ─────────────────────────────────────────────────────────────

function CategoryPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all whitespace-nowrap min-h-[40px]",
        active
          ? "bg-[var(--accent-dark)] text-white"
          : "bg-gray-800 text-[var(--text-tertiary)] hover:bg-gray-700 hover:text-gray-200"
      )}
    >
      {label}
    </button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function KioskPOS() {
  const time = useClock();

  // Data
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [categories, setCategories] = useState<string[]>([]);

  // Filters
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("Todos");
  const searchRef = useRef<HTMLInputElement>(null);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);

  // Payment flow
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("efectivo");
  const [step, setStep] = useState<PosStep>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // ── Load products ──────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      setLoadingProducts(true);
      try {
        const res = await fetch("/api/products?limit=80&active=true");
        if (!res.ok) throw new Error("fetch failed");
        const raw = await res.json();
        const list: Product[] = Array.isArray(raw) ? raw : (raw.data ?? raw.products ?? []);
        setProducts(list);

        // Extract unique categories
        const cats = Array.from(
          new Set(list.map((p) => p.category).filter(Boolean) as string[])
        ).sort();
        setCategories(cats);
      } catch {
        setProducts([]);
      } finally {
        setLoadingProducts(false);
      }
    };
    load();
  }, []);

  // ── Filtered products ──────────────────────────────────────────────────────

  const filtered = products.filter((p) => {
    const matchSearch =
      !search.trim() ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode?.includes(search);
    const matchCat =
      activeCategory === "Todos" || p.category === activeCategory;
    return matchSearch && matchCat;
  });

  // ── Barcode scanner: auto-focus on input ───────────────────────────────────

  // When a barcode is fully scanned (ends with Enter), add product
  const handleSearchKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter" || !search.trim()) return;
      const match = products.find(
        (p) => p.barcode === search.trim() || p.name.toLowerCase() === search.toLowerCase()
      );
      if (match) {
        addToCart(match);
        setSearch("");
      }
    },
    [search, products]
  );

  // Re-focus search after product interaction
  const refocusSearch = useCallback(() => {
    setTimeout(() => searchRef.current?.focus(), 100);
  }, []);

  // ── Cart ops ───────────────────────────────────────────────────────────────

  const addToCart = useCallback((product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }, []);

  const updateQty = useCallback((id: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) =>
          i.product.id === id ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i
        )
        .filter((i) => i.quantity > 0)
    );
  }, []);

  const removeFromCart = useCallback((id: number) => {
    setCart((prev) => prev.filter((i) => i.product.id !== id));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const cartTotal = cart.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  // ── Process payment ────────────────────────────────────────────────────────

  const handleCobrar = async () => {
    if (cart.length === 0) return;
    setStep("paying");
    setErrorMsg("");
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
          source: "kiosk",
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Error al procesar");
      }

      playSuccessBeep();
      setStep("success");

      // Auto-reset after 3.5 s
      setTimeout(() => {
        clearCart();
        setStep("idle");
        setPaymentMethod("efectivo");
        searchRef.current?.focus();
      }, 3_500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error desconocido");
      setStep("error");
      setTimeout(() => setStep("idle"), 3_000);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-black text-white overflow-hidden select-none">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-3 bg-gray-950 border-b border-gray-800 flex-shrink-0">
        {/* Reloj digital */}
        <div className="flex items-center gap-3">
          <Clock className="h-5 w-5 text-[var(--accent)]" />
          <span className="text-2xl font-mono font-bold text-teal-300 tabular-nums">{time}</span>
        </div>

        {/* Marca */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[var(--accent-dark)] flex items-center justify-center">
            <span className="text-xs font-extrabold text-white">B</span>
          </div>
          <span className="text-base font-extrabold tracking-wide text-white">Buleje POS</span>
          <span className="px-2 py-0.5 rounded-full bg-teal-900/60 text-teal-300 text-[length:var(--ts-2xs)] font-bold">POS</span>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
            <ScanBarcode className="h-4 w-4" />
            Lector listo
          </span>
          <Link
            href="/admin"
            className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-[var(--text-tertiary)] text-sm font-semibold transition-colors min-h-[44px] flex items-center"
          >
            Salir
          </Link>
        </div>
      </header>

      {/* ── Body: productos + carrito ───────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Columna izquierda: 70% ──────────────────────────────── */}
        <main className="flex flex-col overflow-hidden" style={{ flex: "0 0 70%" }}>

          {/* Search + barcode */}
          <div className="px-5 pt-4 pb-3 bg-gray-950 border-b border-gray-800 flex-shrink-0 space-y-3">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-[var(--text-secondary)]" />
              <input
                ref={searchRef}
                type="text"
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKey}
                placeholder="Buscar producto o escanear código..."
                className="w-full pl-13 pr-12 py-4 text-xl rounded-xl bg-gray-900 border-2 border-gray-700 text-white placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => { setSearch(""); searchRef.current?.focus(); }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-tertiary)]"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* Category pills */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <CategoryPill
                label="Todos"
                active={activeCategory === "Todos"}
                onClick={() => setActiveCategory("Todos")}
              />
              {categories.map((cat) => (
                <CategoryPill
                  key={cat}
                  label={cat}
                  active={activeCategory === cat}
                  onClick={() => setActiveCategory(cat)}
                />
              ))}
            </div>
          </div>

          {/* Product grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {loadingProducts ? (
              <LoadingState message="" size="lg" />
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-[var(--text-secondary)]">
                <Package className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-lg">Sin productos</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 xl:grid-cols-4 gap-3">
                {filtered.map((product) => {
                  const inCart = cart.find((i) => i.product.id === product.id);
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => { addToCart(product); refocusSearch(); }}
                      className={cn(
                        "group flex flex-col items-center rounded-xl border-2 p-3 bg-gray-900 text-left transition-all active:scale-95 focus:outline-none min-h-[120px]",
                        inCart
                          ? "border-[var(--accent)]"
                          : "border-gray-800 hover:border-gray-600"
                      )}
                    >
                      {/* Imagen */}
                      <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-gray-800 mb-2 flex-shrink-0">
                        {product.imageUrl ? (
                          <Image
                            src={product.imageUrl}
                            alt={product.name}
                            fill
                            className="object-contain p-1"
                            sizes="120px"
                          />
                        ) : (
                          <div className="flex items-center justify-center w-full h-full">
                            <Package className="h-8 w-8 text-[var(--text-primary)]" />
                          </div>
                        )}

                        {/* Qty badge */}
                        {inCart && (
                          <div className="absolute top-1 right-1 w-6 h-6 rounded-full bg-[var(--accent)] text-white text-xs flex items-center justify-center font-bold shadow">
                            {inCart.quantity}
                          </div>
                        )}
                      </div>

                      <p className="text-xs font-semibold text-gray-200 text-center leading-tight line-clamp-2 w-full">
                        {product.name}
                      </p>
                      <p className="text-sm font-bold text-teal-400 mt-1">{fmt(product.price)}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </main>

        {/* ── Columna derecha: 30% carrito ────────────────────────── */}
        <aside className="flex flex-col border-l border-gray-800 bg-gray-950 overflow-hidden" style={{ flex: "0 0 30%" }}>

          {/* Cart header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 flex-shrink-0">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-[var(--accent)]" />
              <span className="font-bold text-white text-base">Carrito</span>
              {cartCount > 0 && (
                <span className="bg-[var(--accent-dark)] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {cartCount}
                </span>
              )}
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={clearCart}
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--data-error-500)] transition-colors flex items-center gap-1"
              >
                <X className="h-3.5 w-3.5" />
                Vaciar
              </button>
            )}
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-[var(--text-primary)]">
                <ShoppingCart className="h-10 w-10 mb-2 opacity-30" />
                <p className="text-sm">Carrito vacío</p>
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.product.id}
                  className="flex items-center gap-2 py-2 border-b border-gray-800 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200 truncate">
                      {item.product.name}
                    </p>
                    <p className="text-xs text-teal-400 font-semibold">
                      {fmt(item.product.price * item.quantity)}
                    </p>
                  </div>

                  {/* Qty controls — 56px touch targets */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => updateQty(item.product.id, -1)}
                      className="w-9 h-9 rounded-lg bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-[var(--text-tertiary)] transition-colors active:scale-90"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-8 text-center text-sm font-bold text-white tabular-nums">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQty(item.product.id, 1)}
                      className="w-9 h-9 rounded-lg bg-teal-900/60 hover:bg-teal-800 flex items-center justify-center text-teal-400 transition-colors active:scale-90"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.product.id)}
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--data-error-500)] transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Cart footer: total + pago + cobrar */}
          <div className="px-5 py-4 border-t border-gray-800 space-y-4 flex-shrink-0 bg-gray-950">
            {/* Total */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--text-tertiary)]">Total</span>
              <span className="text-4xl font-extrabold text-teal-300 tabular-nums">
                {fmt(cartTotal)}
              </span>
            </div>

            {/* Payment method */}
            <div className="flex gap-2">
              <PayBtn
                method="efectivo"
                active={paymentMethod === "efectivo"}
                label="Efectivo"
                icon={<Banknote className="h-5 w-5" />}
                color="bg-[var(--accent-soft)]"
                onClick={() => setPaymentMethod("efectivo")}
              />
              <PayBtn
                method="yape"
                active={paymentMethod === "yape"}
                label="Yape"
                icon={<Smartphone className="h-5 w-5" />}
                color="bg-[var(--accent)]"
                onClick={() => setPaymentMethod("yape")}
              />
              <PayBtn
                method="fiado"
                active={paymentMethod === "fiado"}
                label="Fiado"
                icon={<Users className="h-5 w-5" />}
                color="bg-orange-600"
                onClick={() => setPaymentMethod("fiado")}
              />
            </div>

            {/* Error inline */}
            {step === "error" && (
              <p className="text-sm text-[var(--data-error-500)] text-center font-medium">{errorMsg}</p>
            )}

            {/* COBRAR button — 80px height */}
            <button
              type="button"
              onClick={handleCobrar}
              disabled={cart.length === 0 || step === "paying" || step === "success"}
              style={{ minHeight: 80 }}
              className={cn(
                "w-full rounded-xl font-extrabold text-xl tracking-wide transition-all flex items-center justify-center gap-3",
                "disabled:opacity-40 disabled:cursor-not-allowed",
                cart.length > 0
                  ? "bg-[var(--accent-dark)] hover:bg-[var(--accent)] active:bg-[var(--accent-dark)] text-white"
                  : "bg-gray-800 text-[var(--text-secondary)] cursor-not-allowed"
              )}
            >
              {step === "paying" ? (
                <>
                  <LoadingState variant="inline" size="sm" />
                  Procesando...
                </>
              ) : (
                <>Cobrar {cart.length > 0 ? fmt(cartTotal) : ""}</>
              )}
            </button>
          </div>
        </aside>
      </div>

      {/* ── Success overlay ──────────────────────────────────────────── */}
      {step === "success" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 z-50">
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="w-28 h-28 rounded-full bg-teal-900/50 flex items-center justify-center ring-4 ring-[var(--accent)]/30">
              <CheckCircle2 className="h-14 w-14 text-teal-400" />
            </div>
            <SectionTitle className="text-4xl font-extrabold text-white">Venta registrada</SectionTitle>
            <p className="text-xl text-teal-300 font-semibold">{fmt(cartTotal)}</p>
            <p className="text-[var(--text-secondary)] text-sm mt-2">Volviendo al inicio...</p>
          </div>
        </div>
      )}
    </div>
  );
}
