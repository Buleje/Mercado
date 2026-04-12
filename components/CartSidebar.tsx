"use client";
// v2
import { useRef, useEffect, useState, startTransition, useCallback } from "react";
import Image from "next/image";
import { m, AnimatePresence } from "framer-motion";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import { X, Plus, Minus, Trash2, ShoppingCart, Clipboard, Share2, CheckCircle2, Download, MessageCircleOff, Package, Tag, Truck, Gift, Clock } from "lucide-react";
import { useCart } from "@/contexts/cart-context";
import { useCustomer } from "@/contexts/customer-context";
import { useSettings } from "@/contexts/settings-context";
import { usePromotions } from "@/contexts/promotions-context";
import { useTenantSlug, tenantKey } from "@/contexts/tenant-context";
import { sendOrder, type SendResult } from "@/lib/order-utils";
import { useStoreProducts } from "@/hooks/use-store-products";
import CartUpsellSection from "@/components/CartUpsellSection";

/** Renders a cart item image with graceful error fallback */
function CartItemImage({ src, alt }: { src: string; alt: string }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
        <Package className="h-7 w-7 text-gray-300" />
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      className="object-cover"
      sizes="80px"
      onError={() => setErr(true)}
    />
  );
}

export default function CartSidebar() {
  const { items, isOpen, count, total, close, removeItem, updateQty, setItemNote, clear, markOrderPending, openConfirmModal, clearPendingOrder, openCheckout, addItem } =
    useCart();
  const { customer } = useCustomer();
  const { mode } = useSettings();
  const { getBestPromotion, promotions } = usePromotions();
  const { products: allProducts } = useStoreProducts();
  const panelRef = useRef<HTMLDivElement>(null);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [sending, setSending] = useState(false);

  /* Y4: WhatsApp message preview */
  const [showPreview, setShowPreview] = useState(false);

  /* Z3: Coupon field in cart */
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponMsg, setCouponMsg] = useState("");
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  /* Smart cross-sell: real co-purchase data */
  type CoPurchased = { id: number; name: string; image: string; price: number; unit: string };
  const [coPurchased, setCoPurchased] = useState<CoPurchased[]>([]);
  const coPurchaseRef = useRef("");

  const fetchCoPurchased = useCallback(async (ids: number[]) => {
    const key = ids.sort().join(",");
    if (key === coPurchaseRef.current || ids.length === 0) return;
    coPurchaseRef.current = key;
    try {
      const res = await fetch(`/api/products/co-purchased?ids=${key}&limit=4`);
      if (res.ok) {
        const data = await res.json();
        startTransition(() => setCoPurchased(Array.isArray(data) ? data : []));
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (isOpen && items.length > 0) {
      const ids = items.map(i => i.id).filter(id => id > 0);
      fetchCoPurchased(ids);
    }
  }, [isOpen, items, fetchCoPurchased]);
  const validateCoupon = async () => {
    if (!couponCode.trim()) return;
    setValidatingCoupon(true);
    setCouponMsg("");
    try {
      const res = await fetch("/api/coupons/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: couponCode.trim(), cartTotal: total }) });
      const data = await res.json();
      if (res.ok && data.valid) {
        setCouponDiscount(data.discount ?? 0);
        setCouponMsg(`-S/${(data.discount ?? 0).toFixed(2)}`);
      } else {
        setCouponDiscount(0);
        setCouponMsg(data.message ?? "Cupon invalido");
      }
    } catch { setCouponMsg("Error al validar"); setCouponDiscount(0); }
    setValidatingCoupon(false);
  };

  /* Mejora 18: Guardar carrito para después con link compartible */
  const [savedCartCode, setSavedCartCode] = useState<string | null>(null);
  const [showSavedModal, setShowSavedModal] = useState(false);
  const [loadCartCode, setLoadCartCode] = useState("");
  const [loadCartMsg, setLoadCartMsg] = useState("");

  const saveCartForLater = () => {
    if (items.length === 0) return;
    const code = "Buleje-" + Date.now().toString(36).toUpperCase();
    const cartData = {
      items: items.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity, unit: i.unit, image: i.image })),
      savedAt: Date.now(),
    };
    try { localStorage.setItem(`saved-carts-${code}`, JSON.stringify(cartData)); } catch { /* ignore */ }
    setSavedCartCode(code);
    setShowSavedModal(true);
  };

  const loadSavedCart = () => {
    const code = loadCartCode.trim().toUpperCase();
    if (!code) { setLoadCartMsg("Ingresa un codigo"); return; }
    try {
      const raw = localStorage.getItem(`saved-carts-${code}`);
      if (!raw) { setLoadCartMsg("Codigo no encontrado"); return; }
      const data = JSON.parse(raw);
      // Check expiration (7 days)
      if (Date.now() - data.savedAt > 7 * 24 * 60 * 60 * 1000) {
        setLoadCartMsg("Este codigo ha expirado");
        localStorage.removeItem(`saved-carts-${code}`);
        return;
      }
      // Add items to cart
      for (const item of data.items) {
        const product = allProducts.find(p => p.id === item.id);
        if (product) {
          for (let q = 0; q < item.quantity; q++) addItem(product);
        }
      }
      setLoadCartMsg("Lista cargada con exito");
      setLoadCartCode("");
      setTimeout(() => setLoadCartMsg(""), 3000);
    } catch { setLoadCartMsg("Error al cargar la lista"); }
  };

  const shareCartWhatsApp = () => {
    if (!savedCartCode) return;
    const itemList = items.map((i, idx) => `${idx + 1}. ${i.name} - S/${(i.price * i.quantity).toFixed(2)}`).join("\n");
    const url = typeof window !== "undefined" ? window.location.origin : "";
    const msg = `🛒 Mi lista de Buleje:\n${itemList}\nCodigo: ${savedCartCode}\nIngresa en ${url}/tienda y usa este codigo para cargar la lista`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  /* Z4: Print cart as shopping list */
  const _printCart = () => {
    const now = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
    const rows = items.map((i, idx) => `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${idx + 1}</td><td style="padding:4px 8px;border-bottom:1px solid #eee">${i.name}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:center">${i.quantity}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">S/${(i.price * i.quantity).toFixed(2)}</td></tr>`).join("");
    const html = `<html><head><title>Lista de compras</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#1a1a1a}table{width:100%;border-collapse:collapse}th{text-align:left;padding:6px 8px;border-bottom:2px solid #333;font-size:13px}td{font-size:12px}.total{margin-top:12px;text-align:right;font-size:16px;font-weight:bold}h2{margin:0 0 4px}p{margin:0 0 12px;color:#666;font-size:12px}@media print{body{padding:12px}}</style></head><body><h2>🛒 Buleje</h2><p>Lista de compras — ${now}</p><table><thead><tr><th>#</th><th>Producto</th><th style="text-align:center">Cant.</th><th style="text-align:right">Subtotal</th></tr></thead><tbody>${rows}</tbody></table>${discount > 0 ? `<p class="total" style="font-size:13px;color:#888">Desc. promo: -S/${discount.toFixed(2)}</p>` : ""}${couponDiscount > 0 ? `<p class="total" style="font-size:13px;color:#888">Cupón: -S/${couponDiscount.toFixed(2)}</p>` : ""}<p class="total">Total: S/${finalTotal.toFixed(2)}</p></body></html>`;
    const w = window.open("", "_blank", "width=400,height=600");
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  /* W2: First order detection */

  /* AB2: Cart reservation timer (30 min from first item add) */
  const [reserveTime, setReserveTime] = useState("");
  const slug = useTenantSlug();
  const CART_RESERVE_KEY = tenantKey(slug, "cart-reserve-start");
  useEffect(() => {
    if (items.length === 0) { setReserveTime(""); try { localStorage.removeItem(CART_RESERVE_KEY); } catch {} return; }
    let start = Number(localStorage.getItem(CART_RESERVE_KEY));
    if (!start || start < Date.now() - 30 * 60_000) {
      start = Date.now();
      localStorage.setItem(CART_RESERVE_KEY, String(start));
    }
    const calc = () => {
      const left = 30 * 60_000 - (Date.now() - start);
      if (left <= 0) { setReserveTime(""); return; }
      const m = Math.floor(left / 60000);
      const s = Math.floor((left % 60000) / 1000);
      setReserveTime(`${m}:${String(s).padStart(2, "0")}`);
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [items.length]);
  const [isFirstOrder, setIsFirstOrder] = useState(false);
  /* Stock verification on cart open */
  const [stockAlerts, setStockAlerts] = useState<Record<number, number>>({});
  useEffect(() => {
    if (!isOpen || items.length === 0) return;
    // Fetch current stock for cart items
    const ids = items.map(i => i.id).filter(id => id > 0);
    if (ids.length === 0) return;
    fetch(`/api/products/stock-check?ids=${ids.join(",")}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (Array.isArray(data)) {
          const map: Record<number, number> = {};
          for (const item of data) {
            if (item && typeof item.id === "number" && typeof item.stock === "number") {
              map[item.id] = item.stock;
            }
          }
          setStockAlerts(map);
        }
      })
      .catch(() => { /* silent — stock alerts are best-effort */ });
  }, [isOpen, items.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isOpen) return;
    try {
      const hasOrdered = localStorage.getItem("buleje-has-ordered");
      setIsFirstOrder(!hasOrdered);
    } catch { /* silent */ }
  }, [isOpen]);

  /* W3: Hydrate cart from shared link */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cartParam = params.get("cart");
    if (!cartParam) return;
    // Remove param from URL so it doesn't re-trigger
    const url = new URL(window.location.href);
    url.searchParams.delete("cart");
    window.history.replaceState({}, "", url.toString());
    // Parse and add items
    const entries = cartParam.split(",");
    for (const entry of entries) {
      const [id, qtyStr] = entry.split(":");
      const qty = parseInt(qtyStr, 10);
      if (!id || !qty || qty < 1) continue;
      const numId = Number(id);
      const product = allProducts.find(p => p.id === numId);
      if (product) {
        for (let i = 0; i < qty; i++) addItem(product);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const promo = getBestPromotion(total, customer?.phone);
  const discount = promo ? total * (promo.discountPercent / 100) : 0;
  const finalTotal = total - discount - couponDiscount;

  // Reset state when cart is closed
  useEffect(() => {
    if (!isOpen) {
      startTransition(() => {
        setSendResult(null);
        setSending(false);
      });
    }
  }, [isOpen]);

  // Lock scroll when open
  useScrollLock(isOpen);

  const handleOrder = async () => {
    if (items.length === 0) return;
    // Checkout flow mode — open the checkout modal (handles data collection inside)
    if (mode === "checkout") {
      openCheckout();
      return;
    }
    // WhatsApp mode
    const sender = customer ?? {
      name: "Cliente",
      phone: "",
      location: "Ucayali",
      reference: "",
      savedLocations: [],
    };
    setSending(true);
    const result = await sendOrder(sender, items, total);
    setSending(false);
    setSendResult(result);
    markOrderPending();
    // Dispatch order tracking event so OrderProgress widget appears
    const orderId = `WA-${Date.now().toString(36).toUpperCase()}`;
    window.dispatchEvent(new CustomEvent("buleje:orderCreated", { detail: { orderId, customerName: customer?.name } }));
    setTimeout(() => openConfirmModal(), 1800);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={close}
            aria-hidden="true"
            className="fixed inset-0 z-6000 bg-black/50 sm:backdrop-blur-sm"
          />

          {/* Panel */}
          <m.aside
            ref={panelRef}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            role="dialog"
            aria-modal="true"
            aria-label="Carrito de compras"
            data-testid="cart-sidebar"
            className="fixed top-0 right-0 bottom-0 z-6001 w-full max-w-md bg-white dark:bg-background shadow-2xl flex flex-col isolate"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 sm:py-5 border-b bg-primary/5">
              <div className="flex items-center gap-3">
                <ShoppingCart className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-lg font-bold text-foreground">
                    Tu Carrito{" "}
                    <span className="text-primary">({count})</span>
                  </h2>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${mode === "checkout" ? "text-primary" : "text-emerald-600"}`}>
                    {mode === "checkout" ? "Pedido en línea" : "Pedido por WhatsApp"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {items.length > 0 && (
                  <button
                    onClick={() => { if (window.confirm("¿Seguro que quieres vaciar el carrito?")) clear(); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors text-xs font-bold"
                    aria-label="Vaciar carrito"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Vaciar todo
                  </button>
                )}
                <button
                  onClick={close}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  aria-label="Cerrar carrito"
                >
                  <X className="h-5 w-5 text-muted" />
                </button>
              </div>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4 space-y-2">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center gap-5 py-10 px-2">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/8">
                    <ShoppingCart className="h-9 w-9 text-primary/40" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-foreground">Tu carrito está vacío</p>
                    <p className="text-sm text-muted mt-1">Agrega productos para hacer tu pedido</p>
                  </div>
                  <div className="w-full space-y-2">
                    <p className="text-xs font-semibold text-muted uppercase tracking-wide">Categorías populares</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {[
                        { emoji: "🥬", label: "Verduras", id: "frutas-verduras" },
                        { emoji: "🏪", label: "Abarrotes", id: "abarrotes" },
                        { emoji: "🥩", label: "Carnes", id: "carnes" },
                        { emoji: "🧀", label: "Lácteos", id: "lacteos" },
                        { emoji: "🥤", label: "Bebidas", id: "bebidas" },
                        { emoji: "🧹", label: "Limpieza", id: "limpieza" },
                      ].map(cat => (
                        <button
                          key={cat.id}
                          onClick={() => {
                            close();
                            // Navigate + dispatch category filter
                            const el = document.getElementById(`cat-${cat.id}`);
                            if (el) {
                              el.scrollIntoView({ behavior: "smooth", block: "start" });
                            } else {
                              window.location.href = `/tienda#cat-${cat.id}`;
                            }
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/8 text-primary text-xs font-semibold hover:bg-primary/15 transition-colors"
                        >
                          <span>{cat.emoji}</span>
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={close}
                    className="w-full max-w-48 rounded-xl bg-primary text-white py-2.5 text-sm font-bold hover:bg-primary/90 transition-colors shadow-md shadow-primary/20"
                  >
                    Explorar tienda
                  </button>
                </div>
              ) : (
                <>
                {/* T2: Birthday discount banner */}
                {(() => {
                  if (!customer?.birthday) return null;
                  const now = new Date();
                  const today = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
                  if (customer.birthday !== today) return null;
                  return (
                    <div className="mx-1 mb-2 flex items-center gap-2.5 rounded-xl bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800/30 px-3 py-2.5">
                      <span className="text-xl">🎂</span>
                      <div>
                        <p className="text-xs font-bold text-pink-700 dark:text-pink-300">¡Feliz cumpleaños, {customer.name?.split(" ")[0]}!</p>
                        <p className="text-[10px] text-pink-500 dark:text-pink-400">Tienes 10% de descuento hoy — aplica automático al pagar</p>
                      </div>
                    </div>
                  );
                })()}
                {items.map((item) => (
                  <div
                    key={item.id}
                    className={`flex gap-3 bg-gray-50 dark:bg-card rounded-xl p-2.5 relative${(item as { stock?: number }).stock === 0 ? " opacity-50" : ""}`}
                  >
                    {/* Out of stock overlay */}
                    {(item as { stock?: number }).stock === 0 && (
                      <div className="absolute inset-0 z-10 bg-white/60 dark:bg-black/40 rounded-xl flex items-center justify-center">
                        <span className="text-xs font-bold text-red-600 bg-red-50 dark:bg-red-900/30 px-3 py-1 rounded-full">Agotado</span>
                      </div>
                    )}
                    {/* Image */}
                    <div className="relative h-16 w-16 shrink-0 rounded-lg overflow-hidden bg-white">
                      <CartItemImage src={item.image} alt={item.name} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm text-foreground leading-tight line-clamp-2">
                        {item.name}
                      </h3>
                      {(() => {
                        const liveStock = stockAlerts[item.id];
                        const itemStock = liveStock ?? (item as { stock?: number }).stock;
                        if (itemStock == null) return null;
                        if (itemStock === 0) return (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full mt-0.5">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                            Agotado — elimina del carrito
                          </span>
                        );
                        if (itemStock <= 3) return (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full mt-0.5">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                            ¡Solo quedan {itemStock}!
                          </span>
                        );
                        if (itemStock <= 5) return (
                          <p className="text-[10px] text-amber-500 font-semibold mt-0.5 flex items-center gap-1">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                            ¡Solo {itemStock} en stock!
                          </p>
                        );
                        return null;
                      })()}
                      {(item as { stock?: number }).stock != null &&
                        (item as { stock?: number }).stock! > 0 &&
                        item.quantity >= (item as { stock?: number }).stock! && (
                          <p className="text-[10px] text-red-500 font-semibold mt-0.5">
                            Máximo disponible alcanzado
                          </p>
                        )}
                      <p className="text-xs text-muted mt-0.5">
                        S/{item.price.toFixed(2)} / {item.unit}
                      </p>

                      <div className="flex items-center justify-between mt-2">
                        {/* Quantity Controls */}
                        <div className="flex items-center gap-1 bg-white rounded-lg border shadow-sm">
                          <button
                            onClick={() =>
                              updateQty(item.id, item.quantity - 1)
                            }
                            className="p-2 hover:bg-gray-50 rounded-l-lg transition-colors min-h-9 min-w-9 flex items-center justify-center"
                            aria-label="Reducir cantidad"
                          >
                            <Minus className="h-4 w-4 text-muted" />
                          </button>
                          <span className="px-3 text-sm font-semibold min-w-8 text-center">
                            {item.quantity}
                          </span>
                          {(() => {
                            const stock = (item as { stock?: number }).stock;
                            const atMax = stock != null && stock > 0 && item.quantity >= stock;
                            return (
                              <button
                                onClick={() => !atMax && updateQty(item.id, item.quantity + 1)}
                                disabled={atMax}
                                className={`p-2 rounded-r-lg transition-colors min-h-9 min-w-9 flex items-center justify-center ${atMax ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-50"}`}
                                aria-label="Aumentar cantidad"
                              >
                                <Plus className="h-4 w-4 text-muted" />
                              </button>
                            );
                          })()}
                        </div>

                        {/* Subtotal + Delete */}
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-primary">
                            S/{(item.price * item.quantity).toFixed(2)}
                          </span>
                          <button
                            onClick={() => removeItem(item.id)}
                            className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors min-h-9 min-w-9 flex items-center justify-center"
                            aria-label={`Eliminar ${item.name}`}
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                      {/* Q1 — Per-item note */}
                      <input
                        type="text"
                        value={item.note ?? ""}
                        onChange={e => setItemNote(item.id, e.target.value)}
                        placeholder="Nota: ej. sin cebolla, bien maduro…"
                        maxLength={80}
                        className="mt-1.5 w-full text-[11px] text-gray-600 dark:text-muted placeholder:text-gray-300 bg-white dark:bg-surface border border-gray-100 dark:border-card-border rounded-lg px-2.5 py-1.5 outline-none focus:border-primary/40 transition-colors"
                      />
                    </div>
                  </div>
                ))}
                </>
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="border-t dark:border-card-border px-4 sm:px-6 py-3 pb-safe space-y-2 bg-white dark:bg-background shrink-0">

            {/* AB2: Cart reservation timer */}
                {reserveTime && (
                  <div className="flex items-center justify-center gap-1.5 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 rounded-lg px-3 py-1.5 border border-amber-100 dark:border-amber-700/20">
                    <Clock className="h-3 w-3" />
                    Tu carrito se reserva por <span className="font-bold tabular-nums">{reserveTime}</span>
                  </div>
                )}

            {/* Collapsible details section */}
                <details className="group">
                  <summary className="flex items-center justify-between cursor-pointer list-none text-xs font-semibold text-primary hover:text-primary-dark transition-colors py-1">
                    <span>Ver descuentos y detalles</span>
                    <svg className="h-4 w-4 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                  </summary>
                  <div className="space-y-3 pt-2">

            {/* Promotion banner */}
                {promo && (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
                    <Tag className="h-4 w-4 text-emerald-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-emerald-700 truncate">{promo.name}</p>
                      <p className="text-xs text-emerald-600">-{promo.discountPercent}% aplicado</p>
                    </div>
                    <p className="font-bold text-emerald-700 text-sm shrink-0">-S/{discount.toFixed(2)}</p>
                  </div>
                )}

                {/* W2: First order discount banner */}
                {isFirstOrder && !promo && items.length > 0 && (
                  <div className="flex items-center gap-2 bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-700/30 rounded-xl px-3 py-2.5">
                    <Gift className="h-4 w-4 text-violet-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-violet-700 dark:text-violet-300">¡Es tu primera compra! 🎉</p>
                      <p className="text-[10px] text-violet-600 dark:text-violet-400">Realiza tu pedido y recibe un regalo sorpresa en tu primera entrega</p>
                    </div>
                  </div>
                )}

                {/* Promo threshold progress — "Spend X more to unlock Y%" */}
                {(() => {
                  const upcoming = promotions
                    .filter(p => p.minPurchase && p.minPurchase > total && p.targetType !== "specific")
                    .sort((a, b) => (a.minPurchase ?? 0) - (b.minPurchase ?? 0))[0];
                  if (!upcoming?.minPurchase) return null;
                  const needed = upcoming.minPurchase - total;
                  const pct = Math.min((total / upcoming.minPurchase) * 100, 100);
                  return (
                    <div className="rounded-xl border border-dashed border-amber-400/40 bg-amber-50 dark:bg-amber-500/5 px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <Tag className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                          <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                            Agrega <span className="text-amber-500 font-extrabold">S/{needed.toFixed(2)}</span> más para -{upcoming.discountPercent}%
                          </span>
                        </div>
                        <span className="text-[11px] font-bold tabular-nums text-amber-600/70">
                          {pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-amber-200/60 dark:bg-amber-500/20 overflow-hidden">
                        <div className="h-full rounded-full bg-amber-400 transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })()}

                {/* Free delivery progress */}
                {(() => {
                  const FREE_DELIVERY = 50;
                  const remaining = FREE_DELIVERY - finalTotal;
                  const pct = Math.min((finalTotal / FREE_DELIVERY) * 100, 100);
                  return (
                    <div className="rounded-xl border border-dashed border-primary/25 bg-primary/4 px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <Truck className="h-3.5 w-3.5 text-primary" />
                          <span className="text-xs font-bold text-primary">
                            {remaining > 0
                              ? `Agrega S/${remaining.toFixed(2)} más para delivery gratis`
                              : "🎉 ¡Delivery gratis desbloqueado!"}
                          </span>
                        </div>
                        <span className="text-[11px] font-bold tabular-nums" style={{ color: remaining > 0 ? "var(--color-muted)" : "var(--color-primary)" }}>
                          {pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-primary/15 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: remaining <= 0 ? "#25D366" : "var(--color-primary)" }}
                        />
                      </div>
                    </div>
                  );
                })()}

                {/* F3 — Loyalty points preview */}
                {customer && finalTotal > 0 && (
                  <div className="flex items-center gap-2 bg-violet-50 dark:bg-violet-950/30 rounded-xl px-3 py-2.5 border border-violet-100 dark:border-violet-800/30">
                    <span className="text-base leading-none">⭐</span>
                    <span className="text-xs text-violet-700 dark:text-violet-300">
                      Ganarás ~<span className="font-bold">{Math.floor(finalTotal / 10) * 5} pts</span> con este pedido
                    </span>
                  </div>
                )}

                {/* I3 — Enhanced upsell: threshold push + combos + co-purchased */}
                <CartUpsellSection
                  items={items}
                  cartTotal={finalTotal}
                  coPurchased={coPurchased}
                  onAddItem={addItem}
                />

                  </div>
                </details>

                {/* Mejora 18: Guardar carrito + Cargar código */}
                <div className="flex gap-2">
                  <button
                    onClick={saveCartForLater}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-primary/30 text-xs font-bold text-primary hover:bg-primary/5 transition-colors"
                  >
                    <Clipboard className="h-3.5 w-3.5" />
                    Guardar mi lista
                  </button>
                  <div className="flex-1 flex gap-1">
                    <input
                      type="text"
                      value={loadCartCode}
                      onChange={e => { setLoadCartCode(e.target.value); setLoadCartMsg(""); }}
                      placeholder="Codigo lista..."
                      className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-card-border text-[11px] text-gray-700 dark:text-foreground outline-none focus:border-primary/40"
                    />
                    <button
                      onClick={loadSavedCart}
                      className="px-2 py-1.5 rounded-lg bg-primary/10 text-primary text-[11px] font-bold hover:bg-primary/20 transition-colors shrink-0"
                    >
                      Cargar
                    </button>
                  </div>
                </div>
                {loadCartMsg && (
                  <p className={`text-[10px] font-semibold text-center ${loadCartMsg.includes("exito") ? "text-emerald-600" : "text-red-500"}`}>{loadCartMsg}</p>
                )}

                {/* Mejora 14: Delivery time estimate */}
                {(() => {
                  const now = new Date().getHours();
                  const isDeliveryHours = now >= 8 && now < 21;
                  const estimado = isDeliveryHours ? "~30 minutos" : "manana 8-10am";
                  return (
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-muted py-1">
                      <Truck className="h-3.5 w-3.5 shrink-0" />
                      <span>Entrega estimada: <span className="font-bold text-gray-700 dark:text-foreground">{estimado}</span></span>
                    </div>
                  );
                })()}

                {/* Total */}
                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold text-muted">
                    Total
                  </span>
                  <div className="text-right">
                    {(promo || couponDiscount > 0) && (
                      <p className="text-sm text-gray-400 line-through leading-none mb-0.5">
                        S/{total.toFixed(2)}
                      </p>
                    )}
                    <span className="text-xl font-extrabold text-primary">
                      S/{finalTotal.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Mejora 13: Mensaje motivacional segun monto */}
                {items.length > 0 && (
                  <p className={[
                    "text-xs text-center py-1",
                    finalTotal < 40 ? "text-gray-400" :
                    finalTotal < 80 ? "text-green-600 dark:text-green-400" :
                    "text-amber-600 dark:text-amber-400 font-medium"
                  ].join(" ")}>
                    {finalTotal < 15 ? "🛒 Buen inicio" :
                     finalTotal < 40 ? "👍 Vas bien" :
                     finalTotal < 80 ? "💪 ¡Gran compra!" :
                     finalTotal < 150 ? "🎉 ¡Compra VIP!" :
                     "🏆 ¡Eres nuestro mejor cliente hoy!"}
                  </p>
                )}

                {/* Coupon input */}
                <div className="mb-3">
                  {!couponOpen ? (
                    <button
                      onClick={() => setCouponOpen(true)}
                      className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                    >
                      ¿Tienes un cupon?
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                        placeholder="Codigo de cupon"
                        maxLength={20}
                        className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs bg-white dark:bg-slate-800 dark:text-white"
                        onKeyDown={(e) => e.key === "Enter" && validateCoupon()}
                      />
                      <button
                        onClick={validateCoupon}
                        disabled={validatingCoupon || !couponCode.trim()}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {validatingCoupon ? "..." : "Aplicar"}
                      </button>
                    </div>
                  )}
                  {couponMsg && (
                    <p className={`text-xs mt-1 ${couponDiscount > 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {couponMsg}
                    </p>
                  )}
                  {couponDiscount > 0 && (
                    <p className="text-xs text-emerald-600 font-medium mt-1">
                      Descuento aplicado: -S/{couponDiscount.toFixed(2)}
                    </p>
                  )}
                </div>

                {/* Order Button — WhatsApp or Checkout depending on mode */}
                {mode === "checkout" ? (
                  <m.button
                    onClick={handleOrder}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    data-testid="checkout-button"
                    className="w-full flex items-center justify-center gap-3 rounded-xl bg-primary px-6 py-3 text-base font-bold text-white shadow-lg shadow-primary/25 hover:bg-primary-dark transition-all duration-200"
                  >
                    <Package className="h-5 w-5" />
                    Completar pedido
                  </m.button>
                ) : (

                  <m.button
                    onClick={() => setShowPreview(true)}
                    disabled={sending}
                    whileHover={{ scale: sending ? 1 : 1.02 }}
                    whileTap={{ scale: sending ? 1 : 0.97 }}
                    className="w-full flex items-center justify-center gap-3 rounded-2xl bg-[#25D366] px-6 py-4 text-base font-extrabold text-white shadow-xl shadow-[#25D366]/30 hover:bg-[#20BD5A] transition-all duration-200 disabled:opacity-70 disabled:cursor-wait"
                  >
                    {sending ? (
                      <>
                        <m.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}>
                          <Share2 className="h-5 w-5" />
                        </m.span>
                        Preparando imagen…
                      </>
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 shrink-0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347" /></svg>
                        Pedir por WhatsApp
                      </>
                    )}
                  </m.button>
                )}

                {/* Y4: WhatsApp message preview */}
                <AnimatePresence>
                  {showPreview && !sending && (
                    <m.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="rounded-2xl border border-[#25D366]/40 bg-[#ecfdf5] dark:bg-[#005c4b]/30 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-[#25D366] flex items-center justify-center shrink-0">
                            <svg viewBox="0 0 24 24" fill="white" className="h-4 w-4"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347" /></svg>
                          </div>
                          <p className="text-sm font-bold text-[#075e54] dark:text-emerald-300">Vista previa del pedido</p>
                        </div>
                        <div className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono leading-relaxed max-h-36 overflow-y-auto bg-white/60 dark:bg-black/20 rounded-xl px-3 py-2.5 border border-[#25D366]/20">
                          {`🛒 *Pedido — Buleje*\n\n${items.map(i => `• ${i.quantity}× ${i.name} — S/${(i.price * i.quantity).toFixed(2)}`).join("\n")}\n\n💰 *Total: S/${finalTotal.toFixed(2)}*${promo ? `\n🏷️ Descuento: -S/${discount.toFixed(2)}` : ""}${couponDiscount > 0 ? `\n🎟️ Cupón: -S/${couponDiscount.toFixed(2)}` : ""}`}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowPreview(false)}
                            className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-sm font-semibold text-muted hover:bg-white/50 transition-colors"
                          >
                            ← Editar
                          </button>
                          <button
                            onClick={() => { setShowPreview(false); handleOrder(); }}
                            className="flex-1 py-2.5 rounded-xl bg-[#25D366] text-white text-sm font-extrabold hover:bg-[#20BD5A] transition-colors shadow-lg shadow-[#25D366]/25"
                          >
                            Enviar ✓
                          </button>
                        </div>
                      </div>
                    </m.div>
                  )}
                </AnimatePresence>



                <AnimatePresence>
                  {sendResult && (
                    <m.div
                      key={sendResult}
                      initial={{ opacity: 0, y: 8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ type: "spring", damping: 22, stiffness: 300 }}
                      className={`rounded-xl border px-4 py-3.5 flex items-start gap-3 ${
                        sendResult === "shared"
                          ? "border-[#25D366]/30 bg-[#25D366]/8"
                          : sendResult === "clipboard"
                          ? "border-primary/25 bg-primary/6"
                          : "border-amber-300/50 bg-amber-50"
                      }`}
                    >
                      {sendResult === "shared" && <CheckCircle2 className="h-5 w-5 text-[#20BD5A] shrink-0 mt-0.5" />}
                      {sendResult === "clipboard" && <Clipboard className="h-5 w-5 text-primary shrink-0 mt-0.5" />}
                      {sendResult === "fallback" && <Download className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />}
                      <div>
                        {sendResult === "shared" && (
                          <>
                            <p className="text-sm font-bold text-[#157c3c]">¡Imagen enviada!</p>
                            <p className="text-xs text-foreground/70 mt-0.5">Selecciona el chat de Buleje en WhatsApp para enviar tu pedido.</p>
                          </>
                        )}
                        {sendResult === "clipboard" && (
                          <>
                            <p className="text-sm font-bold text-primary">Imagen copiada al portapapeles</p>
                            <p className="text-xs text-foreground/70 mt-0.5 leading-relaxed">WhatsApp se abrió con el texto del pedido. <strong>Pega la imagen con Ctrl+V</strong> en el chat antes de enviar.</p>
                          </>
                        )}
                        {sendResult === "fallback" && (
                          <>
                            <p className="text-sm font-bold text-amber-600">Imagen descargada</p>
                            <p className="text-xs text-foreground/70 mt-0.5">Adjunta el archivo PNG en el chat de WhatsApp antes de enviar el mensaje.</p>
                          </>
                        )}
                      </div>
                    </m.div>
                  )}
                </AnimatePresence>

                {/* "Didn't send" escape hatch — shown after fallback/clipboard result */}
                <AnimatePresence>
                  {(sendResult === "fallback" || sendResult === "clipboard") && (
                    <m.button
                      key="not-sent"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      onClick={() => { clearPendingOrder(); setSendResult(null); }}
                      className="w-full flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-muted hover:text-foreground hover:border-gray-300 hover:bg-gray-50 transition-all"
                    >
                      <MessageCircleOff className="h-4 w-4 shrink-0" />
                      No envie el mensaje por WhatsApp (Cerrar)
                    </m.button>
                  )}
                </AnimatePresence>
              </div>
            )}
          </m.aside>

          {/* Mejora 18: Modal de lista guardada */}
          {showSavedModal && savedCartCode && (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-6002 bg-black/50 flex items-center justify-center p-4"
              onClick={() => setShowSavedModal(false)}
            >
              <m.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-white dark:bg-card rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-gray-900 dark:text-foreground">Lista guardada</p>
                    <p className="text-xs text-gray-500 dark:text-muted">Valida por 7 dias</p>
                  </div>
                </div>
                <div className="bg-gray-50 dark:bg-surface rounded-xl px-4 py-3 text-center">
                  <p className="text-xs text-gray-500 dark:text-muted mb-1">Codigo:</p>
                  <p className="text-2xl font-extrabold text-primary tracking-wider">{savedCartCode}</p>
                </div>
                <p className="text-xs text-gray-500 dark:text-muted text-center">
                  Comparte este codigo para que alguien mas compre lo mismo
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowSavedModal(false)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-card-border text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-50 transition-colors"
                  >
                    Cerrar
                  </button>
                  <button
                    onClick={shareCartWhatsApp}
                    className="flex-1 py-2.5 rounded-xl bg-[#25D366] text-white text-sm font-bold hover:bg-[#20BD5A] transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    Compartir
                  </button>
                </div>
              </m.div>
            </m.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}
