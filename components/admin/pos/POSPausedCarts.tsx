"use client";

import { useState, useCallback } from "react";
import { Pause, Play, Trash2, ClipboardList, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface PausedCartItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  unit: string;
  discount?: number;
}

interface PausedCart {
  id: string;
  nombre: string;
  items: PausedCartItem[];
  timestamp: number;
  total: number;
}

interface CartItemLike {
  product: { id: number; name: string; price: number; unit: string; image?: string; [k: string]: unknown };
  quantity: number;
  discount?: number;
}

interface POSPausedCartsProps {
  currentCartItems: CartItemLike[];
  currentTotal: number;
  onPause: () => void; // called after saving — clear the cart
  onResume: (items: PausedCartItem[]) => void;
}

const STORAGE_KEY = "pos-paused-carts";
const MAX_PAUSED = 5;

function fmt(n: number) {
  return `S/${n.toFixed(2)}`;
}

function timeAgo(ts: number) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "hace un momento";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  return `hace ${Math.floor(diff / 86400)}d`;
}

function loadPaused(): PausedCart[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePaused(carts: PausedCart[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(carts));
}

export default function POSPausedCarts({
  currentCartItems,
  currentTotal,
  onPause,
  onResume,
}: POSPausedCartsProps) {
  const [paused, setPaused] = useState<PausedCart[]>(() => loadPaused());
  const [showList, setShowList] = useState(false);
  const [pauseName, setPauseName] = useState("");
  const [showNameInput, setShowNameInput] = useState(false);

  const handlePause = useCallback(() => {
    if (currentCartItems.length === 0) return;

    const cart: PausedCart = {
      id: `paused-${Date.now()}`,
      nombre: pauseName.trim() || `Carrito ${paused.length + 1}`,
      items: currentCartItems.map((i) => ({
        productId: i.product.id,
        name: i.product.name,
        price: i.product.price,
        quantity: i.quantity,
        image: i.product.image || "",
        unit: i.product.unit,
        discount: i.discount,
      })),
      timestamp: Date.now(),
      total: currentTotal,
    };

    const updated = [cart, ...paused].slice(0, MAX_PAUSED);
    setPaused(updated);
    savePaused(updated);
    setPauseName("");
    setShowNameInput(false);
    onPause();
  }, [currentCartItems, currentTotal, paused, pauseName, onPause]);

  const handleResume = useCallback(
    (cart: PausedCart) => {
      const updated = paused.filter((c) => c.id !== cart.id);
      setPaused(updated);
      savePaused(updated);
      setShowList(false);
      onResume(cart.items);
    },
    [paused, onResume]
  );

  const handleDelete = useCallback(
    (cartId: string) => {
      const updated = paused.filter((c) => c.id !== cartId);
      setPaused(updated);
      savePaused(updated);
    },
    [paused]
  );

  return (
    <>
      {/* Action buttons inline */}
      <div className="flex items-center gap-1.5">
        {currentCartItems.length > 0 && (
          <>
            {showNameInput ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={pauseName}
                  onChange={(e) => setPauseName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handlePause();
                    if (e.key === "Escape") setShowNameInput(false);
                  }}
                  placeholder="Nombre (opc.)"
                  className="w-24 px-2 py-1 text-xs border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg outline-none focus:border-primary text-[var(--text-primary)] dark:text-[var(--text-primary)]"
                  autoFocus
                />
                <button
                  onClick={handlePause}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  OK
                </button>
                <button
                  onClick={() => setShowNameInput(false)}
                  className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  if (paused.length >= MAX_PAUSED) {
                    // Max reached - pause directly
                    handlePause();
                  } else {
                    setShowNameInput(true);
                  }
                }}
                className="flex items-center gap-1 text-xs font-semibold text-[var(--data-warning-500)] hover:text-[var(--data-warning-500)] transition-colors"
                title="Pausar carrito"
              >
                <Pause className="h-3.5 w-3.5" />
                Pausar
              </button>
            )}
          </>
        )}

        {paused.length > 0 && (
          <button
            onClick={() => setShowList(!showList)}
            className={cn(
              "flex items-center gap-1 text-xs font-semibold transition-colors",
              showList
                ? "text-primary"
                : "text-[var(--text-secondary)] dark:text-muted hover:text-primary"
            )}
          >
            <ClipboardList className="h-3.5 w-3.5" />
            Pausadas ({paused.length})
          </button>
        )}
      </div>

      {/* Paused carts list */}
      {showList && paused.length > 0 && (
        <div className="mt-2 space-y-1.5 bg-gray-50 dark:bg-surface rounded-xl p-2 border border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
          {paused.map((cart) => (
            <div
              key={cart.id}
              className="flex items-center gap-2 p-2 bg-[var(--surface-raised)] rounded-lg border border-[var(--rule-soft)] dark:border-[var(--rule-base)] hover:border-primary/30 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">
                  {cart.nombre}
                </p>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">
                  {fmt(cart.total)} &middot; {cart.items.length}{" "}
                  {cart.items.length === 1 ? "item" : "items"} &middot;{" "}
                  {timeAgo(cart.timestamp)}
                </p>
              </div>
              <button
                onClick={() => handleResume(cart)}
                className="flex items-center gap-1 text-[length:var(--ts-xs)] font-bold text-primary hover:underline shrink-0"
              >
                <Play className="h-3 w-3" /> Retomar
              </button>
              <button
                onClick={() => handleDelete(cart.id)}
                className="p-1 text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors shrink-0"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
