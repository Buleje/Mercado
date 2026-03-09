"use client";

import { useState, useEffect, startTransition } from "react";
import { Home, Search, Heart, ShoppingCart, User } from "lucide-react";
import { useCart } from "@/contexts/cart-context";
import { useCustomer } from "@/contexts/customer-context";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { id: "home", label: "Inicio", icon: Home, action: "scroll-top" },
  { id: "search", label: "Buscar", icon: Search, action: "search" },
  { id: "favs", label: "Favoritos", icon: Heart, action: "scroll-favs" },
  { id: "cart", label: "Carrito", icon: ShoppingCart, action: "cart" },
  { id: "cuenta", label: "Cuenta", icon: User, action: "account" },
] as const;

export default function MobileBottomNav() {
  const { items, open: openCart } = useCart();
  const { openModal } = useCustomer();
  const [visible, setVisible] = useState(false);
  const [active, setActive] = useState("home");

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  // Only show after scrolling past hero
  useEffect(() => {
    const check = () => {
      startTransition(() => setVisible(window.scrollY > 400));
    };
    window.addEventListener("scroll", check, { passive: true });
    check();
    return () => window.removeEventListener("scroll", check);
  }, []);

  const handleTap = (action: string) => {
    setActive(action === "scroll-top" ? "home" : action === "scroll-favs" ? "favs" : action);

    switch (action) {
      case "scroll-top":
        window.scrollTo({ top: 0, behavior: "smooth" });
        break;
      case "search":
        document.getElementById("productos")?.scrollIntoView({ behavior: "smooth" });
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("bsm:focusSearch"));
        }, 500);
        break;
      case "scroll-favs": {
        const el = document.getElementById("favoritos") || document.getElementById("productos");
        el?.scrollIntoView({ behavior: "smooth" });
        break;
      }
      case "cart":
        openCart();
        break;
      case "account":
        openModal();
        break;
    }
  };

  if (!visible) return null;

  return (
    <nav
      className={cn(
        "fixed bottom-0 inset-x-0 z-40 sm:hidden",
        "bg-white/95 dark:bg-card/95 backdrop-blur-lg border-t border-gray-200 dark:border-card-border",
        "safe-area-bottom transition-transform duration-300",
        visible ? "translate-y-0" : "translate-y-full"
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-center justify-around h-14">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleTap(item.action)}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors",
                isActive ? "text-primary" : "text-muted hover:text-foreground"
              )}
              aria-label={item.label}
            >
              <span className="relative">
                <Icon className={cn("w-5 h-5", isActive && "scale-110")} />
                {item.id === "cart" && totalQty > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-4 h-4 flex items-center justify-center px-1 text-[10px] font-bold bg-red-500 text-white rounded-full">
                    {totalQty > 99 ? "99+" : totalQty}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
              {isActive && (
                <span className="absolute top-0 inset-x-4 h-0.5 bg-primary rounded-b-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
