"use client";

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { Product } from "@/data/products";
import { csrfHeaders } from "@/lib/csrf-client";

// Unique identifier for this browser tab — prevents BroadcastChannel self-echo loop
const TAB_ID = typeof crypto !== "undefined" ? crypto.randomUUID() : Math.random().toString(36).slice(2);

const MAX_QTY = 20;

// ── Shared AudioContext (one single instance, not per-click) ──────────────────
let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  try {
    if (!_audioCtx || _audioCtx.state === "closed") {
      _audioCtx = new AudioContext();
    }
    return _audioCtx;
  } catch {
    return null;
  }
}

function playPopSound() {
  const ac = getAudioCtx();
  if (!ac) return;
  // Resume if suspended (browser autoplay policy)
  if (ac.state === "suspended") ac.resume().catch(() => {});
  try {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1400, ac.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 0.12);
  } catch { /* audio not available */ }
}

// ── Per-provider BroadcastChannel factory ───────────────────────────────────
// Each CartProvider instantiates its own channel via useRef; the channel's
// lifecycle follows the provider's (not a module-global singleton). This fixes
// the bug where a marketplace layout with CartProvider tenantSlug="main" co-
// existing with per-store providers would close each other's channels on
// navigation, breaking multi-tab sync intermittently.
function createBroadcastChannel(slug: string): BroadcastChannel | null {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) return null;
  try {
    return new BroadcastChannel(`buleje-cart-sync-${slug}`);
  } catch {
    return null;
  }
}

/** Build a tenant-scoped localStorage key: buleje-{slug}-{key} */
function sk(slug: string, key: string): string {
  return slug ? `buleje-${slug}-${key}` : `buleje-${key}`;
}

export type CartItem = Product & {
  quantity: number;
  note?: string;
  /**
   * Slug del tenant donde se añadió el item al cart. Permite descartar
   * items "fantasma" cuando el usuario navega entre storefronts. Items
   * legacy (sin slug) se asumen del tenant actual. Ver ADR-096.
   */
  storeSlug?: string;
};

type CartState = {
  items: CartItem[];
  isOpen: boolean;
  hasPendingOrder: boolean;
  confirmModalOpen: boolean;
  confirmFromCheckout: boolean;
  checkoutOpen: boolean;
};

type CartAction =
  | { type: "ADD_ITEM"; payload: Product }
  | { type: "ADD_MULTIPLE"; payload: { product: Product; quantity: number }[] }
  | { type: "REMOVE_ITEM"; payload: number }
  | { type: "UPDATE_QTY"; payload: { id: number; qty: number } }
  | { type: "CLEAR" }
  | { type: "TOGGLE" }
  | { type: "OPEN" }
  | { type: "CLOSE" }
  | { type: "HYDRATE"; payload: CartItem[] }
  | { type: "MARK_ORDER_PENDING" }
  | { type: "CLEAR_PENDING_ORDER" }
  | { type: "OPEN_CONFIRM_MODAL"; fromCheckout?: boolean }
  | { type: "CLOSE_CONFIRM_MODAL" }
  | { type: "OPEN_CHECKOUT" }
  | { type: "CLOSE_CHECKOUT" }
  | { type: "SET_ITEM_NOTE"; payload: { id: number; note: string } };

function reducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "MARK_ORDER_PENDING":
      return { ...state, hasPendingOrder: true };
    case "CLEAR_PENDING_ORDER":
      return { ...state, hasPendingOrder: false, confirmModalOpen: false, confirmFromCheckout: false };
    case "OPEN_CONFIRM_MODAL":
      return { ...state, confirmModalOpen: true, confirmFromCheckout: action.fromCheckout ?? false };
    case "CLOSE_CONFIRM_MODAL":
      return { ...state, confirmModalOpen: false, confirmFromCheckout: false };
    case "OPEN_CHECKOUT":
      return { ...state, checkoutOpen: true, isOpen: false };
    case "CLOSE_CHECKOUT":
      return { ...state, checkoutOpen: false };
    case "ADD_ITEM": {
      const existing = state.items.find((i) => i.id === action.payload.id);
      if (existing) {
        if (existing.quantity >= MAX_QTY) return state;
        return {
          ...state,
          items: state.items.map((i) =>
            i.id === action.payload.id ? { ...i, quantity: i.quantity + 1 } : i
          ),
        };
      }
      return {
        ...state,
        items: [...state.items, { ...action.payload, quantity: 1 }],
      };
    }
    case "ADD_MULTIPLE": {
      const items = [...state.items];
      for (const entry of action.payload) {
        const idx = items.findIndex((i) => i.id === entry.product.id);
        if (idx >= 0) {
          items[idx] = { ...items[idx], quantity: Math.min(items[idx].quantity + entry.quantity, MAX_QTY) };
        } else {
          items.push({ ...entry.product, quantity: Math.min(entry.quantity, MAX_QTY) });
        }
      }
      return { ...state, items };
    }
    case "REMOVE_ITEM":
      return { ...state, items: state.items.filter((i) => i.id !== action.payload) };
    case "UPDATE_QTY": {
      if (action.payload.qty <= 0) {
        return { ...state, items: state.items.filter((i) => i.id !== action.payload.id) };
      }
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === action.payload.id ? { ...i, quantity: Math.min(action.payload.qty, MAX_QTY) } : i
        ),
      };
    }
    case "CLEAR":
      return { ...state, items: [] };
    case "TOGGLE":
      return { ...state, isOpen: !state.isOpen };
    case "OPEN":
      return { ...state, isOpen: true };
    case "CLOSE":
      return { ...state, isOpen: false };
    case "HYDRATE":
      return { ...state, items: action.payload };
    case "SET_ITEM_NOTE":
      return { ...state, items: state.items.map(i => i.id === action.payload.id ? { ...i, note: action.payload.note || undefined } : i) };
    default:
      return state;
  }
}

type CartCtx = {
  items: CartItem[];
  isOpen: boolean;
  count: number;
  total: number;
  hasPendingOrder: boolean;
  confirmModalOpen: boolean;
  confirmFromCheckout: boolean;
  checkoutOpen: boolean;
  markOrderPending: () => void;
  clearPendingOrder: () => void;
  openConfirmModal: (fromCheckout?: boolean) => void;
  closeConfirmModal: () => void;
  openCheckout: () => void;
  closeCheckout: () => void;
  addItem: (p: Product) => void;
  addMultiple: (items: { product: Product; quantity: number }[]) => void;
  removeItem: (id: number) => void;
  updateQty: (id: number, qty: number) => void;
  setItemNote: (id: number, note: string) => void;
  clear: () => void;
  toggle: () => void;
  open: () => void;
  close: () => void;
};

const CartContext = createContext<CartCtx | null>(null);

const defaultState: CartState = { items: [], isOpen: false, hasPendingOrder: false, confirmModalOpen: false, confirmFromCheckout: false, checkoutOpen: false };

