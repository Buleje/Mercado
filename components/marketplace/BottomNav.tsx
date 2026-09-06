"use client";

/**
 * BottomNav — Barra de navegación inferior estilo Rappi/Glovo/PedidosYa.
 *
 * Visible solo en mobile (sm:hidden). Brandon 2026-05-18: SIEMPRE FIJA — el
 * cliente típico (panadero de 50 años en Pucallpa) espera el patrón Rappi,
 * no auto-hide. Antes ocultaba al bajar scroll; se eliminó por fricción
 * cognitiva al acceder al carrito mientras se hojea catálogo.
 *
 * Diseño: backdrop-blur + bg semi-transparente para fundirse con cualquier
 * contenido sin robar contraste. Safe area padding para notch iOS.
 *
 * Tabs:
 *   - Tiendas (home del marketplace)
 *   - Buscar (página dedicada)
 *   - Carrito (con badge cuando hay items)
 *   - Cuenta (gate auth automático)
 *
 * Adapta al modo `tiendas-only`: el tab principal lleva a /tiendas.
 */

import { useCallback, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Home,
  MessageCircle,
  ShoppingCart,
  User,
  Store as StoreIcon,
  Tag,
  ArrowRight,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";

const fmtPEN = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

// ── Tipos ─────────────────────────────────────────────────────────────────────

type TabId = "inicio" | "tiendas" | "ofertas" | "chat" | "cuenta";

interface Tab {
  id: TabId;
  label: string;
  Icon: React.ElementType;
}

// Brandon 2026-06-07: "Tiendas" → "Mercado" (→ /marketplace) y "Buscar" → "Chat"
// (abre el Messenger del marketplace vía evento `buleje:open-chat`). El chat del
// top-nav se removió en mobile porque ahora vive acá abajo.
// Brandon 2026-06-07: tab "Carrito" quitado — el carrito vive en el ícono del
// top-nav + la franja de pago de arriba. Quedan 4 tabs.
// Brandon 2026-07-05 (audit navegación): agregado "Ofertas" como atajo directo
// (antes solo se llegaba por el rail desktop / footer). 5 tabs = patrón Rappi/
// PedidosYa. El carrito ya tiene su franja integrada arriba de los tabs.
const TABS: Tab[] = [
  { id: "inicio", label: "Inicio", Icon: Home },
  { id: "tiendas", label: "Tiendas", Icon: StoreIcon },
  { id: "ofertas", label: "Ofertas", Icon: Tag },
  { id: "chat", label: "Chat", Icon: MessageCircle },
  { id: "cuenta", label: "Cuenta", Icon: User },
];

// ── Componente principal ───────────────────────────────────────────────────────

export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { itemCount, items } = useMarketplaceCart();

  // Subtotal para la franja de carrito integrada (Brandon 2026-05-27: un solo
  // nav abajo = franja de carrito + tabs en el MISMO contenedor; reemplaza a la
  // StickyCartBar flotante que duplicaba el acceso al carrito).
  const subtotal = useMemo(
    () => items.reduce((s, it) => s + it.price * it.quantity, 0),
    [items],
  );

  // Brandon, mayo 14 2026: durante el flujo de checkout (carrito + datos +
  // entrega + confirmar) el BottomNav distrae del CTA principal y ofrece
  // salidas no intencionales (volver a buscar). En mobile lo ocultamos.
  // En desktop ya esta oculto por default (sm:hidden del nav).
  const inCheckoutFlow =
    pathname === "/marketplace/carrito" ||
    pathname?.startsWith("/checkout/") ||
    pathname === "/checkout";

  const activeTab = useCallback((): TabId => {
    if (pathname?.startsWith("/chat")) return "chat";
    if (pathname?.startsWith("/marketplace/mi-cuenta")) return "cuenta";
    // Ofertas ANTES de tiendas: /marketplace/ofertas también matchea /marketplace.
    if (pathname?.startsWith("/marketplace/ofertas")) return "ofertas";
    if (pathname === "/") return "inicio";
    if (
      pathname?.startsWith("/tiendas") ||
      pathname?.startsWith("/marketplace")
    )
      return "tiendas";
    return "inicio";
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
        case "inicio":
          router.push("/");
          break;
        case "tiendas":
          router.push("/tiendas");
          break;
        case "ofertas":
          router.push("/marketplace/ofertas");
          break;
        case "chat":
          // Brandon 2026-06-12: el chat ahora es RUTA REAL (/chat), estilo
          // Messenger nativo (atrás del celular + URL funcionan). Antes abría un
          // overlay vía evento; ahora navegamos a la página.
          router.push("/chat");
          break;
        case "cuenta":
          router.push("/marketplace/mi-cuenta");
          break;
      }
    },
    [router],
  );

  const currentActive = activeTab();

  if (inCheckoutFlow) return null;

  return (
    <nav
      aria-label="Navegación principal"
      className={cn(
        "sm:hidden",
        "fixed bottom-0 left-0 right-0 z-40",
        // Blur + bg semi-transparente: se funde con el contenido pero
        // mantiene legibilidad. Fallback bg sólido si el browser no soporta
        // backdrop-filter (supports detection via @supports en globals).
        "border-t border-[var(--rule-base)]",
        "bg-[color-mix(in_oklab,var(--surface-canvas)_85%,transparent)]",
        "supports-[backdrop-filter]:bg-[color-mix(in_oklab,var(--surface-canvas)_70%,transparent)]",
        "supports-[backdrop-filter]:backdrop-blur-xl",
        "supports-[backdrop-filter]:backdrop-saturate-150",
        "pb-[env(safe-area-inset-bottom)]",
        "shadow-[0_-2px_10px_rgba(0,0,0,0.05)]",
      )}
    >
      {/* ── Franja de carrito integrada — solo cuando hay productos.
           Mismo contenedor que los tabs → un solo nav. Toda la franja navega
           al carrito; el chip "Pagar" refuerza el CTA. ── */}
      {itemCount > 0 && (
        <button
          type="button"
          onClick={() => {
            if (typeof navigator !== "undefined" && "vibrate" in navigator) {
              try { navigator.vibrate(15); } catch { /* silent */ }
            }
            router.push("/marketplace/carrito");
          }}
          aria-label={`Ver carrito — ${itemCount} ${itemCount === 1 ? "producto" : "productos"}, ${fmtPEN(subtotal)}. Ir a pagar`}
          className="flex w-full items-center gap-3 border-b border-[var(--rule-base)] bg-primary/10 px-4 py-2.5 text-left text-[var(--text-[var(--accent-ink)] dark:text-[var(--accent)])] active:opacity-95 transition-opacity"
        >
          <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/10 text-[var(--accent)] ring-1 ring-[var(--accent)]/20">
            <ShoppingCart className="h-4.5 w-4.5" strokeWidth={2.25} aria-hidden />
            <span
              aria-hidden
              className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[length:var(--ts-2xs)] font-black leading-none text-white tabular-nums ring-1 ring-[var(--surface-raised)]"
            >
              {itemCount > 99 ? "99+" : itemCount}
            </span>
          </span>
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)]">
              {itemCount} {itemCount === 1 ? "producto" : "productos"}
            </span>
            <span className="text-base font-black tabular-nums truncate">
              {fmtPEN(subtotal)}
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--accent)] px-4 h-9 text-sm font-black text-white">
            Pagar
            <ArrowRight className="h-4 w-4" strokeWidth={2.75} aria-hidden />
          </span>
        </button>
      )}

      <div className="flex items-stretch">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = currentActive === id;
          return (
            <button
              key={id}
              onClick={() => handleTab(id)}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 min-h-[60px] py-2 px-1",
                "relative select-none transition-colors duration-150",
                "active:scale-95",
                isActive
                  ? "text-[var(--accent)]"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
              )}
            >
              {/* Brandon 2026-06-12: pill de acento bajo el ícono en la pestaña
                  activa (estilo Rappi/Glovo) — el link activo se ve claramente. */}
              <span
                className={cn(
                  "relative inline-flex h-8 w-12 items-center justify-center rounded-full transition-colors duration-200",
                  isActive ? "bg-primary/10" : "bg-transparent",
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5 transition-transform duration-200",
                    isActive && "scale-110",
                  )}
                  strokeWidth={isActive ? 2.5 : 1.8}
                  aria-hidden
                />
              </span>
              <span
                className={cn(
                  "text-[length:var(--ts-xs)] leading-tight tracking-tight",
                  isActive ? "font-black" : "font-semibold",
                )}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
