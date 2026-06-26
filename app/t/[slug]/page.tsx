import type { Metadata } from "next";
import { Suspense, Fragment, type ReactNode } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ShoppingBag, Settings, ExternalLink, MapPin, Phone, Sparkles, Tag,
  MessageCircle, Truck, ShieldCheck, ChevronRight, ArrowRight, ArrowUpRight,
  LayoutGrid, Search as SearchIcon,
} from "@buleje/design-system/icons";
import { prisma } from "@/lib/prisma";
import { StorePageDB } from "@/lib/db/store-page.db";
import { SettingsDB } from "@/lib/db/settings.db";
import { logger } from "@/lib/logger";
import TenantPageTracker from "./_components/TenantPageTracker";
import VendorTrustBadges from "@/components/store/VendorTrustBadges";
import StickyCouponBanner from "@/components/store/StickyCouponBanner";
import StorefrontNavbar from "@/components/store/StorefrontNavbar";
import PreviewLiveTheme from "@/components/store/PreviewLiveTheme";
import TenantWelcomePopup from "@/components/store/TenantWelcomePopup";
import StorefrontEditOverlay from "@/components/store/StorefrontEditOverlay";
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
          .slice(0, 8)
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
    footerText: pickStr("footerText"),
    // Orden del cuerpo de la landing (Brandon 2026-06-26, page builder Fase 2):
    // keys reordenables = trust|promos|featured|info. Vacío = orden histórico.
    bodyOrder: Array.isArray(st?.["bodyOrder"])
      ? (st["bodyOrder"] as unknown[]).filter((x): x is string => typeof x === "string")
      : ([] as string[]),
  };

  // Feature flags PRO opt-in por tienda (ADR-298): viven en storeTheme.features.
  // La plantilla es la misma para todas; solo las tiendas con flags ven los
  // bloques extra (trust/urgency/content/capture). Cero impacto en las demás.
  const rawFeatures = (st as Record<string, unknown> | undefined)?.["features"];
  const features = Array.isArray(rawFeatures)
    ? rawFeatures.filter((x): x is string => typeof x === "string")
    : [];

  return { tenant, customization, featured, promotions, exclusiveCount, displayName, showcase, productCount, categories, editorTheme, features };
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
      <section className="max-w-5xl mx-auto px-4 py-12">
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
  const isPreview = preview === "true";
  const data = await loadPageData(slug);
  if (!data) notFound();

  const { tenant, customization, featured, promotions, exclusiveCount, displayName, showcase, productCount, categories, editorTheme, features } = data;

  // Allow admin preview even if inactive/unpublished
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
  const cssPrimaryA = (pct: number) => `color-mix(in srgb, var(--tenant-primary, ${primary}) ${pct}%, transparent)`;
  const cssAccentA = (pct: number) => `color-mix(in srgb, var(--tenant-accent, ${accent}) ${pct}%, transparent)`;
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
  const btnRadius = editorTheme.buttonStyle ? EDITOR_BTN_RADIUS[editorTheme.buttonStyle] : undefined;
  const cssBtnRadius = `var(--tenant-btn-radius, ${btnRadius ?? "9999px"})`;

  // cardStyle del editor → tratamiento de las tarjetas de producto de la vitrina.
  const cardClass =
    editorTheme.cardStyle === "minimal"
      ? "border border-[var(--rule-base)]"
      : editorTheme.cardStyle === "border"
        ? "border-2 border-[var(--rule-base)]"
        : editorTheme.cardStyle === "glass"
          ? "border border-white/30 bg-white/70 backdrop-blur-md shadow-sm dark:bg-white/10"
          : "border border-[var(--rule-base)] shadow-sm hover:shadow-xl"; // "shadow"/default

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
    <main className="min-h-screen bg-[var(--surface-canvas)] tenant-theme" data-store-chrome="tenant" style={brandTokenVars}>
      {/* CSS dinamico generado a partir de los design tokens del tenant.
          Sobreescribe el theme de Buleje solo en el subarbol .tenant-theme. */}
      <style dangerouslySetInnerHTML={{ __html: tokensToCssBlock(designTokens) }} />
      {/* Override de tipografía (editor) + radio de botón — sobre .tenant-theme,
          después de tokensToCssBlock para ganar. PreviewLiveTheme pisa en vivo. */}
      <style dangerouslySetInnerHTML={{ __html: `.tenant-theme{--tenant-font:${fontStack};--font-display-family:var(--tenant-font);${btnRadius ? `--tenant-btn-radius:${btnRadius};` : ""}}` }} />

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

      {/* Beacon tracker (client component) */}
      <TenantPageTracker tenantSlug={tenant.slug} />

      {/* Preview EN VIVO: escucha al editor y aplica tokens sin recargar. */}
      {isPreview && <PreviewLiveTheme />}

      {/* Page builder Fase 1 (Brandon 2026-06-25): overlay de edición — click en
          un bloque [data-pb] abre su panel en el editor. Solo en preview. */}
      {isPreview && <StorefrontEditOverlay />}

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
      />

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

      {/* ═══════════════ HERO EDITORIAL v3 — mas trabajado ═══════════════
          Layout: full-bleed image/gradient + content layered con texto a la
          izq y CTA cluster. Pucallpa-vibe sin caer en cliche.
      */}
      <section
        data-pb="hero"
        className="relative overflow-hidden"
        style={
          heroImage
            ? undefined
            : {
                background: `radial-gradient(circle at 30% 20%, ${cssAccentA(40)} 0%, transparent 50%), linear-gradient(135deg, ${cssPrimary} 0%, ${cssPrimaryA(87)} 50%, ${cssPrimary} 100%)`,
              }
        }
      >
        {/* PERF 2026-05-24: hero LCP via next/image (AVIF/WebP + preload por
            priority) en vez de CSS background-image, que el browser no podía
            preloadear ni optimizar. El gradient queda como overlay aparte. */}
        {heroImage && (
          <>
            <Image
              src={heroImage}
              alt=""
              fill
              priority
              fetchPriority="high"
              sizes="100vw"
              className="object-cover"
              aria-hidden
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage: `linear-gradient(180deg, ${cssPrimaryA(87)} 0%, ${cssPrimaryA(67)} 50%, ${cssPrimaryA(80)} 100%)`,
              }}
            />
          </>
        )}

        {/* Pattern decorativo sutil */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.18) 1.5px, transparent 1.5px)",
            backgroundSize: "32px 32px",
          }}
        />
        {/* Gradient mask abajo para suavizar borde con la siguiente seccion */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-b from-transparent to-[var(--surface-canvas)]"
        />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14 pb-20 sm:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-8 lg:gap-12 items-center">
            {/* Columna izq: contenido principal */}
            <div className="text-left">
              {/* Eyebrow con estado live */}
              <p className="inline-flex items-center gap-2 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-white/85 mb-5">
                <span aria-hidden className="relative inline-flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-60 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                </span>
                Tienda en Buleje
                {tenant.createdAt && (
                  <>
                    <span aria-hidden className="text-white/40">·</span>
                    <span>Desde {new Date(tenant.createdAt).getFullYear()}</span>
                  </>
                )}
              </p>

              <h1 data-live="heroTitle" className="font-display text-[clamp(2.5rem,7vw,4.5rem)] font-extrabold text-white tracking-[var(--ls-tight)] leading-[0.95] mb-5">
                {heroTitle}
              </h1>

              {heroSubtitle && (
                <p data-live="heroSubtitle" className="text-white/85 text-lg sm:text-xl max-w-xl leading-[1.45] mb-7">
                  {heroSubtitle}
                </p>
              )}

              {/* Exclusive prices badge */}
              {exclusiveCount > 0 && (
                <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/20 backdrop-blur-md border border-white/30 text-white font-extrabold text-sm mb-5">
                  <Sparkles className="w-4 h-4" strokeWidth={2.5} aria-hidden />
                  {exclusiveCount} {exclusiveCount === 1 ? "precio exclusivo hoy" : "precios exclusivos hoy"}
                </div>
              )}

              {/* CTAs */}
              <div className="flex items-center gap-3 flex-wrap">
                {(customization.whatsappPhone || tenant.ownerPhone) && (
                  <a
                    href={`https://wa.me/${(customization.whatsappPhone ?? tenant.ownerPhone ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(`Hola ${displayName}, quiero hacer un pedido.`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center gap-2 px-6 h-12 bg-white font-extrabold text-sm hover:gap-2.5 transition-all shadow-xl"
                    style={{ color: cssPrimary, borderRadius: cssBtnRadius }}
                  >
                    <MessageCircle className="w-4 h-4" strokeWidth={2.75} />
                    Pedir por WhatsApp
                    <ArrowRight className="w-4 h-4 opacity-70" strokeWidth={2.5} />
                  </a>
                )}
                <Link
                  href={`/t/${tenant.slug}/tienda`}
                  className="inline-flex items-center gap-2 px-6 h-12 border-2 border-white/40 text-white font-extrabold text-sm hover:bg-white/15 backdrop-blur transition-all"
                  style={{ borderRadius: cssBtnRadius }}
                >
                  <ShoppingBag className="w-4 h-4" strokeWidth={2.5} />
                  Ver catálogo
                </Link>
              </div>

              {/* Stats strip — qué ofrece de un vistazo (hero más potente,
                  Brandon 2026-06-08). Sin duplicar "Verificado/Desde" (eso vive
                  en VendorTrustBadges justo debajo). */}
              <div className="mt-7 flex flex-wrap items-center gap-2.5">
                {productCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-bold text-white ring-1 ring-white/20 backdrop-blur">
                    <ShoppingBag className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                    {productCount} {productCount === 1 ? "producto" : "productos"}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-bold text-white ring-1 ring-white/20 backdrop-blur">
                  <Tag className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  Yape · Plin · Efectivo
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-bold text-white ring-1 ring-white/20 backdrop-blur">
                  <Truck className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  Delivery 25–35 min
                </span>
              </div>

              {/* Preview-only: plan badge + custom CTA */}
              {isPreview && (
                <div className="mt-5 flex items-center gap-2 flex-wrap opacity-90">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${badge.className}`}>
                    Vista previa · plan {badge.label}
                  </span>
                  {customization.heroCtaLabel && customization.heroCtaUrl && (
                    <Link
                      // Guard anti-`javascript:`/`data:` — solo rutas relativas o http(s).
                      href={/^(\/|https?:\/\/)/.test(customization.heroCtaUrl) ? customization.heroCtaUrl : "#"}
                      className="px-3 py-1.5 rounded-full text-xs font-bold bg-white/20 text-white hover:bg-white/30 transition-colors"
                    >
                      {customization.heroCtaLabel}
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* Columna der (desktop): BENTO producto-primero — muestra el
                catálogo de un vistazo (producto destacado + categorías reales).
                Reemplaza el disco del logo. Brandon 2026-06-22. Halo decorativo
                detrás para dar profundidad. */}
            <div className="relative hidden lg:block">
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-6 rounded-[2rem] blur-3xl opacity-40"
                style={{ background: cssAccent }}
              />
              <div className="relative grid grid-cols-2 gap-3">
                {/* Producto destacado — ancho completo, lo más prominente */}
                {heroFeatured && (
                  <Link
                    href={`/t/${tenant.slug}/tienda`}
                    className="col-span-2 group flex items-center gap-4 rounded-2xl bg-white/95 p-4 shadow-[var(--shadow-xl)] ring-1 ring-white/30 transition-all hover:-translate-y-0.5"
                  >
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[var(--surface-sunken)]">
                      {heroFeatured.image ? (
                        <Image src={heroFeatured.image} alt={heroFeatured.name} fill sizes="80px" className="object-cover" />
                      ) : (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <ShoppingBag className="h-7 w-7 text-[var(--text-tertiary)]" strokeWidth={1.5} aria-hidden />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="mb-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)]" style={{ color: cssPrimary }}>
                        Destacado
                      </p>
                      <p className="line-clamp-2 font-extrabold leading-tight text-[var(--text-primary)]">{heroFeatured.name}</p>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-lg font-extrabold" style={{ color: cssPrimary }}>
                          {formatPrice(heroFeatured.exclusivePrice ?? heroFeatured.price)}
                        </span>
                        {heroFeatured.exclusivePrice != null && (
                          <span className="text-xs text-[var(--text-tertiary)] line-through">{formatPrice(heroFeatured.price)}</span>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 shrink-0 text-[var(--text-tertiary)] transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} aria-hidden />
                  </Link>
                )}

                {/* Tiles de categorías reales del comercio */}
                {heroTiles.map((cat) => (
                  <Link
                    key={cat.name}
                    href={`/t/${tenant.slug}/tienda`}
                    className="group rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-white/15"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-white">
                        <LayoutGrid className="h-4 w-4" strokeWidth={2} aria-hidden />
                      </span>
                      <ArrowUpRight className="h-4 w-4 text-white/50 transition-colors group-hover:text-white" strokeWidth={2.5} aria-hidden />
                    </div>
                    <p className="truncate font-extrabold leading-tight text-white">{cat.name}</p>
                    <p className="text-xs font-semibold text-white/70">{cat.count} {cat.count === 1 ? "producto" : "productos"}</p>
                  </Link>
                ))}

                {/* Tile "ver todo" — cierra el bento; ocupa fila completa si queda impar */}
                <Link
                  href={`/t/${tenant.slug}/tienda`}
                  className={`group flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-white/30 p-4 text-center transition-all hover:bg-white/10 ${heroTiles.length % 2 === 0 ? "col-span-2" : ""}`}
                >
                  <span className="mb-1 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-white">
                    <ShoppingBag className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  </span>
                  <p className="font-extrabold leading-tight text-white">Ver todo el catálogo</p>
                  <p className="text-xs font-semibold text-white/70">{productCount} {productCount === 1 ? "producto" : "productos"}</p>
                </Link>
              </div>
            </div>

            {/* Logo compacto solo en mobile */}
            <div className="lg:hidden order-first flex items-center gap-3">
              <span
                className="inline-flex w-16 h-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur border-2 border-white/25 text-white text-xl font-extrabold shadow-lg overflow-hidden"
              >
                {tenant.logoUrl ? (
                  <Image
                    src={tenant.logoUrl}
                    alt=""
                    width={64}
                    height={64}
                    priority
                    sizes="64px"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  logoText
                )}
              </span>
            </div>
          </div>
        </div>
      </section>

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
        <section data-pb="promos" className="max-w-5xl mx-auto px-4 -mt-6 relative z-20">
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
        <section data-pb="featured" className="max-w-5xl mx-auto px-4 py-10">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1.5">
                {featured.length > 0 ? "Destacados" : "Nuestro catálogo"}
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
                {featured.length > 0 ? "Lo que recomendamos" : `Algunos productos de ${displayName}`}
              </h2>
            </div>
            <Link
              href={`/t/${tenant.slug}/tienda`}
              className="hidden shrink-0 items-center gap-1.5 text-sm font-extrabold text-[var(--accent)] transition-all hover:gap-2.5 sm:inline-flex"
            >
              Ver todo
              <ArrowRight className="w-4 h-4" strokeWidth={2.5} aria-hidden />
            </Link>
          </div>

          {showcase.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {showcase.map((p) => {
                const isExclusive = p.exclusivePrice != null;
                const shownPrice = isExclusive ? p.exclusivePrice! : p.price;
                return (
                  <Link
                    key={p.id}
                    href={`/t/${tenant.slug}/tienda`}
                    className={`group relative rounded-2xl overflow-hidden bg-[var(--surface-raised)] transition-all hover:-translate-y-0.5 ${cardClass}`}
                  >
                    <div className="aspect-square bg-[var(--surface-sunken)] overflow-hidden relative">
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

                    <div className="p-3">
                      <p className="font-semibold text-sm truncate text-[var(--text-primary)]">{p.name}</p>
                      <p className="text-xs text-[var(--text-secondary)] mb-2">{p.unit}</p>
                      <div className="flex items-baseline gap-2">
                        <span
                          className="font-extrabold text-lg"
                          style={{ color: isExclusive ? cssPrimary : undefined }}
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
                Ver catálogo completo
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
        <section className="max-w-5xl mx-auto px-4 py-12">
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
      <section id="info" data-pb="info" className="max-w-5xl mx-auto px-4 py-10 scroll-mt-20">
        <div className="mb-6">
          <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1.5">
            Información del negocio
          </p>
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
            Lo que tienes que saber de {displayName}
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
            />
          )}

          {/* Metodos de pago (siempre visible — son los standard de Buleje) */}
          <InfoCard
            icon={<Tag className="w-5 h-5" strokeWidth={2} />}
            label="Métodos de pago"
            value="Yape · Plin · Efectivo"
            hint="Sin tarjeta obligatoria · pagas al recibir"
            primary={cssPrimary}
          />

          {/* Delivery info */}
          <InfoCard
            icon={<Truck className="w-5 h-5" strokeWidth={2} />}
            label="Delivery"
            value="25–35 min promedio"
            hint="Motorizado propio o de la zona"
            primary={cssPrimary}
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
        // Orden final: bodyOrder válido primero, luego cualquier faltante (default).
        const __def = ["trust", "promos", "featured", "info"];
        const __ord = (Array.isArray(editorTheme.bodyOrder) && editorTheme.bodyOrder.length
          ? editorTheme.bodyOrder.filter((k) => __def.includes(k))
          : []) as string[];
        for (const k of __def) if (!__ord.includes(k)) __ord.push(k);
        return __ord.map((k) => <Fragment key={k}>{__body[k]}</Fragment>);
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
            {customSections.map((sec) => (
              <SectionRenderer
                key={sec.id}
                section={sec}
                primaryColor={primary}
                accentColor={accent}
              />
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

      {/* Actions — al público solo "Ver Tienda". El botón Admin SOLO en preview. */}
      <section className="max-w-3xl mx-auto px-4 pb-12">
        <div className={`grid gap-4 mb-6 ${isPreview ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
          <Link
            href={`/t/${tenant.slug}/tienda`}
            className="group flex items-center gap-4 p-6 bg-[var(--surface-raised)] rounded-2xl shadow-md hover:shadow-xl transition-all border border-[var(--rule-base)]"
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: cssPrimaryA(9) }}
            >
              <ShoppingBag className="w-7 h-7" style={{ color: cssPrimary }} />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-lg leading-tight">Ver catálogo completo</p>
              <p className="text-sm text-[var(--text-secondary)] mt-0.5">Todos los productos · arma tu pedido</p>
            </div>
            <ChevronRight className="w-5 h-5 text-[var(--text-tertiary)] ml-auto" strokeWidth={2.5} />
          </Link>

          {/* Admin — SOLO en modo preview (cuando el dueño está mirando su pagina) */}
          {isPreview && (
            <Link
              href={`/t/${tenant.slug}/admin`}
              className="group flex items-center gap-4 p-6 bg-[var(--surface-raised)] rounded-2xl shadow-md hover:shadow-xl transition-all border border-[var(--rule-base)]"
            >
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 bg-orange-50 dark:bg-orange-900/20">
                <Settings className="w-7 h-7 text-[#f4a261]" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-lg leading-tight">Editar tienda</p>
                <p className="text-sm text-[var(--text-secondary)] mt-0.5">Solo vos lo ves · panel admin</p>
              </div>
              <ExternalLink className="w-4 h-4 text-[var(--text-tertiary)] ml-auto" />
            </Link>
          )}
        </div>

        {/* Contact info — solo si hay datos reales; placeholder oculto al publico */}
        {(customization.whatsappPhone ||
          customization.contactEmail ||
          customization.address ||
          tenant.ownerPhone ||
          tenant.customDomain) && (
          <div className="bg-[var(--surface-raised)] rounded-2xl p-6 shadow-sm border border-[var(--rule-base)] space-y-3">
            <h3 className="text-sm font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
              Contacto
            </h3>
            {(customization.whatsappPhone || tenant.ownerPhone) && (
              <div className="flex items-center gap-3 text-[var(--text-secondary)]">
                <Phone className="w-4 h-4 text-[var(--text-tertiary)] flex-shrink-0" />
                <a
                  href={`https://wa.me/${(customization.whatsappPhone ?? tenant.ownerPhone ?? "").replace(/\D/g, "")}`}
                  className="text-sm hover:underline"
                >
                  {customization.whatsappPhone ?? tenant.ownerPhone}
                </a>
              </div>
            )}
            {customization.address && (
              <div className="flex items-center gap-3 text-[var(--text-secondary)]">
                <MapPin className="w-4 h-4 text-[var(--text-tertiary)] flex-shrink-0" />
                <span className="text-sm">{customization.address}</span>
              </div>
            )}
            {customization.contactEmail && (
              <div className="flex items-center gap-3 text-[var(--text-secondary)]">
                <ExternalLink className="w-4 h-4 text-[var(--text-tertiary)] flex-shrink-0" />
                <a
                  href={`mailto:${customization.contactEmail}`}
                  className="text-sm hover:underline"
                >
                  {customization.contactEmail}
                </a>
              </div>
            )}
          </div>
        )}
        {isPreview &&
          !customization.whatsappPhone &&
          !customization.contactEmail &&
          !customization.address &&
          !tenant.ownerPhone && (
            <div className="rounded-2xl p-6 border-2 border-dashed border-[var(--rule-base)] bg-white/60 dark:bg-[var(--surface-canvas)]/60 space-y-3">
              <h3 className="text-sm font-bold text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] uppercase tracking-wider">
                Contacto · vista previa
              </h3>
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-gray-200 dark:text-[var(--text-secondary)] flex-shrink-0" />
                <div className="h-4 w-32 bg-[var(--surface-sunken)] rounded" />
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="w-4 h-4 text-gray-200 dark:text-[var(--text-secondary)] flex-shrink-0" />
                <div className="h-4 w-48 bg-[var(--surface-sunken)] rounded" />
              </div>
              <p className="text-xs text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">Solo visible para vos · configura desde Mi Tienda &gt; Contacto</p>
            </div>
          )}

        {/* Texto de footer configurable (Brandon 2026-06-25). */}
        {editorTheme.footerText && (
          <p data-live="footerText" className="text-center mt-6 text-sm font-medium text-[var(--text-secondary)]">
            {editorTheme.footerText}
          </p>
        )}

        {/* Footer mini con marca Buleje en lugar del slug raw */}
        <p className="text-center mt-6 text-xs text-[var(--text-tertiary)] flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent)]" strokeWidth={2} aria-hidden />
          Tienda verificada en Buleje · <span className="font-mono">/{tenant.slug}</span>
        </p>
      </section>

      {/* Cupón flotante — se monta solo si hay cupón activo para este tenant */}
      <StickyCouponBanner tenantSlug={tenant.slug} />

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
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  primary: string;
  href?: string;
}) {
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
      <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
        {label}
      </p>
      <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-xs text-[var(--text-secondary)] leading-snug">
          {hint}
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
