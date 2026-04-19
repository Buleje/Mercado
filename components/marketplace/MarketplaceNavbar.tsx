"use client";

/**
 * MarketplaceNavbar.tsx — Nav transaccional post-auth.
 *
 * Este nav es para /marketplace/**, /cuenta/**, /tienda, /t/[slug]/**.
 * Enfoque: compra rápida, descubrimiento.
 * NO incluye Inicio/Nosotros/Abre-tu-Tienda (esos van en components/Header.tsx).
 *
 * Estado: separación landing vs marketplace nav — propuesta Ola 7.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Search,
  Menu,
  X,
  UserCircle,
  ChevronDown,
  Heart,
  Sun,
  Moon,
  LogOut,
  Compass,
  Store,
  ChefHat,
  Sparkles,
  Radio,
  Tag,
  Bell,
  Package,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { CartBadge } from "@/components/marketplace/MarketplaceCart";
import MarketplaceCart from "@/components/marketplace/MarketplaceCart";
import { useTheme } from "@/contexts/theme-context";
import { useWishlist } from "@/hooks/use-wishlist";
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

// ── Links transaccionales post-auth ──
// Prioridad (izq → der): Explorar · Bodegas · Recetas · Descubrí▼ · En Vivo · Ofertas.
// NO van aquí: Inicio, Nosotros, Abre-tu-Tienda (Landing Header).
//
// `matchEquals` para links exact (evita que "Bodegas" matchee en sub-rutas).
// `matchPrefix` para links de sección (cubre sub-rutas).
type NavLink = {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  matchExact?: true;
  matchEquals?: string;
  matchPrefix?: string;
  discover?: true;
  /** Dot rojo pulsante si hay live activo (poll /api/lives/active). */
  showLiveDot?: true;
  /** Badge "Nuevo" en warning token. */
  showNewBadge?: true;
};

const PRIMARY_LINKS: readonly NavLink[] = [
  {
    href: "/marketplace/explorar",
    labelKey: "nav.explore",
    icon: Compass,
    matchPrefix: "/marketplace/explorar",
  },
  {
    href: "/marketplace",
    labelKey: "nav.stores",
    icon: Store,
    matchEquals: "/marketplace",
  },
  {
    href: "/recetas",
    labelKey: "nav.recipes",
    icon: ChefHat,
    matchPrefix: "/recetas",
  },
  // "Descubrí" se renderiza como mega-menu (DiscoverMegaMenu) con sus propios items.
  // Marker `discover: true` → el map lo salta y DiscoverMegaMenu ocupa ese slot.
  {
    href: "#discover",
    labelKey: "nav.discover",
    icon: Sparkles,
    discover: true,
  },
  {
    href: "/marketplace/en-vivo",
    labelKey: "nav.live",
    icon: Radio,
    matchPrefix: "/marketplace/en-vivo",
    showLiveDot: true,
  },
  {
    href: "/marketplace/ofertas",
    labelKey: "nav.offers",
    icon: Tag,
    matchPrefix: "/marketplace/ofertas",
    // badge "Nuevo" removido 2026-04-18 — llevaba meses, ya no aporta señal.
  },
] as const;

/** Poll `/api/lives/active` cada 60s — dot rojo pulsante si hay live activo. */
function useActiveLivePoll(): boolean {
  const [hasActive, setHasActive] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const fetchActive = async () => {
      try {
        const res = await fetch("/api/lives/active", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { data?: { active?: unknown[] } };
        if (cancelled) return;
        const activeCount = Array.isArray(json?.data?.active) ? json.data!.active!.length : 0;
        setHasActive(activeCount > 0);
      } catch {
        /* fire-and-forget, sin ruido */
      }
    };
    fetchActive();
    const id = setInterval(fetchActive, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
  return hasActive;
}

/** Sticky: surface token + blur + shadow cuando scroll > 40px. */
function useScrolledPastThreshold(px: number = 40): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > px);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [px]);
  return scrolled;
}

