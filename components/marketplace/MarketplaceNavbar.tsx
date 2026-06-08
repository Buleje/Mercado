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
  Building2,
  Rocket,
  ChefHat,
  Sparkles,
  Radio,
  Tag,
  Package,
  Wallet,
  ShoppingCart,
  ShoppingBag,
  MapPin,
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
import { BRAND_GEO } from "@/lib/geo";
// NotificationsMenu lazy — framer-motion pesado + solo aparece al click.
// Ahorra ~50kb del bundle initial del navbar.
const NotificationsMenu = dynamic(
  () => import("@/components/marketplace/NotificationsMenu"),
  {},
);
// Chat con tiendas estilo Messenger (Brandon 2026-06-06) — lazy: el panel
// solo se monta al interactuar; el botón es liviano pero el chat no.
const ChatNavLauncher = dynamic(
  () => import("@/components/marketplace/chat/ChatNavLauncher"),
  { ssr: false },
);
// Brandon 2026-05-27 (audit perf bundle): estos 3 viven en el navbar que está
// en TODAS las páginas del storefront, pero solo aparecen al interactuar
// (lupa / hamburguesa / mega-menú). Lazy → fuera del bundle del primer paint.
const MobileSearchOverlay = dynamic(
  () => import("@/components/marketplace/MobileSearchOverlay"),
  { ssr: false },
);
const SharedMobileNavDrawer = dynamic(
  () => import("@/components/marketplace/SharedMobileNavDrawer"),
  { ssr: false },
);
import NavbarSearchAutocomplete from "@/components/marketplace/NavbarSearchAutocomplete";
import ClienteFrecuenteBadge from "@/components/marketplace/ClienteFrecuenteBadge";
import OrderTrackerNavBadge from "@/components/marketplace/order-success/OrderTrackerNavBadge";
import { useNavVisibility } from "@/hooks/use-nav-visibility";
import { useHasActiveOffers } from "@/hooks/use-active-offers";
import { useMarketplaceNavMode } from "@/hooks/use-marketplace-nav-mode";
// Brandon 2026-05-21: `useNavScrollHide` removido — navbar siempre fijo.
import { useLocale } from "@/contexts/locale-context";
import LanguageSwitcher from "@/components/LanguageSwitcher";

// MarketplaceCheckoutModal y MarketplaceCart sidebar fueron deprecados —
// ahora el flujo es 100% pages: /marketplace/carrito -> /checkout/datos ->
// /checkout/entrega -> /checkout/confirmar. El navbar solo navega.

