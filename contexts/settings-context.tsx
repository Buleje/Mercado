"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { type HomepageContent, DEFAULT_HOMEPAGE, NEW_STORE_DEFAULTS } from "@/lib/homepage-content";

export type StoreMode = "whatsapp" | "checkout";

export type YapeConfig = {
  enabled: boolean;
  image: string;
  name: string;
  phone: string;
};

export type NavLinkItem = { id: string; visible: boolean };

export const DEFAULT_NAV_LINKS: NavLinkItem[] = [
  // Orden: Inicio → Tienda → Tiendas → Ofertas → Cómo pagar → Explorar → Recetas → A domicilio
  // "tienda":  catálogo del tenant (label "Tienda").
  // "tiendas": directorio multi-tienda (label "Tiendas") → /tiendas
  // "ofertas": captura price-sensitive shoppers.
  // "como-pagar": transparenta métodos (Yape, Plin, efectivo, transferencia, tarjeta).
  { id: "inicio", visible: true },
  { id: "tienda", visible: true },
  { id: "tiendas", visible: true },
  { id: "ofertas", visible: true },
  { id: "como-pagar", visible: true },
  { id: "explorar", visible: true },
  { id: "recetas", visible: true },
  { id: "a-domicilio", visible: true },
  { id: "marketplace", visible: false },
  { id: "historial", visible: false },
  { id: "categorias", visible: false },
  { id: "beneficios", visible: false },
  { id: "contacto", visible: false },
];

export type StoreTheme = {
  name?: string;
  slogan?: string;
  description?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  darkMode?: boolean;
  heroTitle?: string;
  heroSubtitle?: string;
  heroCTA?: string;
  heroLink?: string;
  heroBadge?: string;
  heroImage?: string;
  fontFamily?: string;
  borderRadius?: number;
  spacing?: string;
  whatsapp?: string;
  whatsappMessage?: string;
  email?: string;
  phone?: string;
  address?: string;
  logo?: string;
  visibleSections?: string[];
  // Estilos visuales avanzados
  cardStyle?: "minimal" | "shadow" | "border" | "glass";
  cartStyle?: "sidebar" | "modal" | "drawer";
  buttonStyle?: "rounded" | "square" | "pill";
  navbarStyle?: "solid" | "transparent" | "blur" | "minimal";
  shadowLevel?: "none" | "soft" | "deep";
  animations?: "none" | "subtle" | "dynamic";
  backgroundPattern?: "none" | "dots" | "waves" | "gradient";
  // Contenido editable
  footerText?: string;
  footerLinks?: { label: string; href: string }[];
  socialLinks?: { facebook?: string; instagram?: string; tiktok?: string; youtube?: string };
  welcomePopupEnabled?: boolean;
  welcomePopupTitle?: string;
  welcomePopupMessage?: string;
  welcomePopupCoupon?: string;
  // CSS personalizado
  customCSS?: string;
  // Banners promocionales por categoría (Oferta de Temporada custom)
  categoryBanners?: Record<string, {
    image?: string;
    title?: string;
    subtitle?: string;
    ctaText?: string;
    productSlug?: string;
    enabled?: boolean;
  }>;
};

type SettingsCtx = {
  mode: StoreMode;
  modeLoading: boolean;
  yape: YapeConfig;
  cashEnabled: boolean;
  navLinks: NavLinkItem[];
  homepage: HomepageContent;
  deliveryConfig: DeliveryConfig;
  businessName: string;
  storeTheme: StoreTheme | null;
  setMode: (m: StoreMode) => Promise<void>;
};

export type DeliveryConfig = {
  hours: { day: string; open: string; close: string; enabled: boolean }[];
  zones: { name: string; radius: number; price: number; enabled: boolean }[];
  freeDeliveryMin: number;
};

const DEFAULT_DELIVERY: DeliveryConfig = {
  hours: [
    { day: "Lunes", open: "07:00", close: "21:00", enabled: true },
    { day: "Martes", open: "07:00", close: "21:00", enabled: true },
    { day: "Miércoles", open: "07:00", close: "21:00", enabled: true },
    { day: "Jueves", open: "07:00", close: "21:00", enabled: true },
    { day: "Viernes", open: "07:00", close: "21:00", enabled: true },
    { day: "Sábado", open: "07:00", close: "21:00", enabled: true },
    { day: "Domingo", open: "00:00", close: "00:00", enabled: false },
  ],
  zones: [
    { name: "Centro - Callería", radius: 3, price: 0, enabled: true },
    { name: "Yarinacocha", radius: 6, price: 3, enabled: true },
    { name: "Manantay", radius: 8, price: 5, enabled: true },
  ],
  freeDeliveryMin: 50,
};

