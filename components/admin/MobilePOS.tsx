"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import { Search, X, Plus, Minus, Trash2, Package, Check } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

/* ── Types ─────────────────────────────────────────────────────────────────── */

type POSProduct = {
  id: number;
  name: string;
  price: number;
  image?: string;
  category: string;
  stock?: number;
};

type CartItem = {
  product: POSProduct;
  quantity: number;
};

type PayMethod = "efectivo" | "yape" | "fiado";

/* ── Audio beep ─────────────────────────────────────────────────────────────── */

function playBeep() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
  } catch { /* sin audio en algunos dispositivos */ }
}

function vibrate() {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(50);
  }
}

/* ── ProductButton ──────────────────────────────────────────────────────────── */

function ProductButton({ product, onAdd }: { product: POSProduct; onAdd: (p: POSProduct) => void }) {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flash, setFlash] = useState(false);
  const [longPressQty, setLongPressQty] = useState<number | null>(null);

  const handleAdd = useCallback(() => {
    setFlash(true);
    setTimeout(() => setFlash(false), 200);
    vibrate();
    playBeep();
    onAdd(product);
  }, [product, onAdd]);

  const handlePressStart = useCallback(() => {
    pressTimer.current = setTimeout(() => {
      setLongPressQty(1);
    }, 600);
  }, []);

  const handlePressEnd = useCallback(() => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }, []);

  const confirmLongPress = useCallback(() => {
    if (!longPressQty || longPressQty < 1) return;
    for (let i = 0; i < longPressQty; i++) onAdd(product);
    vibrate();
    setLongPressQty(null);
  }, [longPressQty, product, onAdd]);

  return (
    <>
      <button
        onPointerDown={handlePressStart}
        onPointerUp={handlePressEnd}
        onPointerLeave={handlePressEnd}
        onClick={handleAdd}
        className={cn(
          "relative flex flex-col items-center justify-center rounded-xl border border-gray-700 p-2 gap-1 transition-transform active:scale-95 select-none",
          "bg-gray-800 hover:bg-gray-700",
          flash && "bg-[var(--accent-muted)] border-[var(--data-success-500)]/30",
        )}
        style={{ height: 80, touchAction: "manipulation" }}
      >
        {product.image ? (
          <div className="relative w-8 h-8 rounded-lg overflow-hidden bg-gray-700 shrink-0">
            <Image src={product.image} alt={product.name} fill className="object-cover" sizes="32px" />
          </div>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center shrink-0">
            <Package className="h-4 w-4 text-[var(--text-tertiary)]" />
          </div>
        )}
        <span className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)] text-center leading-tight line-clamp-2 w-full px-0.5">{product.name}</span>
        <span className="text-[length:var(--ts-xs)] font-extrabold text-[var(--data-success-500)]">S/{Number(product.price).toFixed(2)}</span>
      </button>

      {/* Long press modal — cantidad */}
      {longPressQty !== null && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6">
          <div className="bg-gray-900 rounded-3xl p-6 w-full max-w-xs border border-gray-700 space-y-4">
            <p className="text-white font-bold text-center text-base">{product.name}</p>
            <p className="text-[var(--text-tertiary)] text-sm text-center">Elige la cantidad</p>
            <div className="flex items-center justify-center gap-6">
              <button
                onClick={() => setLongPressQty(q => Math.max(1, (q ?? 1) - 1))}
                className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center active:scale-95"
              >
                <Minus className="h-5 w-5 text-white" />
              </button>
              <span className="text-4xl font-extrabold text-white w-12 text-center">{longPressQty}</span>
              <button
                onClick={() => setLongPressQty(q => (q ?? 1) + 1)}
                className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center active:scale-95"
              >
                <Plus className="h-5 w-5 text-white" />
              </button>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setLongPressQty(null)}
                className="flex-1 h-12 rounded-xl bg-gray-700 text-[var(--text-tertiary)] font-semibold active:scale-95"
              >
                Cancelar
              </button>
              <button
                onClick={confirmLongPress}
                className="flex-1 h-12 rounded-xl bg-[var(--accent-soft)] text-white font-bold active:scale-95"
              >
                Agregar {longPressQty}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── CartItemRow ────────────────────────────────────────────────────────────── */

