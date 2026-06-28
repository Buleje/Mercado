import type { Metadata } from "next";
import { Suspense, Fragment, type ReactNode } from "react";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ShoppingBag, Settings, ExternalLink, MapPin, Sparkles, Tag,
  MessageCircle, Truck, ShieldCheck, ChevronRight, ArrowRight,
  Search as SearchIcon,
} from "@buleje/design-system/icons";
import { prisma } from "@/lib/prisma";
import { getSessionPayload, SESSION } from "@/lib/session";
import { StorePageDB } from "@/lib/db/store-page.db";
import { SettingsDB } from "@/lib/db/settings.db";
import { OrdersDB } from "@/lib/db/orders.db";
import { logger } from "@/lib/logger";
import TenantPageTracker from "./_components/TenantPageTracker";
import VendorTrustBadges from "@/components/store/VendorTrustBadges";
import StickyCouponBanner from "@/components/store/StickyCouponBanner";
import StorefrontNavbar from "@/components/store/StorefrontNavbar";
import TenantFooter from "@/components/store/TenantFooter";
import { SettingsProvider } from "@/contexts/settings-context";
import PreviewLiveTheme from "@/components/store/PreviewLiveTheme";
import TenantWelcomePopup from "@/components/store/TenantWelcomePopup";
import TenantExitIntentPopup from "@/components/store/tenant/TenantExitIntentPopup";
import AbHeroTest from "@/components/store/tenant/AbHeroTest";
import TenantPushOptIn from "@/components/store/tenant/TenantPushOptIn";
import SectionViewTracker from "@/components/store/tenant/SectionViewTracker";
import RotatingAnnouncementBar from "@/components/store/tenant/RotatingAnnouncementBar";
import StorefrontEditOverlay from "@/components/store/StorefrontEditOverlay";
import TenantAnalytics from "@/components/store/TenantAnalytics";
import TenantHero, { type HeroVariant } from "@/components/store/tenant/TenantHero";
import WhatsAppFloat from "@/components/store/tenant/WhatsAppFloat";
import ScrollReveal from "@/components/store/tenant/ScrollReveal";
import TenantTextStyles from "@/components/store/tenant/TenantTextStyles";
import TenantSectionStyles from "@/components/store/tenant/TenantSectionStyles";
import CountdownBanner from "@/components/store/tenant/CountdownBanner";
import FreeShipPromoBar from "@/components/store/tenant/FreeShipPromoBar";
import SocialProofToasts from "@/components/store/tenant/SocialProofToasts";
import OpenStatusBadge from "@/components/store/tenant/OpenStatusBadge";
import SeasonalDecor from "@/components/store/tenant/SeasonalDecor";
import TenantTestimonials from "@/components/store/tenant/TenantTestimonials";
import SectionRenderer from "@/components/store/tenant/SectionRenderer";
import ProStoreSections from "@/components/store/tenant/ProStoreSections";
import { deserializePageData, tokensToCssBlock, FONT_FAMILIES, EDITOR_FONT_MAP, EDITOR_BTN_RADIUS } from "@/lib/store-design-tokens";

interface TenantLandingProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}

/** Producto normalizado para la vitrina de la landing (destacados o catálogo). */
interface ShowcaseItem {
  id: string;
  name: string;
  image: string;
  unit: string;
  price: number;
  exclusivePrice: number | null;
  savingsPercent: number | null;
  badge: string | null;
}

/**
 * Resolve tenant + customization + featured + promotions + exclusive count
 * en paralelo. Server Component — sin cache directive para evitar conflicto
 * con `cacheComponents: true` cuando leemos cookies/headers en middleware.
 * La capa StorePageDB ya aplica caché in-process vía getOrSet.
 */
