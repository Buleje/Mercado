"use client";

import { useState, useEffect, startTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Home, Store, Search, ShoppingCart, UserCircle } from "@buleje/design-system/icons";
import { useCart } from "@/contexts/cart-context";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { id: "home",   label: "Inicio",  icon: Home,        action: "go-home",    match: ["/"] },
  { id: "tienda", label: "Tienda",  icon: Store,       action: "go-tienda",  match: ["/tienda"] },
  { id: "cart",   label: "Carrito", icon: ShoppingCart, action: "cart",       match: [] },
  { id: "buscar", label: "Buscar",  icon: Search,      action: "go-buscar",  match: ["/buscar"] },
  { id: "cuenta", label: "Cuenta",  icon: UserCircle,  action: "go-cuenta",  match: ["/cuenta", "/mis-pedidos", "/puntos"] },
] as const;

export default function MobileBottomNav() {
  const { items, open: openCart } = useCart();
  const router   = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  // Mount after hydration to avoid SSR mismatch
  useEffect(() => { startTransition(() => setMounted(true)); }, []);

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  // Derive active tab from URL automatically
  const active = NAV_ITEMS.find(item =>
    item.match.some(p => pathname === p || pathname.startsWith(p + "/"))
  )?.id ?? "home";

  const handleTap = (action: string) => {
    switch (action) {
      case "go-home":   router.push("/");             break;
      case "go-tienda": router.push("/tienda");        break;
      case "go-buscar": router.push("/buscar");        break;
      case "go-cuenta": router.push("/cuenta");        break;
      case "cart":      openCart();                     break;
    }
  };

  // Always render but animate out before mount for smooth appearance
  if (!mounted) return null;

  return (
    <nav
      className={cn(
        "fixed bottom-0 inset-x-0 z-40 sm:hidden",
        "bg-white/97 dark:bg-card/97 backdrop-blur-xl",
        "border-t border-gray-100 dark:border-card-border",
        "shadow-[0_-4px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.3)]",
        "animate-in slide-in-from-bottom-4 duration-300",
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Navegación principal"
    >
      <div className="flex items-center justify-around h-[70px]">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          const isCart   = item.id === "cart";
          return (
            <button
              key={item.id}
              onClick={() => handleTap(item.action)}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 flex-1 h-full",
                "transition-all duration-200 touch-manipulation",
                isActive
                  ? "text-primary"
                  : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 active:scale-90"
              )}
              aria-label={
                isCart && totalQty > 0 ? `Carrito (${totalQty} producto${totalQty !== 1 ? "s" : ""})` : item.label
              }
              aria-current={isActive ? "page" : undefined}
            >
              {/* Active indicator pill at top */}
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-b-full" />
              )}

              {/* Icon wrapper — cart has pill background when items > 0 */}
              <span className={cn(
                "relative flex items-center justify-center transition-all duration-200",
                isCart && totalQty > 0 && !isActive
                  ? "w-10 h-7 rounded-full bg-primary/10"
                  : "w-7 h-7",
                isActive && isCart ? "w-10 h-7 rounded-full bg-primary/15" : "",
              )}>
                <Icon
                  className={cn("transition-transform duration-200", isActive ? "scale-110" : "scale-100")}
                  style={{ width: "22px", height: "22px" }}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                {isCart && totalQty > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[length:var(--ts-2xs)] font-bold bg-[var(--data-error-500)] text-white rounded-full shadow-[var(--shadow-sm)]">
                    {totalQty > 99 ? "99+" : totalQty}
                  </span>
                )}
              </span>

              <span className={cn(
                "text-[length:var(--ts-2xs)] leading-none transition-all",
                isActive ? "font-bold" : "font-medium"
              )}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
