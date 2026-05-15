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
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  Home as HomeIcon,
  Store,
  ChefHat,
  Sparkles,
  Radio,
  Tag,
  Package,
  Wallet,
  ShoppingCart,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { CartBadge } from "@/components/marketplace/MarketplaceCart";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { useTheme } from "@/contexts/theme-context";
import { useWishlist } from "@/hooks/use-wishlist";
import { useCustomer } from "@/contexts/customer-context";
import { AuthModal, useAuthModal } from "@/components/auth/AuthModal";
import { cn } from "@/lib/utils";
import { BulejeWordmark } from "@/components/ui-system/illustrations";
import { usePlatformBrand } from "@/lib/use-platform-brand";
import DiscoverMegaMenu from "@/components/marketplace/navbar/DiscoverMegaMenu";
// NotificationsMenu lazy — framer-motion pesado + solo aparece al click.
// Ahorra ~50kb del bundle initial del navbar.
const NotificationsMenu = dynamic(
  () => import("@/components/marketplace/NotificationsMenu"),
  {},
);
import NavbarSearchAutocomplete from "@/components/marketplace/NavbarSearchAutocomplete";
import ClienteFrecuenteBadge from "@/components/marketplace/ClienteFrecuenteBadge";
import OrderTrackerNavBadge from "@/components/marketplace/order-success/OrderTrackerNavBadge";
import { useNavVisibility } from "@/hooks/use-nav-visibility";
import { useMarketplaceNavMode } from "@/hooks/use-marketplace-nav-mode";
import { useNavScrollHide } from "@/hooks/use-nav-scroll-hide";
import { useLocale } from "@/contexts/locale-context";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";

// MarketplaceCheckoutModal y MarketplaceCart sidebar fueron deprecados —
// ahora el flujo es 100% pages: /marketplace/carrito -> /checkout/datos ->
// /checkout/entrega -> /checkout/confirmar. El navbar solo navega.

// ── Links transaccionales post-auth ──
// Prioridad (izq → der): Explorar · Bodegas · Recetas · Descubrí▼ · En Vivo · Ofertas.
// NO van aquí: Inicio, Nosotros, Abre-tu-Tienda (Landing Header).
//
// `matchEquals` para links exact (evita que "Bodegas" matchee en sub-rutas).
// `matchPrefix` para links de sección (cubre sub-rutas).
type NavLink = {
  /** ID canonico — debe coincidir con NAV_LINK_CATALOG.marketplace[*].id */
  id: string;
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
    // Brandon mayo 14 2026 v2: agregado link "Inicio" → home B2C (Rappi-style).
    // Aparece primero — siempre es la salida natural del marketplace al hero.
    id: "inicio",
    href: "/",
    labelKey: "nav.home",
    icon: HomeIcon,
    matchEquals: "/",
  },
  {
    id: "explorar",
    href: "/marketplace/explorar",
    labelKey: "nav.explore",
    icon: Compass,
    matchPrefix: "/marketplace/explorar",
  },
  {
    id: "bodegas",
    href: "/marketplace",
    labelKey: "nav.stores",
    icon: Store,
    matchEquals: "/marketplace",
  },
  {
    // Directorio de tiendas (filtrable por zona/categoría) — distinto de la
    // home de marketplace que muestra carruseles editoriales. Acceso directo
    // desde el navbar para usuarios que vienen a "buscar tienda" no producto.
    id: "tiendas",
    href: "/tiendas",
    labelKey: "nav.shopDirectory",
    icon: Store,
    matchPrefix: "/tiendas",
  },
  {
    id: "recetas",
    href: "/recetas",
    labelKey: "nav.recipes",
    icon: ChefHat,
    matchPrefix: "/recetas",
  },
  // "Descubrí" se renderiza como mega-menu (DiscoverMegaMenu) con sus propios items.
  // Marker `discover: true` → el map lo salta y DiscoverMegaMenu ocupa ese slot.
  {
    id: "descubri",
    href: "#discover",
    labelKey: "nav.discover",
    icon: Sparkles,
    discover: true,
  },
  {
    id: "en-vivo",
    href: "/marketplace/en-vivo",
    labelKey: "nav.live",
    icon: Radio,
    matchPrefix: "/marketplace/en-vivo",
    showLiveDot: true,
  },
  {
    id: "ofertas",
    href: "/marketplace/ofertas",
    labelKey: "nav.offers",
    icon: Tag,
    matchPrefix: "/marketplace/ofertas",
    // badge "Nuevo" removido 2026-04-18 — llevaba meses, ya no aporta señal.
  },
  {
    id: "como-pagar",
    href: "/marketplace/como-pagar",
    labelKey: "nav.howToPay",
    icon: Wallet,
    matchPrefix: "/marketplace/como-pagar",
  },
] as const;

