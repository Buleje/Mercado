"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Search, Menu, X, UserCircle, ChevronDown, Heart, Sun, Moon, Store, LogOut, Compass } from "lucide-react";
import { CartBadge } from "@/components/marketplace/MarketplaceCart";
import MarketplaceCart from "@/components/marketplace/MarketplaceCart";
import { useTheme } from "@/contexts/theme-context";
import { useWishlist } from "@/hooks/use-wishlist";
import { useRouter } from "next/navigation";
import { useCustomer } from "@/contexts/customer-context";
import { AuthModal, useAuthModal } from "@/components/auth/AuthModal";
import { cn } from "@/lib/utils";
import { BulejeWordmark } from "@/components/ui-system/illustrations";
import LocaleSwitcher from "@/components/ui-system/LocaleSwitcher";
import CurrencySwitcher from "@/components/ui-system/CurrencySwitcher";
import DiscoverMegaMenu from "@/components/marketplace/navbar/DiscoverMegaMenu";
import { useLocale } from "@/contexts/locale-context";

const MarketplaceCheckoutModal = dynamic(
  () => import("@/components/marketplace/MarketplaceCheckoutModal"),
  { ssr: false }
);

// ── Nav principal reorganizado (psicologia jerarquica) ──
// Solo 4 entradas customer-facing: Inicio, Bodegas, Recetas, Nosotros.
// Removido del top: Favoritos/Heart (ahora en Mi cuenta dropdown) y
// ThemeToggle (tambien en dropdown). CTA "Abre tu tienda" outline teal
// separado de "Ingresar"/"Mi cuenta" → no competir visualmente.
// ── Explorar entre Bodegas y Recetas ──
// `/marketplace` matchea con startsWith, asi que para evitar que "Bodegas"
// quede activo al estar en `/marketplace/explorar`, usamos `matchEquals`
// para "Bodegas" y matchPrefix distinto para "Explorar".
const PRIMARY_LINKS = [
  { href: "/", labelKey: "nav.home", matchExact: true },
  { href: "/marketplace", labelKey: "nav.stores", matchEquals: "/marketplace" },
  { href: "/marketplace/explorar", labelKey: "nav.explore", matchPrefix: "/marketplace/explorar", icon: Compass },
  { href: "/recetas", labelKey: "nav.recipes", matchPrefix: "/recetas" },
  { href: "/socio-buleje", labelKey: "nav.socio", matchPrefix: "/socio-buleje" },
  { href: "/about", labelKey: "nav.about", matchPrefix: "/about" },
] as const;

