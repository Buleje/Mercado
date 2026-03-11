"use client";

import { useState, useEffect } from "react";
import { ShoppingCart, ArrowRight } from "lucide-react";
import { useCart } from "@/contexts/cart-context";
import { cn } from "@/lib/utils";

export default function StickyCartBar() {
  const { items, total, toggle } = useCart();
  const [visible, setVisible] = useState(false);
  const qty = items.reduce((s, i) => s + i.quantity, 0);

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
    <div className="md:hidden fixed bottom-20 left-0 right-0 z-40 animate-[slideUp_0.3s_ease-out]">
      <div className="mx-4 mb-2">
        <button
          onClick={toggle}
          className={cn(
            "w-full flex items-center justify-between gap-3 rounded-2xl px-5 py-4 shadow-2xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]",
            "bg-linear-to-r from-primary to-primary-dark text-white"
          )}
          aria-label={`Ver carrito con ${qty} productos`}
        >
          {/* Left: Icon + count */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <ShoppingCart className="h-6 w-6" />
              <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[10px] font-extrabold text-white">
                {qty > 99 ? "99+" : qty}
              </span>
            </div>
            <div className="text-left">
              <p className="text-sm font-bold leading-tight">Ver Carrito</p>
              <p className="text-[11px] text-white/70">{qty} {qty === 1 ? "producto" : "productos"}</p>
            </div>
          </div>

          {/* Right: Total + arrow */}
          <div className="flex items-center gap-2">
            <div className="text-right">
              <p className="text-xs text-white/60 leading-tight">Total</p>
              <p className="text-lg font-extrabold leading-tight">S/{total.toFixed(2)}</p>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0" />
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
