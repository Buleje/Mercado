import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import dynamic from "next/dynamic";
import { headers } from "next/headers";
import { cacheLife, cacheTag } from "next/cache";
import { categories, type Category } from "@/data/products";
import { ProductsDB } from "@/lib/db/products.db";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import { ProductGridSkeleton } from "@/components/LoadingSkeleton";
import CategoryCatalogClient from "@/components/CategoryCatalogClient";
import Breadcrumbs from "@/components/store/Breadcrumbs";
import { getCatalogCategoryIcon } from "@/lib/catalog/catalog-icons";
import { Truck, CreditCard } from "@buleje/design-system/icons";

const CartSidebar = dynamic(() => import("@/components/CartSidebar"));
const CustomerModal = dynamic(() => import("@/components/CustomerModal"));
const Footer = dynamic(() => import("@/components/Footer"));
const CookieConsent = dynamic(() => import("@/components/CookieConsent"));
const MobileBottomNav = dynamic(() => import("@/components/MobileBottomNav"));
const StickyCartBar = dynamic(() => import("@/components/StickyCartBar"));

const realCategories = categories.filter((c) => c.id !== "todos");

/**
 * Cached product fetcher for category pages (Next 16 Cache Components).
 * Replaces the old `export const revalidate = 300`. tenantId is part of
 * the cache key automatically. Invalidable via `updateTag('category-products:*')`.
 * Ver ADR-019.
 */
async function getCategoryProducts(tenantId: string, categoryId: string) {
  "use cache";
  cacheLife({ revalidate: 300, stale: 60, expire: 900 });
  cacheTag("category-products", `category-products:${tenantId}:${categoryId}`);
  const allProducts = await ProductsDB.getAll(tenantId);
  return allProducts.filter(
    (p) => p.category === categoryId && p.active !== false,
  );
}

interface Props {
  params: Promise<{ categoryId: string }>;
}

export async function generateStaticParams() {
  return realCategories.map((c) => ({ categoryId: c.id }));
}

const categoryDescriptions: Record<string, string> = {
  "frutas-verduras":
    "Frutas y verduras frescas del día con delivery. Tomates, plátanos, papas, cebollas y más productos frescos para tu hogar.",
  abarrotes:
    "Abarrotes esenciales: arroz, fideos, aceite, azúcar, enlatados y más. Compra tus productos de despensa con delivery rápido.",
  carnes:
    "Carnes frescas de calidad: pollo, res, cerdo y más. Delivery en frío garantizado. Buleje.",
  lácteos:
    "Productos lácteos frescos: leche, queso, yogurt, mantequilla y más. Delivery rápido.",
  bebidas:
    "Bebidas para toda la familia: agua, gaseosas, jugos naturales y más. Delivery con Buleje.",
  limpieza:
    "Productos de limpieza para tu hogar: detergente, lejía, desinfectante y más. Delivery rápido.",
};

function findCategory(categoryId: string): Category | undefined {
  return realCategories.find((c) => c.id === categoryId);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { categoryId } = await params;
  const cat = findCategory(categoryId);
  if (!cat) return { title: "Categoría no encontrada" };

  // Fetch product count/price from DB (cached 5m via use cache helper)
  const hdrs = await headers();
  const tenantId = hdrs.get("x-tenant-id") ?? "main";
  const isTenantStoreRoute = hdrs.get("x-tenant-store-route") === "1";
  const catProducts = await getCategoryProducts(tenantId, cat.id);
  const productCount = catProducts.length;
  const minPrice = catProducts.length ? Math.min(...catProducts.map((p) => p.price)) : 0;

  // Resuelve el nombre real del comercio para que el título no diga "Buleje"
  // en una tienda individual.
  const { resolveStoreContext } = await import("@/lib/store-metadata");
  const ctx = await resolveStoreContext();

  const baseDec =
    categoryDescriptions[cat.id] ??
    `Compra ${cat.label} online con delivery rápido en ${ctx.name}.`;
  const desc = `${baseDec} ${productCount} productos desde S/${minPrice.toFixed(2)}.`;

  const categoryUrl = `https://www.buleje.pe/tienda/categoria/${cat.id}`;
  const titleStr = `${cat.label} — ${ctx.name}`;

  return {
    title: isTenantStoreRoute ? { absolute: titleStr } : titleStr,
    description: desc,
    openGraph: {
      title: titleStr,
      description: desc,
      type: "website",
      url: categoryUrl,
      locale: "es_PE",
      siteName: ctx.name,
    },
    twitter: {
      card: "summary_large_image",
      title: titleStr,
      description: desc,
    },
    alternates: {
      canonical: categoryUrl,
    },
  };
}