/**
 * Devuelve las iniciales (1 o 2 letras) del nombre del usuario para
 * mostrar en el avatar del nav. Ej: "Juan Martínez" → "JM", "Ana" → "A".
 */
function getInitials(name: string | null | undefined): string {
  if (!name) return "•";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "•";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

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
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const navSearchParams = useSearchParams();
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { authModalOpen, openAuthModal, closeAuthModal } = useAuthModal();
  // Cuando volvemos del callback OAuth con `?oauth=complete&name=...`,
  // pre-llenamos el AuthModal con el nombre del usuario y solo le pedimos
  // el celular para terminar el registro.
  const [oauthInitialName, setOauthInitialName] = useState<string | null>(null);
  useEffect(() => {
    const oauth = navSearchParams.get("oauth");
    const oauthName = navSearchParams.get("name");
    if (oauth === "complete" && oauthName) {
      setOauthInitialName(oauthName);
      openAuthModal();
      // Limpiamos el query param para evitar re-abrir al refresh.
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("oauth");
        url.searchParams.delete("name");
        url.searchParams.delete("email");
        window.history.replaceState({}, "", url.toString());
      } catch {
        /* SSR guard */
      }
    }
    // intencional: solo correr al primer mount con los params
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { count: wishlistCount } = useWishlist();
  const { customer, clear } = useCustomer();
  // Carrito — usado en mobile para mostrar conteo encima del icono.
  const { itemCount: cartItemCount } = useMarketplaceCart();
  const { resolved: themeResolved, toggle: toggleTheme } = useTheme();
  const { t } = useLocale();
  const scrolled = useScrolledPastThreshold(40);
  const navVisible = useNavScrollHide(80);
  const hasActiveLive = useActiveLivePoll();
  const { brand } = usePlatformBrand();
  // Logo: si superadmin subió logos.logoLight (o logoDark en dark mode), úsalo;
  // si no, fallback al wordmark Buleje (SVG inline).
  const brandLogo =
    themeResolved === "dark"
      ? brand?.logos.logoDark ?? brand?.logos.logoLight ?? null
      : brand?.logos.logoLight ?? null;
  const brandName = brand?.identity.name ?? "Buleje";
  // Visibilidad de enlaces controlada desde superadmin/stores → Navegación
  const navVisibility = useNavVisibility("marketplace");
  const navMode = useMarketplaceNavMode();
  const isTiendasOnly = navMode === "tiendas-only";
  // En modo tiendas-only forzamos siempre visibles "ofertas" y "como-pagar"
  // — son utilitarios que ayudan a comprar y no deben ocultarse junto al resto.
  const FORCE_VISIBLE_IN_TIENDAS_ONLY = new Set(["ofertas", "como-pagar"]);
  const visibleLinks = PRIMARY_LINKS.filter((l) => {
    if (isTiendasOnly && FORCE_VISIBLE_IN_TIENDAS_ONLY.has(l.id)) return true;
    return navVisibility[l.id] !== false;
  });
  // En modo tiendas-only el chip "Bodegas" sobra: ya estamos en /tiendas
  // y el navbar debe priorizar el buscador centrado.
  const renderedLinks = isTiendasOnly
    ? visibleLinks.filter((l) => l.id !== "bodegas")
    : visibleLinks;

  const handleOpenCart = useCallback(() => {
    router.push("/marketplace/carrito");
  }, [router]);

  // Listener global de back-compat: si algun componente legacy aun dispara
  // "buleje:open-cart" (ej. el modal de "Agregado al carrito"), lo redirigimos
  // a la pagina de carrito en lugar de abrir un sidebar.
  useEffect(() => {
    const onOpenCart = () => router.push("/marketplace/carrito");
    window.addEventListener("buleje:open-cart", onOpenCart);
    return () => window.removeEventListener("buleje:open-cart", onOpenCart);
  }, [router]);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const q = searchQuery.trim();
      if (q) {
        // En modo "Solo Tiendas" la búsqueda filtra el listado de tiendas en
        // /tiendas?q=, no abre la página de búsqueda cross-product.
        if (isTiendasOnly) {
          router.push(`/tiendas?q=${encodeURIComponent(q)}`);
        } else {
          router.push(`/marketplace/buscar?q=${encodeURIComponent(q)}`);
        }
        setMobileMenuOpen(false);
      }
    },
    [searchQuery, router, isTiendasOnly],
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
          "nav-smooth-transition sticky top-0 z-50",
          scrolled
            ? "bg-[var(--surface-raised)]/95 backdrop-blur-md shadow-md border-b border-[var(--rule-base)]"
            : "bg-[var(--surface-raised)] shadow-sm border-b border-[var(--rule-base)]",
          navVisible ? "translate-y-0" : "-translate-y-full",
        )}
      >
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center gap-3 lg:gap-4">
            {/* ── Logo (desktop+tablet) — Brandon, mayo 14 2026: siempre lleva a /tiendas.
                 En mobile vive dentro del input de búsqueda (mayo 15 2026). ── */}
            <Link
              href="/tiendas"
              aria-label="Buleje — Ir al directorio de tiendas"
              className="hidden md:flex items-center shrink-0 text-[var(--accent)]"
            >
              <BulejeWordmark
                size={36}
                strokeWidth={1.75}
                textSize={18}
                className="text-[var(--accent-600)] dark:text-white"
              />
            </Link>

            {/* ── Search bar autocomplete (desktop + tablet) ── */}
            <div data-tour="search" className="hidden md:block flex-1 max-w-[680px]">
              <NavbarSearchAutocomplete
                className="block"
                storesOnly={isTiendasOnly}
                placeholder={
                  isTiendasOnly
                    ? "Buscar producto o tienda en Pucallpa..."
                    : t("nav.searchPlaceholder")
                }
              />
            </div>

            {/* ── Nav links transaccionales (lg+).
                Brandon mayo 2026: misma capsula pill que LandingHeader
                para consistencia entre pre-auth y post-auth.
                Active state = pill bg sólido (no más underline). */}
            <div className="hidden lg:inline-flex items-center gap-0.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-canvas)]/60 backdrop-blur-md p-1 shadow-sm">
              {renderedLinks.map((link) => {
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
                      "rounded-full px-3 py-1.5 text-sm font-semibold transition-all inline-flex items-center gap-1.5",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
                      active
                        ? "bg-[var(--accent-soft)] text-[var(--accent)] shadow-sm"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]/70 hover:text-[var(--text-primary)]",
                    )}
                  >
                    <LinkIcon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    <span>{t(link.labelKey)}</span>
                    {link.showLiveDot && hasActiveLive && (
                      <span
                        aria-label={t("nav.liveNow")}
                        className="relative ml-0.5 inline-flex h-1.5 w-1.5"
                      >
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--data-error-500)] opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--data-error-500)]" />
                      </span>
                    )}
                    {link.showNewBadge && (
                      <span className="ml-0.5 inline-flex items-center rounded-full bg-[var(--data-warning-50)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--data-warning-500)]">
                        {t("nav.new")}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>

            {/* ── Right cluster (desktop) ── */}
            <div className="hidden md:flex items-center gap-1.5 ml-auto">
              {/* Language + Theme — siempre arrancan en español + light.
                  Brandon mayo 2026: el selector de idioma solo aparece
                  cuando el superadmin tiene activo el modo "Marketplace
                  completo". En Solo Tiendas (default) es ruido — los
                  vecinos de Pucallpa solo hablan español. */}
              {!isTiendasOnly && <LanguageSwitcher />}
              <ThemeToggle className="!h-10 !w-10" />
              <div
                className="mx-0.5 h-6 w-px bg-[var(--rule-soft)]"
                aria-hidden="true"
              />

              {/* Order tracker badge — visible cuando hay pedido reciente,
                  reabre el OrderSuccessModal con animación pulse. */}
              <OrderTrackerNavBadge variant="compact" />

              {/* Notif bell dropdown */}
              <NotificationsMenu />

              {/* Cart */}
              <span data-tour="cart" className="inline-flex">
                <CartBadge onClick={handleOpenCart} />
              </span>

              {/* Divider sutil */}
              <div
                className="mx-0.5 h-6 w-px bg-[var(--rule-soft)]"
                aria-hidden="true"
              />

              {/* Auth — Avatar circular con iniciales o Ingresar */}
              {customer ? (
                <div className="relative" ref={userMenuRef} data-tour="user-menu">
                  <button
                    onClick={() => setUserMenuOpen((o) => !o)}
                    aria-expanded={userMenuOpen}
                    aria-haspopup="true"
                    aria-label={`Cuenta de ${customer.name ?? "usuario"}`}
                    className="group inline-flex items-center gap-2 rounded-full border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] p-0.5 pr-3 transition-all hover:border-[var(--accent)] hover:shadow-md"
                  >
                    {/* Círculo con iniciales del nombre */}
                    <span
                      aria-hidden="true"
                      className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-black text-white shadow-sm"
                    >
                      {getInitials(customer.name)}
                    </span>
                    <span className="hidden sm:inline max-w-[5.5rem] truncate text-sm font-bold text-[var(--text-primary)]">
                      {customer.name?.split(" ")[0] ?? t("nav.account")}
                    </span>
                    <span className="hidden md:inline">
                      <ClienteFrecuenteBadge variant="chip" />
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 text-[var(--text-tertiary)] transition-transform",
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
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] dark:text-gray-200 hover:bg-[var(--surface-alt)] dark:hover:bg-gray-800 transition-colors"
                        >
                          <UserCircle
                            className="h-4 w-4 text-[var(--text-secondary)]"
                            aria-hidden="true"
                            strokeWidth={1.75}
                          />
                          <span>{t("nav.account")}</span>
                        </Link>
                        <Link
                          href="/mis-pedidos"
                          onClick={() => setUserMenuOpen(false)}
                          role="menuitem"
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] dark:text-gray-200 hover:bg-[var(--surface-alt)] dark:hover:bg-gray-800 transition-colors"
                        >
                          <Package
                            className="h-4 w-4 text-[var(--text-secondary)]"
                            aria-hidden="true"
                            strokeWidth={1.75}
                          />
                          <span>{t("nav.orders")}</span>
                        </Link>
                        <Link
                          href="/cuenta/suscripciones"
                          onClick={() => setUserMenuOpen(false)}
                          role="menuitem"
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] dark:text-gray-200 hover:bg-[var(--surface-alt)] dark:hover:bg-gray-800 transition-colors"
                        >
                          <Sparkles
                            className="h-4 w-4 text-[var(--text-secondary)]"
                            aria-hidden="true"
                            strokeWidth={1.75}
                          />
                          <span>{t("nav.subscriptions")}</span>
                        </Link>
                        <Link
                          href="/marketplace/favoritos"
                          onClick={() => setUserMenuOpen(false)}
                          role="menuitem"
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] dark:text-gray-200 hover:bg-[var(--surface-alt)] dark:hover:bg-gray-800 transition-colors"
                        >
                          <Heart
                            className={cn(
                              "h-4 w-4",
                              wishlistCount > 0
                                ? "fill-current text-[var(--data-error-500)]"
                                : "text-[var(--text-secondary)]",
                            )}
                            aria-hidden="true"
                            strokeWidth={1.75}
                          />
                          <span className="flex-1">{t("nav.favorites")}</span>
                          {wishlistCount > 0 && (
                            <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-500)] bg-[var(--data-error-50)] px-1.5 py-0.5 rounded-full">
                              {wishlistCount > 99 ? "99+" : wishlistCount}
                            </span>
                          )}
                        </Link>
                        <button
                          onClick={() => {
                            toggleTheme();
                          }}
                          role="menuitem"
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] dark:text-gray-200 hover:bg-[var(--surface-alt)] dark:hover:bg-gray-800 transition-colors text-left"
                        >
                          {themeResolved === "dark" ? (
                            <Sun
                              className="h-4 w-4 text-[var(--text-secondary)]"
                              aria-hidden="true"
                              strokeWidth={1.75}
                            />
                          ) : (
                            <Moon
                              className="h-4 w-4 text-[var(--text-secondary)]"
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
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] transition-colors text-left"
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
                  data-tour="user-menu"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 h-10 text-sm font-extrabold text-white",
                    "shadow-md shadow-[var(--accent)]/25",
                    "hover:bg-[var(--accent)]/95 hover:shadow-lg hover:shadow-[var(--accent)]/35",
                    "active:scale-[0.98] transition-all duration-200",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
                  )}
                >
                  {t("nav.login")}
                </button>
              )}
            </div>

            {/* ── Mobile bar (Brandon, mayo 15 2026) ──
                 Layout: [Hamburger] [Search pill: logo + placeholder + lupa] [User] [Cart-with-count-on-top].
                 El logo desktop arriba se oculta — vive dentro del input ahora.
                 OrderTrackerNavBadge se mueve al drawer en mobile (real-estate). */}
            <div className="flex md:hidden items-center gap-1.5 w-full">
              {/* Hamburger */}
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                aria-label="Abrir menú"
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-drawer"
              >
                <Menu className="h-6 w-6" aria-hidden="true" strokeWidth={2} />
              </button>

              {/* Search pill: logo Buleje (mark) · placeholder · lupa */}
              <form
                onSubmit={handleSearch}
                role="search"
                aria-label={t("nav.search")}
                className="flex-1 min-w-0"
              >
                <div className="relative flex items-center h-11 rounded-full bg-[var(--surface-sunken)] border-2 border-[var(--rule-base)] focus-within:border-[var(--accent)] focus-within:bg-[var(--surface-canvas)] transition-colors pl-1.5 pr-1 gap-1.5">
                  {/* Logo (solo mark, sin texto) al inicio del input */}
                  <Link
                    href="/tiendas"
                    aria-label="Buleje — Inicio"
                    className="shrink-0 inline-flex items-center"
                    onClick={(e) => {
                      // Si el input tiene foco, evita perderlo al tocar el logo.
                      e.currentTarget.blur();
                    }}
                  >
                    <BulejeWordmark size={28} showText={false} />
                  </Link>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Categoría, producto o tienda"
                    aria-label={t("nav.search")}
                    className="flex-1 min-w-0 bg-transparent outline-none text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] placeholder:font-medium"
                  />
                  <button
                    type="submit"
                    aria-label="Buscar"
                    className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-white active:scale-95 transition-transform hover:brightness-110"
                  >
                    <Search className="h-4 w-4" aria-hidden="true" strokeWidth={2.5} />
                  </button>
                </div>
              </form>

              {/* User — iniciales si está autenticado, ícono si no */}
              {customer ? (
                <Link
                  href="/marketplace/mi-cuenta"
                  aria-label={`Cuenta de ${customer.name ?? "usuario"}`}
                  className="shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent)] text-[length:var(--ts-sm)] font-black text-white shadow-sm active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                >
                  {getInitials(customer.name)}
                </Link>
              ) : (
                <button
                  onClick={openAuthModal}
                  aria-label={t("nav.login")}
                  className="shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-[var(--rule-base)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                >
                  <UserCircle className="h-6 w-6" aria-hidden="true" strokeWidth={1.75} />
                </button>
              )}

              {/* Cart — ícono con contador ARRIBA (centrado), no al costado */}
              <button
                data-tour="cart"
                onClick={handleOpenCart}
                aria-label={`Carrito — ${cartItemCount} ${cartItemCount === 1 ? "producto" : "productos"}`}
                className="relative shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                {cartItemCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute top-0 left-1/2 -translate-x-1/2 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-black text-white shadow-sm leading-none ring-2 ring-[var(--surface-raised)] tabular-nums"
                  >
                    {cartItemCount > 99 ? "99+" : cartItemCount}
                  </span>
                )}
                <ShoppingCart
                  className="h-6 w-6 mt-1.5"
                  aria-hidden="true"
                  strokeWidth={2}
                />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Mobile drawer (Brandon, mayo 15 2026 v2) ──
           - Sale por la IZQUIERDA (mismo lado que el hamburger)
           - Transición suave: 320ms cubic-bezier easeOut + fade del backdrop
           - Sin input de búsqueda interno (ya vive en la nav bar)
           - Header gradient con logo + saludo + decorative blobs
           - Items con indicator pill izquierdo + chevron derecho */}
      {mobileMenuOpen && (
        <div className="md:hidden" role="presentation">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Cerrar menú"
            className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-md animate-in fade-in duration-300"
          />
          <aside
            id="mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menú del marketplace"
            className="fixed inset-y-0 left-0 z-[70] flex w-[88%] sm:max-w-md flex-col bg-[var(--surface-canvas)] shadow-[8px_0_48px_-8px_rgba(0,0,0,0.35)] animate-in slide-in-from-left fade-in duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] overscroll-contain rounded-r-3xl"
          >
            {/* ── Header gradient ── */}
            <div className="relative overflow-hidden bg-linear-to-br from-[var(--accent-600,var(--accent))] via-[var(--accent)] to-[var(--accent-500,var(--accent))] text-white px-5 pt-5 pb-6 rounded-tr-3xl">
              {/* decorative blobs */}
              <div
                aria-hidden
                className="pointer-events-none absolute -top-20 -right-10 h-48 w-48 rounded-full bg-white/15 blur-3xl"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute -bottom-16 -left-8 h-36 w-36 rounded-full bg-white/10 blur-2xl"
              />

              {/* Top row: brand + close */}
              <div className="relative flex items-center justify-between mb-5">
                <Link
                  href="/tiendas"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Buleje — Inicio"
                  className="inline-flex items-center gap-2 text-white"
                >
                  {/* Mark blanco (cuadrado) — diseño plano para que se vea sobre gradient accent */}
                  <span
                    aria-hidden
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/40 backdrop-blur-sm"
                  >
                    <span className="text-white font-black text-lg leading-none -mt-0.5">b</span>
                  </span>
                  <span className="font-extrabold text-xl tracking-[var(--ls-tight)] text-white leading-none">
                    Buleje
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Cerrar menú"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 active:scale-90 transition-all"
                >
                  <X className="h-5 w-5" aria-hidden="true" strokeWidth={2.5} />
                </button>
              </div>

              {/* Greeting block */}
              <div className="relative flex items-center gap-3">
                {customer ? (
                  <span
                    aria-hidden
                    className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-[var(--accent)] text-lg font-black uppercase shadow-lg ring-2 ring-white/30"
                  >
                    {getInitials(customer.name)}
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/15 text-white shadow-lg ring-2 ring-white/30"
                  >
                    <UserCircle className="h-7 w-7" strokeWidth={1.75} />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white/80 leading-tight">
                    {customer ? "Tu cuenta" : "Bienvenido a"}
                  </p>
                  <p className="text-xl font-extrabold tracking-[var(--ls-tight)] text-white leading-tight truncate">
                    {customer ? `Hola, ${customer.name?.split(" ")[0] ?? "vecino"}` : "Buleje Pucallpa"}
                  </p>
                  {customer?.phone ? (
                    <p className="text-[length:var(--ts-xs)] font-medium text-white/85 tabular-nums leading-tight mt-0.5">
                      +51 {customer.phone}
                    </p>
                  ) : (
                    <p className="text-[length:var(--ts-xs)] font-medium text-white/80 leading-tight mt-0.5">
                      Tu barrio, tu compra
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Body scrollable ── */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-4">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2.5 px-3">
                Explorar
              </p>
              <ul className="space-y-1">
                {renderedLinks.map((link) => {
                  if (link.discover) return null;
                  const active = isActive(link);
                  const LinkIcon = link.icon;
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        onClick={() => setMobileMenuOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-2xl pl-4 pr-3 py-2.5 text-[length:var(--ts-sm)] font-bold transition-all active:scale-[0.98]",
                          active
                            ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                            : "text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]",
                        )}
                      >
                        {/* Indicator pill (left edge) cuando activo */}
                        {active && (
                          <span
                            aria-hidden
                            className="absolute left-0 top-1/2 -translate-y-1/2 h-7 w-1 rounded-r-full bg-[var(--accent)]"
                          />
                        )}
                        <span
                          className={cn(
                            "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition-all",
                            active
                              ? "bg-[var(--accent)] text-white shadow-[0_6px_16px_-6px_var(--accent)]"
                              : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] group-hover:bg-[var(--accent-soft)] group-hover:text-[var(--accent)]",
                          )}
                        >
                          <LinkIcon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
                        </span>
                        <span className="flex-1 truncate">{t(link.labelKey)}</span>
                        {link.showLiveDot && hasActiveLive && (
                          <span
                            aria-label={t("nav.liveNow")}
                            className="relative inline-flex h-2.5 w-2.5"
                          >
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--data-error-500)] opacity-75" />
                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--data-error-500)]" />
                          </span>
                        )}
                        {link.showNewBadge && (
                          <span className="inline-flex items-center rounded-full bg-[var(--data-warning-50)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-black uppercase tracking-wide text-[var(--data-warning-500)]">
                            {t("nav.new")}
                          </span>
                        )}
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 -rotate-90 transition-transform",
                            active
                              ? "text-[var(--accent)]"
                              : "text-[var(--text-tertiary)] group-hover:translate-x-0.5",
                          )}
                          strokeWidth={2}
                          aria-hidden
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>

              {/* Descubrí mega-menu — solo si NO estamos en modo "Solo Tiendas" */}
              {!isTiendasOnly && (
                <div className="mt-4 border-t border-[var(--rule-soft)] pt-4 px-1">
                  <DiscoverMegaMenu
                    variant="mobile"
                    onNavigate={() => setMobileMenuOpen(false)}
                  />
                </div>
              )}

              {/* Tu cuenta quick-access (solo customer) */}
              {customer && (
                <div className="mt-4 border-t border-[var(--rule-soft)] pt-4">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2.5 px-3">
                    Tu cuenta
                  </p>
                  <div className="grid grid-cols-3 gap-2 px-1">
                    <Link
                      href="/marketplace/mi-cuenta"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] px-2 py-3 text-[length:var(--ts-xs)] font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:bg-[var(--accent-soft)]/30 active:scale-95 transition-all text-center"
                    >
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                        <UserCircle className="h-5 w-5" strokeWidth={1.75} />
                      </span>
                      <span className="truncate w-full">{t("nav.account")}</span>
                    </Link>
                    <Link
                      href="/mis-pedidos"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] px-2 py-3 text-[length:var(--ts-xs)] font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:bg-[var(--accent-soft)]/30 active:scale-95 transition-all text-center"
                    >
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                        <Package className="h-5 w-5" strokeWidth={1.75} />
                      </span>
                      <span className="truncate w-full">{t("nav.orders")}</span>
                    </Link>
                    <Link
                      href="/marketplace/favoritos"
                      onClick={() => setMobileMenuOpen(false)}
                      className="relative flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] px-2 py-3 text-[length:var(--ts-xs)] font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:bg-[var(--accent-soft)]/30 active:scale-95 transition-all text-center"
                    >
                      <span
                        className={cn(
                          "inline-flex h-9 w-9 items-center justify-center rounded-full",
                          wishlistCount > 0
                            ? "bg-[var(--data-error-50)] text-[var(--data-error-500)]"
                            : "bg-[var(--accent-soft)] text-[var(--accent)]",
                        )}
                      >
                        <Heart
                          className={cn("h-5 w-5", wishlistCount > 0 && "fill-current")}
                          strokeWidth={1.75}
                          aria-hidden
                        />
                      </span>
                      <span className="truncate w-full">{t("nav.favorites")}</span>
                      {wishlistCount > 0 && (
                        <span className="absolute top-1.5 right-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--data-error-500)] px-1 text-[length:var(--ts-2xs)] font-black text-white">
                          {wishlistCount > 99 ? "99+" : wishlistCount}
                        </span>
                      )}
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* ── Footer: login + theme + logout ── */}
            <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]/50 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] rounded-br-3xl">
              {!customer && (
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    openAuthModal();
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-linear-to-r from-[var(--accent-600,var(--accent))] to-[var(--accent)] px-4 h-12 text-sm font-extrabold text-white hover:brightness-110 active:scale-[0.98] transition-all shadow-[0_8px_24px_-8px_var(--accent)] mb-2"
                >
                  <UserCircle className="h-5 w-5" strokeWidth={2} aria-hidden />
                  {t("nav.login")}
                </button>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleTheme()}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 h-11 text-[length:var(--ts-xs)] font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] active:scale-[0.98] transition-all"
                >
                  {themeResolved === "dark" ? (
                    <Sun className="h-4 w-4" strokeWidth={2} aria-hidden />
                  ) : (
                    <Moon className="h-4 w-4" strokeWidth={2} aria-hidden />
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
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-50,#fef2f2)] px-3 h-11 text-[length:var(--ts-xs)] font-bold text-[var(--data-error-600,#dc2626)] hover:bg-[var(--data-error-100,#fee2e2)] active:scale-[0.98] transition-all"
                    aria-label={t("nav.logout")}
                  >
                    <LogOut className="h-4 w-4" strokeWidth={2} aria-hidden />
                  </button>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}

      <AuthModal
        open={authModalOpen}
        onClose={() => {
          setOauthInitialName(null);
          closeAuthModal();
        }}
        initialName={oauthInitialName ?? undefined}
      />
    </>
  );
}
