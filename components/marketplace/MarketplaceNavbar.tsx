"use client";

import { useState } from "react";
import Link from "next/link";
import { CartBadge } from "@/components/marketplace/MarketplaceCart";
import MarketplaceCart from "@/components/marketplace/MarketplaceCart";

export default function MarketplaceNavbar() {
  const [cartOpen, setCartOpen] = useState(false);

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
              <CartBadge onClick={() => setCartOpen(true)} />
              <Link
                href="/registro"
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              >
                Iniciar sesión
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <MarketplaceCart isOpen={cartOpen} onClose={() => setCartOpen(false)} />
    </>
  );
}
