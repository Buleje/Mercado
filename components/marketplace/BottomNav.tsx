"use client";

/**
 * BottomNav — Barra de navegación inferior estilo PedidosYa.
 *
 * Visible solo en mobile (sm:hidden). Oculta al hacer scroll hacia abajo,
 * reaparece al hacer scroll hacia arriba. Safe area padding para notch.
 *
 * Tabs:
 *   - Tiendas (home del marketplace)
 *   - Buscar (página dedicada)
 *   - Carrito (con badge cuando hay items)
 *   - Cuenta (gate auth automático)
 *
 * Adapta al modo `tiendas-only`: el tab principal lleva a /tiendas.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Search,
  ShoppingCart,
  User,
  Store as StoreIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { useMarketplaceNavMode } from "@/hooks/use-marketplace-nav-mode";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type TabId = "tiendas" | "buscar" | "carrito" | "cuenta";

interface Tab {
  id: TabId;
  label: string;
  Icon: React.ElementType;
}

const TABS: Tab[] = [
  { id: "tiendas", label: "Tiendas", Icon: StoreIcon },
  { id: "buscar", label: "Buscar", Icon: Search },
  { id: "carrito", label: "Carrito", Icon: ShoppingCart },
  { id: "cuenta", label: "Cuenta", Icon: User },
];

// ── Hook: ocultar al bajar scroll / mostrar al subir ──────────────────────────

function useScrollHide() {
  const [visible, setVisible] = useState(true);
  const lastY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const currentY = window.scrollY;
        if (currentY < 50) {
          setVisible(true);
        } else if (currentY > lastY.current + 4) {
          setVisible(false);
        } else if (currentY < lastY.current - 4) {
          setVisible(true);
        }
        lastY.current = currentY;
        ticking.current = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return visible;
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const visible = useScrollHide();
  const { itemCount } = useMarketplaceCart();
  const navMode = useMarketplaceNavMode();
  const isTiendasOnly = navMode === "tiendas-only";

  // Tab principal: en tiendas-only va a /tiendas, sino a /marketplace
  const homeHref = isTiendasOnly ? "/tiendas" : "/marketplace";

  const activeTab = useCallback((): TabId => {
    if (pathname?.startsWith("/marketplace/buscar")) return "buscar";
    if (pathname?.startsWith("/marketplace/carrito")) return "carrito";
    if (pathname?.startsWith("/marketplace/mi-cuenta")) return "cuenta";
    if (
      pathname === "/" ||
      pathname?.startsWith("/marketplace") ||
      pathname?.startsWith("/tiendas")
    )
      return "tiendas";
    return "tiendas";
  }, [pathname]);

  const handleTab = useCallback(
    (id: TabId) => {
      // Haptic feedback nativo en mobile
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate(15);
        } catch {
          /* silent */
        }
      }
      switch (id) {
        case "tiendas":
          router.push(homeHref);
          break;
        case "buscar":
          router.push(
            isTiendasOnly ? "/tiendas?focus=search" : "/marketplace/buscar",
          );
          break;
        case "carrito":
          router.push("/marketplace/carrito");
          break;
        case "cuenta":
          router.push("/marketplace/mi-cuenta");
          break;
      }
    },
    [router, homeHref, isTiendasOnly],
  );

  const currentActive = activeTab();

  return (
    <nav
      aria-label="Navegación principal"
      className={cn(
        "sm:hidden",
        "fixed bottom-0 left-0 right-0 z-40",
        "bg-[var(--surface-canvas)] border-t border-[var(--rule-base)]",
        "pb-[env(safe-area-inset-bottom)]",
        "shadow-[0_-2px_10px_rgba(0,0,0,0.05)]",
        "transition-transform duration-300 ease-in-out",
        visible ? "translate-y-0" : "translate-y-full",
      )}
    >
      <div className="flex items-stretch">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = currentActive === id;
          const isCart = id === "carrito";
          return (
            <button
              key={id}
              onClick={() => handleTab(id)}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[60px] py-2 px-1",
                "relative select-none transition-colors duration-150",
                "active:scale-95",
                isActive
                  ? "text-[var(--accent)]"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
              )}
            >
              <span className="relative">
                <Icon
                  className={cn(
                    "h-5 w-5 transition-transform duration-150",
                    isActive && "scale-110",
                  )}
                  strokeWidth={isActive ? 2.5 : 1.8}
                  aria-hidden
                />
                {isCart && itemCount > 0 && (
                  <span
                    aria-label={`${itemCount} productos en el carrito`}
                    className={cn(
                      "absolute -top-1.5 -right-1.5",
                      "flex h-4 min-w-4 items-center justify-center",
                      "rounded-full bg-[var(--accent)] px-1",
                      "text-[length:var(--ts-2xs)] font-black text-white leading-none",
                      "ring-1 ring-[var(--surface-canvas)]",
                    )}
                  >
                    {itemCount > 99 ? "99+" : itemCount}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  "text-[length:var(--ts-xs)] leading-tight tracking-tight",
                  isActive ? "font-bold" : "font-semibold",
                )}
              >
                {label}
              </span>
              {isActive && (
                <span
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-full bg-[var(--accent)]"
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
