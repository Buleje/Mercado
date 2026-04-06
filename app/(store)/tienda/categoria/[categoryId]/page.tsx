import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import { headers } from "next/headers";
import { categories, type Category } from "@/data/products";
import { ProductsDB } from "@/lib/db/products.db";
import Header from "@/components/Header";
import AnnouncementBar from "@/components/AnnouncementBar";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import { ProductGridSkeleton } from "@/components/LoadingSkeleton";
import CategoryCatalogClient from "@/components/CategoryCatalogClient";

const CartSidebar = dynamic(() => import("@/components/CartSidebar"));
const CustomerModal = dynamic(() => import("@/components/CustomerModal"));
const Footer = dynamic(() => import("@/components/Footer"));
const CookieConsent = dynamic(() => import("@/components/CookieConsent"));
const MobileBottomNav = dynamic(() => import("@/components/MobileBottomNav"));
const StickyCartBar = dynamic(() => import("@/components/StickyCartBar"));

const realCategories = categories.filter((c) => c.id !== "todos");

// ISR: regenerate category pages at most once per 5 minutes
export const revalidate = 300;

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
  lacteos:
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

  // Fetch product count/price from DB
  const hdrs = await headers();
  const tenantId = hdrs.get("x-tenant-id") ?? "main";
  const allProducts = await ProductsDB.getAll(tenantId);
  const catProducts = allProducts.filter((p) => p.category === cat.id && p.active !== false);
  const productCount = catProducts.length;
  const minPrice = catProducts.length ? Math.min(...catProducts.map((p) => p.price)) : 0;

  const baseDec =
    categoryDescriptions[cat.id] ??
    `Compra ${cat.label} online con delivery gratis. Buleje.`;
  const desc = `${baseDec} ${productCount} productos desde S/${minPrice.toFixed(2)}.`;

  const categoryUrl = `https://www.buleje.pe/tienda/categoria/${cat.id}`;

  return {
    title: `${cat.emoji} ${cat.label} — Delivery Gratis | Buleje`,
    description: desc,
    openGraph: {
      title: `${cat.label} — Compra Online con Delivery`,
      description: desc,
      type: "website",
      url: categoryUrl,
      locale: "es_PE",
      siteName: "Buleje",
      images: [{ url: "https://www.buleje.pe/og-image.jpg", width: 1200, height: 630, alt: `${cat.label} — Buleje` }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${cat.emoji} ${cat.label} — Buleje`,
      description: desc,
      images: ["https://www.buleje.pe/og-image.jpg"],
    },
    alternates: {
      canonical: categoryUrl,
    },
  };
}

export default async function CategoryPage({ params }: Props) {
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
  
  // Fetch products from DB for JSON-LD schema
  const hdrs = await headers();
  const tenantId = hdrs.get("x-tenant-id") ?? "main";
  const allProducts = await ProductsDB.getAll(tenantId);
  const catProducts = allProducts.filter((p) => p.category === cat.id && p.active !== false);

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
      <AnnouncementBar />
      <Header />
      {/* Spacer for fixed header */}
      <div className="h-[6.75rem] sm:h-[7.75rem]" />
      {/* Visible breadcrumbs */}
      <nav
        aria-label="Breadcrumb"
        className="bg-gray-50 dark:bg-card border-b border-gray-100 dark:border-card-border"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-2 flex items-center gap-1.5 text-xs text-muted">
          <Link href="/" className="hover:text-primary transition-colors">
            Inicio
          </Link>
          <span className="text-gray-300">/</span>
          <Link
            href="/tienda"
            className="hover:text-primary transition-colors"
          >
            Tienda
          </Link>
          <span className="text-gray-300">/</span>
          <span className="font-semibold text-foreground">
            {cat.emoji} {cat.label}
          </span>
        </div>
      </nav>
      <main id="main-content">
        {/* Category hero */}
        <section className="relative bg-linear-to-br from-[#312e81] via-primary-dark to-[#1e1b4b] pt-32 pb-14 sm:pt-36 sm:pb-16 overflow-hidden">
          <div className="absolute top-0 right-0 w-[40vw] h-[40vw] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <span className="text-5xl sm:text-6xl mb-4 block">{cat.emoji}</span>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white leading-tight mb-4">
              {cat.label}
            </h1>
            <p className="text-white/50 text-base sm:text-lg max-w-xl mx-auto mb-6">
              {categoryDescriptions[cat.id]?.split(".")[0] ??
                `Todos los productos de ${cat.label}`}
              . Delivery gratis.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1.5 bg-white/8 border border-white/10 rounded-full px-3 py-1.5 text-white/70">
                🚚 Delivery gratis +S/50
              </span>
              <span className="inline-flex items-center gap-1.5 bg-white/8 border border-white/10 rounded-full px-3 py-1.5 text-white/70">
                💳 Yape o efectivo
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
      <Footer />
      <CartSidebar />
      <CustomerModal />
      <CookieConsent />
      <StickyCartBar />
      <MobileBottomNav />
    </>
  );
}