export const SettingsContext = createContext<SettingsCtx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<StoreMode>("whatsapp");
  const [modeLoading, setModeLoading] = useState(true);
  const [yape, setYape] = useState<YapeConfig>({ enabled: false, image: "", name: "", phone: "" });
  const [cashEnabled, setCashEnabled] = useState(true);
  const [navLinks, setNavLinks] = useState<NavLinkItem[]>(DEFAULT_NAV_LINKS);
  const [homepage, setHomepage] = useState<HomepageContent>(DEFAULT_HOMEPAGE);
  const [deliveryConfig, setDeliveryConfig] = useState<DeliveryConfig>(DEFAULT_DELIVERY);
  const [businessName, setBusinessName] = useState<string>("");
  const [storeTheme, setStoreTheme] = useState<StoreTheme | null>(null);

  useEffect(() => {
    // FIX 2026-05-07: detectar el tenant activo PRIMERO desde el path
    // `/t/[slug]/...`, luego desde la cookie active-tenant, luego "main".
    //
    // Antes solo leíamos la cookie. Si Brandon visitaba directo
    // /t/mi-pollo/tienda SIN haber pasado por el admin, no había cookie,
    // el fetch a /api/settings no enviaba `x-tenant-id`, el server
    // resolvía a "main" → la tienda mostraba defaults aunque tenía
    // banner/logo/colores configurados en la DB del tenant correcto.
    const tenantSlug =
      typeof window !== "undefined"
        ? (() => {
            // 1. Path /t/[slug]/... — fuente de verdad cuando el visitor
            //    está navegando explícitamente la tienda de un tenant.
            const pathMatch = window.location.pathname.match(/^\/t\/([^/]+)/);
            if (pathMatch) return decodeURIComponent(pathMatch[1]);
            // 2. Cookie active-tenant — set por el admin al loguearse.
            const cookieMatch = document.cookie.match(/(?:^|;\s*)active-tenant=([^;]+)/);
            if (cookieMatch) return decodeURIComponent(cookieMatch[1]);
            return "main";
          })()
        : "main";
    const isMainTenant = tenantSlug === "main";

    fetch("/api/settings", {
      cache: "no-store",
      headers: { "x-tenant-id": tenantSlug },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Record<string, unknown> | null) => {
        if (data) {
          if (data.mode) setModeState(data.mode as StoreMode);
          if (data.businessName) setBusinessName(data.businessName as string);
          setYape({
            enabled: !!data.yapeEnabled,
            image: (data.yapeImage as string) || "",
            name: (data.yapeName as string) || "",
            phone: (data.yapePhone as string) || "",
          });
          if (data.cashEnabled !== undefined) setCashEnabled(!!data.cashEnabled);
          if (Array.isArray(data.navLinks) && data.navLinks.length > 0) {
            // Merge saved navLinks with defaults so new items (e.g. marketplace) appear
            const saved = data.navLinks as NavLinkItem[];
            const savedMap = new Map(saved.map(n => [n.id, n.visible]));
            const merged = DEFAULT_NAV_LINKS.map(def => ({
              ...def,
              visible: savedMap.has(def.id) ? savedMap.get(def.id)! : def.visible,
            }));
            setNavLinks(merged);
          }
          if (data.homepageContent && typeof data.homepageContent === "object") {
            // Para el tenant "main" usar DEFAULT_HOMEPAGE como base; para otros usar NEW_STORE_DEFAULTS
            const base = isMainTenant ? DEFAULT_HOMEPAGE : NEW_STORE_DEFAULTS;
            setHomepage({ ...base, ...(data.homepageContent as Partial<HomepageContent>) });
          } else if (!isMainTenant) {
            // Tienda nueva sin homepage configurada → usar defaults genéricos
            setHomepage(NEW_STORE_DEFAULTS);
          }
          if (data.deliveryConfig && typeof data.deliveryConfig === "object") {
            setDeliveryConfig({ ...DEFAULT_DELIVERY, ...(data.deliveryConfig as Partial<DeliveryConfig>) });
          }
          if (data.storeTheme && typeof data.storeTheme === "object") {
            const raw = data.storeTheme as Record<string, unknown>;
            setStoreTheme({
              name: raw.storeName as string | undefined,
              slogan: raw.slogan as string | undefined,
              description: raw.description as string | undefined,
              primaryColor: raw.primaryColor as string | undefined,
              secondaryColor: raw.secondaryColor as string | undefined,
              accentColor: raw.accentColor as string | undefined,
              darkMode: raw.darkModeDefault as boolean | undefined,
              heroTitle: raw.heroTitle as string | undefined,
              heroSubtitle: raw.heroSubtitle as string | undefined,
              heroCTA: raw.heroCTA as string | undefined,
              heroLink: raw.heroLink as string | undefined,
              heroBadge: raw.heroBadge as string | undefined,
              heroImage: raw.heroImage as string | undefined,
              fontFamily: raw.fontFamily as string | undefined,
              borderRadius: raw.borderRadius as number | undefined,
              spacing: raw.spacing as string | undefined,
              whatsapp: raw.whatsapp as string | undefined,
              whatsappMessage: raw.whatsappMessage as string | undefined,
              email: raw.email as string | undefined,
              phone: raw.phone as string | undefined,
              address: raw.address as string | undefined,
              logo: raw.logo as string | undefined,
              visibleSections: Array.isArray(raw.sections) ? (raw.sections as string[]) : undefined,
              // Estilos visuales avanzados — el ThemeInjector los consume.
              cardStyle: raw.cardStyle as StoreTheme["cardStyle"],
              cartStyle: raw.cartStyle as StoreTheme["cartStyle"],
              buttonStyle: raw.buttonStyle as StoreTheme["buttonStyle"],
              navbarStyle: raw.navbarStyle as StoreTheme["navbarStyle"],
              shadowLevel: raw.shadowLevel as StoreTheme["shadowLevel"],
              animations: raw.animations as StoreTheme["animations"],
              backgroundPattern: raw.backgroundPattern as StoreTheme["backgroundPattern"],
              footerText: raw.footerText as string | undefined,
              welcomePopupEnabled: raw.welcomePopupEnabled as boolean | undefined,
              welcomePopupTitle: raw.welcomePopupTitle as string | undefined,
              welcomePopupMessage: raw.welcomePopupMessage as string | undefined,
              welcomePopupCoupon: raw.welcomePopupCoupon as string | undefined,
              customCSS: raw.customCSS as string | undefined,
              categoryBanners: raw.categoryBanners as StoreTheme["categoryBanners"],
              socialLinks: raw.socialLinks as StoreTheme["socialLinks"],
            });
          }
        }
      })
      .catch(() => {})
      .finally(() => setModeLoading(false));
  }, []);

  const setMode = useCallback(async (m: StoreMode) => {
    // FIX 2026-05-07: incluir x-tenant-id derivado del path para que el PUT
    // afecte al tenant correcto (no siempre "main"). Mismo patrón que el GET.
    const tenantSlug =
      typeof window !== "undefined"
        ? (() => {
            const pathMatch = window.location.pathname.match(/^\/t\/([^/]+)/);
            if (pathMatch) return decodeURIComponent(pathMatch[1]);
            const cookieMatch = document.cookie.match(/(?:^|;\s*)active-tenant=([^;]+)/);
            if (cookieMatch) return decodeURIComponent(cookieMatch[1]);
            return "main";
          })()
        : "main";
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-tenant-id": tenantSlug },
      body: JSON.stringify({ mode: m }),
    });
    setModeState(m);
  }, []);

  return (
    <SettingsContext.Provider value={{ mode, modeLoading, yape, cashEnabled, navLinks, homepage, deliveryConfig, businessName, storeTheme, setMode }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be inside SettingsProvider");
  return ctx;
}

/**
 * Brandon mayo 2026 v7: variante segura para módulos del admin que viven
 * fuera del SettingsProvider (que sólo se monta en el storefront).
 * Devuelve null si no hay provider — el caller hace fallback.
 */
export function useSettingsSafe() {
  return useContext(SettingsContext);
}
