"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { CartBadge } from "@/components/marketplace/MarketplaceCart";
import MarketplaceCart from "@/components/marketplace/MarketplaceCart";

const MarketplaceCheckoutModal = dynamic(
  () => import("@/components/marketplace/MarketplaceCheckoutModal"),
  { ssr: false }
);

export default function MarketplaceNavbar() {
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const handleOpenCart = useCallback(() => setCartOpen(true), []);
  const handleCloseCart = useCallback(() => setCartOpen(false), []);
  const handleCloseCheckout = useCallback(() => setCheckoutOpen(false), []);

  const handleCheckout = useCallback(() => {
    setCartOpen(false);
    setCheckoutOpen(true);
  }, []);

  return (
    <>
      <nav
        className="sticky top-0 z-50 border-b border-gray-200 dark:border-gray-800"
        style={{ background: "rgba(15,118,110,0.97)", backdropFilter: "blur(8px)" }}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            <Link
              href="/marketplace"
              className="flex items-center gap-2 text-white font-bold text-lg tracking-tight"
            >
              <span
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white text-sm font-black"
                style={{ background: "rgba(255,255,255,0.2)" }}
              >
                B
              </span>
              <span>Marketplace Buleje</span>
            </Link>

            <div className="flex items-center gap-1">
              <CartBadge onClick={handleOpenCart} />
              <Link
                href="/marketplace/registrar"
                className="hidden sm:inline-flex rounded-lg px-3 py-1.5 text-sm font-semibold text-white/90 transition-colors hover:bg-white/10 hover:text-white"
              >
                Abre tu tienda
              </Link>
              <Link
                href="/registro"
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
              >
                Iniciar sesión
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <MarketplaceCart
        isOpen={cartOpen}
        onClose={handleCloseCart}
        onCheckout={handleCheckout}
      />
      <MarketplaceCheckoutModal
        isOpen={checkoutOpen}
        onClose={handleCloseCheckout}
      />
    </>
  );
}
