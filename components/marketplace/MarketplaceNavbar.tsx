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
import { CartBadge } from "@/components/marketplace/cart/CartBadge";
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
import MobileSearchOverlay from "@/components/marketplace/MobileSearchOverlay";
import SharedMobileNavDrawer from "@/components/marketplace/SharedMobileNavDrawer";
import ClienteFrecuenteBadge from "@/components/marketplace/ClienteFrecuenteBadge";
import OrderTrackerNavBadge from "@/components/marketplace/order-success/OrderTrackerNavBadge";
import { useNavVisibility } from "@/hooks/use-nav-visibility";
import { useHasActiveOffers } from "@/hooks/use-active-offers";
import { useMarketplaceNavMode } from "@/hooks/use-marketplace-nav-mode";
// Brandon 2026-05-21: `useNavScrollHide` removido — navbar siempre fijo.
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

// Brandon 2026-05-20 v7 — logo dinámico en storefront:
// Cuando el usuario navega a /marketplace/[slug] (storefront de una tienda
// específica), el search pill del navbar debe mostrar el logo de ESA tienda
// en lugar del mark de Buleje. Detectamos el slug del path, fetcheamos el
// logo a /api/marketplace/stores/[slug]/logo y cacheamos en sessionStorage
// para evitar re-fetchear al navegar dentro del mismo storefront.
function useStorefrontLogo(pathname: string | null): {
  logo: string | null;
  name: string | null;
} {
  const [data, setData] = useState<{ logo: string | null; name: string | null }>(
    { logo: null, name: null },
  );

  useEffect(() => {
    if (!pathname) {
      setData({ logo: null, name: null });
      return;
    }
    // Solo aplica en /marketplace/[slug] (no en /marketplace, /marketplace/explorar,
    // /marketplace/mi-cuenta, etc — solo subrutas con slug específico).
    const match = pathname.match(/^\/marketplace\/([^/]+)$/);
    const slug = match?.[1];
    // Excluimos paths reservados que NO son slugs de tienda
    const RESERVED = new Set([
      "explorar", "ofertas", "favoritos", "carrito", "mi-cuenta",
      "como-pagar", "repartidor", "registrar", "buscar", "categoria",
      "gift-cards", "recetas", "calificar-entrega", "en-vivo",
      "comparar", "payment-result", "apply",
    ]);
    if (!slug || RESERVED.has(slug)) {
      setData({ logo: null, name: null });
      return;
    }

    // Cache key per slug — sessionStorage para que persista al navegar entre
    // PDPs de la misma tienda sin re-fetch.
    const cacheKey = `bsm:storefront:logo:${slug}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        setData({ logo: parsed.logo ?? null, name: parsed.name ?? null });
        return;
      }
    } catch {
      /* sessionStorage puede fallar en private browsing */
    }

    // Fetch al endpoint específico del storefront (single store by slug).
    // Brandon 2026-05-20 v7: antes usaba /api/marketplace/stores?slug=...
    // pero ese endpoint NO acepta `slug` como param — devolvía todas las
    // tiendas. El correcto es /api/marketplace/stores/[slug] que retorna
    // el detail con logo + name + tenantSlug.
    const ctrl = new AbortController();
    fetch(`/api/marketplace/stores/${encodeURIComponent(slug)}`, {
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const store = j?.data;
        if (!store) {
          setData({ logo: null, name: null });
          return;
        }
        const payload = { logo: store.logo ?? null, name: store.name ?? null };
        setData(payload);
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(payload));
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setData({ logo: null, name: null });
      });
    return () => ctrl.abort();
  }, [pathname]);

  return data;
}

type MarketplaceNavbarProps = {
  /**
   * Override del modo del navbar. Si se pasa desde el layout server-side
   * (ej. `/tiendas/layout.tsx`), evita el flash de "links del marketplace →
   * recorte tiendas-only" que producía el hook client `useMarketplaceNavMode()`
   * al resolverse post-hidratación. Brandon 2026-05-21 perf FOUC.
   */
  modeOverride?: import("@/lib/nav-visibility").MarketplaceNavMode;
};

export default function MarketplaceNavbar({ modeOverride }: MarketplaceNavbarProps = {}) {
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const navSearchParams = useSearchParams();
  // Logo dinámico cuando estamos dentro de un storefront concreto.
  const storefront = useStorefrontLogo(pathname);
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
  // Brandon 2026-05-21: navbar siempre fijo en mobile + desktop. Antes
  // usaba `useNavScrollHide(80)` para esconderse al scrollear hacia abajo,
  // pero Brandon prefiere acceso constante a buscador/carrito/cuenta. El
  // hook se sigue usando en otros lugares (sticky bars de subcategorías).
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
  const navModeHook = useMarketplaceNavMode();
  // Cuando viene `modeOverride` (server-side desde un segment layout) lo
  // usamos como verdad absoluta. Esto evita el flash post-hidratación, porque
  // el hook arranca `null` en SSR y resuelve después → con override el primer
  // render ya conoce el modo correcto.
  const navMode = modeOverride ?? navModeHook;
  const isTiendasOnly = navMode === "tiendas-only";
  // Brandon 2026-05-18 v3: gate "Ofertas" si no hay descuentos activos en
  // ningún tenant. Antes el link estaba forzado visible en modo tiendas-only,
  // ahora gatea por dato real (no prometer descuentos inexistentes).
  const hasActiveOffers = useHasActiveOffers();
  // En modo tiendas-only forzamos siempre visible "como-pagar" — utilitario
  // que ayuda a comprar. "Ofertas" ya no se fuerza: respeta hasActiveOffers.
  const FORCE_VISIBLE_IN_TIENDAS_ONLY = new Set(["como-pagar"]);
  const visibleLinks = PRIMARY_LINKS.filter((l) => {
    // Ofertas — solo visible si hay ofertas activas (independiente de superadmin).
    if (l.id === "ofertas" && hasActiveOffers !== true) return false;
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

  // El search mobile ahora abre MobileSearchOverlay (panel full-screen con
  // sugerencias/recientes). El form solo previene el submit nativo y abre el
  // overlay — la query real se escribe dentro del overlay.
  const openMobileSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setMobileSearchOpen(true);
  }, []);

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
        )}
      >
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
          {/* Brandon 2026-05-20 v6 — navbar mobile minimalista:
              h-16 (64px) → h-14 (56px) en mobile, h-16 desktop.
              Reduce el real-estate ocupado above-the-fold y se siente más
              ligero/comercial. Desktop mantiene h-16 por links + branding. */}
          <div className="flex h-14 md:h-16 items-center gap-2 sm:gap-3 lg:gap-4">
            {/* ── Logo (desktop+tablet) — Brandon, mayo 14 2026: siempre lleva a /tiendas.
                 En mobile vive dentro del input de búsqueda (mayo 15 2026). ── */}
            {/* Brandon 2026-05-20 v7: logo dinámico — en storefront muestra
                el logo del negocio + nombre; en otras rutas el wordmark Buleje. */}
            {/* Brandon 2026-05-20 v9 audit P1: logo va a "/" (home) — convención
                UX universal. En storefront sigue siendo "/" pero también ofrecemos
                volver al directorio /tiendas via breadcrumb interno. */}
            <Link
              href={storefront.logo ? "/tiendas" : "/"}
              aria-label={
                storefront.logo
                  ? `${storefront.name ?? "Tienda"} — Ver directorio`
                  : "Buleje — Ir al inicio"
              }
              className="hidden md:flex items-center gap-2 shrink-0 text-[var(--accent)]"
            >
              {storefront.logo ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element -- avatar simple */}
                  <img
                    src={storefront.logo}
                    alt=""
                    width={36}
                    height={36}
                    className="h-9 w-9 rounded-full object-cover ring-2 ring-[var(--rule-base)]"
                    loading="eager"
                  />
                  {storefront.name && (
                    <span className="font-extrabold text-base tracking-tight text-[var(--text-primary)] max-w-[180px] truncate">
                      {storefront.name}
                    </span>
                  )}
                </>
              ) : (
                <BulejeWordmark
                  size={36}
                  strokeWidth={1.75}
                  textSize={18}
                  className="text-[var(--accent-600)] dark:text-white"
                />
              )}
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
            <div className="flex md:hidden items-center gap-1 w-full">
              {/* Brandon 2026-05-20 v6 — bar mobile compactado:
                  · botones h-11 (44px) → h-10 (40px): sigue tappable (WCAG
                    pide ≥44px ideal pero 40px aceptable, mejor ratio visual)
                  · íconos h-6 (24px) → h-5 (20px): más sutil, menos peso
                  · search pill h-11 → h-10, border-2 → border (1px): minimalista
                  · gap 1.5 → 1: agrupa cluster visualmente
                  · placeholder más corto: "Buscar tienda…" en lugar de
                    "Categoría, producto o tienda" (3 palabras → 2) */}
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                aria-label="Abrir menú"
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-drawer"
              >
                <Menu className="h-5 w-5" aria-hidden="true" strokeWidth={2.25} />
              </button>

              {/* Search pill compacto: logo + placeholder + lupa */}
              <form
                onSubmit={openMobileSearch}
                role="search"
                aria-label={t("nav.search")}
                className="flex-1 min-w-0"
              >
                <div className="relative flex items-center h-10 rounded-full bg-[var(--surface-sunken)] border border-[var(--rule-base)] focus-within:border-[var(--accent)] focus-within:bg-[var(--surface-canvas)] transition-colors pl-1.5 pr-1 gap-1">
                  <Link
                    href={storefront.logo ? "/tiendas" : "/"}
                    aria-label={storefront.logo ? `${storefront.name ?? "Tienda"} — Ver directorio` : "Buleje — Inicio"}
                    className="shrink-0 inline-flex items-center"
                    onClick={(e) => {
                      e.currentTarget.blur();
                    }}
                  >
                    {/* Brandon 2026-05-20 v7: logo dinámico — en storefront
                        (/marketplace/[slug]) muestra el logo del negocio;
                        en cualquier otra ruta el mark de Buleje. Avatar
                        circular para que se vea como "estás en esta tienda". */}
                    {storefront.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element -- avatar simple, sin next/image overhead
                      <img
                        src={storefront.logo}
                        alt=""
                        width={24}
                        height={24}
                        className="h-6 w-6 rounded-full object-cover ring-1 ring-[var(--rule-base)]"
                        loading="eager"
                      />
                    ) : (
                      <BulejeWordmark size={24} showText={false} />
                    )}
                  </Link>
                  {/* Brandon 2026-05-24: el input mobile ahora ABRE el overlay
                      de búsqueda full-screen (sugerencias + recientes +
                      categorías) en vez de tipear inline sin panel. readOnly +
                      onFocus/onClick → setMobileSearchOpen(true). */}
                  <input
                    type="text"
                    readOnly
                    onFocus={(e) => {
                      e.currentTarget.blur();
                      setMobileSearchOpen(true);
                    }}
                    onClick={() => setMobileSearchOpen(true)}
                    placeholder="Buscar productos o tiendas…"
                    aria-label={t("nav.search")}
                    aria-haspopup="dialog"
                    className="flex-1 min-w-0 bg-transparent outline-none text-[13px] font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] placeholder:font-medium cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => setMobileSearchOpen(true)}
                    aria-label="Buscar"
                    className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-white active:scale-95 transition-transform hover:brightness-110"
                  >
                    <Search className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={2.5} />
                  </button>
                </div>
              </form>

              {/* User — iniciales o ícono. Compactado a h-10. */}
              {customer ? (
                <Link
                  href="/marketplace/mi-cuenta"
                  aria-label={`Cuenta de ${customer.name ?? "usuario"}`}
                  className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)] text-[12px] font-black text-white shadow-sm active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                >
                  {getInitials(customer.name)}
                </Link>
              ) : (
                <button
                  onClick={openAuthModal}
                  aria-label={t("nav.login")}
                  className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--rule-base)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                >
                  <UserCircle className="h-5 w-5" aria-hidden="true" strokeWidth={1.75} />
                </button>
              )}

              {/* Cart — compactado. Badge sigue siendo prominente con ring. */}
              <button
                data-tour="cart"
                onClick={handleOpenCart}
                aria-label={`Carrito — ${cartItemCount} ${cartItemCount === 1 ? "producto" : "productos"}`}
                className="relative shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                {cartItemCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute top-0.5 right-0.5 inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-black text-white shadow-sm leading-none ring-2 ring-[var(--surface-raised)] tabular-nums"
                  >
                    {cartItemCount > 99 ? "99+" : cartItemCount}
                  </span>
                )}
                <ShoppingCart
                  className="h-5 w-5"
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
      {/* Brandon 2026-05-18: drawer unificado SharedMobileNavDrawer.
          Antes había drawer inline gigante (~280 líneas) duplicado con el
          del StoreDetailClient. Ahora ambos consumen el mismo componente. */}
      <SharedMobileNavDrawer
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      {/* Buscador full-screen mobile — sugerencias + recientes + categorías */}
      <MobileSearchOverlay
        open={mobileSearchOpen}
        onClose={() => setMobileSearchOpen(false)}
        storesOnly={isTiendasOnly}
      />

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
