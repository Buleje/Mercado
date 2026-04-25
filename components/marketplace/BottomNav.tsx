"use client";

/**
 * BottomNav — Barra de navegación inferior del Marketplace
 *
 * Visible solo en mobile (hidden en sm: y superiores).
 * Oculta al hacer scroll hacia abajo, reaparece al hacer scroll hacia arriba.
 * Safe area padding para notch de iPhone.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Home,
  Search,
  Package,
  ShoppingCart,
  User,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { AuthModal, useAuthModal } from "@/components/auth/AuthModal";
import MarketplaceCart from "@/components/marketplace/MarketplaceCart";
import dynamic from "next/dynamic";

const MarketplaceCheckoutModal = dynamic(
  () => import("@/components/marketplace/MarketplaceCheckoutModal"),
  { ssr: false }
);

// ── Tipos ─────────────────────────────────────────────────────────────────────

type TabId = "inicio" | "buscar" | "carrito" | "pedidos" | "cuenta";

interface Tab {
  id: TabId;
  label: string;
  Icon: React.ElementType;
}

// MK-50: BottomNav rediseñado con 5 tabs estables coherentes con apps de
// delivery modernas. "Pedidos" reemplaza "Categorias" — más útil para
// usuarios recurrentes que quieren ver el estado de su orden.
const TABS: Tab[] = [
  { id: "inicio",  label: "Inicio",   Icon: Home },
  { id: "buscar",  label: "Buscar",   Icon: Search },
  { id: "carrito", label: "Carrito",  Icon: ShoppingCart },
  { id: "pedidos", label: "Pedidos",  Icon: Package },
  { id: "cuenta",  label: "Cuenta",   Icon: User },
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
        // Siempre mostrar cuando estamos cerca del tope (< 50px)
        if (currentY < 50) {
          setVisible(true);
        } else if (currentY > lastY.current + 4) {
          // Scroll hacia abajo — ocultar
          setVisible(false);
        } else if (currentY < lastY.current - 4) {
          // Scroll hacia arriba — mostrar
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
  const { authModalOpen, openAuthModal, closeAuthModal } = useAuthModal();

  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const handleCloseCart = useCallback(() => setCartOpen(false), []);
  const handleCheckout = useCallback(() => {
    setCartOpen(false);
    setCheckoutOpen(true);
  }, []);
  const handleCloseCheckout = useCallback(() => setCheckoutOpen(false), []);

  // Determinar tab activo según la ruta actual
  const activeTab = useCallback((): TabId => {
    if (pathname === "/" || pathname === "/marketplace") return "inicio";
    if (pathname?.startsWith("/marketplace/buscar")) return "buscar";
    if (pathname?.startsWith("/marketplace/mi-cuenta/pedidos")) return "pedidos";
    if (pathname?.startsWith("/marketplace/mi-cuenta")) return "cuenta";
    return "inicio";
  }, [pathname]);

  const handleTab = useCallback(
    (id: TabId) => {
      switch (id) {
        case "inicio":
          router.push("/marketplace");
          break;

        case "buscar":
          // Llevar a la página dedicada de búsqueda con foco automático.
          router.push("/marketplace/buscar");
          break;

        case "carrito":
          setCartOpen(true);
          break;

        case "pedidos":
          // Mi-cuenta hace su propio gate de auth si es necesario.
          router.push("/marketplace/mi-cuenta/pedidos");
          break;

        case "cuenta":
          // Si no esta autenticado, AuthModal se encarga.
          // Si esta auth, llevamos a mi-cuenta home (que tiene su propio gate
          // server-side, así no rompemos nada si el cookie expira).
          router.push("/marketplace/mi-cuenta");
          break;
      }
    },
    [router]
  );

  const currentActive = activeTab();

  return (
    <>
      {/* Barra de navegación inferior — solo mobile */}
      <nav
        aria-label="Navegación principal"
        className={cn(
          // Solo visible en mobile
          "sm:hidden",
          // Posición y tamaño
          "fixed bottom-0 left-0 right-0 z-50",
          // Colores y borde
          "bg-white dark:bg-card border-t border-gray-200 dark:border-gray-700",
          // Safe area para notch de iPhone
          "pb-[env(safe-area-inset-bottom)]",
          // Sombra hacia arriba
          "shadow-[0_-2px_10px_rgba(0,0,0,0.05)]",
          // Transición scroll hide/show
          "transition-transform duration-300 ease-in-out",
          visible ? "translate-y-0" : "translate-y-full"
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
                  // Touch target mínimo 44px
                  "flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[56px] py-2 px-1",
                  "relative select-none",
                  "transition-colors duration-150 ease-in-out",
                  "active:scale-95",
                  isActive
                    ? "text-primary-dark dark:text-[#4ade80]"
                    : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                )}
              >
                {/* Icono con badge de carrito */}
                <span className="relative">
                  <Icon
                    className={cn(
                      "h-5 w-5 transition-transform duration-150",
                      isActive && "scale-110"
                    )}
                    strokeWidth={isActive ? 2.5 : 1.8}
                    aria-hidden="true"
                  />

                  {/* Badge del carrito */}
                  {isCart && itemCount > 0 && (
                    <span
                      aria-label={`${itemCount} productos en el carrito`}
                      className={cn(
                        "absolute -top-1.5 -right-1.5",
                        "flex h-4 min-w-4 items-center justify-center",
                        "rounded-full bg-[var(--accent)] px-1",
                        "text-[length:var(--ts-2xs)] font-black text-white leading-none",
                        "ring-1 ring-white dark:ring-gray-900"
                      )}
                    >
                      {itemCount > 99 ? "99+" : itemCount}
                    </span>
                  )}
                </span>

                {/* Label */}
                <span
                  className={cn(
                    "text-[length:var(--ts-2xs)] font-medium leading-tight tracking-tight",
                    "transition-all duration-150",
                    isActive ? "font-semibold" : ""
                  )}
                >
                  {label}
                </span>

                {/* Indicador activo: punto inferior */}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-full bg-primary-dark dark:bg-[#4ade80]"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Modales controlados desde BottomNav */}
      <MarketplaceCart
        isOpen={cartOpen}
        onClose={handleCloseCart}
        onCheckout={handleCheckout}
      />
      <MarketplaceCheckoutModal
        isOpen={checkoutOpen}
        onClose={handleCloseCheckout}
      />
      <AuthModal open={authModalOpen} onClose={closeAuthModal} />
    </>
  );
}