function CartItemRow({ item, onInc, onDec, onRemove }: {
  item: CartItem;
  onInc: () => void;
  onDec: () => void;
  onRemove: () => void;
}) {
  const startX = useRef<number | null>(null);
  const [swiped, setSwiped] = useState(false);

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    setSwiped(false);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (startX.current === null) return;
    const dx = startX.current - e.changedTouches[0].clientX;
    if (dx > 60) {
      setSwiped(true);
      setTimeout(() => { onRemove(); setSwiped(false); }, 300);
    }
    startX.current = null;
  };

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className={cn(
        "flex items-center gap-2 py-2 px-1 rounded-xl border border-gray-800 bg-gray-900 dark:border-gray-700 dark:bg-gray-800/80 transition-all duration-[var(--dur-base)]",
        swiped && "-translate-x-full opacity-0",
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-[var(--text-tertiary)] truncate">{item.product.name}</p>
        <p className="text-[length:var(--ts-xs)] text-[var(--data-success-500)] font-bold">S/{Number(item.product.price).toFixed(2)} c/u</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={onDec}
          className="w-11 h-11 rounded-lg bg-gray-700 flex items-center justify-center active:scale-90"
        >
          <Minus className="h-3 w-3 text-white" />
        </button>
        <span className="w-6 text-center text-sm font-extrabold text-white">{item.quantity}</span>
        <button
          onClick={onInc}
          className="w-11 h-11 rounded-lg bg-gray-700 flex items-center justify-center active:scale-90"
        >
          <Plus className="h-3 w-3 text-white" />
        </button>
        <button
          onClick={onRemove}
          className="w-11 h-11 rounded-lg bg-[var(--data-error-500)]/50 flex items-center justify-center active:scale-90 ml-1"
        >
          <Trash2 className="h-3 w-3 text-[var(--data-error-500)]" />
        </button>
      </div>
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────────────────────────── */

export default function MobilePOS() {
  const [products, setProducts] = useState<POSProduct[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [loading, setLoading] = useState(true);
  const [paySuccess, setPaySuccess] = useState(false);
  // Audit 2026-05-17 07-P0-1: estados para el flujo real de cobro (antes mock)
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/products?limit=100&active=true", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          const list: POSProduct[] = (Array.isArray(data) ? data : data.products ?? data.data ?? []).map((p: Record<string, unknown>) => ({
            id: Number(p.id),
            name: String(p.name ?? ""),
            price: Number(p.price ?? p.salePrice ?? 0),
            image: typeof p.image === "string" ? p.image : undefined,
            category: String(p.category ?? "General"),
            stock: Number(p.stock ?? 99),
          }));
          setProducts(list);
        }
      } catch { /* silencioso */ }
      finally { setLoading(false); }
    })();
  }, []);

  const categories = ["Todos", ...Array.from(new Set(products.map(p => p.category))).sort()];

  const filtered = products.filter(p => {
    const matchCat = activeCategory === "Todos" || p.category === activeCategory;
    const matchQ = !query || p.name.toLowerCase().includes(query.toLowerCase());
    return matchCat && matchQ;
  });

  const total = cart.reduce((s, i) => s + i.product.price * i.quantity, 0);

  const addToCart = useCallback((product: POSProduct) => {
    setCart(prev => {
      const idx = prev.findIndex(i => i.product.id === product.id);
      if (idx >= 0) {
        return prev.map((i, n) => n === idx ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { product, quantity: 1 }];
    });
  }, []);

  const incItem  = useCallback((id: number) => setCart(p => p.map(i => i.product.id === id ? { ...i, quantity: i.quantity + 1 } : i)), []);
  const decItem  = useCallback((id: number) => setCart(p => p.map(i => i.product.id === id ? { ...i, quantity: Math.max(1, i.quantity - 1) } : i)), []);
  const removeItem = useCallback((id: number) => setCart(p => p.filter(i => i.product.id !== id)), []);

  // Audit 2026-05-17 07-P0-1: antes este handler era un MOCK que solo hacía
  // setPaySuccess(true) sin llamar /api/sales. /admin/pos-mobile en prod
  // mostraba "Cobrado!" sin cobrar de verdad → pérdida de dinero real si un
  // cajero la usaba. Ahora hace POST real a /api/sales con CSRF + idempotency
  // key + fallback offline (mismo patrón que POSView.tsx desktop).
  const handlePay = useCallback(async (method: PayMethod) => {
    if (!cart.length || paying) return;
    setPaying(true);
    setPayError(null);
    vibrate();

    const total = cart.reduce((s, i) => s + i.product.price * i.quantity, 0);
    const idempotencyKey = `mobile-pos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payload = {
      items: cart.map((i) => ({
        productId: i.product.id,
        name: i.product.name,
        price: i.product.price,
        quantity: i.quantity,
        unit: "und",
      })),
      total,
      payment: method,
      // Para fiado el server NO exige amountPaid >= total (ver app/api/sales:222);
      // para los demás, marcamos pago exacto.
      amountPaid: method === "fiado" ? 0 : total,
      idempotencyKey,
    };

    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setPaySuccess(true);
        setTimeout(() => {
          setCart([]);
          setPaySuccess(false);
        }, 1800);
      } else {
        const body = await res.json().catch(() => ({} as Record<string, unknown>));
        const errMsg = typeof body.error === "string" ? body.error : `Error ${res.status}`;
        setPayError(errMsg);
        // Si el server rechaza por fiado sin customerPhone, mostrar pista
        if (res.status === 400 && method === "fiado") {
          setPayError("Fiado necesita seleccionar cliente. Usá la app desktop.");
        }
      }
    } catch (err) {
      // Offline / red caída — guardar en cola para reintentar después
      try {
        const queue = await import("@/lib/pos-offline-queue");
        await queue.enqueue(payload);
        setPaySuccess(true);
        setPayError("Sin conexión. Venta guardada y se enviará después.");
        setTimeout(() => {
          setCart([]);
          setPaySuccess(false);
          setPayError(null);
        }, 2500);
      } catch (queueErr) {
        console.warn("[MobilePOS] offline queue failed", queueErr);
        setPayError(err instanceof Error ? err.message : "Error de red");
      }
    } finally {
      setPaying(false);
    }
  }, [cart, paying]);

  const PAY_BUTTONS: { method: PayMethod; label: string; color: string }[] = [
    { method: "efectivo", label: "Efectivo", color: "bg-gray-700 hover:bg-gray-600" },
    { method: "yape",     label: "Yape",     color: "bg-[var(--accent)] hover:bg-[var(--accent)]" },
    { method: "fiado",    label: "Fiado",    color: "bg-[var(--data-warning-500)] hover:bg-[var(--data-warning-500)]" },
  ];

  return (
    <div className="flex flex-col bg-black dark:bg-gray-950" style={{ height: "100dvh", overflow: "hidden" }}>

      {/* ── Zona superior (60%) — productos ─────────────────────────────── */}
      <div className="flex flex-col" style={{ flex: "0 0 60%" }}>

        {/* Búsqueda */}
        <div className="px-3 pt-3 pb-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-secondary)]" />
            <input
              type="search"
              inputMode="search"
              placeholder="Buscar producto..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full bg-gray-900 text-white placeholder-gray-500 border border-gray-700 rounded-lg pl-9 pr-9 py-3 text-base focus:outline-none focus:border-[var(--data-success-500)]/30"
              style={{ fontSize: 16 }}
            />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="h-4 w-4 text-[var(--text-tertiary)]" />
              </button>
            )}
          </div>
        </div>

        {/* Categorías — pills horizontal */}
        <div className="flex gap-2 px-3 pb-2 overflow-x-auto shrink-0 scrollbar-hide" style={{ scrollbarWidth: "none" }}>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors",
                activeCategory === cat
                  ? "bg-[var(--accent-soft)] text-white"
                  : "bg-gray-800 text-[var(--text-tertiary)]",
              )}
              style={{ minHeight: 32 }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Grid de productos */}
        <div className="flex-1 overflow-y-auto px-3 pb-2">
          {loading ? (
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-20 bg-gray-800 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-[var(--text-secondary)] text-sm">Sin productos</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {filtered.map(p => (
                <ProductButton key={p.id} product={p} onAdd={addToCart} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Divisor ──────────────────────────────────────────────────────── */}
      <div className="h-px bg-gray-800 shrink-0" />

      {/* ── Zona inferior (40%) — carrito + cobrar ───────────────────────── */}
      <div className="flex flex-col" style={{ flex: "0 0 40%" }}>

        {/* Lista de items del carrito */}
        <div className="flex-1 overflow-y-auto px-3 pt-2 space-y-1.5">
          {cart.length === 0 ? (
            <p className="text-center text-[var(--text-secondary)] text-xs pt-4">Toca un producto para agregarlo</p>
          ) : (
            cart.map(item => (
              <CartItemRow
                key={item.product.id}
                item={item}
                onInc={() => incItem(item.product.id)}
                onDec={() => decItem(item.product.id)}
                onRemove={() => removeItem(item.product.id)}
              />
            ))
          )}
        </div>

        {/* Total + botones de cobro */}
        <div className="px-3 pb-3 pt-2 space-y-2 shrink-0">
          {/* Total */}
          <div className="flex items-center justify-between bg-gray-900 dark:bg-gray-800 rounded-xl px-4 py-2 border border-gray-800 dark:border-gray-700">
            <span className="text-[var(--text-tertiary)] text-sm font-semibold">Total</span>
            <span className="text-4xl font-extrabold text-white">S/{total.toFixed(2)}</span>
          </div>

          {/* 3 métodos de pago */}
          <div className="grid grid-cols-3 gap-2">
            {PAY_BUTTONS.map(({ method, label, color }) => (
              <button
                key={method}
                onClick={() => handlePay(method)}
                disabled={!cart.length}
                className={cn(
                  "rounded-xl font-bold text-white text-sm transition-colors active:scale-95 disabled:opacity-30",
                  color,
                )}
                style={{ height: 60, touchAction: "manipulation" }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Botón cobrar principal */}
          <button
            onClick={() => handlePay("efectivo")}
            disabled={!cart.length || paying}
            className="w-full rounded-xl bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] active:scale-95 text-white font-extrabold text-lg transition-all disabled:opacity-30"
            style={{ height: 80, touchAction: "manipulation" }}
          >
            {paying ? "Procesando..." : paySuccess ? "Cobrado!" : `Cobrar S/${total.toFixed(2)}`}
          </button>
          {payError && (
            <div role="alert" className="mt-2 px-3 py-2 rounded-lg bg-[var(--data-error-50)] border border-[var(--data-error-500)]/40">
              <p className="text-xs font-semibold text-[var(--data-error-500)]">{payError}</p>
            </div>
          )}
        </div>
      </div>

      {/* Overlay de éxito */}
      {paySuccess && (
        <div className="fixed inset-0 z-50 bg-[var(--accent-muted)] flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <Check className="h-16 w-16 text-white mx-auto mb-2" strokeWidth={3} />
            <p className="text-white text-2xl font-semibold">Cobrado!</p>
            <p className="text-[var(--data-success-500)] text-lg tabular-nums">S/{total.toFixed(2)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
