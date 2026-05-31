import "server-only";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BRAND_GEO } from "@/lib/geo";

/**
 * Platform Brand — la marca de la plataforma Buleje (no de las tiendas).
 *
 * Storage: lib/data/platform-brand.json (file system, MVP).
 * - Hub de personalización: logos, colores, contacto, socials, SEO, legal.
 * - Event mode: override temporal de logo + colores (ej. Black Friday, Navidad).
 *
 * Consumido por:
 *  - Superadmin: GET /api/superadmin/brand (auth)
 *  - Páginas públicas: GET /api/platform-brand (sin auth, cacheable)
 *  - Server components: getPlatformBrand() directo
 */

export const BRAND_PATH = join(process.cwd(), "lib", "data", "platform-brand.json");

export type PlatformBrand = {
  identity: {
    name: string;
    tagline: string;
    description: string;
    since: string;
    city: string;
    country: string;
  };
  logos: {
    /** Logo principal — usado en barra navegacional + footer (light bg). */
    logoLight: string | null;
    /** Logo para fondos oscuros (header sticky, dark mode). */
    logoDark: string | null;
    /** Versión cuadrada — app icon, social shares. */
    logoSquare: string | null;
    /** Favicon 32x32. */
    favicon: string | null;
    /** Imagen Open Graph 1200x630. */
    ogImage: string | null;
  };
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    danger: string;
    success: string;
  };
  typography: {
    fontFamily: string;
    fontDisplay: string;
  };
  contact: {
    email: string;
    phone: string;
    whatsapp: string;
    address: string;
    supportHours: string;
  };
  socials: {
    instagram: string;
    facebook: string;
    tiktok: string;
    x: string;
    youtube: string;
  };
  seo: {
    metaTitle: string;
    metaDescription: string;
    ogTitle: string;
    ogDescription: string;
  };
  legal: {
    legalName: string;
    ruc: string;
    termsUrl: string;
    privacyUrl: string;
    cookiesUrl: string;
  };
  /** Modo evento — overridea logo + colores temporalmente (Black Friday, Navidad, etc). */
  eventMode: {
    active: boolean;
    name: string;
    logoLight: string | null;
    logoDark: string | null;
    primaryColor: string | null;
    accentColor: string | null;
    /** ISO 8601. Si presente y futuro, no aplica todavía. */
    startsAt: string | null;
    /** ISO 8601. Si presente y pasado, ya no aplica. */
    endsAt: string | null;
  };
};

const DEFAULTS: PlatformBrand = {
  identity: {
    name: "Buleje",
    tagline: "El marketplace de tu barrio",
    description: `Marketplace local de ${BRAND_GEO.city}.`,
    since: "2024",
    city: BRAND_GEO.city,
    country: "Perú",
  },
  logos: { logoLight: null, logoDark: null, logoSquare: null, favicon: null, ogImage: null },
  colors: {
    primary: "#00B4A6",
    secondary: "#0c1015",
    accent: "#f4a261",
    danger: "#b91c1c",
    success: "#047857",
  },
  typography: { fontFamily: "geist", fontDisplay: "fraunces" },
  contact: { email: "", phone: "", whatsapp: "", address: "", supportHours: "" },
  socials: { instagram: "", facebook: "", tiktok: "", x: "", youtube: "" },
  seo: { metaTitle: "", metaDescription: "", ogTitle: "", ogDescription: "" },
  legal: { legalName: "", ruc: "", termsUrl: "", privacyUrl: "", cookiesUrl: "" },
  eventMode: {
    active: false,
    name: "",
    logoLight: null,
    logoDark: null,
    primaryColor: null,
    accentColor: null,
    startsAt: null,
    endsAt: null,
  },
};

function deepMerge<T>(base: T, patch: unknown): T {
  if (!patch || typeof patch !== "object") return base;
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const baseV = (base as Record<string, unknown>)[k];
    if (v && typeof v === "object" && !Array.isArray(v) && baseV && typeof baseV === "object") {
      out[k] = deepMerge(baseV, v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}

/** Lee el JSON de marca con fallback a defaults. */
export async function getPlatformBrand(): Promise<PlatformBrand> {
  try {
    const raw = await readFile(BRAND_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return deepMerge(DEFAULTS, parsed);
  } catch {
    return DEFAULTS;
  }
}

export async function savePlatformBrand(next: PlatformBrand): Promise<void> {
  await writeFile(BRAND_PATH, JSON.stringify(next, null, 2), "utf8");
}

/**
 * Resuelve la marca efectiva considerando event mode:
 *  - Si eventMode.active=true Y dentro de la ventana de fechas → mergear overrides
 *  - Si fuera de fechas → ignora overrides (la marca normal manda)
 */
export function resolveActiveBrand(brand: PlatformBrand, now = new Date()): PlatformBrand {
  const e = brand.eventMode;
  if (!e.active) return brand;
  if (e.startsAt && new Date(e.startsAt).getTime() > now.getTime()) return brand;
  if (e.endsAt && new Date(e.endsAt).getTime() < now.getTime()) return brand;
  return {
    ...brand,
    logos: {
      ...brand.logos,
      logoLight: e.logoLight ?? brand.logos.logoLight,
      logoDark: e.logoDark ?? brand.logos.logoDark,
    },
    colors: {
      ...brand.colors,
      primary: e.primaryColor ?? brand.colors.primary,
      accent: e.accentColor ?? brand.colors.accent,
    },
  };
}
