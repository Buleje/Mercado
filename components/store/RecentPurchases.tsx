"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------------ types ---

interface RecentOrder {
  id: string;
  customerName: string;
  items: { name: string; quantity: number }[];
  createdAt: string;
  status?: string;
}

// ----------------------------------------------------------------- utils ---

/** Oculta parte del nombre por privacidad: "Maria" -> "Mar***" */
function maskName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 2) return `${trimmed}***`;
  const visible = Math.min(3, Math.ceil(trimmed.length / 2));
  return `${trimmed.slice(0, visible)}***`;
}

/** Devuelve una cadena relativa simple: "hace X min / hora / dia" */
function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);

  if (mins < 2)   return "hace un momento";
  if (mins < 60)  return `hace ${mins} min`;
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${days} dia${days > 1 ? "s" : ""}`;
}

/** Toma el nombre del primer producto de un pedido */
function firstProduct(items: RecentOrder["items"]): string {
  if (!items || items.length === 0) return "un producto";
  return items[0].name;
}

// ------------------------------------------------------- banner item ---

interface BannerItem {
  id: string;
  text: string;
}

function buildBannerItem(order: RecentOrder): BannerItem {
  return {
    id: order.id,
    text: `${maskName(order.customerName)} compro ${firstProduct(order.items)} ${timeAgo(order.createdAt)}`,
  };
}

// ------------------------------------------------------------------ component ---

export default function RecentPurchases() {
  const [items, setItems]     = useState<BannerItem[]>([]);
  const [current, setCurrent] = useState(0);
  const [visible, setVisible] = useState(false);
  const [closed, setClosed]   = useState(false);
  const [entering, setEntering] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- fetch ----
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Check for admin session cookie before fetching — endpoint requires auth.
        // Without this check, the 401 response pollutes the browser console.
        if (!document.cookie.includes("admin-session")) return;
        const res = await fetch("/api/orders?limit=5&status=entregado");
        if (!res.ok) return;
        const data = await res.json();

        // El endpoint de orders devuelve { orders: [] } o un array directo
        const orders: RecentOrder[] = Array.isArray(data) ? data : (data.orders ?? []);

        if (cancelled || orders.length === 0) return;
        setItems(orders.map(buildBannerItem));
        setVisible(true);
        setEntering(true);
        setTimeout(() => setEntering(false), 400);
      } catch {
        // fallo silencioso — el banner es optional
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // ---- rotacion automatica cada 5s ----
  const rotate = useCallback(() => {
    if (items.length < 2) return;

    setEntering(false);
    setTimeout(() => {
      setCurrent((prev) => (prev + 1) % items.length);
      setEntering(true);
      setTimeout(() => setEntering(false), 400);
    }, 150);
  }, [items.length]);

  useEffect(() => {
    if (!visible || items.length < 2) return;

    timerRef.current = setTimeout(() => {
      rotate();
    }, 5_000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible, current, items.length, rotate]);

  // ---- nada que mostrar ----
  if (closed || items.length === 0 || !visible) return null;

  const item = items[current];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        "fixed bottom-6 left-4 z-40 flex max-w-xs items-center gap-3 rounded-xl",
        "border border-border bg-card px-4 py-3 shadow-lg",
        "dark:bg-card dark:border-border",
        "transition-all duration-[var(--dur-base)]",
        entering
          ? "translate-y-0 opacity-100"
          : "translate-y-2 opacity-90",
      )}
    >
      {/* icono bolsa */}
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/10">
        <svg
          className="h-4 w-4 text-[var(--accent)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
      </div>

      {/* texto */}
      <p className="flex-1 text-xs leading-snug text-foreground dark:text-foreground">
        {item.text}
      </p>

      {/* cerrar */}
      <button
        type="button"
        onClick={() => setClosed(true)}
        aria-label="Cerrar notificacion"
        className="ml-1 flex-shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground dark:text-muted dark:hover:text-foreground transition-colors"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
