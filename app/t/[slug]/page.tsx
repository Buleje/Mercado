import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ShoppingBag, Settings, ExternalLink, MapPin, Phone, Sparkles, Tag } from "@buleje/design-system/icons";
import { prisma } from "@/lib/prisma";
import { StorePageDB } from "@/lib/db/store-page.db";
import { SettingsDB } from "@/lib/db/settings.db";
import TenantPageTracker from "./_components/TenantPageTracker";
import VendorTrustBadges from "@/components/store/VendorTrustBadges";
import StickyCouponBanner from "@/components/store/StickyCouponBanner";

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
  const tenant = await prisma.tenant
    .findFirst({
      where: { OR: [{ id: slug }, { slug }] },
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
    .catch(() => null);

  if (!tenant) return null;

  const [customization, featured, promotions, exclusiveCount, settings] = await Promise.all([
    StorePageDB.getCustomization(tenant.id),
    StorePageDB.listPublicFeatured(tenant.id, 24),
    StorePageDB.listPromotions(tenant.id, true),
    StorePageDB.countActiveExclusivePrices(tenant.id),
    SettingsDB.get(tenant.id).catch(() => null),
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
  const ogImage = customization.ogImageUrl ?? customization.heroImageUrl ?? undefined;

  return {
    title: { absolute: title },
    description,
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
        <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 rounded mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-[var(--surface-raised)] shadow-sm border border-[var(--rule-base)] overflow-hidden">
              <div className="aspect-square bg-[var(--surface-sunken)]" />
              <div className="p-3 space-y-2">
                <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
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

  const primary = customization.primaryColor || tenant.primaryColor || "var(--accent)";
  const accent = customization.accentColor || "#f4a261";
  // El logo y el título usan el nombre público real (storeTheme.storeName) en
  // lugar de `tenant.name` — para que el comercio nunca vea el nombre raw del
  // tenant ni la marca del marketplace en su propia página.
  const logoText = displayName.slice(0, 2).toUpperCase();
  const heroTitle = customization.heroTitle ?? displayName;
  const heroSubtitle = customization.heroSubtitle;
  const heroImage = customization.heroImageUrl;

  const formatPrice = (n: number) => `S/${n.toFixed(2)}`;

  const planBadge: Record<string, { label: string; className: string }> = {
    free: {
      label: "Free",
      className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    },
    pro: {
      label: "Pro",
      className: "bg-teal-100 text-[var(--accent-dark)] dark:bg-teal-900/30 dark:text-teal-400",
    },
    business: {
      label: "Business",
      className: "bg-emerald-100 text-[var(--data-success-700)] dark:bg-emerald-900/30 dark:text-emerald-400",
    },
    enterprise: {
      label: "Enterprise",
      className: "bg-amber-100 text-[var(--data-warning-700)] dark:bg-amber-900/30 dark:text-amber-400",
    },
  };
  const badge = planBadge[tenant.plan] ?? planBadge.free;

  return (
    <main className="min-h-screen bg-[var(--surface-canvas)]">
      {/* Beacon tracker (client component) */}
      <TenantPageTracker tenantSlug={tenant.slug} />

      {/* Hero */}
      <section
        className="relative overflow-hidden"
        style={
          heroImage
            ? {
                backgroundImage: `linear-gradient(135deg, ${primary}cc 0%, ${accent}cc 100%), url(${heroImage})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                minHeight: "360px",
              }
            : {
                background: `linear-gradient(135deg, ${primary} 0%, ${primary}cc 100%)`,
                minHeight: "320px",
              }
        }
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        <div className="relative z-10 max-w-3xl mx-auto px-4 py-16 sm:py-20 text-center">
          <div
            className="w-24 h-24 rounded-3xl mx-auto mb-6 flex items-center justify-center text-2xl font-extrabold shadow-xl"
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "2px solid rgba(255,255,255,0.3)",
              color: "#fff",
            }}
          >
            {tenant.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tenant.logoUrl}
                alt=""
                className="w-full h-full rounded-3xl object-cover"
              />
            ) : (
              logoText
            )}
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-3 tracking-tight">
            {heroTitle}
          </h1>

          {heroSubtitle && (
            <p className="text-white/85 text-lg max-w-md mx-auto mb-6">
              {heroSubtitle}
            </p>
          )}

          {/* Exclusive prices badge */}
          {exclusiveCount > 0 && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 backdrop-blur border border-white/30 text-white font-bold text-sm mb-4">
              <Sparkles className="w-4 h-4" />
              {exclusiveCount} {exclusiveCount === 1 ? "precio exclusivo" : "precios exclusivos"} hoy
            </div>
          )}

          <div className="flex items-center justify-center gap-2 flex-wrap">
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${badge.className}`}>
              {badge.label}
            </span>
            {customization.heroCtaLabel && customization.heroCtaUrl && (
              <Link
                href={customization.heroCtaUrl}
                className="px-4 py-2 rounded-full text-sm font-bold bg-white text-gray-900 hover:bg-gray-100 transition-colors"
              >
                {customization.heroCtaLabel}
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Trust badges — verificado, ventas, antigüedad */}
      <VendorTrustBadges
        verified={tenant.active}
        createdYear={tenant.createdAt ? new Date(tenant.createdAt).getFullYear() : 2026}
      />

      {/* Active promotions banner */}
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
          <div className="flex items-center gap-3 p-4 rounded-2xl shadow-lg border-2 border-dashed border-[var(--rule-base)] bg-white/80 dark:bg-gray-900/80 backdrop-blur">
            <div className="w-10 h-10 rounded-xl bg-[var(--surface-sunken)] flex items-center justify-center flex-shrink-0">
              <Tag className="w-5 h-5 text-gray-300 dark:text-gray-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-[var(--text-tertiary)]">Promoción destacada</p>
              <p className="text-gray-300 dark:text-gray-600 text-sm">Configura desde Mi Tienda &gt; Secciones</p>
            </div>
            <div className="flex-shrink-0 px-3 py-1 rounded-full bg-[var(--surface-sunken)] text-gray-300 dark:text-gray-600 font-extrabold text-sm">
              % OFF
            </div>
          </div>
        )}
      </section>

      {/* Featured products */}
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
                <div
                  key={p.id}
                  className="group relative rounded-2xl overflow-hidden bg-[var(--surface-raised)] shadow-sm hover:shadow-xl transition-shadow border border-[var(--rule-base)]"
                >
                  <div className="aspect-square bg-[var(--surface-sunken)] overflow-hidden">
                    {p.productImage && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.productImage}
                        alt={p.productName}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-[var(--dur-base)]"
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
                    <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-white/95 text-gray-900 font-bold text-[length:var(--ts-2xs)] shadow">
                      {p.badge}
                    </div>
                  )}

                  <div className="p-3">
                    <p className="font-semibold text-sm truncate">{p.productName}</p>
                    <p className="text-xs text-gray-500 mb-2">{p.productUnit}</p>
                    <div className="flex items-baseline gap-2">
                      <span
                        className="font-extrabold text-lg"
                        style={{ color: isExclusive ? primary : undefined }}
                      >
                        {formatPrice(shownPrice)}
                      </span>
                      {isExclusive && (
                        <span className="text-xs text-gray-400 line-through">
                          {formatPrice(p.productBasePrice)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl overflow-hidden bg-[var(--surface-raised)] border-2 border-dashed border-[var(--rule-base)]"
              >
                <div className="aspect-square bg-[var(--surface-sunken)] flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-12 h-12 mx-auto mb-2 rounded-xl bg-[var(--surface-sunken)] flex items-center justify-center">
                      <ShoppingBag className="w-6 h-6 text-gray-300 dark:text-gray-600" />
                    </div>
                    <p className="text-xs font-semibold text-gray-300 dark:text-gray-600">Imagen {i + 1}</p>
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
      </section>

      {/* About */}
      {(customization.aboutTitle || customization.aboutBody) ? (
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
      ) : (
        <section className="max-w-3xl mx-auto px-4 py-8">
          <div className="p-6 rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-white/60 dark:bg-gray-900/60">
            <h2 className="text-xl font-extrabold mb-3 text-gray-300 dark:text-gray-600">
              Sobre nosotros
            </h2>
            <div className="space-y-2">
              <div className="h-4 w-full bg-[var(--surface-sunken)] rounded" />
              <div className="h-4 w-4/5 bg-[var(--surface-sunken)] rounded" />
              <div className="h-4 w-3/5 bg-[var(--surface-sunken)] rounded" />
            </div>
            <p className="text-xs text-gray-300 dark:text-gray-600 mt-3">Configura desde Mi Tienda &gt; Identidad</p>
          </div>
        </section>
      )}

      {/* Actions */}
      <section className="max-w-3xl mx-auto px-4 pb-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
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
              <p className="font-bold text-lg leading-tight">Ver Tienda</p>
              <p className="text-sm text-gray-500 mt-0.5">Catálogo completo</p>
            </div>
            <ExternalLink className="w-4 h-4 text-gray-400 ml-auto" />
          </Link>

          <Link
            href={`/t/${tenant.slug}/admin`}
            className="group flex items-center gap-4 p-6 bg-[var(--surface-raised)] rounded-2xl shadow-md hover:shadow-xl transition-all border border-[var(--rule-base)]"
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 bg-orange-50 dark:bg-orange-900/20">
              <Settings className="w-7 h-7 text-[#f4a261]" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-lg leading-tight">Admin</p>
              <p className="text-sm text-gray-500 mt-0.5">Panel de gestión</p>
            </div>
            <ExternalLink className="w-4 h-4 text-gray-400 ml-auto" />
          </Link>
        </div>

        {/* Contact info */}
        {(customization.whatsappPhone ||
          customization.contactEmail ||
          customization.address ||
          tenant.ownerPhone ||
          tenant.customDomain) ? (
          <div className="bg-[var(--surface-raised)] rounded-2xl p-6 shadow-sm border border-[var(--rule-base)] space-y-3">
            <h3 className="text-sm font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
              Contacto
            </h3>
            {(customization.whatsappPhone || tenant.ownerPhone) && (
              <div className="flex items-center gap-3 text-[var(--text-secondary)]">
                <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
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
                <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-sm">{customization.address}</span>
              </div>
            )}
            {customization.contactEmail && (
              <div className="flex items-center gap-3 text-[var(--text-secondary)]">
                <ExternalLink className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <a
                  href={`mailto:${customization.contactEmail}`}
                  className="text-sm hover:underline"
                >
                  {customization.contactEmail}
                </a>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl p-6 border-2 border-dashed border-[var(--rule-base)] bg-white/60 dark:bg-gray-900/60 space-y-3">
            <h3 className="text-sm font-bold text-gray-300 dark:text-gray-600 uppercase tracking-wider">
              Contacto
            </h3>
            <div className="flex items-center gap-3">
              <Phone className="w-4 h-4 text-gray-200 dark:text-gray-700 flex-shrink-0" />
              <div className="h-4 w-32 bg-[var(--surface-sunken)] rounded" />
            </div>
            <div className="flex items-center gap-3">
              <MapPin className="w-4 h-4 text-gray-200 dark:text-gray-700 flex-shrink-0" />
              <div className="h-4 w-48 bg-[var(--surface-sunken)] rounded" />
            </div>
            <p className="text-xs text-gray-300 dark:text-gray-600">Configura desde Mi Tienda &gt; Contacto</p>
          </div>
        )}

        <p className="text-center mt-6 text-xs text-gray-400 dark:text-gray-600 font-mono">
          /{tenant.slug}
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
