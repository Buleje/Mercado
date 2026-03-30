"use client";

import { useState, useEffect, startTransition } from "react";
import { useRouter } from "next/navigation";
import { Home, Store, Search, ShoppingCart, ChefHat } from "lucide-react";
import { useCart } from "@/contexts/cart-context";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { id: "home", label: "Inicio", icon: Home, action: "go-home" },
  { id: "tienda", label: "Tienda", icon: Store, action: "go-tienda" },
  { id: "recetas", label: "Recetas", icon: ChefHat, action: "go-recetas" },
  { id: "buscar", label: "Buscar", icon: Search, action: "go-buscar" },
  { id: "cart", label: "Carrito", icon: ShoppingCart, action: "cart" },
] as const;

export default function MobileBottomNav() {
  const { items, open: openCart } = useCart();
  const router = useRouter();
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
    setActive(
      action === "go-home" ? "home" :
      action === "go-tienda" ? "tienda" :
      action === "go-recetas" ? "recetas" :
      action === "go-buscar" ? "buscar" :
      action
    );

    switch (action) {
      case "go-home":
        router.push("/");
        break;
      case "go-tienda":
        router.push("/tienda");
        break;
      case "go-recetas":
        router.push("/recetas");
        break;
      case "go-buscar":
        router.push("/buscar");
        break;
      case "cart":
        openCart();
        break;
    }
  };

  if (!visible) return null;

  return (
    <nav
      className={cn(
        "fixed bottom-0 inset-x-0 z-40 sm:hidden",
        "bg-white/97 dark:bg-card/97 backdrop-blur-xl border-t border-gray-100 dark:border-card-border shadow-[0_-4px_20px_rgba(0,0,0,0.06)]",
        "safe-area-bottom transition-transform duration-300",
        visible ? "translate-y-0" : "translate-y-full"
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-center justify-around h-[74px]">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleTap(item.action)}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-all duration-200",
                isActive ? "text-primary" : "text-gray-400 dark:text-gray-500 active:text-primary active:scale-90"
              )}
              aria-label={item.id === "cart" && totalQty > 0 ? `${item.label} (${totalQty} productos)` : item.label}
              aria-current={isActive ? "page" : undefined}
            >
              {isActive && (
                <span className="absolute top-0 inset-x-3 h-0.75 bg-primary rounded-b-full" />
              )}
              <span className="relative">
                <Icon className={cn("w-5.5 h-5.5 transition-transform duration-200", isActive && "scale-110")} strokeWidth={isActive ? 2.5 : 2} />
                {item.id === "cart" && totalQty > 0 && (
                  <span className="absolute -top-1 -right-2 min-w-4.5 h-4.5 flex items-center justify-center px-1 text-[9px] font-bold bg-red-500 text-white rounded-full shadow-sm animate-[scaleIn_0.15s_ease-out]">
                    {totalQty > 99 ? "99+" : totalQty}
                  </span>
                )}
              </span>
              <span className={cn("text-[10px] leading-none mt-0.5 transition-all", isActive ? "font-bold" : "font-medium")}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
