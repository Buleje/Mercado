/**
 * lib/nav-visibility.ts — Control de visibilidad de enlaces en la navegación.
 *
 * Permite al superadmin ocultar/mostrar enlaces en:
 *   - Landing (`components/landing/LandingHeader.tsx`)
 *   - Marketplace (`components/marketplace/MarketplaceNavbar.tsx`)
 *
 * Storage: localStorage (cliente). Cambios visibles de inmediato sin redeploy.
 * Se expone un evento `buleje:nav-visibility-changed` para que los navs
 * re-lean el config al toggle.
 */

export type NavScope = "landing" | "marketplace" | "marketplace-sections";

type NavLinkEntry = {
  id: string;
  label: string;
  href: string;
  description: string;
  /** Default de visibilidad — `false` = oculto al primer load. Se persiste tras edición admin. */
  defaultVisible?: boolean;
};

/** Enlaces conocidos por scope — lo que el admin puede ocultar. */
export const NAV_LINK_CATALOG: Record<NavScope, NavLinkEntry[]> = {
  landing: [
    { id: "inicio", label: "Inicio", href: "/", description: "Portada del sitio" },
    { id: "como-funciona", label: "Cómo funciona", href: "/#como-funciona", description: "Sección 4 pasos" },
    { id: "nosotros", label: "Nosotros", href: "/#nosotros", description: "Historia + valores" },
    { id: "planes", label: "Planes", href: "/#planes", description: "Planes mensuales" },
    { id: "faq", label: "FAQ", href: "/#faq", description: "Preguntas frecuentes" },
    { id: "abrir-tienda", label: "Abre tu Tienda", href: "/abrir-tienda", description: "CTA bodegueros" },
  ],
  marketplace: [
    { id: "explorar", label: "Explorar", href: "/marketplace/explorar", description: "Hub de descubrimiento" },
    { id: "bodegas", label: "Bodegas", href: "/marketplace", description: "Home del marketplace" },
    { id: "recetas", label: "Recetas", href: "/recetas", description: "Catálogo de recetas" },
    { id: "descubri", label: "Descubrí", href: "#discover", description: "Mega menú", defaultVisible: false },
    { id: "en-vivo", label: "En Vivo", href: "/marketplace/en-vivo", description: "Live shopping", defaultVisible: false },
    { id: "ofertas", label: "Ofertas", href: "/marketplace/ofertas", description: "Deals del día (también en sub-nav)", defaultVisible: false },
  ],
  // Secciones del home /marketplace que el admin puede ocultar/mostrar.
  // Por defecto OFF para mantener el home limpio (pedido del negocio).
  "marketplace-sections": [
    { id: "asistente-ia", label: "Asistente IA", href: "/asistente", description: "Banner Buleje IA en home", defaultVisible: false },
    { id: "gift-cards", label: "Gift Cards", href: "/marketplace/gift-cards", description: "Banner regalá Buleje", defaultVisible: false },
    { id: "socio-buleje", label: "Socio Buleje", href: "/marketplace/mi-cuenta?tab=socio", description: "Promo membresía", defaultVisible: false },
    { id: "bodega-al-mes", label: "Bodega al Mes", href: "/marketplace/bodega-al-mes", description: "Subscribe & save · 5% off", defaultVisible: false },
    { id: "comparar-productos", label: "Comparar productos", href: "/marketplace/comparar", description: "Cross-sell comparador", defaultVisible: false },
  ],
};

const STORAGE_KEY = "buleje-nav-visibility";
const EVENT_NAME = "buleje:nav-visibility-changed";

export type NavVisibilityMap = Record<string, boolean>;

type Store = Record<NavScope, NavVisibilityMap>;

function defaultStore(): Store {
  const build = (scope: NavScope): NavVisibilityMap =>
    Object.fromEntries(
      NAV_LINK_CATALOG[scope].map((l) => [l.id, l.defaultVisible !== false]),
    );
  return {
    landing: build("landing"),
    marketplace: build("marketplace"),
    "marketplace-sections": build("marketplace-sections"),
  };
}

export function readNavVisibility(): Store {
  if (typeof window === "undefined") return defaultStore();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultStore();
    const parsed = JSON.parse(raw) as Partial<Store>;
    const base = defaultStore();
    return {
      landing: { ...base.landing, ...(parsed.landing ?? {}) },
      marketplace: { ...base.marketplace, ...(parsed.marketplace ?? {}) },
      "marketplace-sections": {
        ...base["marketplace-sections"],
        ...(parsed["marketplace-sections"] ?? {}),
      },
    };
  } catch {
    return defaultStore();
  }
}

export function writeNavVisibility(store: Store): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // storage lleno o bloqueado — silent fail
  }
}

/** Hook-friendly: suscribirse al cambio de visibilidad. */
export function subscribeNavVisibility(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT_NAME, cb);
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) cb();
  });
  return () => {
    window.removeEventListener(EVENT_NAME, cb);
  };
}

/** Helper para filtrar links según visibilidad — usar en navs. */
export function isLinkVisible(scope: NavScope, id: string): boolean {
  if (typeof window === "undefined") return true;
  const store = readNavVisibility();
  return store[scope]?.[id] ?? true;
}
