"use client";

/**
 * ActiveDeliveryWidget — widget flotante que aparece en cualquier página
 * cuando el cliente tiene un pedido activo ("preparando", "en camino",
 * "llegando"). Se integra encima del BottomNav sin interferir.
 *
 * UX:
 *   - Auto-visible si hay pedido "in-flight" detectado via polling API
 *   - Colapsa a un chip compacto cuando el usuario scrollea
 *   - Tap abre tracking completo en /tracking/{orderId}
 *   - Se puede cerrar con X (no vuelve a mostrar hasta nuevo pedido)
 *
 * Reduce ansiedad post-compra ("¿dónde está mi pedido?") y tickets a
 * soporte. Patrón de Rappi/PedidosYa que aumenta retención.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { Bike, Clock, X, Phone, ArrowRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface ActiveOrder {
  orderId: string;
  status: "preparando" | "asignado" | "recogido" | "en_camino" | "llegando" | "entregado";
  etaMinutes: number | null;
  repartidorName?: string;
  repartidorPhone?: string;
  storeName?: string;
}

interface Props {
  /** Endpoint que devuelve la orden activa o null */
  endpoint?: string;
  /** Polling interval en ms (default 20s) */
  pollMs?: number;
  /** Phone del cliente para filtrar la orden activa */
  customerPhone?: string | null;
}

const STORAGE_DISMISS_KEY = "buleje-active-delivery-dismissed";

const STATUS_CONFIG: Record<
  ActiveOrder["status"],
  { label: string; sub: string; tone: "accent" | "warn" | "neutral" }
> = {
  preparando: { label: "Preparando tu pedido", sub: "La bodega lo está armando", tone: "neutral" },
  asignado: { label: "Repartidor asignado", sub: "Está por ir a recogerlo", tone: "neutral" },
  recogido: { label: "Recogido, en camino", sub: "Sale para tu dirección", tone: "accent" },
  en_camino: { label: "En camino", sub: "Llega en minutos", tone: "accent" },
  llegando: { label: "¡Ya está llegando!", sub: "Prepará el pago", tone: "warn" },
  entregado: { label: "Entregado", sub: "Disfrutá tu pedido", tone: "neutral" },
};

export default function ActiveDeliveryWidget({
  endpoint = "/api/marketplace/me/active-delivery",
  pollMs = 20_000,
  customerPhone,
}: Props) {
  const [order, setOrder] = useState<ActiveOrder | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);
  const lastScrollRef = useRef<number>(0);

  // Cargar dismissed IDs de localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_DISMISS_KEY);
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr)) setDismissed(new Set(arr));
      }
    } catch {
      /* silent */
    }
  }, []);

  // Polling del pedido activo
  useEffect(() => {
    if (!customerPhone) return;

    let active = true;
    const controller = new AbortController();

    const fetchOrder = async () => {
      try {
        const res = await fetch(
          `${endpoint}?phone=${encodeURIComponent(customerPhone)}`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        const activeOrder: ActiveOrder | null = data.order ?? null;
        // Solo mostrar si hay orden y no fue dismissed
        if (activeOrder && !dismissed.has(activeOrder.orderId)) {
          setOrder(activeOrder);
        } else {
          setOrder(null);
        }
      } catch {
        /* silent */
      }
    };

    fetchOrder();
    const id = setInterval(fetchOrder, pollMs);

    return () => {
      active = false;
      controller.abort();
      clearInterval(id);
    };
  }, [customerPhone, endpoint, pollMs, dismissed]);

  // Colapsar en scroll down, expandir en scroll up
  useEffect(() => {
    const onScroll = () => {
      const current = window.scrollY;
      const diff = current - lastScrollRef.current;
      if (Math.abs(diff) > 50) {
        setCollapsed(diff > 0);
        lastScrollRef.current = current;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleDismiss = useCallback(() => {
    if (!order) return;
    setDismissed((prev) => {
      const next = new Set(prev).add(order.orderId);
      try {
        localStorage.setItem(STORAGE_DISMISS_KEY, JSON.stringify(Array.from(next)));
      } catch {
        /* silent */
      }
      return next;
    });
    setOrder(null);
  }, [order]);

  if (!order) return null;

  const config = STATUS_CONFIG[order.status];
  const toneClasses =
    config.tone === "accent"
      ? "bg-[var(--accent)] text-white"
      : config.tone === "warn"
      ? "bg-[var(--data-warning,_#eab308)] text-white"
      : "bg-[var(--text-primary)] text-[var(--surface-canvas)]";

  return (
    <div
      aria-label="Pedido en camino"
      className={cn(
        "fixed left-3 right-3 md:left-auto md:right-4 z-40 transition-all duration-300",
        // Posición: arriba del BottomNav en mobile (que está en bottom-0),
        // abajo-derecha flotante en desktop
        "bottom-20 md:bottom-20 md:w-[360px]",
        collapsed && "md:w-auto",
      )}
    >
      <div
        className={cn(
          "rounded-2xl shadow-xl overflow-hidden flex items-stretch transition-all",
          toneClasses,
        )}
      >
        {/* Icon bike animado */}
        <div className="flex items-center justify-center px-4 py-3 shrink-0">
          <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/20 backdrop-blur">
            <Bike className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            {(order.status === "en_camino" || order.status === "llegando") && (
              <span
                aria-hidden
                className="absolute inset-0 rounded-full border-2 border-white/40 animate-ping"
              />
            )}
          </span>
        </div>

        {/* Contenido */}
        {!collapsed && (
          <Link
            href={`/tracking/${order.orderId}`}
            className="flex-1 py-3 pr-2 flex items-center gap-2 min-w-0 hover:opacity-90"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-extrabold truncate">{config.label}</p>
              <p className="text-[length:var(--ts-2xs)] opacity-90 truncate">
                {order.etaMinutes !== null && order.etaMinutes > 0 ? (
                  <>
                    <Clock className="h-3 w-3 inline-block mr-1 -mt-0.5" strokeWidth={2} aria-hidden />
                    {order.etaMinutes} min · {config.sub}
                  </>
                ) : (
                  config.sub
                )}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 opacity-80" strokeWidth={2} aria-hidden />
          </Link>
        )}

        {/* Collapsed state — solo muestra ETA chip */}
        {collapsed && order.etaMinutes !== null && (
          <Link
            href={`/tracking/${order.orderId}`}
            className="px-3 py-3 text-sm font-extrabold tabular-nums"
            aria-label={`${config.label}, ${order.etaMinutes} minutos`}
          >
            {order.etaMinutes} min
          </Link>
        )}

        {/* Phone repartidor (solo expandido + en_camino) */}
        {!collapsed && order.repartidorPhone &&
          (order.status === "recogido" || order.status === "en_camino" || order.status === "llegando") && (
            <a
              href={`tel:${order.repartidorPhone}`}
              aria-label="Llamar al repartidor"
              className="inline-flex h-auto w-11 items-center justify-center border-l border-white/20 hover:bg-white/10 transition-colors"
            >
              <Phone className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </a>
          )}

        {/* Close */}
        {!collapsed && (
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Ocultar"
            className="inline-flex h-auto w-11 items-center justify-center border-l border-white/20 hover:bg-white/10 transition-colors shrink-0"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