// ── Links transaccionales post-auth ──
// Prioridad (izq → der): Explorar · Bodegas · Recetas · Descubrí▼ · En Vivo · Ofertas.
// NO van aquí: Inicio, Nosotros, Abre-tu-Tienda (Landing Header).
//
// `matchEquals` para links exact (evita que "Bodegas" matchee en sub-rutas).
// `matchPrefix` para links de sección (cubre sub-rutas).
export type NavLink = {
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
    // Brandon 2026-06-05: acceso directo al MARKETPLACE (feed editorial) desde
    // el nav "Solo Tiendas". Distinto de "Tiendas" (/tiendas = directorio) y de
    // "Bodegas" (/marketplace, oculto en este modo). Solo en tiendas-only — en
    // modo completo "Bodegas" ya cubre /marketplace, no duplicar.
    id: "mercado",
    href: "/marketplace",
    labelKey: "nav.market",
    icon: ShoppingBag,
    matchEquals: "/marketplace",
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
  // Links B2B — cruzan del directorio de tiendas a la oferta para negocios.
  // Visibles también en modo "Solo Tiendas" (toggle desde superadmin → Navegación).
  {
    id: "negocios",
    href: "/negocios",
    labelKey: "nav.business",
    icon: Building2,
    matchPrefix: "/negocios",
  },
  {
    id: "abrir-tienda",
    href: "/abrir-tienda",
    labelKey: "nav.openStore",
    icon: Rocket,
    matchPrefix: "/abrir-tienda",
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
    // Brandon 2026-05-27 (audit perf): guard de visibilidad — no pollear
    // /api/lives/active con la pestaña en background.
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!id) id = setInterval(fetchActive, 60_000); };
    const stop = () => { if (id) { clearInterval(id); id = null; } };
    const onVis = () => {
      if (document.visibilityState === "visible") { fetchActive(); start(); }
      else stop();
    };
    // Brandon 2026-06-04 (auditoría /negocios): diferir el PRIMER fetch a idle —
    // el live dot no es crítico para el primer paint y no debe competir con el
    // render/hidratación inicial (en landings de marketing es latencia pura para
    // un visitante nuevo). El poll de 60s arranca recién tras el primer kickoff.
    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const kickoff = () => {
      if (cancelled) return;
      fetchActive();
      if (typeof document === "undefined" || document.visibilityState === "visible") start();
    };
    if (typeof requestIdleCallback === "function") {
      idleId = requestIdleCallback(kickoff, { timeout: 3000 });
    } else {
      timeoutId = setTimeout(kickoff, 1200);
    }
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      if (idleId != null && typeof cancelIdleCallback === "function") cancelIdleCallback(idleId);
      if (timeoutId != null) clearTimeout(timeoutId);
      stop();
      document.removeEventListener("visibilitychange", onVis);
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
    // Flag `cancelled` en vez de AbortController: evita el ruido "Uncaught
    // AbortError" de React 19 + Fast Refresh sin perder protección de stale.
    let cancelled = false;
    fetch(`/api/marketplace/stores/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
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
        if (!cancelled) setData({ logo: null, name: null });
      });
    return () => {
      cancelled = true;
    };
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
  const { customer, hydrated: authHydrated, clear } = useCustomer();
  // Carrito — usado en mobile para mostrar conteo encima del icono.
  const { itemCount: cartItemCount } = useMarketplaceCart();
  const { resolved: themeResolved, toggle: toggleTheme } = useTheme();
  const { t } = useLocale();
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
  const platformCity = brand?.identity.city ?? BRAND_GEO.city;
  // Visibilidad de enlaces controlada desde superadmin/stores → Navegación
  const navVisibility = useNavVisibility("marketplace");
  const navModeHook = useMarketplaceNavMode();
  // Cuando viene `modeOverride` (server-side desde un segment layout) lo
  // usamos como verdad absoluta. Esto evita el flash post-hidratación, porque
  // el hook arranca `null` en SSR y resuelve después → con override el primer
  // render ya conoce el modo correcto.
  //
  // FIX FOUC (Brandon 2026-05-30): mientras el hook resuelve (`null` en SSR y
  // primer render cliente), asumimos "tiendas-only" — que es el DEFAULT real
  // del sistema (`defaultStore()` → tiendas-only) y lo que ve ~todo visitante
  // sin localStorage. Antes asumíamos "completo" → al recargar en modo tiendas
  // se veía 1 frame el nav completo y colapsaba (flash grave). Ahora el primer
  // paint ya es Solo Tiendas; el modo "completo" (solo navegador del superadmin)
  // resuelve por efecto sin flash perceptible.
  const navMode = modeOverride ?? navModeHook ?? "tiendas-only";
  const isTiendasOnly = navMode === "tiendas-only";
  // Brandon 2026-05-18 v3: gate "Ofertas" si no hay descuentos activos en
  // ningún tenant. Antes el link estaba forzado visible en modo tiendas-only,
  // ahora gatea por dato real (no prometer descuentos inexistentes).
  const hasActiveOffers = useHasActiveOffers();
  const visibleLinks = PRIMARY_LINKS.filter((l) => {
    // Ofertas — solo visible si hay ofertas activas (independiente de superadmin).
    if (l.id === "ofertas" && hasActiveOffers !== true) return false;
    return navVisibility[l.id] !== false;
  });
  // Brandon 2026-05-30: el modo "Solo Tiendas" es un nav mínimo intencional —
  // SOLO Inicio + Tiendas. Se ocultan Bodegas (ya estamos en el directorio),
  // Cómo pagar, Negocios y Abre tu tienda (utilitarios/B2B que distraen del
  // foco "elegí tu tienda"). El modo manda sobre los toggles individuales:
  // ponés "Solo Tiendas" en superadmin → el público ve solo Inicio + Tiendas.
  const TIENDAS_ONLY_LINKS = new Set(["inicio", "tiendas", "mercado"]);
  // Brandon 2026-06-08 (oleada nav): el top-nav es IDÉNTICO en ambos modos —
  // Inicio · Tiendas · Mercado. Antes "completo" mostraba Explorar·Bodegas y
  // "tiendas-only" mostraba Tiendas·Mercado → el nav "cambiaba de forma" entre
  // modos (flash + confusión). Una sola palabra por concepto; el resto (En Vivo,
  // Recetas, Negocios, Ofertas…) vive en el rail lateral (☰).
  const DESKTOP_TOPNAV_LINKS = new Set(["inicio", "tiendas", "mercado"]);
  const renderedLinks = isTiendasOnly
    ? PRIMARY_LINKS.filter((l) => TIENDAS_ONLY_LINKS.has(l.id))
    : visibleLinks.filter((l) => DESKTOP_TOPNAV_LINKS.has(l.id));

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

  // Brandon 2026-05-31: el BottomNav mobile "Buscar" dispara este evento para
  // abrir EL MISMO overlay de búsqueda que el pill del navbar (misma acción,
  // un solo buscador). Antes navegaba a /tiendas?focus=search (distinto).
  useEffect(() => {
    const onOpenSearch = () => setMobileSearchOpen(true);
    window.addEventListener("buleje:open-search", onOpenSearch);
    return () => window.removeEventListener("buleje:open-search", onOpenSearch);
  }, []);

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

  // Brandon 2026-05-27 (FIX bug nav oculto): el body-scroll-lock lo maneja
  // EXCLUSIVAMENTE SharedMobileNavDrawer. Antes este efecto también lo hacía y
  // generaba un race: el drawer (hijo) corre su efecto primero y pone
  // `overflow: hidden`; este efecto (padre) capturaba `prev = "hidden"` y al
  // cerrar lo RESTAURABA a "hidden", dejando el body bloqueado. Con
  // `body { overflow: hidden }` el `position: sticky` del nav se rompe y al
  // scrollear el nav se va de pantalla. Quitar el duplicado elimina el race.

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
          // Minimalista/ejecutivo (Brandon 2026-06-07): superficie sólida +
          // hairline inferior MUY suave (rule-soft). Sin backdrop-blur, sin
          // sombras, sin oscurecer el borde al hacer scroll (se veía duro).
          "bg-[var(--surface-raised)] border-b border-[var(--rule-soft)]",
        )}
      >
        <div className="w-full px-4 sm:px-6 lg:px-8">
          {/* Brandon 2026-05-20 v6 — navbar mobile minimalista:
              h-16 (64px) → h-14 (56px) en mobile, h-16 desktop.
              Reduce el real-estate ocupado above-the-fold y se siente más
              ligero/comercial. Desktop mantiene h-16 por links + branding. */}
          <div className="flex h-[52px] md:h-16 items-center gap-2 sm:gap-3 lg:gap-4">
            {/* ── Hamburguesa desktop (Brandon 2026-06-07) — abre el drawer
                 lateral estilo YouTube con la navegación completa (Tiendas,
                 Descubrí, En Vivo, Negocios, Abre tu tienda, etc). En mobile la
                 hamburguesa vive en el cluster de abajo. ── */}
            <button
              type="button"
              // data-navrail-toggle: el click-outside del rail ignora este botón
              // (si no, mousedown colapsaría y este onClick re-expandiría).
              data-navrail-toggle
              onClick={() => {
                // En /marketplace el rail lateral escucha y togglea (preventDefault
                // → dispatchEvent devuelve false). En otras rutas nadie lo maneja
                // → abrimos el drawer overlay como fallback.
                const notHandled = window.dispatchEvent(
                  new CustomEvent("buleje:toggle-navrail", { cancelable: true }),
                );
                if (notHandled) setMobileMenuOpen(true);
              }}
              aria-label="Abrir menú de navegación"
              className="hidden lg:inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              <Menu className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
            </button>

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
                    className="h-9 w-9 rounded-full object-cover"
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

            {/* ── Ubicación de entrega al lado del logo (Brandon 2026-06-07) —
                solo modo completo. Ícono pin + lugar; click → direcciones. ── */}
            {!isTiendasOnly && (
              <button
                type="button"
                onClick={() => router.push("/marketplace/mi-cuenta/direcciones")}
                aria-label="Tu ubicación de entrega"
                className="hidden lg:inline-flex items-center gap-1.5 shrink-0 max-w-[180px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <MapPin className="h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2.25} aria-hidden="true" />
                <span className="text-sm font-bold truncate">{platformCity}</span>
              </button>
            )}

            {/* ── Enlaces Inicio/Tiendas (Brandon 2026-06-02) — re-agregados en
                modo tiendas, pegados al logo (antes de la pastilla). En lg+ para
                no apretar el tablet. ── */}
            {isTiendasOnly && (
              <nav
                aria-label="Navegación de tiendas"
                className="hidden lg:flex items-center gap-1 shrink-0"
              >
                {renderedLinks.map((link) => {
                  const active = isActive(link);
                  const LinkIcon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-bold transition-colors",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
                        active
                          ? "text-[var(--text-primary)] after:absolute after:inset-x-3 after:-bottom-px after:h-[2px] after:rounded-full after:bg-[var(--accent)]"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                      )}
                    >
                      <LinkIcon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                      {t(link.labelKey)}
                    </Link>
                  );
                })}
              </nav>
            )}

            {/* ── PASTILLA CENTRAL (rediseño B, Brandon 2026-06-02) ──
                Estilo Airbnb/Uber Eats: ubicación + búsqueda unidas en un
                único control redondeado, centrado. Los tabs Inicio/Tiendas
                vuelven pegados al logo (arriba). Solo modo tiendas, md+. */}
            {isTiendasOnly && (
              <div className="hidden md:flex flex-1 justify-center min-w-0 px-2">
                <div className="group flex items-center w-full max-w-[680px] h-12 rounded-full border-2 border-[var(--text-primary)]/20 bg-[var(--surface-raised)] transition-all hover:border-[var(--text-primary)]/35 focus-within:border-[var(--text-primary)] focus-within:bg-[var(--surface-canvas)]">
                  {/* Segmento ubicación */}
                  <div className="flex items-center gap-1.5 pl-4 pr-3 h-full shrink-0 text-[var(--accent)]">
                    <MapPin className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden="true" />
                    <span className="text-sm font-bold truncate max-w-[150px]">{platformCity}</span>
                  </div>
                  {/* Divisor */}
                  <div className="h-6 w-px bg-[var(--rule-base)] shrink-0" aria-hidden="true" />
                  {/* Búsqueda embebida (lupa + input + botón Buscar viven adentro) */}
                  <NavbarSearchAutocomplete
                    className="flex-1 min-w-0"
                    storesOnly
                    embedded
                    placeholder="Buscar tienda o producto…"
                  />
                </div>
              </div>
            )}

            {/* ── Search bar (fila 1) — SOLO Marketplace completo. En modo
                tiendas la búsqueda vive dentro de la pastilla central
                (rediseño B, Brandon 2026-06-02). ── */}
            {!isTiendasOnly && (
              <div
                data-tour="search"
                className="hidden md:block flex-1 min-w-0 px-2 lg:px-6"
              >
                {/* Buscador largo y centrado — protagonista del nav (Brandon
                    2026-06-07). Recto (la card del input ya es rounded-none). */}
                <div className="mx-auto w-full max-w-[760px]">
                  <NavbarSearchAutocomplete
                    className="block"
                    storesOnly={false}
                    placeholder={t("nav.searchPlaceholder")}
                  />
                </div>
              </div>
            )}

            {/* ── Nav links transaccionales (lg+) con overflow adaptativo —
                SOLO en Marketplace completo/custom. En Solo Tiendas se usan los
                tabs de arriba (a la izquierda). Mide el ancho real
                (ResizeObserver + capa fantasma) y pliega bajo "Más ▾" lo que no
                entra. Nunca se desborda (hasta 11 links). Brandon 2026-05-30. */}
            {/* Brandon 2026-06-07: enlaces Inicio/Explorar/Bodegas REMOVIDOS del
                nav top — viven en el rail lateral. El nav queda: ☰ · logo ·
                ubicación · BUSCADOR (centro, protagonista) · cluster derecho. */}

            {/* ── Right cluster (desktop) ── */}
            <div className="hidden md:flex items-center gap-1.5 ml-auto">
              {/* Selector de idioma — solo en modo "Marketplace completo"
                  (en Solo Tiendas los vecinos solo hablan español).
                  Theme toggle REMOVIDO del navbar (Brandon 2026-06-02): el
                  cambio claro/oscuro ya vive dentro del menú de perfil/cuenta
                  → un solo lugar, nav más limpio. El separator se agrupa con el
                  idioma para no dejar una línea suelta en Solo Tiendas. */}
              {!isTiendasOnly && (
                <>
                  <LanguageSwitcher />
                  <div
                    className="mx-0.5 h-6 w-px bg-[var(--rule-soft)]"
                    aria-hidden="true"
                  />
                </>
              )}

              {/* Order tracker badge — visible cuando hay pedido reciente,
                  reabre el OrderSuccessModal con animación pulse. */}
              <OrderTrackerNavBadge variant="compact" />

              {/* Notif bell dropdown */}
              <NotificationsMenu />

              {/* Chat con tiendas — Messenger del marketplace (Brandon 2026-06-06) */}
              <ChatNavLauncher />

              {/* Cart */}
              <span data-tour="cart" className="inline-flex">
                <CartBadge onClick={handleOpenCart} />
              </span>

              {/* Divider sutil */}
              <div
                className="mx-0.5 h-6 w-px bg-[var(--rule-soft)]"
                aria-hidden="true"
              />

              {/* Auth — Avatar circular con iniciales o Ingresar.
                  Brandon 2026-06-04 (auditoría): skeleton estable hasta que el
                  customer-context termine de hidratar — evita el flicker
                  "Ingresar → avatar" para usuarios ya logueados. */}
              {!authHydrated ? (
                <div
                  aria-hidden="true"
                  className="h-10 w-[104px] rounded-full bg-[var(--surface-sunken)] animate-pulse"
                />
              ) : customer ? (
                <div className="relative" ref={userMenuRef} data-tour="user-menu">
                  <button
                    onClick={() => setUserMenuOpen((o) => !o)}
                    aria-expanded={userMenuOpen}
                    aria-haspopup="true"
                    aria-label={`Cuenta de ${customer.name ?? "usuario"}`}
                    className="group inline-flex items-center gap-2 rounded-full bg-[var(--surface-sunken)] p-0.5 pr-3 transition-colors hover:bg-[var(--surface-alt)]"
                  >
                    {/* Círculo con iniciales del nombre */}
                    <span
                      aria-hidden="true"
                      className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--text-primary)] text-sm font-black text-[var(--surface-raised)]"
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
                      className="absolute right-0 top-full mt-2 w-60 bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] shadow-[var(--shadow-md)] overflow-hidden z-50"
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
                    "inline-flex items-center gap-1.5 rounded-full bg-[var(--text-primary)] px-5 h-10 text-sm font-extrabold text-[var(--surface-raised)]",
                    "hover:opacity-90 active:scale-[0.98] transition-all duration-200",
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
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                aria-label="Abrir menú"
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-drawer"
              >
                <Menu className="h-5 w-5" aria-hidden="true" strokeWidth={2.25} />
              </button>

              {/* Search pill minimalista (Brandon 2026-06-07): SIN logo dentro,
                  redondeado (rounded-full) + borde fino. Lupa a la izquierda;
                  input readOnly que abre el overlay full-screen al tocar. */}
              <form
                onSubmit={openMobileSearch}
                role="search"
                aria-label={t("nav.search")}
                className="flex-1 min-w-0"
              >
                <div className="relative flex items-center h-9 rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] focus-within:border-[var(--text-primary)] transition-colors px-3 gap-2">
                  <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" strokeWidth={2.25} />
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
                </div>
              </form>

              {/* Perfil/cuenta REMOVIDO del top-nav en celular (Brandon 2026-06-07):
                  ya vive en el bottom-nav (tab "Cuenta"). El nav mobile queda con
                  3 elementos: ☰ · buscador · carrito. */}

              {/* Chat con tiendas — Messenger (Brandon 2026-06-06), versión bare
                  mobile. Botón oculto en celular (max-sm:hidden, el chat vive en el
                  bottom-nav); se mantiene montado para abrir el panel desde abajo. */}
              <ChatNavLauncher variant="bare" />

              {/* Cart — compactado. Badge sigue siendo prominente con ring. */}
              <button
                data-tour="cart"
                onClick={handleOpenCart}
                aria-label={`Carrito — ${cartItemCount} ${cartItemCount === 1 ? "producto" : "productos"}`}
                className="relative shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                {cartItemCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute top-0.5 right-0.5 inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-black text-white leading-none ring-2 ring-[var(--surface-raised)] tabular-nums"
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