async function CategoryPageContent({ params }: Props) {
  await connection();
  const { categoryId } = await params;
  const cat = findCategory(categoryId);

  if (!cat) notFound();

  const breadcrumbs = [
    { name: "Inicio", url: "https://www.buleje.pe" },
    { name: "Tienda", url: "https://www.buleje.pe/tienda" },
    {
      name: cat.label,
      url: `https://www.buleje.pe/tienda/categoria/${cat.id}`,
    },
  ];

  const categoryUrl = `https://www.buleje.pe/tienda/categoria/${cat.id}`;
  
  // Fetch products from DB for JSON-LD schema (cached 5m via use cache helper)
  const hdrs = await headers();
  const tenantId = hdrs.get("x-tenant-id") ?? "main";
  const catProducts = await getCategoryProducts(tenantId, cat.id);

  return (
    <>
      <BreadcrumbSchema items={breadcrumbs} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: `${cat.label} — Buleje`,
            description:
              categoryDescriptions[cat.id] ??
              `${cat.label} con delivery.`,
            url: categoryUrl,
            numberOfItems: catProducts.length,
            isPartOf: {
              "@type": "WebSite",
              name: "Buleje",
              url: "https://www.buleje.pe",
            },
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: cat.label,
            numberOfItems: catProducts.length,
            itemListElement: catProducts.slice(0, 20).map((p, i) => ({
              "@type": "ListItem",
              position: i + 1,
              item: {
                "@type": "Product",
                name: p.name,
                description: p.description ?? `${p.name} — ${cat.label}`,
                image: p.image,
                url: `${categoryUrl}#product-${p.id}`,
                offers: {
                  "@type": "Offer",
                  price: p.price,
                  priceCurrency: "PEN",
                  availability: (p.stock ?? 1) > 0
                    ? "https://schema.org/InStock"
                    : "https://schema.org/OutOfStock",
                  seller: {
                    "@type": "Organization",
                    name: "Buleje",
                  },
                },
              },
            })),
          }),
        }}
      />
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/" },
          { label: "Tienda", href: "/tienda" },
          { label: cat.label },
        ]}
      />
      <main id="main-content">
        {/* Category hero */}
        <section className="relative bg-gray-900 pt-32 pb-14 sm:pt-36 sm:pb-16 overflow-hidden border-b border-gray-800">
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-[0.06] pointer-events-none"
            style={{
              backgroundImage:
                "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <CatIconDisplay categoryId={cat.id} />
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-[var(--ls-tight)] text-white leading-[1.05] mb-4">
              {cat.label}
            </h1>
            <p className="text-white/55 text-base sm:text-lg max-w-xl mx-auto mb-6 leading-relaxed">
              {categoryDescriptions[cat.id]?.split(".")[0] ??
                `Todos los productos de ${cat.label}`}
              . Delivery gratis.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 text-[length:var(--ts-2xs)]">
              <span className="inline-flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-full px-3 py-1 font-semibold text-white/75">
                <Truck className="h-3 w-3" strokeWidth={1.75} />
                Delivery gratis +S/50
              </span>
              <span className="inline-flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-full px-3 py-1 font-semibold text-white/75">
                <CreditCard className="h-3 w-3" strokeWidth={1.75} />
                Yape o efectivo
              </span>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0" aria-hidden="true">
            <svg
              viewBox="0 0 1440 60"
              xmlns="http://www.w3.org/2000/svg"
              className="block w-full"
              preserveAspectRatio="none"
            >
              <path
                d="M0,30 C360,60 1080,0 1440,30 L1440,60 L0,60 Z"
                fill="var(--color-background)"
              />
            </svg>
          </div>
        </section>
        <Suspense
          fallback={
            <section className="py-20 bg-surface">
              <div className="max-w-7xl mx-auto px-4">
                <ProductGridSkeleton />
              </div>
            </section>
          }
        >
          <CategoryCatalogClient categoryId={cat.id} categoryLabel={cat.label} categoryEmoji={cat.emoji} />
        </Suspense>
      </main>
      <CartSidebar />
      <CustomerModal />
      <CookieConsent />
      <StickyCartBar />
    </>
  );
}

function CategoryPageSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--surface-sunken)] dark:bg-[var(--surface-canvas)] animate-pulse">
      <div className="h-[6.75rem] sm:h-[7.75rem]" />
      <section className="bg-linear-to-br from-indigo-900 to-indigo-950 pt-32 pb-14">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="h-14 w-14 bg-white/20 rounded mx-auto mb-4" />
          <div className="h-10 w-48 bg-white/20 rounded mx-auto mb-4" />
          <div className="h-5 w-64 bg-white/15 rounded mx-auto" />
        </div>
      </section>
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4">
          <ProductGridSkeleton />
        </div>
      </section>
    </div>
  );
}

function CatIconDisplay({ categoryId }: { categoryId: string }) {
  return (
    <div className="h-14 w-14 mx-auto mb-5 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-white">
      {renderCatIcon(categoryId)}
    </div>
  );
}

function renderCatIcon(categoryId: string) {
  const CatIcon = getCatalogCategoryIcon(categoryId);
  return <CatIcon className="h-6 w-6" strokeWidth={1.5} />;
}

export default function CategoryPage({ params }: Props) {
  return (
    <Suspense fallback={<CategoryPageSkeleton />}>
      <CategoryPageContent params={params} />
    </Suspense>
  );
}
