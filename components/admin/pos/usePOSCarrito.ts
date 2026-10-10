import { useState, useEffect, useCallback, useRef } from "react";
import { logger } from "@/lib/logger";
import { estaAgotado } from "@/lib/pos/stock-vendible";
import type { Product, CartItem, StockAlert } from "@/components/admin/pos/pos-shared";
import { useTopeDescuentoCajero } from "@/components/admin/pos/useTopeDescuentoCajero";

interface UsePOSCarritoOpciones {
  products: Product[];
  addToRecents: (productId: number) => void;
  playDing: () => void;
  playError: () => void;
}

/** El carrito del POS: líneas, descuentos, cola de clientes, avisos de stock y totales de vista previa. */
export function usePOSCarrito({ products, addToRecents, playDing, playError }: UsePOSCarritoOpciones) {
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
  const [globalDiscount, setGlobalDiscount] = useState<{ monto: number; porcentaje: number }>({ monto: 0, porcentaje: 0 });
  const [clientQueues, setClientQueues] = useState<CartItem[][]>([]);
  const [stockAlert, setStockAlert] = useState<StockAlert | null>(null);
  /* «Aplicar −10 %» de lo que vence: un cajero no pasa su tope de Ajustes (si no, la línea sale en rojo y el cobro da 403). */
  const tope = useTopeDescuentoCajero();
  const topeRef = useRef(tope);
  useEffect(() => {
    topeRef.current = tope;
  }, [tope]);
  const [showZeroStockConfirm, setShowZeroStockConfirm] = useState<Product | null>(null);
  const [lastAddedId, setLastAddedId] = useState<number | null>(null);
  const lastAddedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const updateDiscount = useCallback((productId: number, discount: number) => {
    setCart(prev => prev.map(i => 
      i.product.id === productId ? { ...i, discount: Math.min(100, Math.max(0, discount)) } : i
    ));
  }, []);

  const addToCart = useCallback((product: Product) => {
    addToRecents(product.id);

    // Mejora 7: Alerta de stock cero — pedir confirmacion
    if (estaAgotado(product)) {
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
            actionLabel: `Aplicar -${descuentoPorVencer(topeRef.current)}%`,
            actionFn: () => {
              const d = descuentoPorVencer(topeRef.current);
              setCart(prev => prev.map(i =>
                i.product.id === product.id ? { ...i, discount: d } : i
              ));
              setStockAlert(null);
            },
          });
          setTimeout(() => setStockAlert(curr => curr?.message?.includes('vence') ? null : curr), 8000);
        }
      })
      .catch((err) => logger.error("[pos-stock-alert] fetch failed", { error: String(err) }));

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

  // Vista previa: el total que vale es el que devuelve /api/sales.
  const cartSubtotal = cart.reduce((s, i) => {
    const discountMultiplier = 1 - (i.discount || 0) / 100;
    return s + i.product.price * i.quantity * discountMultiplier;
  }, 0);
  const cartTotal = Math.max(0, cartSubtotal - globalDiscount.monto);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

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
  }, [cart, clientQueues]);

  const removeFromQueue = useCallback((index: number) => {
    setClientQueues(prev => prev.filter((_, i) => i !== index));
  }, []);

  /**
   * Agrega desde el buscador o el dictado. La `quantity` importa: el dictado
   * dice «2 tablas» y esto agregaba UNA — la cantidad hablada se perdía en el
   * camino y el cajero tenía que corregirla a mano en el carrito.
   */
  const handleAddFromSearch = useCallback((productId: number, quantity = 1) => {
    const p = products.find(pr => pr.id === productId);
    if (!p) return;
    const veces = Math.max(1, Math.round(quantity));
    for (let i = 0; i < veces; i++) addToCart(p);
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
  }, [products, addToCart]);

  return {
    cart, setCart, addToCart, forceAddZeroStock, updateQuantity, removeFromCart, clearCart, updateDiscount,
    lastAddedId, stockAlert, setStockAlert, showZeroStockConfirm, setShowZeroStockConfirm,
    globalDiscount, setGlobalDiscount, clientQueues, setClientQueues, enqueueClient, loadFromQueue, removeFromQueue,
    handleAddFromSearch, handlePauseCart, handleResumeCart, handleRepeatOrder, cartSubtotal, cartTotal, cartCount,
  };
}

export type POSCarrito = ReturnType<typeof usePOSCarrito>;

/** El −10 % de lo que vence, sin pasar el tope del cajero (admin/dueño: 10). */
function descuentoPorVencer(t: { pct: number; sinTope: boolean }): number {
  return t.sinTope ? 10 : Math.min(10, t.pct);
}
