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

interface TenantTiendaPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: TenantTiendaPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await findTenantByIdOrSlug(slug);
  const name = tenant?.name ?? slug;
  return {
    title: `${name} — Tienda online`,
    description: `Compra en ${name}. Delivery con Yape o efectivo contra entrega.`,
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

  return (
    <TenantTiendaClient
      slug={tenant.slug}
      storeName={storeName}
      products={products}
      visibleSections={Array.from(config.visible)}
      sectionOrder={config.order}
    />
  );
}

function TenantTiendaSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] animate-pulse">
      <section className="bg-[#060a0d]" style={{ minHeight: "320px" }}>
        <div className="max-w-5xl mx-auto px-4 py-16 text-center space-y-4">
          <div className="h-3 w-28 bg-white/20 rounded mx-auto" />
          <div className="h-10 w-72 bg-white/15 rounded-lg mx-auto" />
          <div className="h-4 w-56 bg-white/10 rounded mx-auto" />
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
                <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
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
