import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ShoppingBag, Settings, ExternalLink, MapPin, Phone, Sparkles, Tag,
  MessageCircle, Truck, ShieldCheck, ChevronRight, ArrowRight,
  Search as SearchIcon,
} from "@buleje/design-system/icons";
import { prisma } from "@/lib/prisma";
import { StorePageDB } from "@/lib/db/store-page.db";
import { SettingsDB } from "@/lib/db/settings.db";
import { logger } from "@/lib/logger";
import TenantPageTracker from "./_components/TenantPageTracker";
import VendorTrustBadges from "@/components/store/VendorTrustBadges";
import StickyCouponBanner from "@/components/store/StickyCouponBanner";
import StorefrontNavbar from "@/components/store/StorefrontNavbar";
import SectionRenderer from "@/components/store/tenant/SectionRenderer";
import { deserializePageData, tokensToCssBlock, FONT_FAMILIES } from "@/lib/store-design-tokens";

interface TenantLandingProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
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

  const [customization, featured, promotions, exclusiveCount, settings] = await Promise.all([
    StorePageDB.getCustomization(tenant.id),
    StorePageDB.listPublicFeatured(tenant.id, 24),
    StorePageDB.listPromotions(tenant.id, true),
    StorePageDB.countActiveExclusivePrices(tenant.id),
    SettingsDB.get(tenant.id).catch((err) => { logger.warn("[t/[slug]] settings load failed", { err: String(err), tenantId: tenant.id }); return null; }),
  ]);

  // Cadena de fallback para el nombre público de la tienda:
  //   storeTheme.storeName  →  settings.businessName  →  tenant.name  →  slug
  // El primero suele ser el campo que el dueño edita en el panel admin —
  // mientras que `tenant.name` puede contener el ID legacy del owner.
  const themeName = (settings?.storeTheme as Record<string, unknown> | undefined)?.["storeName"];
  const displayName =
    (typeof themeName === "string" && themeName.trim()) ||
    (typeof settings?.businessName === "string" && settings.businessName.trim()) ||
    tenant.name ||
    tenant.slug;

  return { tenant, customization, featured, promotions, exclusiveCount, displayName };
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
  const ogFallback = `${process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe"}/api/og?title=${encodeURIComponent(displayName)}&subtitle=${encodeURIComponent("Comprá con delivery rápido en Ciudad Constitución")}`;
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

  const { tenant, customization, featured, promotions, exclusiveCount, displayName } = data;

  // Allow admin preview even if inactive/unpublished
  if (!isPreview && (!tenant.active || !customization.published)) notFound();

  // Design tokens del SectionsBuilder tienen prioridad sobre customization viejo.
  // El bodeguero edita primary/accent desde el tab "Diseño" del admin.
  const pageDataForColors = deserializePageData(customization.footerHtml);
  const primary = pageDataForColors.design.primaryColor || customization.primaryColor || tenant.primaryColor || "var(--accent)";
  const accent = pageDataForColors.design.accentColor || customization.accentColor || "#f4a261";
  // El logo y el título usan el nombre público real (storeTheme.storeName) en
  // lugar de `tenant.name` — para que el comercio nunca vea el nombre raw del
  // tenant ni la marca del marketplace en su propia página.
  const logoText = displayName.slice(0, 2).toUpperCase();
  const heroTitle = customization.heroTitle ?? displayName;
  const heroSubtitle = customization.heroSubtitle;
  const heroImage = customization.heroImageUrl;

  const formatPrice = (n: number) => `S/${n.toFixed(2)}`;

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
  const designTokens = pageData.design;
  const tenantFont = FONT_FAMILIES[designTokens.fontFamily];

  return (
    <main
      className="min-h-screen bg-[var(--surface-canvas)] tenant-theme"
      style={{ fontFamily: tenantFont.stack }}
    >
      {/* CSS dinamico generado a partir de los design tokens del tenant.
          Sobreescribe el theme de Buleje solo en el subarbol .tenant-theme. */}
      <style dangerouslySetInnerHTML={{ __html: tokensToCssBlock(designTokens) }} />

      {/* Google Fonts loader — carga solo la fuente que el tenant eligio.
          PERF 2026-05-24: preconnect evita ~200-400ms de DNS+TCP+TLS a Google
          antes de descubrir el stylesheet (display=swap ya evita FOIT). */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(tenantFont.label).replace(/%20/g, "+")}:wght@400;600;700;800;900&display=swap`}
      />

      {/* Beacon tracker (client component) */}
      <TenantPageTracker tenantSlug={tenant.slug} />

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

      {/* ═══════════════ HERO EDITORIAL v3 — mas trabajado ═══════════════
          Layout: full-bleed image/gradient + content layered con texto a la
          izq y CTA cluster. Pucallpa-vibe sin caer en cliche.
      */}
      <section
        className="relative overflow-hidden"
        style={
          heroImage
            ? undefined
            : {
                background: `radial-gradient(circle at 30% 20%, ${accent}66 0%, transparent 50%), linear-gradient(135deg, ${primary} 0%, ${primary}dd 50%, ${primary} 100%)`,
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
                backgroundImage: `linear-gradient(180deg, ${primary}dd 0%, ${primary}aa 50%, ${primary}cc 100%)`,
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

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14 pb-28 sm:pb-32">
          <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-8 items-center">
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

              <h1 className="font-display text-[clamp(2.5rem,7vw,4.5rem)] font-extrabold text-white tracking-[var(--ls-tight)] leading-[0.95] mb-5">
                {heroTitle}
              </h1>

              {heroSubtitle && (
                <p className="text-white/85 text-lg sm:text-xl max-w-xl leading-[1.45] mb-7">
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
                    className="group inline-flex items-center gap-2 px-6 h-12 rounded-full bg-white font-extrabold text-sm hover:gap-2.5 transition-all shadow-xl"
                    style={{ color: primary }}
                  >
                    <MessageCircle className="w-4 h-4" strokeWidth={2.75} />
                    Pedir por WhatsApp
                    <ArrowRight className="w-4 h-4 opacity-70" strokeWidth={2.5} />
                  </a>
                )}
                <Link
                  href={`/t/${tenant.slug}/tienda`}
                  className="inline-flex items-center gap-2 px-6 h-12 rounded-full border-2 border-white/40 text-white font-extrabold text-sm hover:bg-white/15 backdrop-blur transition-all"
                >
                  <ShoppingBag className="w-4 h-4" strokeWidth={2.5} />
                  Ver catálogo
                </Link>
              </div>

              {/* Preview-only: plan badge + custom CTA */}
              {isPreview && (
                <div className="mt-5 flex items-center gap-2 flex-wrap opacity-90">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${badge.className}`}>
                    Vista previa · plan {badge.label}
                  </span>
                  {customization.heroCtaLabel && customization.heroCtaUrl && (
                    <Link
                      href={customization.heroCtaUrl}
                      className="px-3 py-1.5 rounded-full text-xs font-bold bg-white/20 text-white hover:bg-white/30 transition-colors"
                    >
                      {customization.heroCtaLabel}
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* Columna der: logo grande sobre disco decorativo */}
            <div className="hidden lg:flex items-center justify-center">
              <div className="relative">
                {/* Halos decorativos */}
                <div
                  aria-hidden
                  className="absolute inset-0 rounded-full blur-3xl opacity-50"
                  style={{ background: accent }}
                />
                <div
                  aria-hidden
                  className="relative w-48 h-48 rounded-full bg-white/10 backdrop-blur-md border-2 border-white/20 flex items-center justify-center shadow-[var(--shadow-xl)]"
                >
                  {tenant.logoUrl ? (
                    <Image
                      src={tenant.logoUrl}
                      alt=""
                      width={128}
                      height={128}
                      priority
                      className="w-32 h-32 rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-7xl font-extrabold text-white tracking-[var(--ls-tight)]">
                      {logoText}
                    </span>
                  )}
                </div>
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

      {/* Trust badges — verificado, ventas, antigüedad */}
      <VendorTrustBadges
        verified={tenant.active}
        createdYear={tenant.createdAt ? new Date(tenant.createdAt).getFullYear() : 2026}
      />

      {/* Active promotions banner — solo renderea si hay promos reales o en modo preview */}
      {(promotions.length > 0 || isPreview) && (
        <section className="max-w-5xl mx-auto px-4 -mt-6 relative z-20">
          {promotions.length > 0 ? (
            <div className="space-y-2">
              {promotions.slice(0, 3).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 p-4 rounded-2xl shadow-lg"
                  style={{
                    background: `linear-gradient(90deg, ${accent} 0%, ${primary} 100%)`,
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

      {/* Featured products — solo si hay reales o preview */}
      {(featured.length > 0 || isPreview) && (
        <section className="max-w-5xl mx-auto px-4 py-12">
          <h2 className="text-2xl font-extrabold mb-6 flex items-center gap-2">
            <Sparkles className="w-6 h-6" style={{ color: featured.length > 0 ? primary : "#d1d5db" }} />
            Productos destacados
          </h2>

          {featured.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {featured.map((p) => {
                const isExclusive =
                  p.exclusivePrice != null && p.exclusivePrice < p.productBasePrice;
                const shownPrice = isExclusive ? p.exclusivePrice! : p.productBasePrice;
                return (
                  <Link
                    key={p.id}
                    href={`/t/${tenant.slug}/tienda`}
                    className="group relative rounded-2xl overflow-hidden bg-[var(--surface-raised)] shadow-sm hover:shadow-xl transition-all hover:-translate-y-0.5 border border-[var(--rule-base)]"
                  >
                    <div className="aspect-square bg-[var(--surface-sunken)] overflow-hidden relative">
                      {p.productImage && (
                        <Image
                          src={p.productImage}
                          alt={p.productName}
                          fill
                          sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
                          className="object-cover group-hover:scale-105 transition-transform duration-[var(--dur-base)]"
                        />
                      )}
                    </div>

                    {/* Exclusive badge */}
                    {isExclusive && p.savingsPercent != null && p.savingsPercent > 0 && (
                      <div
                        className="absolute top-2 left-2 px-2 py-1 rounded-full text-white font-extrabold text-xs shadow-lg"
                        style={{ background: accent }}
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
                      <p className="font-semibold text-sm truncate">{p.productName}</p>
                      <p className="text-xs text-[var(--text-secondary)] mb-2">{p.productUnit}</p>
                      <div className="flex items-baseline gap-2">
                        <span
                          className="font-extrabold text-lg"
                          style={{ color: isExclusive ? primary : undefined }}
                        >
                          {formatPrice(shownPrice)}
                        </span>
                        {isExclusive && (
                          <span className="text-xs text-[var(--text-tertiary)] line-through">
                            {formatPrice(p.productBasePrice)}
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

          {/* CTA explorar catalogo completo — siempre visible si hay productos */}
          {featured.length > 0 && (
            <div className="mt-6 text-center">
              <Link
                href={`/t/${tenant.slug}/tienda`}
                className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 h-11 text-sm font-extrabold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
              >
                Ver catalogo completo
                <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
              </Link>
            </div>
          )}
        </section>
      )}

      {/* Si NO hay productos destacados y NO es preview: bloque "Como pedir" + CTA fuerte */}
      {featured.length === 0 && !isPreview && (
        <section className="max-w-5xl mx-auto px-4 py-12">
          <div className="mb-8 text-center max-w-2xl mx-auto">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-3">
              Cómo pedir
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
              Hacé tu pedido en 3 pasos
            </h2>
          </div>
          <ol className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                n: "01",
                title: "Explorá el catálogo",
                desc: "Mirá todos los productos disponibles con precios y stock.",
                Icon: SearchIcon,
              },
              {
                n: "02",
                title: "Armá tu pedido",
                desc: "Agregá lo que quieras. Veras el total real sin sorpresas.",
                Icon: ShoppingBag,
              },
              {
                n: "03",
                title: "Recibí en tu puerta",
                desc: "Pagás con Yape o efectivo al recibir. Delivery rápido a tu zona.",
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
                      style={{ background: primary }}
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
              style={{ background: primary }}
            >
              <ShoppingBag className="w-4 h-4" strokeWidth={2.5} />
              Ver catálogo de {displayName}
              <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
            </Link>
          </div>
        </section>
      )}

      {/* ═══════════════ Información del negocio (anchor #info) ═══════════════
          Brandon, mayo 2026: la landing es el lugar natural para horarios,
          antiguedad, metodos de pago, delivery info — todo lo que el cliente
          quiere saber antes de comprar. */}
      <section id="info" className="max-w-5xl mx-auto px-4 py-10 scroll-mt-20">
        <div className="mb-6">
          <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1.5">
            Información del negocio
          </p>
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
            Lo que tenés que saber de {displayName}
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
              primary={primary}
            />
          )}

          {/* WhatsApp */}
          {(customization.whatsappPhone || tenant.ownerPhone) && (
            <InfoCard
              icon={<MessageCircle className="w-5 h-5" strokeWidth={2} />}
              label="Pedidos por WhatsApp"
              value={customization.whatsappPhone ?? tenant.ownerPhone ?? ""}
              hint="Respondemos al toque"
              primary={primary}
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
              primary={primary}
            />
          )}

          {/* Metodos de pago (siempre visible — son los standard de Buleje) */}
          <InfoCard
            icon={<Tag className="w-5 h-5" strokeWidth={2} />}
            label="Métodos de pago"
            value="Yape · Plin · Efectivo"
            hint="Sin tarjeta obligatoria · pagás al recibir"
            primary={primary}
          />

          {/* Delivery info */}
          <InfoCard
            icon={<Truck className="w-5 h-5" strokeWidth={2} />}
            label="Delivery"
            value="25–35 min promedio"
            hint="Motorizado propio o de la zona"
            primary={primary}
          />

          {/* Email si existe */}
          {customization.contactEmail && (
            <InfoCard
              icon={<ExternalLink className="w-5 h-5" strokeWidth={2} />}
              label="Email"
              value={customization.contactEmail}
              hint="Para consultas formales"
              primary={primary}
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
              style={{ background: `${primary}18` }}
            >
              <ShoppingBag className="w-7 h-7" style={{ color: primary }} />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-lg leading-tight">Ver catálogo completo</p>
              <p className="text-sm text-[var(--text-secondary)] mt-0.5">Todos los productos · armá tu pedido</p>
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

        {/* Footer mini con marca Buleje en lugar del slug raw */}
        <p className="text-center mt-6 text-xs text-[var(--text-tertiary)] flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent)]" strokeWidth={2} aria-hidden />
          Tienda verificada en Buleje · <span className="font-mono">/{tenant.slug}</span>
        </p>
      </section>

      {/* Cupón flotante — se monta solo si hay cupón activo para este tenant */}
      <StickyCouponBanner tenantSlug={tenant.slug} />
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
