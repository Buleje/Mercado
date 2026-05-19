import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { findTenantByIdOrSlug } from "@/lib/tenant";
import { getTiendaSectionConfig } from "@/lib/tienda-config";
import { StorePageDB } from "@/lib/db/store-page.db";
import { SettingsDB } from "@/lib/db/settings.db";
import type { Product } from "@/data/products";
import TenantTiendaClient from "./TenantTiendaClient";
import StickyCouponBanner from "@/components/store/StickyCouponBanner";

interface TenantTiendaPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: TenantTiendaPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await findTenantByIdOrSlug(slug);
  const name = tenant?.name ?? slug;
  // Tienda individual: título dueño del negocio. `absolute` impide que el
  // template `%s | Buleje` del root layout añada branding del marketplace.
  return {
    title: { absolute: `${name} — Tienda online` },
    description: `Compra en ${name}. Delivery con Yape o efectivo contra entrega.`,
    openGraph: {
      title: `${name} — Tienda online`,
      description: `Compra en ${name}. Delivery con Yape o efectivo contra entrega.`,
      type: "website",
      locale: "es_PE",
      siteName: name,
    },
  };
}

/**
 * Transforma las filas del StorePageDB (tenant-scoped, ya filtra visible+active)
 * al shape `Product` que consumen las secciones y el catalogo.
 */
function toProductShape(
  rows: Awaited<ReturnType<typeof StorePageDB.listCatalogWithVisibility>>,
): Product[] {
  return rows
    .filter((r) => r.visible && r.active)
    .map((r) => ({
      id: r.productId,
      name: r.name,
      image: r.image,
      category: r.category,
      unit: r.unit,
      price: r.price,
      stock: r.stock ?? undefined,
    })) as Product[];
}

async function TenantTiendaContent({ slug }: { slug: string }) {
  // Fuerza dynamic rendering — leemos headers/cookies via SettingsDB.get.
  await connection();

  // Resolver tenant real (slug→id). Si no existe, 404 limpio.
  const tenant = await findTenantByIdOrSlug(slug);
  if (!tenant) notFound();

  // Tres lecturas independientes — se pueden disparar en paralelo.
  const [config, settings, catalogRows] = await Promise.all([
    getTiendaSectionConfig(tenant.id),
    SettingsDB.get(tenant.id),
    StorePageDB.listCatalogWithVisibility(tenant.id),
  ]);

  const storeName =
    (settings?.storeTheme?.storeName as string | undefined) ??
    settings?.businessName ??
    tenant.name ??
    slug;

  const products = toProductShape(catalogRows);

  // Theme colors del customizer (Settings.storeTheme). Solo aplicamos overrides
  // si el valor es un color literal (#hex/rgb) — los presets que apuntan a
  // `var(--color-primary)` se ignoran para evitar loops y dejar el default.
  const storeTheme = (settings?.storeTheme as Record<string, unknown> | undefined) ?? {};
  const themeStyle = buildThemeStyle({
    primaryColor: storeTheme.primaryColor as string | undefined,
    secondaryColor: storeTheme.secondaryColor as string | undefined,
    accentColor: storeTheme.accentColor as string | undefined,
  });

  // Sin breadcrumb arriba — el hero arranca pegado al nav para mayor impacto visual.
  // Brandon (2026-05-05): el breadcrumb genera un espacio blanco que rompe el flujo.
  // Inyectamos un <style> inline que oculta cualquier nav[aria-label="Breadcrumb"]
  // que esté como hijo directo del body. Funciona pre-paint sin flash.

  return (
    <div style={themeStyle}>
      <style>{`
        body > nav[aria-label="Breadcrumb"] { display: none !important; }
      `}</style>
      <TenantTiendaClient
        slug={tenant.slug}
        storeName={storeName}
        products={products}
        visibleSections={Array.from(config.visible)}
        sectionOrder={config.order}
      />
      <StickyCouponBanner tenantSlug={tenant.slug} />
    </div>
  );
}

/**
 * Construye un style con CSS variables override SOLO para colores literales.
 * Si el valor empieza con `var(...)` lo ignora para no crear loops infinitos
 * (ej: el preset "Teal" guarda `var(--color-primary)` que apuntaria a si misma).
 */
function buildThemeStyle({
  primaryColor,
  secondaryColor,
  accentColor,
}: {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
}): React.CSSProperties {
  const style: Record<string, string> = {};
  const isLiteral = (v: string | undefined): v is string =>
    typeof v === "string" && v.length > 0 && !v.trim().startsWith("var(");

  if (isLiteral(primaryColor)) {
    style["--color-primary"] = primaryColor;
    style["--accent"] = primaryColor;
  }
  if (isLiteral(secondaryColor)) {
    style["--color-secondary"] = secondaryColor;
  }
  if (isLiteral(accentColor)) {
    style["--accent-soft"] = accentColor;
  }
  return style as React.CSSProperties;
}

function TenantTiendaSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] animate-pulse">
      <section className="bg-[var(--surface-canvas)] border-b border-[var(--rule-soft)]" style={{ minHeight: "320px" }}>
        <div className="max-w-5xl mx-auto px-4 py-16 text-center space-y-4">
          <div className="h-3 w-28 bg-[var(--rule-soft)] rounded mx-auto" />
          <div className="h-10 w-72 bg-[var(--rule-base)] rounded-lg mx-auto" />
          <div className="h-4 w-56 bg-[var(--rule-soft)] rounded mx-auto" />
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl bg-[var(--surface-raised)] shadow-sm border border-[var(--rule-base)] overflow-hidden"
            >
              <div className="aspect-square bg-[var(--surface-sunken)]" />
              <div className="p-3 space-y-2">
                <div className="h-4 w-24 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded" />
                <div className="h-5 w-16 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default async function TenantTiendaPage({
  params,
}: TenantTiendaPageProps) {
  const { slug } = await params;
  return (
    <Suspense fallback={<TenantTiendaSkeleton />}>
      <TenantTiendaContent slug={slug} />
    </Suspense>
  );
}