async function loadPageData(slug: string) {
  // SECURITY 2026-05-07 (audit MT5): si slug es synthetic `custom--{host}`,
  // resolver al slug REAL via Tenant.customDomain. Si no hay match → null.
  // Antes el synthetic slug se usaba como id directo y, si por casualidad
  // coincidía con un slug registrado, daba acceso al tenant equivocado.
  let lookupCondition: { OR: Array<{ id: string } | { slug: string } | { customDomain: string }> };
  if (slug.startsWith("custom--")) {
    const host = slug.slice("custom--".length);
    lookupCondition = { OR: [{ customDomain: host }] };
  } else {
    lookupCondition = { OR: [{ id: slug }, { slug }] };
  }
  // eslint-disable-next-line no-restricted-properties -- Public SSR landing: lookup cross-tenant intentional por slug/id/customDomain; no hay tenantId del request todavía (esta misma query lo resuelve).
  const tenant = await prisma.tenant
    .findFirst({
      where: lookupCondition,
      select: {
        id: true,
        slug: true,
        name: true,
        plan: true,
        active: true,
        ownerPhone: true,
        customDomain: true,
        logoUrl: true,
        primaryColor: true,
        createdAt: true,
      },
    })
    .catch((err) => { logger.warn("[t/[slug]] tenant lookup failed", { err: String(err), slug }); return null; });

  if (!tenant) return null;

  const [customization, featured, promotions, exclusiveCount, settings, catalog] = await Promise.all([
    StorePageDB.getCustomization(tenant.id),
    StorePageDB.listPublicFeatured(tenant.id, 24),
    StorePageDB.listPromotions(tenant.id, true),
    StorePageDB.countActiveExclusivePrices(tenant.id),
    SettingsDB.get(tenant.id).catch((err) => { logger.warn("[t/[slug]] settings load failed", { err: String(err), tenantId: tenant.id }); return null; }),
    StorePageDB.listCatalogWithVisibility(tenant.id).catch((err) => { logger.warn("[t/[slug]] catalog load failed", { err: String(err), tenantId: tenant.id }); return []; }),
  ]);

  // "Productos al frente" (Brandon 2026-06-08): la landing debe mostrar
  // productos REALES sin entrar al catálogo. Si el dueño marcó destacados
  // (tenantPageProductOverride) usamos esos; si no, caemos al catálogo real
  // (primeros productos activos+visibles). Shape unificado para la vitrina.
  const productCount = catalog.filter((c) => c.active && c.visible).length;

  // Categorías reales (con conteo) para el bento del hero de escritorio.
  // Solo productos visibles+activos; ordenadas por cantidad desc.
  const catCounts = new Map<string, number>();
  for (const c of catalog) {
    const cat = c.active && c.visible && typeof c.category === "string" ? c.category.trim() : "";
    if (cat) catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
  }
  const categories = [...catCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const showcase: ShowcaseItem[] =
    featured.length > 0
      ? featured.map((p) => ({
          id: String(p.id),
          name: p.productName,
          image: p.productImage,
          unit: p.productUnit,
          price: p.productBasePrice,
          exclusivePrice:
            p.exclusivePrice != null && p.exclusivePrice < p.productBasePrice
              ? p.exclusivePrice
              : null,
          savingsPercent: p.savingsPercent ?? null,
          badge: p.badge ?? null,
        }))
      : catalog
          .filter((c) => c.active && c.visible)
          .slice(0, 12)
          .map((c) => ({
            id: String(c.productId),
            name: c.name,
            image: c.image,
            unit: c.unit,
            price: c.price,
            exclusivePrice: null,
            savingsPercent: null,
            badge: null,
          }));

  // Cadena de fallback para el nombre público de la tienda:
  //   storeTheme.storeName  →  settings.businessName  →  tenant.name  →  slug
  // El primero suele ser el campo que el dueño edita en el panel admin —
  // mientras que `tenant.name` puede contener el ID legacy del owner.
  const st = (settings?.storeTheme as Record<string, unknown> | undefined) ?? undefined;
  const themeName = st?.["storeName"];
  const displayName =
    (typeof themeName === "string" && themeName.trim()) ||
    (typeof settings?.businessName === "string" && settings.businessName.trim()) ||
    tenant.name ||
    tenant.slug;

  // FUENTE DE VERDAD del tema (Brandon 2026-06-08): el editor (Modo Creativo /
  // Identidad y tema) guarda en settings.storeTheme vía /api/settings. La landing
  // ANTES leía solo customization.footerHtml → los cambios del editor no se
  // reflejaban acá (sí en el catálogo, que sí lee settings.storeTheme). Ahora
  // settings.storeTheme manda, con fallback al diseño viejo. Así "todo se
  // personaliza" en la landing también.
  const pick = (k: string) => {
    const v = st?.[k];
    return typeof v === "string" && v.trim() && !v.trim().startsWith("var(") ? v.trim() : undefined;
  };
  const pickStr = (k: string) => (typeof st?.[k] === "string" ? (st[k] as string) : undefined);
  const editorTheme = {
    primaryColor: pick("primaryColor"),
    secondaryColor: pick("secondaryColor"),
    accentColor: pick("accentColor"),
    // Tipografía + estilos UI del editor (otra taxonomía) — opcionales.
    fontFamily: pickStr("fontFamily"),
    bodyFontFamily: pickStr("bodyFontFamily"),
    // Lote B (Brandon 2026-06-27): gradiente del hero + grid de destacados.
    heroGradientFrom: pickStr("heroGradientFrom"),
    heroGradientTo: pickStr("heroGradientTo"),
    heroGradientAngle: typeof st?.["heroGradientAngle"] === "number" ? (st["heroGradientAngle"] as number) : undefined,
    featuredCols: typeof st?.["featuredCols"] === "number" ? (st["featuredCols"] as number) : undefined,
    featuredCount: typeof st?.["featuredCount"] === "number" ? (st["featuredCount"] as number) : undefined,
    // Lote D (Brandon 2026-06-27): video/2º CTA hero, velocidad anuncios, fondo página.
    heroVideoUrl: pickStr("heroVideoUrl"),
    heroCta2Label: pickStr("heroCta2Label"),
    heroCta2Url: pickStr("heroCta2Url"),
    announcementInterval: typeof st?.["announcementInterval"] === "number" ? (st["announcementInterval"] as number) : undefined,
    pageBgColor: pickStr("pageBgColor"),
    // Lote E (Brandon 2026-06-27): color de navbar + layout de destacados.
    navbarBgColor: pickStr("navbarBgColor"),
    navbarTextColor: pickStr("navbarTextColor"),
    featuredLayout: pickStr("featuredLayout"),
    // Lote F (Brandon 2026-06-27): fuente propia por URL.
    customFontUrl: pickStr("customFontUrl"),
    customFontName: pickStr("customFontName"),
    customFontTarget: pickStr("customFontTarget"),
    // Lote H (Brandon 2026-06-27): tamaño base + interlineado.
    baseFontSize: typeof st?.["baseFontSize"] === "number" ? (st["baseFontSize"] as number) : undefined,
    lineHeight: typeof st?.["lineHeight"] === "number" ? (st["lineHeight"] as number) : undefined,
    // Lote I (Brandon 2026-06-27): menú de navegación editable.
    navCatalogLabel: pickStr("navCatalogLabel"),
    navExtraLinks: Array.isArray(st?.["navExtraLinks"]) ? (st["navExtraLinks"] as Array<{ label: string; url: string }>) : [],
    // Lote J (Brandon 2026-06-27): peso de fuente de títulos.
    headingWeight: typeof st?.["headingWeight"] === "number" ? (st["headingWeight"] as number) : undefined,
    // Lote P (Brandon 2026-06-28): A/B test del hero.
    abTestEnabled: st?.["abTestEnabled"] === true,
    heroVariantB: (st?.["heroVariantB"] && typeof st["heroVariantB"] === "object" && !Array.isArray(st["heroVariantB"]) ? st["heroVariantB"] : {}) as { heroTitle?: string; heroSubtitle?: string },
    // Lote Q (Brandon 2026-06-28): push opt-in.
    pushOptInEnabled: st?.["pushOptInEnabled"] === true,
    pushOptInMessage: pickStr("pushOptInMessage"),
    borderRadius: typeof st?.["borderRadius"] === "number" ? (st["borderRadius"] as number) : undefined,
    buttonStyle: pickStr("buttonStyle"),
    cardStyle: pickStr("cardStyle"),
    shadowLevel: pickStr("shadowLevel"),
    // Banner de anuncio del editor (Brandon 2026-06-25): imagen arriba de la tienda.
    announcementImage: pickStr("announcementImage"),
    // Imagen por sección (Brandon 2026-06-25): map clave-sección → URL.
    sectionImages:
      st?.["sectionImages"] && typeof st["sectionImages"] === "object" && !Array.isArray(st["sectionImages"])
        ? (st["sectionImages"] as Record<string, string>)
        : ({} as Record<string, string>),
    // Automatización (Brandon 2026-06-25): popup de bienvenida + texto del footer.
    welcomePopupEnabled: st?.["welcomePopupEnabled"] === true,
    welcomePopupTitle: pickStr("welcomePopupTitle"),
    welcomePopupMessage: pickStr("welcomePopupMessage"),
    welcomePopupCoupon: pickStr("welcomePopupCoupon"),
    // Lote C (Brandon 2026-06-27): conversión avanzada.
    announcements: Array.isArray(st?.["announcements"]) ? (st["announcements"] as unknown[]).filter((x): x is string => typeof x === "string") : [],
    exitIntentEnabled: st?.["exitIntentEnabled"] === true,
    exitIntentTitle: pickStr("exitIntentTitle"),
    exitIntentMessage: pickStr("exitIntentMessage"),
    exitIntentCoupon: pickStr("exitIntentCoupon"),
    scheduleExceptions: Array.isArray(st?.["scheduleExceptions"]) ? (st["scheduleExceptions"] as Array<{ date: string; label: string; closed: boolean }>) : [],
    chatPosition: pickStr("chatPosition"),
    chatBubbleText: pickStr("chatBubbleText"),
    footerText: pickStr("footerText"),
    // Analytics por tenant (Brandon 2026-06-26): GA4 + Meta Pixel del comerciante.
    analyticsId: pickStr("analyticsId"),
    pixelId: pickStr("pixelId"),
    // Variantes + controles del hero (Brandon 2026-06-26, page builder Fase 4).
    heroVariant: pickStr("heroVariant"),
    heroOverlay: typeof st?.["heroOverlay"] === "number" ? (st["heroOverlay"] as number) : undefined,
    heroAlign: pickStr("heroAlign"),
    heroHeight: pickStr("heroHeight"),
    heroShowBadges: st?.["heroShowBadges"] !== false, // default true
    // Mejoras Modo Creativo (Brandon 2026-06-26): escala tipográfica, WhatsApp
    // flotante, animaciones de entrada.
    fontScale: pickStr("fontScale"),
    whatsappFloatEnabled: st?.["whatsappFloatEnabled"] === true,
    whatsapp: pickStr("whatsapp"), // número que el dueño pone en Contacto
    whatsappMessage: pickStr("whatsappMessage"),
    animateOnScroll: st?.["animateOnScroll"] === true,
    // Contador de oferta (Brandon 2026-06-26).
    countdownEnabled: st?.["countdownEnabled"] === true,
    countdownTitle: pickStr("countdownTitle"),
    countdownEndsAt: pickStr("countdownEndsAt"),
    // Testimonios (Brandon 2026-06-26): array de reseñas.
    testimonials: Array.isArray(st?.["testimonials"])
      ? (st["testimonials"] as unknown[]).filter(
          (t): t is { name: string; stars: number; comment: string } =>
            !!t && typeof t === "object" && "name" in t,
        )
      : ([] as Array<{ name: string; stars: number; comment: string }>),
    // Estilos POR SECCIÓN (Brandon 2026-06-26): map data-pb → {bg,text,pad}.
    sectionStyles:
      st?.["sectionStyles"] && typeof st["sectionStyles"] === "object" && !Array.isArray(st["sectionStyles"])
        ? (st["sectionStyles"] as Record<string, { bg?: string; text?: string; pad?: "sm" | "md" | "lg"; radius?: number; border?: string; borderW?: number; shadow?: "none" | "soft" | "deep"; font?: string; width?: "narrow" | "normal" | "full"; padY?: number; divider?: "none" | "line" | "space"; anim?: "none" | "fade" | "up" | "zoom" }>)
        : ({} as Record<string, { bg?: string; text?: string; pad?: "sm" | "md" | "lg"; radius?: number; border?: string; borderW?: number; shadow?: "none" | "soft" | "deep"; font?: string; width?: "narrow" | "normal" | "full"; padY?: number; divider?: "none" | "line" | "space"; anim?: "none" | "fade" | "up" | "zoom" }>),
    // Texto POR SECCIÓN (Brandon 2026-06-27): map data-pb → {eyebrow,title}.
    // Override del texto por defecto de cada sección del cuerpo (featured/info…).
    sectionText:
      st?.["sectionText"] && typeof st["sectionText"] === "object" && !Array.isArray(st["sectionText"])
        ? (st["sectionText"] as Record<string, { eyebrow?: string; title?: string; align?: "left" | "center" | "right" }>)
        : ({} as Record<string, { eyebrow?: string; title?: string; align?: "left" | "center" | "right" }>),
    // Texto inline genérico (Brandon 2026-06-27): map data-live="inlineText:key" → override.
    inlineText:
      st?.["inlineText"] && typeof st["inlineText"] === "object" && !Array.isArray(st["inlineText"])
        ? (st["inlineText"] as Record<string, string>)
        : ({} as Record<string, string>),
    // Secciones del cuerpo ocultas (Brandon 2026-06-27).
    bodyHidden: Array.isArray(st?.["bodyHidden"])
      ? (st["bodyHidden"] as unknown[]).filter((x): x is string => typeof x === "string")
      : ([] as string[]),
    // Diseño de tarjetas de producto (Brandon 2026-06-27).
    cardDesign:
      st?.["cardDesign"] && typeof st["cardDesign"] === "object" && !Array.isArray(st["cardDesign"])
        ? (st["cardDesign"] as { bg?: string; radius?: number; border?: string; borderW?: number; shadow?: "none" | "soft" | "deep"; nameColor?: string; priceColor?: string })
        : ({} as { bg?: string; radius?: number; border?: string; borderW?: number; shadow?: "none" | "soft" | "deep"; nameColor?: string; priceColor?: string }),
    // Estilos por texto (barra de texto flotante): map campo → {size,bold,color,align,italic,underline,upper}.
    textStyles:
      st?.["textStyles"] && typeof st["textStyles"] === "object" && !Array.isArray(st["textStyles"])
        ? (st["textStyles"] as Record<string, { size?: number; bold?: boolean; color?: string; align?: "left" | "center" | "right"; italic?: boolean; underline?: boolean; upper?: boolean; track?: number; tshadow?: boolean }>)
        : ({} as Record<string, { size?: number; bold?: boolean; color?: string; align?: "left" | "center" | "right"; italic?: boolean; underline?: boolean; upper?: boolean; track?: number; tshadow?: boolean }>),
    // Orden del cuerpo de la landing (Brandon 2026-06-26, page builder Fase 2):
    // keys reordenables = trust|promos|featured|info. Vacío = orden histórico.
    bodyOrder: Array.isArray(st?.["bodyOrder"])
      ? (st["bodyOrder"] as unknown[]).filter((x): x is string => typeof x === "string")
      : ([] as string[]),
    // Conversión (Brandon 2026-06-26, Modo Creativo > Automatización): envío
    // gratis, prueba social, estado abierto/cerrado, tema estacional.
    freeShipEnabled: st?.["freeShipEnabled"] === true,
    freeShipThreshold: typeof st?.["freeShipThreshold"] === "number" ? (st["freeShipThreshold"] as number) : 50,
    freeShipText: pickStr("freeShipText"),
    socialProofEnabled: st?.["socialProofEnabled"] === true,
    openStatusEnabled: st?.["openStatusEnabled"] === true,
    seasonalTheme: pickStr("seasonalTheme") || "none",
    schedules:
      st?.["schedules"] && typeof st["schedules"] === "object" && !Array.isArray(st["schedules"])
        ? (st["schedules"] as Record<string, { open: string; close: string }>)
        : ({} as Record<string, { open: string; close: string }>),
  };

  // Feature flags PRO opt-in por tienda (ADR-298): viven en storeTheme.features.
  // La plantilla es la misma para todas; solo las tiendas con flags ven los
  // bloques extra (trust/urgency/content/capture). Cero impacto en las demás.
  const rawFeatures = (st as Record<string, unknown> | undefined)?.["features"];
  const features = Array.isArray(rawFeatures)
    ? rawFeatures.filter((x): x is string => typeof x === "string")
    : [];

  // Prueba social (Brandon 2026-06-26): pedidos recientes ANONIMIZADOS, solo si
  // el dueño activó el toggle. Sin pedidos → array vacío (no se inventa data).
  let socialProof: Array<{ product: string; at: string }> = [];
  if (editorTheme.socialProofEnabled) {
    try {
      const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7); // últimos 7 días
      socialProof = await OrdersDB.recentForSocialProof(tenant.id, since);
    } catch {
      socialProof = [];
    }
  }

  return { tenant, customization, featured, promotions, exclusiveCount, displayName, showcase, productCount, categories, editorTheme, features, socialProof };
}

