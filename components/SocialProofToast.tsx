"use client";

import { useState, useEffect, useRef, startTransition } from "react";
import Image from "next/image";
import { ShoppingBag, X, Star } from "@buleje/design-system/icons";
import { useHasCompletedFirstOrder } from "@/hooks/use-first-order";
import { useStoreProducts } from "@/hooks/use-store-products";
import type { Product } from "@/data/products";
import { cn } from "@/lib/utils";

const NAMES = [
  "Mar\u00eda", "Carlos", "Ana", "Jos\u00e9", "Luc\u00eda", "Pedro", "Rosa",
  "Juan", "Carmen", "Luis", "Elena", "Miguel", "Diana", "Roberto",
  "Patricia", "Fernando", "Silvia", "Andr\u00e9s", "Teresa", "Ricardo",
];
const ZONES = [
  "Caller\u00eda", "Yarinacocha", "Manantay", "Campo Verde",
  "San Fernando", "9 de Octubre", "Las Palmeras",
];
const MINUTES_AGO = [2, 3, 5, 7, 10, 12, 15, 18, 20, 25];

// Mejora 15: Different message types for variety
type MessageType = "purchase" | "delivery" | "review";
const MESSAGE_TYPES: MessageType[] = ["purchase", "purchase", "purchase", "delivery", "review"];

type Notification = {
  id: number;
  name: string;
  zone: string;
  product: Product;
  minutesAgo: number;
  type: MessageType;
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateNotification(id: number, products: Product[]): Notification | null {
  if (products.length === 0) return null;
  return {
    id,
    name: pickRandom(NAMES),
    zone: pickRandom(ZONES),
    product: pickRandom(products),
    minutesAgo: pickRandom(MINUTES_AGO),
    type: pickRandom(MESSAGE_TYPES),
  };
}

export default function SocialProofToast() {
  const hasFirstOrder = useHasCompletedFirstOrder();
  const { products } = useStoreProducts();
  const [notification, setNotification] = useState<Notification | null>(null);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const counterRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks whether the user explicitly dismissed — prevents interval from re-showing
  const userDismissedRef = useRef(false);

  useEffect(() => {
    // Mejora 15: Check localStorage preference
    try {
      if (localStorage.getItem("social-proof-enabled") === "false") return;
    } catch { /* ignore */ }

    // Don't show during checkout
    if (typeof window !== "undefined" && window.location.pathname.includes("checkout")) return;

    // Only show social proof after user has completed their first order
    if (hasFirstOrder !== true) return;

    // SECURITY 2026-05-07 (audit bugs P0-1): cleanup correcto del setInterval.
    // Antes el `return () => clearInterval(interval)` vivía DENTRO del callback
    // del setTimeout — nunca era accesible al cleanup del useEffect, así que
    // intervals quedaban huérfanos al cambiar `products`/`hasFirstOrder`.
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const show = () => {
      if (userDismissedRef.current) return;
      counterRef.current += 1;
      startTransition(() => {
        const n = generateNotification(counterRef.current, products);
        if (!n) return;
        setNotification(n);
        setVisible(true);
        setDismissed(false);
      });
      // Auto-hide after 5s
      timerRef.current = setTimeout(() => {
        setVisible(false);
      }, 5000);
    };

    // Don't show on first 10s of page load to avoid being annoying
    const initialDelay = setTimeout(() => {
      show();
      // Show every 25-40s
      intervalId = setInterval(() => {
        show();
      }, 25000 + Math.random() * 15000);
    }, 10000);

    return () => {
      clearTimeout(initialDelay);
      if (intervalId) clearInterval(intervalId);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [hasFirstOrder, products]);

  if (products.length === 0 || !notification || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label="Actividad reciente de clientes"
      className={cn(
        "fixed bottom-54 sm:bottom-6 left-4 z-20 max-w-xs transition-all duration-[var(--dur-slow)] pointer-events-auto",
        visible
          ? "opacity-100 translate-y-0 translate-x-0"
          : "opacity-0 translate-y-4 -translate-x-4"
      )}
    >
      <div className="bg-[var(--surface-raised)] rounded-2xl shadow-[var(--shadow-xl)] border border-[var(--rule-base)] overflow-hidden">
        <div className="flex items-start gap-3 p-3">
          {/* Product image */}
          <div className="relative h-14 w-14 rounded-xl overflow-hidden bg-gray-50 shrink-0 border border-gray-100">
            {notification.product.image ? (
              <Image
                src={notification.product.image}
                alt={notification.product.name}
                fill
                className="object-cover"
                sizes="56px"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-gray-300">
                <ShoppingBag className="h-6 w-6" />
              </div>
            )}
          </div>

          {/* Text — varies by message type */}
          <div className="flex-1 min-w-0 pr-5">
            {notification.type === "review" ? (
              <>
                <p className="text-xs text-[var(--text-primary)] leading-snug">
                  <strong className="font-bold">{notification.name}</strong>{" "}
                  dejo una resena
                </p>
                <div className="flex items-center gap-0.5 mt-0.5">
                  {[1, 2, 3, 4, 5].map(s => (
                    <Star key={s} className="h-3 w-3 text-amber-400 fill-amber-400" />
                  ))}
                </div>
              </>
            ) : notification.type === "delivery" ? (
              <>
                <p className="text-xs text-[var(--text-primary)] leading-snug">
                  <strong className="font-bold">{notification.name}</strong> de{" "}
                  <span className="text-primary font-semibold">{notification.zone}</span>{" "}
                  pidio delivery
                </p>
                <p className="text-sm font-bold text-[var(--text-primary)] truncate mt-0.5">
                  {notification.product.name}
                </p>
              </>
            ) : (
              <>
                <p className="text-xs text-[var(--text-primary)] leading-snug">
                  <strong className="font-bold">{notification.name}</strong> de{" "}
                  <span className="text-primary font-semibold">{notification.zone}</span>{" "}
                  compro
                </p>
                <p className="text-sm font-bold text-[var(--text-primary)] truncate mt-0.5">
                  {notification.product.name}
                </p>
              </>
            )}
            <p className="text-[length:var(--ts-2xs)] text-muted mt-0.5">
              hace {notification.minutesAgo} minutos
            </p>
          </div>

          {/* Close button */}
          <button
            onClick={() => { userDismissedRef.current = true; setDismissed(true); }}
            className="absolute top-2 right-2 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-surface transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-3.5 w-3.5 text-muted" />
          </button>
        </div>

        {/* Bottom accent bar */}
        <div className="h-1" style={{ background: "linear-gradient(90deg, var(--accent), #ff6b5b)" }} />
      </div>
    </div>
  );
}