export function CartProvider({ children, tenantSlug = "main" }: { children: ReactNode; tenantSlug?: string }) {
  const [state, dispatch] = useReducer(reducer, defaultState);
  const hydratedRef = useRef(false);
  const slugRef = useRef(tenantSlug);
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Latest state via ref — necesario para que callbacks asíncronos (validación
  // de productos, fetch sync) lean el state ACTUAL en vez del que tenían en
  // closure cuando se dispararon. Antes: addItem mientras la validación estaba
  // in-flight → el .then(HYDRATE) clobbeaba el item recién agregado (parpadeo).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // FIX 2026-05-07: Set de productIds válidos del tenant actual.
  // Se popula al cambiar tenantSlug (y al hidratar). Permite rechazar adds
  // de productos que NO pertenecen al tenant — defensa final contra el
  // bug "carrito con productos cross-tenant" sin pasar por el checkout.
  const validProductIdsRef = useRef<Set<number> | null>(null);

  // Mantener slugRef sincronizado en un effect (no se puede mutar refs en render — react-hooks/refs)
  useEffect(() => {
    slugRef.current = tenantSlug;
  }, [tenantSlug]);

  // FIX 2026-05-07: cargar Set de productIds válidos del tenant para que
  // addItem pueda rechazar productos cross-tenant antes de añadirlos.
  // Fire-and-forget; si falla, addItem permite todo (no romper UX).
  //
  // Audit 2026-05-17 01-P1-9: en tenantSlug==="main" (marketplace global)
  // intencionalmente NO filtramos por ids del tenant porque el carrito
  // agrega productos de múltiples tiendas (cross-store). La validación de
  // pertenencia se hace SIEMPRE en backend (lib/db/orders.db.ts +
  // marketplace/orders endpoint validan storeId/tenantId server-side).
  // Si llegara un id de otro tenant, backend rechaza con 422; lo único que
  // se degrada es UX (no se filtra previo a la POST). NO es bypass de
  // tenant isolation — es trade-off de UX explícito documentado.
  useEffect(() => {
    const s = tenantSlug;
    if (!s || s === "main") {
      validProductIdsRef.current = null; // marketplace cross-store: backend valida
      return;
    }
    // FIX 2026-05-07 (P0 #5): se eliminó un fetch "fantasma" a
    //   /api/marketplace/products/check-exists?ids=&listAll=1
    // que descartaba el resultado, no tenía AbortController, y llamaba al
    // endpoint con `ids` vacío (que retorna inmediatamente {existingIds:[]}).
    // Solo gastaba conexiones y latencia. /api/products?active=true es la
    // fuente real de validProductIdsRef.
    const controller = new AbortController();
    fetch("/api/products?active=true", { cache: "no-store", signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then((data: unknown) => {
        if (!Array.isArray(data)) return;
        const ids = new Set<number>(data.map((p: { id?: number }) => p.id).filter((n): n is number => typeof n === "number"));
        validProductIdsRef.current = ids;
      })
      .catch(() => { /* sin filtro si falla o aborta */ });
    return () => { controller.abort(); };
  }, [tenantSlug]);

  // Hydrate from localStorage when tenantSlug changes (and on mount).
  // Deps [tenantSlug] — al cambiar de tienda, reset del state y abort del fetch
  // para que no pise el carrito nuevo con datos de la tienda anterior.
  useEffect(() => {
    const s = tenantSlug;
    hydratedRef.current = false;
    dispatch({ type: "CLEAR" });
    const controller = new AbortController();

    try {
      const saved = localStorage.getItem(sk(s, "cart"));
      const rawItems = saved ? JSON.parse(saved) : [];
      // ADR-096: descartar items con storeSlug distinto al tenant actual.
      // Items legacy (sin storeSlug) se preservan — pertenecen al tenant
      // actual por convención. Determinístico, no requiere fetch.
      const items = Array.isArray(rawItems)
        ? rawItems.filter((i: CartItem) => !i.storeSlug || i.storeSlug === s)
        : [];
      if (items.length !== (rawItems?.length ?? 0)) {
        // Persistir el cart limpio para que la próxima hidratación sea consistente.
        localStorage.setItem(sk(s, "cart"), JSON.stringify(items));
      }
      if (Array.isArray(items) && items.length > 0) {
        dispatch({ type: "HYDRATE", payload: items });

        /* cart-hydration-patch-v1 */
        // Validate cart items still exist in DB — remove stale/deleted products.
        //
        // Endpoint: /api/marketplace/products/check-exists cruza stores (marketplace
        // multi-tenant). El endpoint legacy /api/products?active=true solo devuelve
        // productos del tenant "main" → borraba el carrito al hidratar si los items
        // venían de otros stores. Bug 2026-04-19.
        //
        // Guard: si por alguna razón la respuesta no es confiable (empty, error),
        // NUNCA borrar el carrito entero. Ver
        // .github/instructions/state-management.instructions.md.
        const originalIds = new Set<number>(items.map((i: CartItem) => i.id));
        const idsQuery = items.map((i: CartItem) => i.id).join(",");
        // FIX 2026-05-07: cuando el carrito está en un storefront tenant-scoped
        // (no en /marketplace cross-store), pasamos tenantSlug para que la
        // validación filtre productos del tenant correcto. Antes el endpoint
        // siempre era cross-store → preservaba productos fantasma de otros
        // tenants en el carrito y el checkout fallaba con invalid_product.
        const isMarketplaceContext = typeof window !== "undefined"
          && window.location.pathname.startsWith("/marketplace");
        const tenantParam = !isMarketplaceContext && s !== "main"
          ? `&tenantSlug=${encodeURIComponent(s)}`
          : "";
        fetch(`/api/marketplace/products/check-exists?ids=${idsQuery}${tenantParam}`, { signal: controller.signal })
          .then(r => r.ok ? r.json() : null)
          .then((data: { existingIds?: number[]; missingIds?: number[] } | null) => {
            if (!data || !Array.isArray(data.existingIds)) return;
            const existing = new Set<number>(data.existingIds);

            // Guard: preservar carrito si TODOS "desaparecerían" (señal dudosa)
            // SOLO en modo cross-store (sin tenantSlug filter). Cuando el filter
            // tenant-scoped está activo, "todos invalidos" es determinístico
            // (productos de otro tenant) → SÍ debemos limpiarlos para que
            // checkout no falle con invalid_product.
            const validOriginals = items.filter((item: CartItem) => existing.has(item.id));
            if (validOriginals.length === 0 && items.length > 0 && !tenantParam) return;

            // BUGFIX 2026-05-05: leer state ACTUAL via ref. Si el usuario agregó
            // items mientras el fetch estaba in-flight, NO los borramos.
            // Solo filtramos los ORIGINALES que ahora son inválidos; items
            // nuevos (no estaban en originalIds) se preservan tal cual.
            const current = stateRef.current.items;
            const merged = current.filter(
              (item) => !originalIds.has(item.id) || existing.has(item.id),
            );

            if (merged.length !== current.length) {
              dispatch({ type: "HYDRATE", payload: merged });
              localStorage.setItem(sk(s, "cart"), JSON.stringify(merged));
            }
          })
          .catch(() => { /* silently ignore — cart stays as-is or fetch aborted */ });
      }
      if (localStorage.getItem(sk(s, "pending")) === "1") {
        dispatch({ type: "MARK_ORDER_PENDING" });
      }
      // Check for reorder items (set from /cuenta page)
      const reorder = localStorage.getItem(sk(s, "reorder"));
      if (reorder) {
        localStorage.removeItem(sk(s, "reorder"));
        const reorderItems = JSON.parse(reorder);
        if (Array.isArray(reorderItems) && reorderItems.length > 0) {
          dispatch({
            type: "ADD_MULTIPLE",
            payload: reorderItems.map((r: { id: number; name: string; price: number; image: string; unit: string; category: string; quantity: number }) => ({
              product: { id: r.id, name: r.name, price: r.price, image: r.image, unit: r.unit, category: r.category },
              quantity: r.quantity,
            })),
          });
          // Auto-open cart to show the added items
          setTimeout(() => dispatch({ type: "OPEN" }), 300);
        }
      }
    } catch {}
    // Mark hydration complete AFTER all dispatches above
    hydratedRef.current = true;

    return () => { controller.abort(); };
  }, [tenantSlug]);

  // Multi-tab cart sync with BroadcastChannel API.
  // Canal per-provider via channelRef; lifecycle atado al tenantSlug.
  // Al cambiar slug: close() del canal anterior + re-instancia con slug nuevo.
  useEffect(() => {
    const channel = createBroadcastChannel(tenantSlug);
    channelRef.current = channel;
    if (!channel) return;

    // Listen to messages from other tabs (skip own messages to avoid self-echo loop)
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== "object") return;
      if (event.data.tabId === TAB_ID) return;

      const { type, payload } = event.data;

      switch (type) {
        case "CART_UPDATE":
          // Sync cart items from another tab
          if (Array.isArray(payload)) {
            dispatch({ type: "HYDRATE", payload });
          }
          break;
        case "CART_CLEAR":
          dispatch({ type: "CLEAR" });
          break;
        case "PENDING_STATUS":
          if (payload === true) {
            dispatch({ type: "MARK_ORDER_PENDING" });
          } else {
            dispatch({ type: "CLEAR_PENDING_ORDER" });
          }
          break;
      }
    };

    channel.addEventListener("message", handleMessage);

    return () => {
      channel.removeEventListener("message", handleMessage);
      try { channel.close(); } catch { /* ok */ }
      channelRef.current = null;
    };
  }, [tenantSlug]);

  // Persist to localStorage — only after hydration to prevent overwriting saved cart
  useEffect(() => {
    if (!hydratedRef.current) return;
    const s = slugRef.current;
    localStorage.setItem(sk(s, "cart"), JSON.stringify(state.items));
    // Track last-modified timestamp for abandoned-cart recovery
    if (state.items.length > 0) {
      localStorage.setItem(sk(s, "cart-ts"), Date.now().toString());
    } else {
      localStorage.removeItem(sk(s, "cart-ts"));
      localStorage.removeItem(sk(s, "cart-dismissed"));
    }

    // Broadcast cart changes to other tabs (provider-scoped channel)
    const channel = channelRef.current;
    if (channel) {
      try {
        channel.postMessage({ type: "CART_UPDATE", payload: state.items, tabId: TAB_ID });
      } catch { /* Silently fail */ }
    }
  }, [state.items]);

  // Sync cart to server when customer is identified (debounced).
  //
  // `/api/cart/[phone]` require un HMAC token firmado server-side (RED-009)
  // que devuelve 404 anti-oracle si falta. El token se guarda en localStorage
  // bajo `cart-token` cuando el flujo server-side identifica al cliente.
  // Si no existe token, el sync es opt-in: NO disparamos el fetch para evitar
  // 404 constantes en console + consumo inutil de red.
  useEffect(() => {
    if (!hydratedRef.current) return;
    const s = slugRef.current;
    const phone = (() => {
      try {
        const c = localStorage.getItem(sk(s, "customer"));
        if (c) { const p = JSON.parse(c); return p?.phone?.replace(/\D/g, ""); }
      } catch { /* ignore */ }
      return null;
    })();
    if (!phone || phone.length < 6 || state.items.length === 0) return;

    // Gate anti-404: sin token HMAC, el endpoint devuelve 404 por diseno.
    const token = (() => {
      try { return localStorage.getItem(sk(s, "cart-token")); }
      catch { return null; }
    })();
    if (!token) return;

    const timeout = setTimeout(() => {
      fetch(`/api/cart/${encodeURIComponent(phone)}?token=${encodeURIComponent(token)}`, {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ items: state.items }),
      }).catch(() => { /* silent — local cart is primary */ });
    }, 2000); // 2s debounce

    return () => clearTimeout(timeout);
  }, [state.items]);

  // On mount: si el customer esta identificado Y tenemos cart-token, intenta
  // restaurar desde servidor cuando el carrito local esta vacio. Sin token,
  // saltamos el fetch (mismo criterio que el sync de arriba).
  useEffect(() => {
    const s = slugRef.current;
    const phone = (() => {
      try {
        const c = localStorage.getItem(sk(s, "customer"));
        if (c) { const p = JSON.parse(c); return p?.phone?.replace(/\D/g, ""); }
      } catch { /* ignore */ }
      return null;
    })();
    if (!phone || phone.length < 6) return;

    const localCart = localStorage.getItem(sk(s, "cart"));
    const localItems = localCart ? JSON.parse(localCart) : [];
    if (Array.isArray(localItems) && localItems.length > 0) return; // local has items, skip

    // Gate anti-404: sin token HMAC, el endpoint devuelve 404 por diseno.
    const token = (() => {
      try { return localStorage.getItem(sk(s, "cart-token")); }
      catch { return null; }
    })();
    if (!token) return;

    fetch(`/api/cart/${encodeURIComponent(phone)}?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.items) && data.items.length > 0) {
          // FIX 2026-05-07: filtrar items que NO son del tenant actual.
          // El endpoint /api/cart/[phone] guarda carrito por phone (no por
          // tenant), así que puede restaurar items del tenant equivocado.
          // Si validProductIdsRef está cargado, solo aceptamos IDs del tenant.
          const valid = validProductIdsRef.current;
          const filtered = valid
            ? data.items.filter((it: { id?: number }) => typeof it.id === "number" && valid.has(it.id))
            : data.items;
          if (filtered.length > 0) {
            dispatch({ type: "HYDRATE", payload: filtered });
          }
        }
      })
      .catch(() => { /* silent */ });
  }, []);

  useEffect(() => {
    const s = slugRef.current;
    localStorage.setItem(sk(s, "pending"), state.hasPendingOrder ? "1" : "0");

    // Broadcast pending status to other tabs (provider-scoped channel)
    const channel = channelRef.current;
    if (channel) {
      try {
        channel.postMessage({ type: "PENDING_STATUS", payload: state.hasPendingOrder, tabId: TAB_ID });
      } catch { /* Silently fail */ }
    }
  }, [state.hasPendingOrder]);

  const count = state.items.reduce((acc, i) => acc + i.quantity, 0);
  const total = state.items.reduce((acc, i) => acc + i.price * i.quantity, 0);

  const addItem = useCallback((p: Product) => {
    // FIX 2026-05-07: defensa final contra cross-tenant items. Si validIds
    // está cargado (del tenant actual via /api/products) y el productId NO
    // está en el set, RECHAZAR el add y mostrar warning. Si validIds es null
    // (aún cargando o tenant 'main' legacy), permitir todo. Esto evita el
    // bug "carrito con productos fantasma" que llegaban al checkout y daban
    // 400 invalid_product.
    const valid = validProductIdsRef.current;
    if (valid && typeof p.id === "number" && !valid.has(p.id)) {
      // No añadir + log para diagnóstico. UI puede mostrar toast desde el
      // caller si quiere (no spammeamos toasts desde acá).
      if (typeof console !== "undefined") {
        console.warn("[cart] rechazando add: producto no pertenece al tenant actual", {
          productId: p.id,
          tenantSlug: slugRef.current,
        });
      }
      return;
    }
    // ADR-096: tag con slug actual para descartar después si el usuario
    // navega a otro storefront. El reducer hace `{ ...payload, quantity: 1 }`
    // por lo que `storeSlug` se persiste tal cual en el item.
    dispatch({ type: "ADD_ITEM", payload: { ...p, storeSlug: slugRef.current } as Product });
    playPopSound();
  }, []);
  const addMultiple = useCallback(
    (items: { product: Product; quantity: number }[]) =>
      dispatch({
        type: "ADD_MULTIPLE",
        payload: items.map((i) => ({
          product: { ...i.product, storeSlug: slugRef.current } as Product,
          quantity: i.quantity,
        })),
      }),
    [],
  );
  const removeItem = useCallback((id: number) => dispatch({ type: "REMOVE_ITEM", payload: id }), []);
  const updateQty = useCallback(
    (id: number, qty: number) => dispatch({ type: "UPDATE_QTY", payload: { id, qty } }),
    []
  );
  const setItemNote = useCallback((id: number, note: string) => dispatch({ type: "SET_ITEM_NOTE", payload: { id, note } }), []);
  const clear = useCallback(() => dispatch({ type: "CLEAR" }), []);
  const toggle = useCallback(() => dispatch({ type: "TOGGLE" }), []);
  const openCart = useCallback(() => dispatch({ type: "OPEN" }), []);
  const close = useCallback(() => dispatch({ type: "CLOSE" }), []);
  const markOrderPending = useCallback(() => dispatch({ type: "MARK_ORDER_PENDING" }), []);
  const clearPendingOrder = useCallback(() => dispatch({ type: "CLEAR_PENDING_ORDER" }), []);
  const openConfirmModal = useCallback((fromCheckout = false) => dispatch({ type: "OPEN_CONFIRM_MODAL", fromCheckout }), []);
  const closeConfirmModal = useCallback(() => dispatch({ type: "CLOSE_CONFIRM_MODAL" }), []);
  const openCheckout = useCallback(() => dispatch({ type: "OPEN_CHECKOUT" }), []);
  const closeCheckout = useCallback(() => dispatch({ type: "CLOSE_CHECKOUT" }), []);

  // audit P0 #6 (Brandon 2026-05-18): memoizar value para evitar
  // re-render en cadena de TODA app con cart. Antes value={{...}} creaba
  // referencia nueva cada render del provider (causado por dispatch,
  // audio, sync BroadcastChannel) → todos los consumers re-renderizaban.
  // Deps: state granular + callbacks (callbacks ya son estables por useCallback).
  const value = useMemo(
    () => ({
      items: state.items,
      isOpen: state.isOpen,
      count,
      total,
      hasPendingOrder: state.hasPendingOrder,
      confirmModalOpen: state.confirmModalOpen,
      confirmFromCheckout: state.confirmFromCheckout,
      checkoutOpen: state.checkoutOpen,
      markOrderPending,
      clearPendingOrder,
      openConfirmModal,
      closeConfirmModal,
      openCheckout,
      closeCheckout,
      addItem,
      addMultiple,
      removeItem,
      updateQty,
      setItemNote,
      clear,
      toggle,
      open: openCart,
      close,
    }),
    [
      state.items,
      state.isOpen,
      state.hasPendingOrder,
      state.confirmModalOpen,
      state.confirmFromCheckout,
      state.checkoutOpen,
      count,
      total,
      markOrderPending,
      clearPendingOrder,
      openConfirmModal,
      closeConfirmModal,
      openCheckout,
      closeCheckout,
      addItem,
      addMultiple,
      removeItem,
      updateQty,
      setItemNote,
      clear,
      toggle,
      openCart,
      close,
    ],
  );

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be inside CartProvider");
  return ctx;
}