export default function MarketplaceNavbar() {
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const userMenuRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  const { authModalOpen, openAuthModal, closeAuthModal } = useAuthModal();
  const { count: wishlistCount } = useWishlist();
  const { customer, clear } = useCustomer();
  const { resolved: themeResolved, toggle: toggleTheme } = useTheme();
  const { t } = useLocale();
  const scrolled = useScrolledPastThreshold(40);
  const hasActiveLive = useActiveLivePoll();

  const handleOpenCart = useCallback(() => setCartOpen(true), []);
  const handleCloseCart = useCallback(() => setCartOpen(false), []);
  const handleCloseCheckout = useCallback(() => setCheckoutOpen(false), []);

  const handleCheckout = useCallback(() => {
    setCartOpen(false);
    setCheckoutOpen(true);
  }, []);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const q = searchQuery.trim();
      if (q) {
        router.push(`/marketplace/buscar?q=${encodeURIComponent(q)}`);
        setMobileMenuOpen(false);
      }
    },
    [searchQuery, router],
  );

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

  // Autofocus search al abrir drawer mobile
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const timer = setTimeout(() => mobileSearchRef.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, [mobileMenuOpen]);

  // Body scroll lock mientras drawer mobile abierto
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileMenuOpen]);

  // Escape cierra drawer mobile
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileMenuOpen]);

  const isActive = (link: NavLink) => {
    if (!pathname) return false;
    if (link.matchExact) return pathname === link.href;
    if (link.matchEquals) return pathname === link.matchEquals;
    if (link.matchPrefix) return pathname.startsWith(link.matchPrefix);
    return false;
  };

  return (
    <>
      <nav
        aria-label="Navegación del marketplace"
        className={cn(
          "sticky top-0 z-50 transition-[background-color,backdrop-filter,border-color,box-shadow] duration-200",
          scrolled
            ? "bg-[var(--surface-canvas)]/90 backdrop-blur-md shadow-[var(--shadow-sm)] border-b border-[var(--rule-soft)]"
            : "bg-[var(--surface-canvas)] border-b border-[var(--rule-soft)]",
        )}
      >
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center gap-3 lg:gap-4">
            {/* ── Logo ── */}
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

            {/* ── Search bar (desktop + tablet) ── */}
            <form
              onSubmit={handleSearch}
              role="search"
              aria-label={t("nav.search")}
              className="hidden md:block flex-1 max-w-[520px]"
            >
              <div className="relative">
                <Search
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none"
                  aria-hidden="true"
                  strokeWidth={1.75}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("nav.searchPlaceholder")}
                  aria-label={t("nav.search")}
                  className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 pl-10 pr-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]"
                />
              </div>
            </form>

            {/* ── Nav links transaccionales (lg+) ── */}
            <div className="hidden lg:flex items-center gap-0.5">
              {PRIMARY_LINKS.map((link) => {
                if (link.discover) {
                  return <DiscoverMegaMenu key="discover" variant="desktop" />;
                }
                const active = isActive(link);
                const LinkIcon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative rounded-lg px-3 py-2 text-sm font-semibold transition-colors inline-flex items-center gap-1.5",
                      active
                        ? "text-gray-900 dark:text-white after:content-[''] after:absolute after:left-3 after:right-3 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-[var(--accent)]"
                        : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white",
                    )}
                  >
                    <LinkIcon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    <span>{t(link.labelKey)}</span>
                    {link.showLiveDot && hasActiveLive && (
                      <span
                        aria-label={t("nav.liveNow")}
                        className="relative ml-0.5 inline-flex h-1.5 w-1.5"
                      >
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--data-error)] opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--data-error)]" />
                      </span>
                    )}
                    {link.showNewBadge && (
                      <span className="ml-0.5 inline-flex items-center rounded-full bg-[var(--data-warning-50)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--data-warning)]">
                        {t("nav.new")}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>

            {/* ── Right cluster (desktop) ── */}
            <div className="hidden md:flex items-center gap-1.5 ml-auto">
              <div className="hidden xl:flex items-center gap-1">
                <CurrencySwitcher />
                <LocaleSwitcher />
              </div>

              {/* Notif bell */}
              <button
                type="button"
                aria-label={t("nav.notifications")}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 dark:text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
                onClick={() => router.push("/cuenta/notificaciones")}
              >
                <Bell className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>

              {/* Cart */}
              <CartBadge onClick={handleOpenCart} />

              {/* Divider sutil */}
              <div
                className="mx-0.5 h-6 w-px bg-[var(--rule-soft)]"
                aria-hidden="true"
              />

              {/* Auth — Avatar dropdown o Ingresar */}
              {customer ? (
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setUserMenuOpen((o) => !o)}
                    aria-expanded={userMenuOpen}
                    aria-haspopup="true"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm font-semibold text-gray-900 dark:text-white transition-colors hover:bg-gray-200 dark:hover:bg-gray-700 min-h-[40px]"
                  >
                    <UserCircle className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
                    <span className="max-w-[5.5rem] truncate">
                      {customer.name?.split(" ")[0] ?? t("nav.account")}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform",
                        userMenuOpen && "rotate-180",
                      )}
                      aria-hidden="true"
                      strokeWidth={2}
                    />
                  </button>

                  {userMenuOpen && (
                    <div
                      role="menu"
                      aria-label="Menú de usuario"
                      className="absolute right-0 top-full mt-2 w-60 bg-[var(--surface-raised)] rounded-xl shadow-xl border border-[var(--rule-soft)] overflow-hidden z-50"
                    >
                      <div className="py-1.5">
                        <Link
                          href="/marketplace/mi-cuenta"
                          onClick={() => setUserMenuOpen(false)}
                          role="menuitem"
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <UserCircle
                            className="h-4 w-4 text-gray-500"
                            aria-hidden="true"
                            strokeWidth={1.75}
                          />
                          <span>{t("nav.account")}</span>
                        </Link>
                        <Link
                          href="/mis-pedidos"
                          onClick={() => setUserMenuOpen(false)}
                          role="menuitem"
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <Package
                            className="h-4 w-4 text-gray-500"
                            aria-hidden="true"
                            strokeWidth={1.75}
                          />
                          <span>{t("nav.orders")}</span>
                        </Link>
                        <Link
                          href="/cuenta/suscripciones"
                          onClick={() => setUserMenuOpen(false)}
                          role="menuitem"
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <Sparkles
                            className="h-4 w-4 text-gray-500"
                            aria-hidden="true"
                            strokeWidth={1.75}
                          />
                          <span>{t("nav.subscriptions")}</span>
                        </Link>
                        <Link
                          href="/marketplace/favoritos"
                          onClick={() => setUserMenuOpen(false)}
                          role="menuitem"
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <Heart
                            className={cn(
                              "h-4 w-4",
                              wishlistCount > 0
                                ? "fill-current text-[var(--data-error)]"
                                : "text-gray-500",
                            )}
                            aria-hidden="true"
                            strokeWidth={1.75}
                          />
                          <span className="flex-1">{t("nav.favorites")}</span>
                          {wishlistCount > 0 && (
                            <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-error)] bg-[var(--data-error-50)] px-1.5 py-0.5 rounded-full">
                              {wishlistCount > 99 ? "99+" : wishlistCount}
                            </span>
                          )}
                        </Link>
                        <button
                          onClick={() => {
                            toggleTheme();
                          }}
                          role="menuitem"
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                        >
                          {themeResolved === "dark" ? (
                            <Sun
                              className="h-4 w-4 text-gray-500"
                              aria-hidden="true"
                              strokeWidth={1.75}
                            />
                          ) : (
                            <Moon
                              className="h-4 w-4 text-gray-500"
                              aria-hidden="true"
                              strokeWidth={1.75}
                            />
                          )}
                          <span>
                            {themeResolved === "dark" ? t("nav.lightMode") : t("nav.darkMode")}
                          </span>
                        </button>
                        <div className="mx-3 my-1 border-t border-[var(--rule-soft)]" />
                        <button
                          onClick={() => {
                            clear();
                            setUserMenuOpen(false);
                            window.location.reload();
                          }}
                          role="menuitem"
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[var(--data-error)] hover:bg-[var(--data-error-50)] transition-colors text-left"
                        >
                          <LogOut className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
                          <span>{t("nav.logout")}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={openAuthModal}
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 focus-visible:outline-2 focus-visible:outline-[var(--accent)] min-h-[40px]"
                >
                  {t("nav.login")}
                </button>
              )}
            </div>

            {/* ── Mobile: cart + hamburger ── */}
            <div className="flex md:hidden items-center gap-1 ml-auto">
              <CartBadge onClick={handleOpenCart} />
              <button
                onClick={() => setMobileMenuOpen((o) => !o)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label={mobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-drawer"
              >
                {mobileMenuOpen ? (
                  <X className="h-5 w-5" aria-hidden="true" strokeWidth={1.75} />
                ) : (
                  <Menu className="h-5 w-5" aria-hidden="true" strokeWidth={1.75} />
                )}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Mobile drawer lateral ── */}
      {mobileMenuOpen && (
        <div className="md:hidden" role="presentation">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Cerrar menú"
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
          />
          <aside
            id="mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menú del marketplace"
            className="fixed inset-y-0 right-0 z-[70] flex w-[90vw] max-w-sm flex-col bg-[var(--surface-canvas)] shadow-2xl animate-in slide-in-from-right duration-200"
          >
            {/* Header drawer */}
            <div className="flex items-center justify-between border-b border-[var(--rule-soft)] px-4 py-3">
              <span className="inline-flex items-center gap-2 text-[var(--accent)]">
                <BulejeWordmark
                  size={28}
                  strokeWidth={1.75}
                  textSize={16}
                  className="text-[var(--accent)] dark:text-white"
                />
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Cerrar menú"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5" aria-hidden="true" strokeWidth={1.75} />
              </button>
            </div>

            {/* Search top, autofocus */}
            <form
              onSubmit={handleSearch}
              role="search"
              aria-label={t("nav.search")}
              className="border-b border-[var(--rule-soft)] px-4 py-3"
            >
              <div className="relative">
                <Search
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none"
                  aria-hidden="true"
                  strokeWidth={1.75}
                />
                <input
                  ref={mobileSearchRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("nav.searchPlaceholder")}
                  aria-label={t("nav.search")}
                  className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 pl-10 pr-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]"
                />
              </div>
            </form>

            {/* Scrollable: links + mega-menu + switchers */}
            <div className="flex-1 overflow-y-auto px-3 py-3">
              <div className="space-y-0.5">
                {PRIMARY_LINKS.map((link) => {
                  if (link.discover) return null;
                  const active = isActive(link);
                  const LinkIcon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileMenuOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                        active
                          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900",
                      )}
                    >
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--rule-soft)] bg-gray-50 dark:bg-gray-900">
                        <LinkIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      </span>
                      <span className="flex-1">{t(link.labelKey)}</span>
                      {link.showLiveDot && hasActiveLive && (
                        <span
                          aria-label={t("nav.liveNow")}
                          className="relative inline-flex h-2 w-2"
                        >
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--data-error)] opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--data-error)]" />
                        </span>
                      )}
                      {link.showNewBadge && (
                        <span className="inline-flex items-center rounded-full bg-[var(--data-warning-50)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--data-warning)]">
                          {t("nav.new")}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>

              {/* Separator + Descubrí mega-menu */}
              <div className="mt-3 border-t border-[var(--rule-soft)] pt-3">
                <DiscoverMegaMenu
                  variant="mobile"
                  onNavigate={() => setMobileMenuOpen(false)}
                />
              </div>

              {/* Separator + Locale/Currency horizontal compact */}
              <div className="mt-3 flex items-center gap-2 border-t border-[var(--rule-soft)] pt-3">
                <CurrencySwitcher />
                <LocaleSwitcher />
              </div>
            </div>

            {/* Footer drawer — auth + theme fijo abajo */}
            <div className="border-t border-[var(--rule-soft)] px-3 py-3 space-y-1">
              {customer ? (
                <>
                  <Link
                    href="/marketplace/mi-cuenta"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900"
                  >
                    <UserCircle
                      className="h-4 w-4 text-gray-500"
                      aria-hidden="true"
                      strokeWidth={1.75}
                    />
                    <span>
                      {t("nav.account")}
                      {customer.name ? ` — ${customer.name.split(" ")[0]}` : ""}
                    </span>
                  </Link>
                  <Link
                    href="/mis-pedidos"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900"
                  >
                    <Package
                      className="h-4 w-4 text-gray-500"
                      aria-hidden="true"
                      strokeWidth={1.75}
                    />
                    <span>{t("nav.orders")}</span>
                  </Link>
                  <Link
                    href="/marketplace/favoritos"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900"
                  >
                    <Heart
                      className={cn(
                        "h-4 w-4",
                        wishlistCount > 0
                          ? "fill-current text-[var(--data-error)]"
                          : "text-gray-500",
                      )}
                      aria-hidden="true"
                      strokeWidth={1.75}
                    />
                    <span className="flex-1">{t("nav.favorites")}</span>
                    {wishlistCount > 0 && (
                      <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-error)] bg-[var(--data-error-50)] px-1.5 py-0.5 rounded-full">
                        {wishlistCount > 99 ? "99+" : wishlistCount}
                      </span>
                    )}
                  </Link>
                </>
              ) : (
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    openAuthModal();
                  }}
                  className="w-full flex items-center justify-center rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 min-h-[44px]"
                >
                  {t("nav.login")}
                </button>
              )}
              <button
                onClick={() => {
                  toggleTheme();
                }}
                className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 text-left"
              >
                {themeResolved === "dark" ? (
                  <Sun
                    className="h-4 w-4 text-gray-500"
                    aria-hidden="true"
                    strokeWidth={1.75}
                  />
                ) : (
                  <Moon
                    className="h-4 w-4 text-gray-500"
                    aria-hidden="true"
                    strokeWidth={1.75}
                  />
                )}
                <span>
                  {themeResolved === "dark" ? t("nav.lightMode") : t("nav.darkMode")}
                </span>
              </button>
              {customer && (
                <button
                  onClick={() => {
                    clear();
                    setMobileMenuOpen(false);
                    window.location.reload();
                  }}
                  className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-[var(--data-error)] hover:bg-[var(--data-error-50)] text-left"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
                  <span>{t("nav.logout")}</span>
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      <MarketplaceCart
        isOpen={cartOpen}
        onClose={handleCloseCart}
        onCheckout={handleCheckout}
      />
      <MarketplaceCheckoutModal isOpen={checkoutOpen} onClose={handleCloseCheckout} />
      <AuthModal open={authModalOpen} onClose={closeAuthModal} />
    </>
  );
}