export default function MarketplaceNavbar() {
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { authModalOpen, openAuthModal, closeAuthModal } = useAuthModal();
  const { count: wishlistCount } = useWishlist();
  const { customer, clear } = useCustomer();
  const { resolved: themeResolved, toggle: toggleTheme } = useTheme();
  const { t } = useLocale();

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

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [userMenuOpen]);

  const isActive = (link: typeof PRIMARY_LINKS[number]) => {
    if (!pathname) return false;
    if ("matchExact" in link && link.matchExact) return pathname === link.href;
    if ("matchEquals" in link && link.matchEquals) return pathname === link.matchEquals;
    if ("matchPrefix" in link && link.matchPrefix) return pathname.startsWith(link.matchPrefix);
    return false;
  };

  return (
    <>
      <nav
        aria-label="Navegación del marketplace"
        className="sticky top-0 z-50 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 backdrop-blur-md"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Row 1: Logo + Search + Actions */}
          <div className="flex h-16 items-center gap-3">
            {/* Logo */}
            <Link
              href="/marketplace"
              aria-label="Buleje — Ir al marketplace"
              className="flex items-center shrink-0 text-[var(--accent)]"
            >
              <BulejeWordmark
                size={36}
                strokeWidth={1.75}
                textSize={18}
                className="text-[var(--accent)] dark:text-white"
              />
            </Link>

            {/* Search bar — big and prominent */}
            <form onSubmit={handleSearch} role="search" aria-label="Buscar en el marketplace" className="flex-1 max-w-2xl mx-2 sm:mx-4">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-gray-400 pointer-events-none" aria-hidden="true" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("nav.searchPlaceholder")}
                  aria-label={t("nav.search")}
                  className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 pl-10 pr-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:border-gray-300 dark:focus:border-gray-600 transition-all"
                />
              </div>
            </form>

            {/* Customer primary nav (centro, jerarquia) — links + mega-menu Descubrí */}
            <div className="hidden md:flex items-center gap-0.5">
              {PRIMARY_LINKS.map((link) => {
                const active = isActive(link);
                const LinkIcon = "icon" in link ? link.icon : undefined;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors inline-flex items-center gap-1.5",
                      active
                        ? "text-gray-900 dark:text-white after:content-[''] after:absolute after:left-3.5 after:right-3.5 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-primary"
                        : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    )}
                  >
                    {LinkIcon ? <LinkIcon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" /> : null}
                    {t(link.labelKey)}
                  </Link>
                );
              })}
              <DiscoverMegaMenu variant="desktop" />
            </div>

            {/* Separador visual sutil */}
            <div className="hidden md:block h-6 w-px bg-gray-200 dark:bg-gray-700" aria-hidden="true" />

            {/* Business CTA — outline teal, no compite con auth */}
            <div className="hidden md:flex items-center gap-2">
              {/* Locale + Currency switchers — enterprise style */}
              <CurrencySwitcher />
              <LocaleSwitcher />

              <Link
                href="/vender"
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 px-3.5 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/5 hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Store className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={2} />
                {t("nav.openStore")}
              </Link>

              {/* Auth — Mi cuenta dropdown (si hay customer) o Ingresar */}
              {customer ? (
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setUserMenuOpen((o) => !o)}
                    aria-expanded={userMenuOpen}
                    aria-haspopup="true"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm font-semibold text-gray-900 dark:text-white transition-colors hover:bg-gray-200 dark:hover:bg-gray-700 min-h-[44px]"
                  >
                    <UserCircle className="h-4 w-4" aria-hidden="true" />
                    <span className="max-w-[6rem] truncate">
                      {customer.name?.split(" ")[0] ?? t("nav.account")}
                    </span>
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", userMenuOpen && "rotate-180")} aria-hidden="true" />
                  </button>

                  {userMenuOpen && (
                    <div
                      role="menu"
                      aria-label="Menú de usuario"
                      className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50"
                    >
                      <div className="py-1.5">
                        <Link
                          href="/marketplace/mi-cuenta"
                          onClick={() => setUserMenuOpen(false)}
                          role="menuitem"
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <UserCircle className="h-4 w-4 text-gray-500" aria-hidden="true" />
                          <span>{t("nav.account")}</span>
                        </Link>
                        <Link
                          href="/marketplace/favoritos"
                          onClick={() => setUserMenuOpen(false)}
                          role="menuitem"
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <Heart className={cn("h-4 w-4", wishlistCount > 0 ? "fill-current text-rose-500" : "text-gray-500")} aria-hidden="true" />
                          <span className="flex-1">{t("nav.favorites")}</span>
                          {wishlistCount > 0 && (
                            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-900/20 px-1.5 py-0.5 rounded-full">
                              {wishlistCount > 99 ? "99+" : wishlistCount}
                            </span>
                          )}
                        </Link>
                        <button
                          onClick={() => { toggleTheme(); }}
                          role="menuitem"
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                        >
                          {themeResolved === "dark" ? <Sun className="h-4 w-4 text-gray-500" aria-hidden="true" /> : <Moon className="h-4 w-4 text-gray-500" aria-hidden="true" />}
                          <span>{themeResolved === "dark" ? t("nav.lightMode") : t("nav.darkMode")}</span>
                        </button>
                        <div className="mx-3 my-1 border-t border-gray-100 dark:border-gray-700" />
                        <button
                          onClick={() => { clear(); setUserMenuOpen(false); window.location.reload(); }}
                          role="menuitem"
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors text-left"
                        >
                          <LogOut className="h-4 w-4" aria-hidden="true" />
                          <span>{t("nav.logout")}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={openAuthModal}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-primary min-h-[44px]"
                >
                  {t("nav.login")}
                </button>
              )}

              {/* Cart icon al extremo derecho con badge count */}
              <CartBadge onClick={handleOpenCart} />
            </div>

            {/* Mobile: cart + hamburger (sin theme toggle, va en drawer) */}
            <div className="flex md:hidden items-center gap-1">
              <CartBadge onClick={handleOpenCart} />
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900"
                aria-label={mobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-menu"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu dropdown — customer primary + business CTA + preferences */}
        {mobileMenuOpen && (
          <div
            id="mobile-menu"
            className="md:hidden border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 backdrop-blur-sm"
          >
            <div className="px-4 py-3 space-y-1">
              {/* Customer primary nav */}
              {PRIMARY_LINKS.map((link) => {
                const active = isActive(link);
                const LinkIcon = "icon" in link ? link.icon : undefined;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900"
                    )}
                  >
                    {LinkIcon ? <LinkIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> : null}
                    {t(link.labelKey)}
                  </Link>
                );
              })}
            </div>

            {/* Descubrí — mega-menu mobile */}
            <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
              <DiscoverMegaMenu
                variant="mobile"
                onNavigate={() => setMobileMenuOpen(false)}
              />
            </div>

            {/* Business CTA + switchers */}
            <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 space-y-3">
              <div className="flex items-center gap-2">
                <CurrencySwitcher />
                <LocaleSwitcher />
              </div>
              <Link
                href="/vender"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center gap-2 rounded-lg border border-primary/40 px-3.5 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5 min-h-[44px]"
              >
                <Store className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
                {t("nav.openStore")}
              </Link>
            </div>

            {/* Auth + Mi cuenta utilities */}
            <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 space-y-1">
              {customer ? (
                <>
                  <Link
                    href="/marketplace/mi-cuenta"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900"
                  >
                    <UserCircle className="h-4 w-4 text-gray-500" aria-hidden="true" />
                    <span>Mi cuenta — {customer.name?.split(" ")[0] ?? "Mi cuenta"}</span>
                  </Link>
                  <Link
                    href="/marketplace/favoritos"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900"
                  >
                    <Heart className={cn("h-4 w-4", wishlistCount > 0 ? "fill-current text-rose-500" : "text-gray-500")} aria-hidden="true" />
                    <span className="flex-1">Favoritos</span>
                    {wishlistCount > 0 && (
                      <span className="text-[10px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-900/20 px-1.5 py-0.5 rounded-full">
                        {wishlistCount > 99 ? "99+" : wishlistCount}
                      </span>
                    )}
                  </Link>
                </>
              ) : (
                <button
                  onClick={() => { setMobileMenuOpen(false); openAuthModal(); }}
                  className="w-full flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 min-h-[44px]"
                >
                  Ingresar
                </button>
              )}
              <button
                onClick={() => { toggleTheme(); }}
                className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 text-left"
              >
                {themeResolved === "dark" ? <Sun className="h-4 w-4 text-gray-500" aria-hidden="true" /> : <Moon className="h-4 w-4 text-gray-500" aria-hidden="true" />}
                <span>{themeResolved === "dark" ? "Modo claro" : "Modo oscuro"}</span>
              </button>
              {customer && (
                <button
                  onClick={() => { clear(); setMobileMenuOpen(false); window.location.reload(); }}
                  className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 text-left"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  <span>Cerrar sesión</span>
                </button>
              )}
            </div>
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
