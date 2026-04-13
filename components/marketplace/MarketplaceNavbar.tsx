"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Search, ChefHat, Menu, X } from "lucide-react";
import { CartBadge } from "@/components/marketplace/MarketplaceCart";
import MarketplaceCart from "@/components/marketplace/MarketplaceCart";
import { useRouter } from "next/navigation";
import { AuthModal, useAuthModal } from "@/components/auth/AuthModal";

const MarketplaceCheckoutModal = dynamic(
  () => import("@/components/marketplace/MarketplaceCheckoutModal"),
  { ssr: false }
);

export default function MarketplaceNavbar() {
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();
  const { authModalOpen, openAuthModal, closeAuthModal } = useAuthModal();

  const handleOpenCart = useCallback(() => setCartOpen(true), []);
  const handleCloseCart = useCallback(() => setCartOpen(false), []);
  const handleCloseCheckout = useCallback(() => setCheckoutOpen(false), []);

  const handleCheckout = useCallback(() => {
    setCartOpen(false);
    setCheckoutOpen(true);
  }, []);

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/marketplace?buscar=${encodeURIComponent(searchQuery.trim())}`);
    }
  }, [searchQuery, router]);

  return (
    <>
      <nav
        className="sticky top-0 z-50 border-b border-teal-700/30 bg-teal-700/97 backdrop-blur-md"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Row 1: Logo + Search + Actions */}
          <div className="flex h-16 items-center gap-3">
            {/* Logo */}
            <Link
              href="/marketplace"
              className="flex items-center gap-2 text-white font-bold text-lg tracking-tight shrink-0"
            >
              <span
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/18 text-white text-sm font-black"
              >
                B
              </span>
              <span className="hidden sm:inline">Buleje</span>
            </Link>

            {/* Search bar — big and prominent */}
            <form onSubmit={handleSearch} className="flex-1 max-w-2xl mx-2 sm:mx-4">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar tiendas, productos, categorías..."
                  className="w-full rounded-xl bg-white/95 dark:bg-gray-800/95 pl-10 pr-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none ring-2 ring-white/20 focus:ring-white/50 transition-all shadow-sm"
                />
              </div>
            </form>

            {/* Desktop nav links */}
            <div className="hidden md:flex items-center gap-1">
              <Link
                href="/"
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
              >
                Inicio
              </Link>
              <Link
                href="/recetas"
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white flex items-center gap-1"
              >
                <ChefHat className="h-3.5 w-3.5" />
                Recetas
              </Link>
              <CartBadge onClick={handleOpenCart} />
              <Link
                href="/negocios"
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
              >
                Para Negocios
              </Link>
              <Link
                href="/marketplace/apply"
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
              >
                Abre tu tienda
              </Link>
              <button
                onClick={openAuthModal}
                className="rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white min-h-[44px]"
              >
                Ingresar
              </button>
            </div>

            {/* Mobile: cart + hamburger */}
            <div className="flex md:hidden items-center gap-1">
              <CartBadge onClick={handleOpenCart} />
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg text-white/80 hover:bg-white/10"
                aria-label="Abrir menú"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/10 bg-teal-800/95 backdrop-blur-sm px-4 py-3 space-y-1">
            <Link href="/" onClick={() => setMobileMenuOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-white/90 hover:bg-white/10">
              Inicio
            </Link>
            <Link href="/recetas" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-white/90 hover:bg-white/10">
              <ChefHat className="h-4 w-4" /> Recetas
            </Link>
            <Link href="/marketplace/apply" onClick={() => setMobileMenuOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-white/90 hover:bg-white/10">
              Abre tu tienda
            </Link>
            <Link href="/negocios" onClick={() => setMobileMenuOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-white/90 hover:bg-white/10">
              Para Negocios
            </Link>
            <button
              onClick={() => { setMobileMenuOpen(false); openAuthModal(); }}
              className="w-full text-left rounded-lg px-3 py-2.5 text-sm font-semibold text-white/90 hover:bg-white/10 min-h-[44px]"
            >
              Ingresar
            </button>
          </div>
        )}
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
      <AuthModal open={authModalOpen} onClose={closeAuthModal} />
    </>
  );
}