export async function generateMetadata({
  params,
}: TenantLandingProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadPageData(slug);
  if (!data) return { title: "Tienda no encontrada" };

  const { customization, displayName } = data;
  // Tienda individual: el título es solo el nombre del comercio.
  // `absolute` evita que el template `%s | Buleje` del root layout añada
  // el sufijo del marketplace a la página propia del negocio.
  const title = customization.metaTitle ?? displayName;
  const description =
    customization.metaDescription ??
    customization.heroSubtitle ??
    `Compra en ${displayName} con delivery rápido. Paga con Yape o efectivo.`;
  // Audit 2026-05-17 02-P2-4: fallback a /api/og?title=...&subtitle=...
  // cuando el tenant no tiene OG personalizada. Antes, sin ogImage ni
  // heroImage, el share en WhatsApp/FB no mostraba preview visual —
  // muy mala UX en discovery. Ahora siempre hay una OG con 1200×630.
  const ogFallback = `${process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe"}/api/og?title=${encodeURIComponent(displayName)}&subtitle=${encodeURIComponent("Compra con delivery rápido en Ciudad Constitución")}`;
  const ogImage = customization.ogImageUrl ?? customization.heroImageUrl ?? ogFallback;

  return {
    title: { absolute: title },
    description,
    // Audit 2026-05-17 02-P1-06: sin canonical, Google puede indexar duplicados
    // (preview=true vs normal, query strings). Fija URL canónica al slug puro.
    alternates: {
      canonical: `${process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe"}/t/${slug}`,
    },
    openGraph: {
      title,
      description,
      ...(ogImage ? { images: [{ url: ogImage, width: 1200, height: 630 }] } : {}),
      type: "website",
      locale: "es_PE",
      siteName: displayName,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

/**
 * Next 16 Cache Components canonical pattern:
 * 1. export default Page() síncrona → shell con <Suspense>
 * 2. TenantLandingContent async con await connection() → dynamic rendering
 * Sin esto, cacheComponents: true rechaza uncached data fuera de Suspense.
 */

function TenantPageSkeleton() {
  return (
    <main className="min-h-screen bg-[var(--surface-canvas)] animate-pulse">
      <section className="bg-[var(--accent)]" style={{ minHeight: "320px" }}>
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <div className="w-24 h-24 rounded-3xl mx-auto mb-6 bg-white/20" />
          <div className="h-10 w-60 bg-white/20 rounded-lg mx-auto mb-3" />
          <div className="h-5 w-80 bg-white/15 rounded mx-auto" />
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="h-8 w-48 bg-[var(--rule-soft)] dark:bg-[var(--surface-sunken)] rounded mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-[var(--surface-raised)] shadow-sm border border-[var(--rule-base)] overflow-hidden">
              <div className="aspect-square bg-[var(--surface-sunken)]" />
              <div className="p-3 space-y-2">
                <div className="h-4 w-24 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded" />
                <div className="h-5 w-16 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

async function TenantLandingContent({ params, searchParams }: TenantLandingProps) {
  await connection();
  const { slug } = await params;
  const { preview } = await searchParams;
  const isPreviewParam = preview === "true";
  const data = await loadPageData(slug);
  if (!data) notFound();

  const { tenant, customization, featured, promotions, exclusiveCount, displayName, showcase, productCount, categories, editorTheme, features, socialProof } = data;

  // SECURITY (audit 2026-06-26): `?preview=true` solo lo honra el DUEÑO de este
  // tenant o un superadmin con sesión válida. Antes, cualquier visitante anónimo
  // podía ver una tienda no publicada/inactiva agregando el parámetro a la URL.
  let isPreview = false;
  if (isPreviewParam) {
    try {
      const token = (await cookies()).get(SESSION.COOKIE_NAME)?.value;
      const payload = token ? await getSessionPayload(token) : null;
      isPreview = !!payload && (payload.role === "superadmin" || payload.tenantId === tenant.id);
    } catch {
      isPreview = false;
    }
  }

  // Permitir preview del dueño/superadmin aunque esté inactiva/sin publicar.
  if (!isPreview && (!tenant.active || !customization.published)) notFound();

  // Design tokens del SectionsBuilder tienen prioridad sobre customization viejo.
  // El bodeguero edita primary/accent desde el tab "Diseño" del admin.
  const pageDataForColors = deserializePageData(customization.footerHtml);
  // settings.storeTheme (editor) manda; luego el diseño viejo (footerHtml),
  // customization y por último el color del tenant.
  const primary = editorTheme.primaryColor || pageDataForColors.design.primaryColor || customization.primaryColor || tenant.primaryColor || "var(--accent)";
  const accent = editorTheme.accentColor || pageDataForColors.design.accentColor || customization.accentColor || "#f4a261";

  // Preview EN VIVO (Brandon 2026-06-08): las inline-styles de color usan estas
  // CSS vars con FALLBACK al valor del server. Así el render normal es idéntico,
  // pero PreviewLiveTheme (en ?preview=true) puede sobrescribir --tenant-primary/
  // accent vía postMessage y la tienda cambia de color sin recargar.
  const cssPrimary = `var(--tenant-primary, ${primary})`;
  const cssAccent = `var(--tenant-accent, ${accent})`;
  // El logo y el título usan el nombre público real (storeTheme.storeName) en
  // lugar de `tenant.name` — para que el comercio nunca vea el nombre raw del
  // tenant ni la marca del marketplace en su propia página.
  const logoText = displayName.slice(0, 2).toUpperCase();
  const heroTitle = customization.heroTitle ?? displayName;
  // Subtítulo: el que cargó el dueño o, si no hay, un tagline derivado de sus
  // categorías reales ("Tecnología, Hogar y Accesorios con delivery rápido").
  const catNames = categories.slice(0, 3).map((c) => c.name);
  const catPhrase =
    catNames.length === 0
      ? ""
      : catNames.length === 1
        ? catNames[0]
        : `${catNames.slice(0, -1).join(", ")} y ${catNames[catNames.length - 1]}`;
  const heroSubtitle =
    customization.heroSubtitle ?? (catPhrase ? `${catPhrase} con delivery rápido a tu puerta.` : undefined);
  const heroImage = customization.heroImageUrl;

  const formatPrice = (n: number) => `S/${n.toFixed(2)}`;

  // Datos del bento del hero de escritorio: 1 producto destacado + tiles de
  // categorías reales. Sin inventar nada — sale del catálogo del comercio.
  const heroFeatured = showcase[0] ?? null;
  const heroTiles = categories.slice(0, 3);

  // Plan badges alineados con plan-tiers.ts mayo 2026 v2.
  // PlanId DB ↔ Label: free→Free, pro→Starter, business→Pro, enterprise→Business.
  const planBadge: Record<string, { label: string; className: string }> = {
    free: {
      label: "Free",
      className: "bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:bg-[var(--surface-sunken)] dark:text-[var(--text-tertiary)]",
    },
    pro: {
      label: "Starter",
      className: "bg-teal-100 text-[var(--accent-dark)] dark:bg-teal-900/30 dark:text-teal-400",
    },
    business: {
      label: "Pro",
      className: "bg-emerald-100 text-[var(--data-success-700)] dark:bg-emerald-900/30 dark:text-emerald-400",
    },
    enterprise: {
      label: "Business",
      className: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-900)]/30 dark:text-amber-400",
    },
  };
  const badge = planBadge[tenant.plan] ?? planBadge.free;

  // ── Design tokens del tenant — pintados via CSS vars en el wrapper .tenant-theme ──
  const pageData = deserializePageData(customization.footerHtml);
  // El editor (settings.storeTheme) manda sobre el diseño viejo (footerHtml):
  // sus colores alimentan los CSS vars --tenant-* que usan las inline-styles.
  // (Fuente única de verdad del tema — Brandon 2026-06-08.) La tipografía del
  // editor usa otra taxonomía → se deja la de footerHtml por ahora.
  const designTokens = {
    ...pageData.design,
    ...(editorTheme.primaryColor ? { primaryColor: editorTheme.primaryColor } : {}),
    ...(editorTheme.secondaryColor ? { secondaryColor: editorTheme.secondaryColor } : {}),
    ...(editorTheme.accentColor ? { accentColor: editorTheme.accentColor } : {}),
  };

  // Tipografía + estilos UI del editor (settings.storeTheme) = fuente de verdad.
  // El editor usa otra taxonomía de fuentes → EDITOR_FONT_MAP. El font-family lo
  // maneja .tenant-theme vía var(--tenant-font), que sobreescribimos abajo (y que
  // PreviewLiveTheme puede pisar en vivo). buttonStyle → --tenant-btn-radius.
  const baseFont = FONT_FAMILIES[designTokens.fontFamily];
  const editorFont = editorTheme.fontFamily ? EDITOR_FONT_MAP[editorTheme.fontFamily] : undefined;
  const fontStack = editorFont?.stack ?? baseFont.stack;
  const fontLabel = editorFont ? editorFont.label : baseFont.label; // null = sistema (sin Google Font)
  // Par de fuentes (Lote A): bodyFontFamily = CUERPO; vacío = misma que títulos.
  const editorBodyFont = editorTheme.bodyFontFamily ? EDITOR_FONT_MAP[editorTheme.bodyFontFamily] : undefined;
  let bodyStack = editorBodyFont?.stack ?? fontStack;
  const bodyLabel = editorBodyFont ? editorBodyFont.label : null;
  // Fuente personalizada (Lote F): URL hosteada → @font-face. Se aplica a títulos
  // y/o cuerpo según customFontTarget. Tiene prioridad como 1ª familia del stack.
  const customFontActive = Boolean(editorTheme.customFontUrl) && editorTheme.customFontTarget !== "none" && editorTheme.customFontTarget !== "";
  let headingStack = fontStack;
  if (customFontActive) {
    const cf = `"BulejeCustomFont"`;
    const tgt = editorTheme.customFontTarget;
    if (tgt === "headings" || tgt === "all") headingStack = `${cf}, ${fontStack}`;
    if (tgt === "body" || tgt === "all") bodyStack = `${cf}, ${bodyStack}`;
  }
  const btnRadius = editorTheme.buttonStyle ? EDITOR_BTN_RADIUS[editorTheme.buttonStyle] : undefined;
  // Escala tipográfica global (Brandon 2026-06-26): agranda/achica TODO el texto
  // de la tienda escalando el font-size raíz (los text-* de Tailwind son rem).
  // Solo afecta a /t (documento propio), no al admin.
  const fontScalePct = editorTheme.fontScale === "small" ? 92 : editorTheme.fontScale === "large" ? 112 : 100;
  // Lote H: tamaño base en px tiene prioridad sobre la escala %; interlineado opcional.
  const baseFontPx = typeof editorTheme.baseFontSize === "number" && editorTheme.baseFontSize >= 12 && editorTheme.baseFontSize <= 24 && editorTheme.baseFontSize !== 16 ? editorTheme.baseFontSize : null;
  const lineH = typeof editorTheme.lineHeight === "number" && editorTheme.lineHeight >= 1.2 && editorTheme.lineHeight <= 2.2 ? editorTheme.lineHeight : null;

  // cardStyle del editor → tratamiento de las tarjetas de producto de la vitrina.
  const cardClass =
    editorTheme.cardStyle === "minimal"
      ? "border border-[var(--rule-base)]"
      : editorTheme.cardStyle === "border"
        ? "border-2 border-[var(--rule-base)]"
        : editorTheme.cardStyle === "glass"
          ? "border border-white/30 bg-white/70 backdrop-blur-md shadow-sm dark:bg-white/10"
          : "border border-[var(--rule-base)] shadow-sm hover:shadow-xl"; // "shadow"/default

  // Diseño de tarjetas (Brandon 2026-06-27): override inline sobre cardClass.
  const _cd = editorTheme.cardDesign ?? {};
  const _cardShadow: Record<string, string> = { none: "none", soft: "0 4px 16px rgba(0,0,0,0.10)", deep: "0 12px 32px rgba(0,0,0,0.18)" };
  const cardDesignStyle = {
    ...(_cd.bg ? { background: _cd.bg } : {}),
    ...(typeof _cd.radius === "number" ? { borderRadius: _cd.radius } : {}),
    ...(_cd.border ? { border: `${_cd.borderW ?? 2}px solid ${_cd.border}` } : {}),
    ...(_cd.shadow ? { boxShadow: _cardShadow[_cd.shadow] } : {}),
  } as Record<string, string | number>;

  // Override de tokens de marca (--accent/--color-primary) con el color del
  // tenant para que TODO (navbar, eyebrows, botones token-based) use la marca,
  // no solo el hero. Solo si el color es literal (#hex) — los tenants sin tema
  // propio heredan el default. Brandon 2026-06-21.
  const isLitColor = (v: string) => Boolean(v) && !v.trim().startsWith("var(");
  const brandTokenVars = isLitColor(primary)
    ? ({
        "--accent": primary,
        "--accent-600": primary,
        "--accent-dark": primary,
        "--color-primary": primary,
        ...(isLitColor(accent) ? { "--accent-soft": accent } : {}),
      } as React.CSSProperties)
    : undefined;

  return (
    <main className="min-h-screen bg-[var(--surface-canvas)] tenant-theme" data-store-chrome="tenant" style={{ ...(brandTokenVars ?? {}), ...(editorTheme.pageBgColor ? ({ "--surface-canvas": editorTheme.pageBgColor } as React.CSSProperties) : {}) }}>
      {/* Anuncios rotativos (Lote C) — barra superior con N mensajes. */}
      {editorTheme.announcements.length > 0 && <RotatingAnnouncementBar messages={editorTheme.announcements} intervalMs={(editorTheme.announcementInterval ?? 4) * 1000} />}
      {/* CSS dinamico generado a partir de los design tokens del tenant.
          Sobreescribe el theme de Buleje solo en el subarbol .tenant-theme. */}
      <style dangerouslySetInnerHTML={{ __html: tokensToCssBlock(designTokens) }} />
      {/* Escala tipográfica global del editor: tamaño base px (prioridad) o escala %. */}
      {baseFontPx ? (
        <style dangerouslySetInnerHTML={{ __html: `html{font-size:${baseFontPx}px}` }} />
      ) : fontScalePct !== 100 ? (
        <style dangerouslySetInnerHTML={{ __html: `html{font-size:${fontScalePct}%}` }} />
      ) : null}
      {/* Lote H: interlineado global opcional. */}
      {lineH && (
        <style dangerouslySetInnerHTML={{ __html: `.tenant-theme{line-height:${lineH}}` }} />
      )}
      {/* Lote J: peso de fuente de los títulos (override de las clases font-bold). */}
      {typeof editorTheme.headingWeight === "number" && editorTheme.headingWeight >= 400 && editorTheme.headingWeight <= 900 && (
        <style dangerouslySetInnerHTML={{ __html: `.tenant-theme .font-display{font-weight:${editorTheme.headingWeight} !important}` }} />
      )}
      {/* Animaciones de entrada al scrollear (Brandon 2026-06-26) — el estado
          oculto lo agrega ScrollReveal (JS), no el server → SEO/no-JS intactos. */}
      {editorTheme.animateOnScroll && (
        <>
          <style dangerouslySetInnerHTML={{ __html: ".pb-reveal{opacity:0;transform:translateY(18px)}.pb-reveal-in{opacity:1;transform:none;transition:opacity .6s ease,transform .6s ease}" }} />
          <ScrollReveal />
        </>
      )}
      {/* Override de tipografía (editor) + radio de botón — sobre .tenant-theme,
          después de tokensToCssBlock para ganar. PreviewLiveTheme pisa en vivo. */}
      <style dangerouslySetInnerHTML={{ __html: `.tenant-theme{--tenant-font:${bodyStack};--font-display-family:${headingStack};${btnRadius ? `--tenant-btn-radius:${btnRadius};` : ""}}` }} />
      {/* Fuente personalizada del dueño (Lote F) — @font-face desde URL hosteada. */}
      {customFontActive && (
        <style dangerouslySetInnerHTML={{ __html: `@font-face{font-family:"BulejeCustomFont";src:url("${(editorTheme.customFontUrl ?? "").replace(/"/g, "")}");font-display:swap;}` }} />
      )}
      {/* Keyframes de animación de entrada por sección (Brandon 2026-06-27 · #4).
          @media reduced-motion las desactiva (a11y). */}
      <style dangerouslySetInnerHTML={{ __html: "@keyframes buleje-fade{from{opacity:0}to{opacity:1}}@keyframes buleje-up{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}@keyframes buleje-zoom{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}@media (prefers-reduced-motion: reduce){[data-pb]{animation:none !important}}" }} />

      {/* Google Fonts loader — carga solo la fuente que el tenant eligio.
          PERF 2026-05-24: preconnect evita ~200-400ms de DNS+TCP+TLS a Google
          antes de descubrir el stylesheet (display=swap ya evita FOIT). */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {fontLabel && (
        <link
          rel="stylesheet"
          href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontLabel).replace(/%20/g, "+")}:wght@400;600;700;800;900&display=swap`}
        />
      )}
      {/* Fuente de CUERPO (Lote A) — solo si difiere de la de títulos. */}
      {bodyLabel && bodyLabel !== fontLabel && (
        <link
          rel="stylesheet"
          href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(bodyLabel).replace(/%20/g, "+")}:wght@400;600;700;800;900&display=swap`}
        />
      )}
      {/* Fuentes reales POR SECCIÓN (Brandon 2026-06-27 · #3): carga las familias
          Google usadas en sectionStyles[].font (la 1ª entre comillas del stack). */}
      {Array.from(new Set(
        Object.values(editorTheme.sectionStyles ?? {})
          .map((s) => (s as { font?: string }).font)
          .filter((f): f is string => typeof f === "string" && f.includes('"'))
          .map((f) => f.match(/"([^"]+)"/)?.[1])
          .filter((x): x is string => !!x),
      )).map((fam) => (
        <link
          key={fam}
          rel="stylesheet"
          href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(fam).replace(/%20/g, "+")}:wght@400;600;700;800;900&display=swap`}
        />
      ))}

      {/* Beacon tracker (client component) */}
      <TenantPageTracker tenantSlug={tenant.slug} />

      {/* GA4 + Meta Pixel del comerciante (Brandon 2026-06-26) — solo en la tienda
          pública, NUNCA en preview (no contaminar las métricas con el dueño editando). */}
      {!isPreview && (
        <TenantAnalytics gaId={editorTheme.analyticsId} pixelId={editorTheme.pixelId} />
      )}

      {/* Preview EN VIVO: escucha al editor y aplica tokens sin recargar. */}
      {isPreview && <PreviewLiveTheme />}

      {/* Page builder Fase 1 (Brandon 2026-06-25): overlay de edición — click en
          un bloque [data-pb] abre su panel en el editor. Solo en preview. */}
      {isPreview && <StorefrontEditOverlay />}

      {/* Estilos por texto (barra de texto flotante) — aplica tamaño/negrita/color/
          alineación sobre los [data-live]. Solo si el dueño configuró alguno. */}
      {Object.keys(editorTheme.textStyles).length > 0 && (
        <TenantTextStyles styles={editorTheme.textStyles} />
      )}

      {/* Estilos por sección (editar componente individual) — aplica fondo/texto/
          espaciado SOLO a la sección [data-pb] elegida. */}
      {Object.keys(editorTheme.sectionStyles).length > 0 && (
        <TenantSectionStyles styles={editorTheme.sectionStyles} />
      )}

      {/* Nav ÚNICO de la tienda — el MISMO StorefrontNavbar del catálogo
          (`/t/<slug>/tienda`). Tenant-aware: Inicio → esta landing, Catálogo →
          el catálogo, buscador → catálogo. El carrito es un enlace al catálogo
          (esta landing está fuera del chrome `(store)`, sin CartProvider). */}
      <StorefrontNavbar
        name={displayName}
        logo={tenant.logoUrl}
        homeHref={`/t/${tenant.slug}`}
        catalogHref={`/t/${tenant.slug}/tienda`}
        searchHref={`/t/${tenant.slug}/tienda#productos`}
        cartHref={`/t/${tenant.slug}/tienda`}
        bgColor={editorTheme.navbarBgColor || undefined}
        textColor={editorTheme.navbarTextColor || undefined}
        catalogLabel={editorTheme.navCatalogLabel || undefined}
        extraLinks={editorTheme.navExtraLinks}
      />

      {/* Tema estacional + envío gratis + estado Abierto/Cerrado (Brandon
          2026-06-26, Modo Creativo > Automatización). */}
      {editorTheme.seasonalTheme && editorTheme.seasonalTheme !== "none" && (
        <SeasonalDecor season={editorTheme.seasonalTheme as "none" | "navidad" | "fiestas_patrias" | "halloween"} />
      )}
      {editorTheme.freeShipEnabled && (
        <FreeShipPromoBar slug={tenant.slug} threshold={editorTheme.freeShipThreshold} text={editorTheme.freeShipText} />
      )}
      {editorTheme.openStatusEnabled && (Object.keys(editorTheme.schedules || {}).length > 0 || editorTheme.scheduleExceptions.length > 0) && (
        <div className="flex justify-center px-4 pt-3">
          <OpenStatusBadge schedules={editorTheme.schedules} exceptions={editorTheme.scheduleExceptions} />
        </div>
      )}

      {/* Contador de oferta (Brandon 2026-06-26) — banda de urgencia arriba.
          Se oculta sola al vencer (client component). */}
      {editorTheme.countdownEnabled && editorTheme.countdownEndsAt && (
        <CountdownBanner
          title={editorTheme.countdownTitle ?? "¡Oferta por tiempo limitado!"}
          endsAt={editorTheme.countdownEndsAt}
        />
      )}

      {/* Banner de anuncio (Brandon 2026-06-25): imagen full-width arriba de la
          tienda, configurable desde Modo Creativo > Secciones. */}
      {editorTheme.announcementImage && (
        <div data-pb="announcement" className="w-full bg-[var(--surface-sunken)]">
          {/* eslint-disable-next-line @next/next/no-img-element -- banner full-width de aspecto variable */}
          <img
            src={editorTheme.announcementImage}
            alt={`Anuncio de ${displayName}`}
            className="block w-full h-auto max-h-[280px] object-cover"
          />
        </div>
      )}

      {/* HERO con variantes (Brandon 2026-06-26, page builder Fase 4) — TenantHero.tsx.
          El dueño elige editorial|centered|split|immersive desde Modo Creativo > Hero. */}
      <TenantHero
        variant={(editorTheme.heroVariant as HeroVariant) || "minimal"}
        heroTitle={heroTitle}
        heroSubtitle={heroSubtitle}
        heroImage={heroImage}
        heroGradientFrom={editorTheme.heroGradientFrom}
        heroGradientTo={editorTheme.heroGradientTo}
        heroGradientAngle={editorTheme.heroGradientAngle}
        heroVideoUrl={editorTheme.heroVideoUrl}
        heroCta2Label={editorTheme.heroCta2Label}
        heroCta2Url={editorTheme.heroCta2Url}
        displayName={displayName}
        slug={tenant.slug}
        ownerPhone={tenant.ownerPhone}
        whatsappPhone={customization.whatsappPhone}
        createdYear={tenant.createdAt ? new Date(tenant.createdAt).getFullYear() : null}
        logoUrl={tenant.logoUrl}
        logoText={logoText}
        primary={primary}
        accent={accent}
        btnRadiusFallback={btnRadius ?? "9999px"}
        exclusiveCount={exclusiveCount}
        productCount={productCount}
        heroFeatured={heroFeatured}
        heroTiles={heroTiles}
        isPreview={isPreview}
        badgeLabel={badge.label}
        badgeClassName={badge.className}
        heroCtaLabel={customization.heroCtaLabel}
        heroCtaUrl={customization.heroCtaUrl}
        overlay={editorTheme.heroOverlay}
        align={(editorTheme.heroAlign as "left" | "center") ?? "left"}
        height={(editorTheme.heroHeight as "compact" | "normal" | "tall") ?? "normal"}
        showBadges={editorTheme.heroShowBadges}
        inlineText={editorTheme.inlineText}
      />
      {/* Lote P: A/B test del hero (variante B de título/subtítulo) — Brandon 2026-06-28. */}
      {editorTheme.abTestEnabled && (editorTheme.heroVariantB?.heroTitle || editorTheme.heroVariantB?.heroSubtitle) && (
        <AbHeroTest slug={tenant.slug} variantB={editorTheme.heroVariantB} />
      )}

      {/* ═══ Cuerpo reordenable (Brandon 2026-06-26, page builder Fase 2):
          trust, promos, featured, info se renderizan en el orden de
          editorTheme.bodyOrder. Default (vacío) = orden histórico → sin cambio
          visual. Los bloques quedan en su sitio; solo cambia el orden de emisión. ═══ */}
      {(() => {
        const __body: Record<string, ReactNode> = {};
        // Trust badges — verificado, ventas, antigüedad
        __body.trust = (
      <div data-pb="trust">
        <VendorTrustBadges
          verified={tenant.active}
          createdYear={tenant.createdAt ? new Date(tenant.createdAt).getFullYear() : 2026}
        />
      </div>
        );
        // Promociones + bandas de imágenes por sección (anidadas a este bloque)
        __body.promos = (
          <>
      {/* Active promotions banner — solo renderea si hay promos reales o en modo preview */}
      {(promotions.length > 0 || isPreview) && (
        <section data-pb="promos" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6 relative z-20">
          {promotions.length > 0 ? (
            <div className="space-y-2">
              {promotions.slice(0, 3).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 p-4 rounded-2xl shadow-lg"
                  style={{
                    background: `linear-gradient(90deg, ${cssAccent} 0%, ${cssPrimary} 100%)`,
                  }}
                >
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                    <Tag className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-white">{p.title}</p>
                    {p.description && (
                      <p className="text-white/85 text-sm truncate">{p.description}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0 px-3 py-1 rounded-full bg-white/25 text-white font-extrabold text-sm">
                    {p.discountType === "percent"
                      ? `${p.discountValue}% OFF`
                      : p.discountType === "amount"
                      ? `-S/${p.discountValue}`
                      : `S/${p.discountValue}`}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Placeholder SOLO en modo preview — al público le ocultamos esto */
            <div className="flex items-center gap-3 p-4 rounded-2xl shadow-lg border-2 border-dashed border-[var(--rule-base)] bg-white/80 dark:bg-[var(--surface-canvas)]/80 backdrop-blur">
              <div className="w-10 h-10 rounded-xl bg-[var(--surface-sunken)] flex items-center justify-center flex-shrink-0">
                <Tag className="w-5 h-5 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[var(--text-tertiary)]">Promoción destacada</p>
                <p className="text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] text-sm">Vista previa · configura desde Mi Tienda &gt; Promociones</p>
              </div>
              <div className="flex-shrink-0 px-3 py-1 rounded-full bg-[var(--surface-sunken)] text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] font-extrabold text-sm">
                % OFF
              </div>
            </div>
          )}
        </section>
      )}

      {/* Imágenes por sección (Brandon 2026-06-25): bandas full-width que el dueño
          sube desde Modo Creativo > Secciones (una por sección). */}
      {Object.entries(editorTheme.sectionImages)
        .filter(([, url]) => typeof url === "string" && url.length > 0)
        .map(([key, url]) => (
          <div key={key} className="w-full bg-[var(--surface-sunken)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- banda full-width de aspecto variable */}
            <img
              src={url}
              alt={`${displayName} — ${key}`}
              className="block w-full h-auto max-h-[320px] object-cover"
            />
          </div>
        ))}
          </>
        );
        // Productos al frente + bloques PRO + empty-state (anidados a este bloque)
        __body.featured = (
          <>
      {/* ═══════════════ Productos al frente (Brandon 2026-06-08) ═══════════════
          Vitrina de productos REALES en la landing — destacados si el dueño los
          marcó (tenantPageProductOverride), si no caemos al catálogo real. Es lo
          que más vende: el cliente ve productos sin tener que entrar al catálogo. */}
      {(showcase.length > 0 || isPreview) && (
        <section data-pb="featured" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div style={editorTheme.sectionText?.featured?.align ? { textAlign: editorTheme.sectionText.featured.align } : undefined}>
              <p data-pb-text="featured:eyebrow" data-live="sectionText:featured:eyebrow" className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1.5">
                {editorTheme.sectionText?.featured?.eyebrow || (featured.length > 0 ? "Destacados" : "Nuestro catálogo")}
              </p>
              <h2 data-pb-text="featured:title" data-live="sectionText:featured:title" className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
                {editorTheme.sectionText?.featured?.title || (featured.length > 0 ? "Lo que recomendamos" : `Algunos productos de ${displayName}`)}
              </h2>
            </div>
            <Link
              href={`/t/${tenant.slug}/tienda`}
              className="hidden shrink-0 items-center gap-1.5 text-sm font-extrabold text-[var(--accent)] transition-all hover:gap-2.5 sm:inline-flex"
            >
              <span data-live="inlineText:featured.viewAll">{editorTheme.inlineText?.["featured.viewAll"] || "Ver todo"}</span>
              <ArrowRight className="w-4 h-4" strokeWidth={2.5} aria-hidden />
            </Link>
          </div>

          {showcase.length > 0 ? (
            <div className={
              editorTheme.featuredLayout === "list" ? "flex flex-col gap-3"
              : editorTheme.featuredLayout === "carousel" ? "flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]"
              : `grid gap-4 ${editorTheme.featuredCols === 2 ? "grid-cols-2 sm:grid-cols-2 md:grid-cols-2" : editorTheme.featuredCols === 3 ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4"}`
            }>
              {showcase.slice(0, editorTheme.featuredCount ?? 8).map((p) => {
                const isExclusive = p.exclusivePrice != null;
                const shownPrice = isExclusive ? p.exclusivePrice! : p.price;
                const isList = editorTheme.featuredLayout === "list";
                const isCarousel = editorTheme.featuredLayout === "carousel";
                return (
                  <Link
                    key={p.id}
                    href={`/t/${tenant.slug}/tienda`}
                    data-pb-card="1"
                    style={cardDesignStyle}
                    className={`group relative rounded-2xl overflow-hidden bg-[var(--surface-raised)] transition-all hover:-translate-y-0.5 ${cardClass} ${isList ? "sm:flex sm:items-stretch" : ""} ${isCarousel ? "snap-start shrink-0 w-44 sm:w-52" : ""}`}
                  >
                    <div className={`${isList ? "aspect-[4/3] sm:w-44 sm:shrink-0" : "aspect-square"} bg-[var(--surface-sunken)] overflow-hidden relative`}>
                      {p.image ? (
                        <Image
                          src={p.image}
                          alt={p.name}
                          fill
                          sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
                          className="object-cover group-hover:scale-105 transition-transform duration-[var(--dur-base)]"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <ShoppingBag className="w-8 h-8 text-[var(--text-tertiary)]" strokeWidth={1.5} aria-hidden />
                        </div>
                      )}
                    </div>

                    {/* Exclusive badge */}
                    {isExclusive && p.savingsPercent != null && p.savingsPercent > 0 && (
                      <div
                        className="absolute top-2 left-2 px-2 py-1 rounded-full text-white font-extrabold text-xs shadow-lg"
                        style={{ background: cssAccent }}
                      >
                        -{p.savingsPercent}%
                      </div>
                    )}

                    {/* Custom badge */}
                    {p.badge && (
                      <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-white/95 text-[var(--text-primary)] font-bold text-[length:var(--ts-2xs)] shadow">
                        {p.badge}
                      </div>
                    )}

                    <div className={`p-3 ${isList ? "sm:flex-1 sm:flex sm:flex-col sm:justify-center" : ""}`}>
                      <p data-pb-card-name className="font-semibold text-sm truncate text-[var(--text-primary)]" style={_cd.nameColor ? { color: _cd.nameColor } : undefined}>{p.name}</p>
                      <p className="text-xs text-[var(--text-secondary)] mb-2">{p.unit}</p>
                      <div className="flex items-baseline gap-2">
                        <span
                          data-pb-card-price
                          className="font-extrabold text-lg"
                          style={{ color: _cd.priceColor || (isExclusive ? cssPrimary : undefined) }}
                        >
                          {formatPrice(shownPrice)}
                        </span>
                        {isExclusive && (
                          <span className="text-xs text-[var(--text-tertiary)] line-through">
                            {formatPrice(p.price)}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            /* Skeleton SOLO visible en modo preview (no al cliente final) */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl overflow-hidden bg-[var(--surface-raised)] border-2 border-dashed border-[var(--rule-base)]"
                >
                  <div className="aspect-square bg-[var(--surface-sunken)] flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-12 h-12 mx-auto mb-2 rounded-xl bg-[var(--surface-sunken)] flex items-center justify-center">
                        <ShoppingBag className="w-6 h-6 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]" />
                      </div>
                      <p className="text-xs font-semibold text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">Producto {i + 1}</p>
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="h-4 w-20 bg-[var(--surface-sunken)] rounded" />
                    <div className="h-5 w-14 bg-[var(--surface-sunken)] rounded" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* CTA explorar catálogo completo — siempre visible si hay productos */}
          {showcase.length > 0 && (
            <div className="mt-7 text-center">
              <Link
                href={`/t/${tenant.slug}/tienda`}
                className="inline-flex items-center gap-2 rounded-full text-white px-6 h-12 text-sm font-extrabold shadow-lg transition-all hover:opacity-90"
                style={{ background: cssPrimary }}
              >
                <ShoppingBag className="w-4 h-4" strokeWidth={2.5} aria-hidden />
                <span data-live="inlineText:featured.viewAllFull">{editorTheme.inlineText?.["featured.viewAllFull"] || "Ver catálogo completo"}</span>
                <ChevronRight className="w-4 h-4" strokeWidth={2.5} aria-hidden />
              </Link>
            </div>
          )}
        </section>
      )}

      {/* ═══ Bloques PRO opt-in por tienda (ADR-298 · feature flags) ═══
          Solo se renderizan si el tenant tiene flags en storeTheme.features.
          CompraFácil los prende; las demás tiendas no ven nada de esto. */}
      {features.length > 0 && (
        <ProStoreSections
          features={features}
          displayName={displayName}
          primary={cssPrimary}
          accent={cssAccent}
          tenantSlug={tenant.slug}
          whatsappPhone={customization.whatsappPhone ?? tenant.ownerPhone}
          bestSellers={showcase.map((p) => ({ id: p.id, name: p.name, image: p.image, unit: p.unit, price: p.price }))}
        />
      )}

      {/* Si NO hay NINGÚN producto que mostrar y NO es preview: bloque "Cómo
          pedir" como empty-state. Con productos en la vitrina ya no hace falta. */}
      {showcase.length === 0 && !isPreview && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="mb-8 text-center max-w-2xl mx-auto">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-3">
              Cómo pedir
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
              Haz tu pedido en 3 pasos
            </h2>
          </div>
          <ol className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                n: "01",
                title: "Explorá el catálogo",
                desc: "Mira todos los productos disponibles con precios y stock.",
                Icon: SearchIcon,
              },
              {
                n: "02",
                title: "Arma tu pedido",
                desc: "Agrega lo que quieras. Verás el total real sin sorpresas.",
                Icon: ShoppingBag,
              },
              {
                n: "03",
                title: "Recibí en tu puerta",
                desc: "Pagas con Yape o efectivo al recibir. Delivery rápido a tu zona.",
                Icon: Truck,
              },
            ].map((step) => {
              const FIcon = step.Icon;
              return (
                <li
                  key={step.n}
                  className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-6"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <p
                      className="font-display text-[2rem] font-extrabold leading-none text-[var(--rule-base)] tabular-nums"
                    >
                      {step.n}
                    </p>
                    <span
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white"
                      style={{ background: cssPrimary }}
                    >
                      <FIcon className="h-5 w-5" strokeWidth={2} aria-hidden />
                    </span>
                  </div>
                  <h3 className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                    {step.desc}
                  </p>
                </li>
              );
            })}
          </ol>
          <div className="mt-8 text-center">
            <Link
              href={`/t/${tenant.slug}/tienda`}
              className="inline-flex items-center gap-2 rounded-full text-white px-6 h-12 text-sm font-extrabold shadow-lg transition-all hover:opacity-90"
              style={{ background: cssPrimary }}
            >
              <ShoppingBag className="w-4 h-4" strokeWidth={2.5} />
              Ver catálogo de {displayName}
              <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
            </Link>
          </div>
        </section>
      )}
          </>
        );
        // Información del negocio (anchor #info)
        __body.info = (
      <section id="info" data-pb="info" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 scroll-mt-20">
        <div className="mb-6" style={editorTheme.sectionText?.info?.align ? { textAlign: editorTheme.sectionText.info.align } : undefined}>
          <p data-pb-text="info:eyebrow" data-live="sectionText:info:eyebrow" className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1.5">
            {editorTheme.sectionText?.info?.eyebrow || "Información del negocio"}
          </p>
          <h2 data-pb-text="info:title" data-live="sectionText:info:title" className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
            {editorTheme.sectionText?.info?.title || `Lo que tienes que saber de ${displayName}`}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Antiguedad */}
          {tenant.createdAt && (
            <InfoCard
              icon={<ShieldCheck className="w-5 h-5" strokeWidth={2} />}
              label="Antigüedad"
              value={(() => {
                const years = new Date().getFullYear() - new Date(tenant.createdAt).getFullYear();
                if (years === 0) return "Nuevo · este año";
                if (years === 1) return "1 año atendiendo";
                return `${years} años atendiendo`;
              })()}
              hint={`En Buleje desde ${new Date(tenant.createdAt).getFullYear()}`}
              primary={cssPrimary}
              cardId="antiguedad"
              inlineText={editorTheme.inlineText}
            />
          )}

          {/* WhatsApp */}
          {(customization.whatsappPhone || tenant.ownerPhone) && (
            <InfoCard
              icon={<MessageCircle className="w-5 h-5" strokeWidth={2} />}
              label="Pedidos por WhatsApp"
              value={customization.whatsappPhone ?? tenant.ownerPhone ?? ""}
              hint="Respondemos al toque"
              primary={cssPrimary}
              href={`https://wa.me/${(customization.whatsappPhone ?? tenant.ownerPhone ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(`Hola ${displayName}, quiero hacer un pedido.`)}`}
              cardId="whatsapp"
              inlineText={editorTheme.inlineText}
            />
          )}

          {/* Direccion */}
          {customization.address && (
            <InfoCard
              icon={<MapPin className="w-5 h-5" strokeWidth={2} />}
              label="Ubicación"
              value={customization.address}
              hint="Delivery a tu zona"
              primary={cssPrimary}
              cardId="ubicacion"
              inlineText={editorTheme.inlineText}
            />
          )}

          {/* Metodos de pago (siempre visible — son los standard de Buleje) */}
          <InfoCard
            icon={<Tag className="w-5 h-5" strokeWidth={2} />}
            label="Métodos de pago"
            value="Yape · Plin · Efectivo"
            hint="Sin tarjeta obligatoria · pagas al recibir"
            primary={cssPrimary}
            cardId="pago"
            inlineText={editorTheme.inlineText}
          />

          {/* Delivery info */}
          <InfoCard
            icon={<Truck className="w-5 h-5" strokeWidth={2} />}
            label="Delivery"
            value="25–35 min promedio"
            hint="Motorizado propio o de la zona"
            primary={cssPrimary}
            cardId="delivery"
            inlineText={editorTheme.inlineText}
          />

          {/* Email si existe */}
          {customization.contactEmail && (
            <InfoCard
              icon={<ExternalLink className="w-5 h-5" strokeWidth={2} />}
              label="Email"
              value={customization.contactEmail}
              hint="Para consultas formales"
              primary={cssPrimary}
              href={`mailto:${customization.contactEmail}`}
              cardId="email"
              inlineText={editorTheme.inlineText}
            />
          )}
        </div>

        {/* Hint preview — solo el dueño lo ve */}
        {isPreview && (
          <p className="mt-6 text-xs text-[var(--text-tertiary)] flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" strokeWidth={2} aria-hidden />
            Solo lo que cargaste se muestra. Edita más datos desde <span className="font-mono text-[var(--accent)]">Mi tienda pública</span>.
          </p>
        )}
      </section>
        );
        // Testimonios (Brandon 2026-06-26): sección reordenable del cuerpo.
        __body.testimonials = (
          <TenantTestimonials testimonials={editorTheme.testimonials} primary={cssPrimary} text={editorTheme.sectionText?.testimonials} />
        );
        // Orden final: bodyOrder válido primero, luego cualquier faltante (default).
        const __def = ["trust", "promos", "featured", "testimonials", "info"];
        const __ord = (Array.isArray(editorTheme.bodyOrder) && editorTheme.bodyOrder.length
          ? editorTheme.bodyOrder.filter((k) => __def.includes(k))
          : []) as string[];
        for (const k of __def) if (!__ord.includes(k)) __ord.push(k);
        // Secciones ocultas por el dueño (Brandon 2026-06-27): no renderizar.
        // En preview SÍ se muestran (atenuadas vía data-pb-hidden) para poder reactivarlas.
        const __hidden = new Set(Array.isArray(editorTheme.bodyHidden) ? editorTheme.bodyHidden : []);
        return __ord
          .filter((k) => isPreview || !__hidden.has(k))
          .map((k) => <Fragment key={k}>{__body[k]}</Fragment>);
      })()}

      {/* ═══════════════ Secciones custom del SectionsBuilder ═══════════════
          El bodeguero arma estas desde /admin?tab=pagina-inicio → Secciones.
          Se guardan en customization.footerHtml (prefix __BULEJE_PAGE_DATA__::).
          Ordenadas por section.order, las invisibles se filtran en el render. */}
      {(() => {
        const customSections = pageData.sections
          .filter((s) => s.visible)
          .sort((a, b) => a.order - b.order);
        if (customSections.length === 0) return null;
        return (
          <div className="border-t border-[var(--rule-soft)]">
            {/* #12: engagement por sección (IntersectionObserver → beacon). */}
            <SectionViewTracker slug={tenant.slug} />
            {customSections.map((sec) => (
              // data-pb="custom:<id>" → seleccionable en Modo Creativo (ADR-301 Fase 4)
              <div key={sec.id} data-pb={`custom:${sec.id}`}>
                <SectionRenderer
                  section={sec}
                  primaryColor={primary}
                  accentColor={accent}
                />
              </div>
            ))}
          </div>
        );
      })()}

      {/* About — solo render si hay contenido real, o en preview */}
      {(customization.aboutTitle || customization.aboutBody) && (
        <section className="max-w-3xl mx-auto px-4 py-8">
          <div className="p-6 rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-base)]">
            <h2 className="text-xl font-extrabold mb-3">
              {customization.aboutTitle ?? "Sobre nosotros"}
            </h2>
            {customization.aboutBody && (
              <p className="text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
                {customization.aboutBody}
              </p>
            )}
          </div>
        </section>
      )}
      {isPreview && !customization.aboutTitle && !customization.aboutBody && (
        <section className="max-w-3xl mx-auto px-4 py-8">
          <div className="p-6 rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-white/60 dark:bg-[var(--surface-canvas)]/60">
            <h2 className="text-xl font-extrabold mb-3 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">
              Sobre nosotros · vista previa
            </h2>
            <div className="space-y-2">
              <div className="h-4 w-full bg-[var(--surface-sunken)] rounded" />
              <div className="h-4 w-4/5 bg-[var(--surface-sunken)] rounded" />
              <div className="h-4 w-3/5 bg-[var(--surface-sunken)] rounded" />
            </div>
            <p className="text-xs text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] mt-3">Solo visible para vos · configura desde Mi Tienda &gt; Identidad</p>
          </div>
        </section>
      )}

      {/* Acción admin — SOLO en preview (el dueño editando su página). El público
          va directo al footer dedicado de la tienda. */}
      {isPreview && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
          <Link
            href={`/t/${tenant.slug}/admin`}
            className="group inline-flex items-center gap-4 p-5 bg-[var(--surface-raised)] rounded-2xl shadow-sm hover:shadow-md transition-all border border-[var(--rule-base)]"
          >
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: "color-mix(in oklch, var(--accent) 12%, transparent)" }}
            >
              <Settings className="w-6 h-6" style={{ color: accent }} />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-base leading-tight">Editar tienda</p>
              <p className="text-sm text-[var(--text-secondary)] mt-0.5">Solo vos lo ves · panel admin</p>
            </div>
            <ExternalLink className="w-4 h-4 text-[var(--text-tertiary)] ml-auto" />
          </Link>
        </section>
      )}

      {/* Texto de footer configurable (Brandon 2026-06-25). */}
      {editorTheme.footerText && (
        <p data-live="footerText" className="text-center px-4 pb-6 text-sm font-medium text-[var(--text-secondary)]">
          {editorTheme.footerText}
        </p>
      )}

      {/* Footer dedicado de la tienda — el MISMO del catálogo (Brandon 2026-06-26):
          contacto, navegación, ayuda, newsletter y marca verificada. Reemplaza el
          mini-footer custom anterior. SettingsProvider (auto-inicializa leyendo el
          slug del path /t/[slug]) le da el contexto que el footer consume; la home
          es standalone y no monta el StoreProviders del layout de (store). */}
      <SettingsProvider>
        <TenantFooter slug={tenant.slug} storeName={displayName} inlineText={editorTheme.inlineText} />
      </SettingsProvider>

      {/* Botón flotante de WhatsApp (Brandon 2026-06-26) — Modo Creativo > Contacto.
          Solo si el dueño lo activa y hay número. */}
      {editorTheme.whatsappFloatEnabled && (editorTheme.whatsapp || customization.whatsappPhone || tenant.ownerPhone) && (
        <WhatsAppFloat
          phone={editorTheme.whatsapp || customization.whatsappPhone || tenant.ownerPhone || ""}
          displayName={displayName}
          message={editorTheme.whatsappMessage}
          position={editorTheme.chatPosition === "left" ? "left" : "right"}
          bubbleText={editorTheme.chatBubbleText}
        />
      )}

      {/* Cupón flotante — se monta solo si hay cupón activo para este tenant */}
      <StickyCouponBanner tenantSlug={tenant.slug} />

      {/* Prueba social en vivo (Brandon 2026-06-26) — pedidos reales anonimizados.
          Solo si el dueño lo activó y hay pedidos recientes. */}
      {editorTheme.socialProofEnabled && socialProof.length > 0 && (
        <SocialProofToasts items={socialProof} />
      )}

      {/* Popup de bienvenida configurable (Brandon 2026-06-25) — Modo Creativo >
          Automatización. Dismissable (X / click-fuera / Escape). */}
      {editorTheme.welcomePopupEnabled && (
        <TenantWelcomePopup
          title={editorTheme.welcomePopupTitle ?? "¡Bienvenido!"}
          message={editorTheme.welcomePopupMessage ?? ""}
          coupon={editorTheme.welcomePopupCoupon || undefined}
          ctaHref={`/t/${tenant.slug}/tienda`}
          storageKey={`buleje-welcome-${tenant.slug}`}
        />
      )}

      {/* Push opt-in (Lote Q) — solo si el dueño lo activó y hay VAPID key. */}
      {editorTheme.pushOptInEnabled && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && (
        <TenantPushOptIn slug={tenant.slug} vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} message={editorTheme.pushOptInMessage} />
      )}

      {/* Exit-intent popup (Lote C): cupón de último momento al intentar salir. */}
      {editorTheme.exitIntentEnabled && (
        <TenantExitIntentPopup
          title={editorTheme.exitIntentTitle ?? "¡Esperá!"}
          message={editorTheme.exitIntentMessage ?? ""}
          coupon={editorTheme.exitIntentCoupon || undefined}
          ctaHref={`/t/${tenant.slug}/tienda`}
          storageKey={`buleje-exit-${tenant.slug}`}
        />
      )}
    </main>
  );
}

export default function TenantLandingPage({ params, searchParams }: TenantLandingProps) {
  return (
    <Suspense fallback={<TenantPageSkeleton />}>
      <TenantLandingContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

// ─── Sub-componente: InfoCard ─────────────────────────────────────────────
// Card de informacion del negocio en la seccion "Lo que tenes que saber".
// Acepta opcionalmente un href para volverla clicable (ej. WhatsApp, email).
function InfoCard({
  icon,
  label,
  value,
  hint,
  primary,
  href,
  cardId,
  inlineText,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  primary: string;
  href?: string;
  // Edición inline (Brandon 2026-06-27): cada cuadro tiene un id → su label/value/
  // hint se editan con doble-click y se guardan en inlineText.
  cardId?: string;
  inlineText?: Record<string, string>;
}) {
  const k = (f: string) => `info.${cardId}.${f}`;
  // data-live debe llevar el prefijo "inlineText:" para que el editor lo rutee a
  // patchInlineText; la clave guardada en inlineText es k(f) (sin prefijo).
  const dl = (f: string) => `inlineText:${k(f)}`;
  const ov = (f: string, fb: string) => (cardId && inlineText?.[k(f)]) || fb;
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3 mb-3">
        <span
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white"
          style={{ background: primary }}
        >
          {icon}
        </span>
      </div>
      <p {...(cardId ? { "data-live": dl("label") } : {})} className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
        {ov("label", label)}
      </p>
      <p {...(cardId ? { "data-live": dl("value") } : {})} className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
        {ov("value", value)}
      </p>
      {hint && (
        <p {...(cardId ? { "data-live": dl("hint") } : {})} className="mt-1 text-xs text-[var(--text-secondary)] leading-snug">
          {ov("hint", hint)}
        </p>
      )}
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target={href.startsWith("http") ? "_blank" : undefined}
        rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
        className="group block rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 hover:border-[var(--accent)] hover:-translate-y-0.5 hover:shadow-md transition-all"
      >
        {inner}
      </a>
    );
  }
  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      {inner}
    </div>
  );
}
