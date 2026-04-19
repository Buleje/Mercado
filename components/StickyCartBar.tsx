"use client";

import { useState, useEffect } from "react";
import { ShoppingCart, ArrowRight } from "@buleje/design-system/icons";
import { useCart } from "@/contexts/cart-context";
import { cn } from "@/lib/utils";

export default function StickyCartBar() {
  const { items, total, toggle } = useCart();
  const [visible, setVisible] = useState(false);
  const qty = items.reduce((s, i) => s + i.quantity, 0);
  const wrapperStyle = {
    bottom: "calc(env(safe-area-inset-bottom, 0px) + 5.5rem)",
  } as const;
  const containerStyle = {
    marginRight: "calc(4.75rem + env(safe-area-inset-right, 0px))",
  } as const;

  useEffect(() => {
    // Only show when there are items and user scrolled past initial view
    const check = () => {
      const scrolled = window.scrollY > 300;
      setVisible(qty > 0 && scrolled);
    };
    window.addEventListener("scroll", check, { passive: true });
    check();
    return () => window.removeEventListener("scroll", check);
  }, [qty]);

  if (!visible) return null;

  return (
    <div className="md:hidden fixed left-0 right-0 z-50 animate-[slideUp_0.3s_ease-out]" style={wrapperStyle}>
      <div className="ml-3 sm:mx-4" style={containerStyle}>
        <button
          onClick={toggle}
          className={cn(
            "w-full flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5 sm:px-5 sm:py-4 shadow-2xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]",
            "bg-linear-to-r from-primary to-primary-dark text-white"
          )}
          aria-label={`Ver carrito con ${qty} productos`}
        >
          {/* Left: Icon + count */}
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-white/14 shrink-0">
              <ShoppingCart className="h-5 w-5" />
              <span className="absolute -top-1 -right-1 flex min-w-5 h-5 items-center justify-center rounded-full bg-secondary px-1 text-[length:var(--ts-2xs)] font-extrabold text-white shadow-sm">
                {qty > 99 ? "99+" : qty}
              </span>
            </div>
            <div className="text-left min-w-0">
              <p className="text-sm font-bold leading-tight">Ver Carrito</p>
              <p className="text-[length:var(--ts-2xs)] text-white/70">{qty} {qty === 1 ? "producto" : "productos"}</p>
            </div>
          </div>

          {/* Right: Total + arrow */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <p className="text-xs text-white/60 leading-tight">Total</p>
              <p className="text-base sm:text-lg font-extrabold leading-tight">S/{total.toFixed(2)}</p>
            </div>
            <ArrowRight className="h-4.5 w-4.5 sm:h-5 sm:w-5 shrink-0" />
          </div>
        </button>
      </div>

      <style jsx>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(100%);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
