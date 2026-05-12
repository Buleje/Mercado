"use client";

/**
 * LastOrderContext — guarda el snapshot del pedido recién realizado
 * (orderIds, items, customer, address, total) y controla el modal de
 * éxito + el badge en el navbar para reabrirlo.
 *
 * Persistencia: localStorage `marketplace-last-order`. El context se hidrata
 * en mount y refresca en navegaciones.
 *
 * Auto-open: cuando el snapshot tiene `autoOpen=true` (puesto por la página
 * /checkout/confirmar tras éxito), el modal aparece automáticamente al
 * cargar la siguiente vista (ej. /tiendas). Tras abrirse, se marca como
 * `autoOpen=false` para que no reaparezca al refrescar.
 *
 * Hide: si el pedido tiene >24h, lo ignoramos (badge no aparece).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface LastOrderItem {
  productId: number | string;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string;
  storeName: string;
  storeSlug: string;
}

export interface LastOrderSnapshot {
  orderIds: string[];
  ts: number;
  autoOpen: boolean;
  customer: { name: string; phone: string };
  address: {
    line: string;
    district?: string;
    province?: string;
    department?: string;
    notes?: string;
  };
  total: number;
  items: LastOrderItem[];
  storeNames: string[];
}

interface LastOrderValue {
  order: LastOrderSnapshot | null;
  /** True una vez que el provider terminó de leer localStorage. */
  hydrated: boolean;
  /** Si el modal de éxito está abierto en este momento. */
  modalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  /** Borra el pedido (descarta el snapshot — al despachar entrega real). */
  clear: () => void;
}

const STORAGE_KEY = "marketplace-last-order";
const TTL_MS = 24 * 60 * 60 * 1000; // 24h

function readSnapshot(): LastOrderSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastOrderSnapshot;
    if (!parsed.ts || Date.now() - parsed.ts > TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    if (!Array.isArray(parsed.items) || !Array.isArray(parsed.orderIds)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSnapshot(snap: LastOrderSnapshot | null) {
  if (typeof window === "undefined") return;
  try {
    if (snap) localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* silent */
  }
}

const LastOrderContext = createContext<LastOrderValue | null>(null);

export function LastOrderProvider({ children }: { children: ReactNode }) {
  const [order, setOrder] = useState<LastOrderSnapshot | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // Hidratación + auto-open al montar
  useEffect(() => {
    const snap = readSnapshot();
    setOrder(snap);
    setHydrated(true);
    if (snap?.autoOpen) {
      setModalOpen(true);
      // Marcamos autoOpen=false en localStorage para que no se vuelva a
      // abrir al recargar; el badge del nav sigue disponible.
      const updated: LastOrderSnapshot = { ...snap, autoOpen: false };
      writeSnapshot(updated);
      setOrder(updated);
    }
  }, []);

  // Sync entre pestañas
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setOrder(readSnapshot());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const openModal = useCallback(() => setModalOpen(true), []);
  const closeModal = useCallback(() => setModalOpen(false), []);
  const clear = useCallback(() => {
    writeSnapshot(null);
    setOrder(null);
    setModalOpen(false);
  }, []);

  const value = useMemo<LastOrderValue>(
    () => ({ order, hydrated, modalOpen, openModal, closeModal, clear }),
    [order, hydrated, modalOpen, openModal, closeModal, clear],
  );

  return <LastOrderContext.Provider value={value}>{children}</LastOrderContext.Provider>;
}

const NOOP_LAST_ORDER: LastOrderValue = {
  order: null,
  hydrated: true,
  modalOpen: false,
  openModal: () => {},
  closeModal: () => {},
  clear: () => {},
};

export function useLastOrder(): LastOrderValue {
  // MarketplaceNavbar (que monta OrderTrackerNavBadge + OrderSuccessModal) se
  // renderiza tambien en rutas (store)/* que usan StoreProviders — donde no
  // hay LastOrderProvider montado. Antes lanzabamos un Error y la ErrorBoundary
  // tumbaba el navbar entero. Ahora devolvemos defaults inertes: el badge se
  // oculta (order=null) y el modal nunca se abre.
  const ctx = useContext(LastOrderContext);
  return ctx ?? NOOP_LAST_ORDER;
}
