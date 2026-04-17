import type { Metadata } from "next";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { cacheLife, cacheTag } from "next/cache";
import {
  GeolocationPrompt,
  CategoriesGridClient,
  DiscountBanner,
  AnimatedSearchBar,
  ReviewsCarousel,
} from "@/components/landing/LandingClientSections";
import HeroParallax from "@/components/landing/HeroParallax";
import FeaturedStoresCarousel from "@/components/landing/FeaturedStoresCarousel";
import ScrollyHowItWorks from "@/components/landing/ScrollyHowItWorks";
import { Button, Card, SectionHeader, Kicker } from "@/components/ui-system";
import { Store, Bike } from "lucide-react";

export const metadata: Metadata = {
  title: "Buleje — Pide lo que quieras, te lo llevamos | Bodegas, Mercado y Mas",
  description:
    "Compra en bodegas, minimarkets y tiendas de tu zona con delivery rapido. Paga con Yape o efectivo. Miles de productos al alcance de tu mano en Buleje.",
  alternates: {
    canonical: "https://www.buleje.pe",
  },
  openGraph: {
    title: "Buleje — Pide lo que quieras, te lo llevamos",
    description:
      "Compra en bodegas y tiendas de tu zona con delivery rapido. Yape y efectivo.",
    url: "https://www.buleje.pe",
    type: "website",
    locale: "es_PE",
    images: [
      {
        url: "/api/og",
        width: 1200,
        height: 630,
        alt: "Buleje — Marketplace de Bodegas y Tiendas del Peru",
      },
    ],
  },
};

// ── Dynamic sections ──
const Footer = dynamic(() => import("@/components/Footer"), { ssr: true });
const MarketplaceNavbar = dynamic(
  () => import("@/components/marketplace/MarketplaceNavbar"),
  { ssr: true }
);

// ── Cached marketplace stats from DB ──
async function getMarketplaceStats() {
  "use cache";
  cacheLife({ revalidate: 300, stale: 60, expire: 900 });
  cacheTag("marketplace-stats");
  const { prisma } = await import("@/lib/prisma");
  const [storeCount, productCount, avgRating] = await Promise.all([
    prisma.store.count({ where: { isPublished: true } }).catch(() => 0),
    prisma.product.count({ where: { active: true } }).catch(() => 0),
    prisma.review
      .aggregate({ _avg: { rating: true }, where: { status: "approved" } })
      .then((r) => r._avg.rating ?? 4.8)
      .catch(() => 4.8),
  ]);
  return { storeCount, productCount, avgRating: Number(avgRating.toFixed(1)) };
}

// ── Cached featured stores from DB (with products) ──
async function getFeaturedStores() {
  "use cache";
  cacheLife({ revalidate: 300, stale: 60, expire: 900 });
  cacheTag("featured-stores");
  const { prisma } = await import("@/lib/prisma");
  try {
    const stores = await prisma.store.findMany({
      where: { isPublished: true },
      orderBy: [{ rating: "desc" }, { reviewCount: "desc" }],
      take: 6,
      select: {
        id: true,
        slug: true,
        name: true,
        logo: true,
        category: true,
        zone: true,
        rating: true,
        reviewCount: true,
        description: true,
        products: {
          where: { isActive: true },
          take: 3,
          select: {
            retailPrice: true,
            product: {
              select: {
                name: true,
                image: true,
              },
            },
          },
        },
      },
    });
    // Convert Decimal → number so data is RSC-serializable through "use cache"
    return stores.map((s) => ({
      ...s,
      products: s.products.map((p) => ({
        ...p,
        retailPrice: Number(p.retailPrice),
      })),
    }));
  } catch {
    return [];
  }
}

// ── Cached reviews from DB ──
async function getMarketplaceReviews() {
  "use cache";
  cacheLife({ revalidate: 600, stale: 120, expire: 1800 });
  cacheTag("marketplace-reviews");
  const { prisma } = await import("@/lib/prisma");
  try {
    return await prisma.review.findMany({
      where: { status: "approved", rating: { gte: 4 }, storeId: { not: null } },
      orderBy: { date: "desc" },
      take: 6,
      select: { id: true, name: true, text: true, rating: true, date: true },
    });
  } catch {
    return [];
  }
}

// ── JSON-LD structured data (consumer marketplace) ──
function BulejeJsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Buleje",
    url: "https://www.buleje.pe",
    description:
      "Marketplace de bodegas y tiendas del Peru. Compra online con delivery rapido.",
    potentialAction: {
      "@type": "SearchAction",
      target: "https://www.buleje.pe/marketplace?buscar={search_term_string}",
      "query-input": "required name=search_term_string",
    },
    provider: {
      "@type": "Organization",
      name: "Buleje",
      url: "https://www.buleje.pe",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Pucallpa",
        addressRegion: "Ucayali",
        addressCountry: "PE",
      },
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

// ── Hero — Parallax multicapa con stats animados ──
async function HeroSection() {
  const stats = await getMarketplaceStats();
  return (
    <HeroParallax
      storeCount={stats.storeCount}
      productCount={stats.productCount}
      avgRating={stats.avgRating}
    />
  );
}

// ── Categories grid — minimal editorial con lucide icons ──
const CATEGORIES = [
  { label: "Bodegas", slug: "bodegas", desc: "Abarrotes, bebidas y más" },
  { label: "Restaurantes", slug: "restaurantes", desc: "Comida lista para ti" },
  { label: "Licorería", slug: "licoreria", desc: "Cervezas, vinos y licores" },
  { label: "Farmacia", slug: "farmacia", desc: "Medicinas y cuidado personal" },
  { label: "Frutas y Verduras", slug: "frutas-verduras", desc: "Frescos del mercado" },
  { label: "Panadería", slug: "panaderia", desc: "Pan caliente y pasteles" },
  { label: "Limpieza", slug: "limpieza", desc: "Productos para tu hogar" },
  { label: "Mascotas", slug: "mascotas", desc: "Alimento y accesorios" },
  { label: "Carnicería", slug: "carniceria", desc: "Carnes frescas del día" },
  { label: "Congelados", slug: "congelados", desc: "Helados y comida congelada" },
  { label: "Snacks", slug: "snacks", desc: "Galletas, dulces y más" },
  { label: "Cuidado Personal", slug: "higiene", desc: "Jabones, shampoo, crema" },
];

function CategoriesGrid() {
  return <CategoriesGridClient categories={CATEGORIES} />;
}

// HowItWorks fue reemplazado por <ScrollyHowItWorks /> del design system.

// ── Featured Stores section (real DB data) ──
async function FeaturedStoresSection() {
  const stores = await getFeaturedStores();
  if (stores.length === 0) return null;

  return (
    <section className="py-12 sm:py-16 bg-gray-50 dark:bg-gray-900/50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="Con mejor reputación"
          title="Tiendas destacadas"
          description="Las mejor valoradas por nuestros clientes esta semana."
          size="md"
          ruled
          className="mb-6"
          action={
            <Link
              href="/marketplace"
              className="text-xs font-bold text-gray-900 dark:text-white link-underline hidden sm:inline-flex"
            >
              Ver todas →
            </Link>
          }
        />
        <FeaturedStoresCarousel stores={stores} />
        <div className="mt-6 sm:hidden text-center">
          <Link
            href="/marketplace"
            className="text-xs font-bold text-gray-900 dark:text-white link-underline"
          >
            Ver todas las tiendas →
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Reviews section (real DB data → animated carousel) ──
async function ReviewsSection() {
  const reviews = await getMarketplaceReviews();

  const fallbackReviews = [
    { id: "f1", name: "Maria L.", text: "Pedí mis cosas de la bodega y llegaron en 30 minutos. Increíble.", rating: 5, date: new Date("2025-12-15") },
    { id: "f2", name: "Carlos R.", text: "Pago con Yape y listo. Más fácil que ir al mercado.", rating: 5, date: new Date("2025-11-20") },
    { id: "f3", name: "Ana P.", text: "Las frutas llegaron frescas y bien empacadas. Volveré a comprar.", rating: 4, date: new Date("2025-10-10") },
    { id: "f4", name: "Jorge M.", text: "Los precios son iguales que en la bodega pero me lo traen a la casa. Genial.", rating: 5, date: new Date("2025-09-05") },
    { id: "f5", name: "Rosa T.", text: "Ya no necesito salir al mercado con esta lluvia. Todo llega perfecto.", rating: 5, date: new Date("2025-08-18") },
    { id: "f6", name: "Luis S.", text: "Compré para la semana entera. Rápido y sin problemas.", rating: 4, date: new Date("2025-07-22") },
  ];

  const displayReviews = reviews.length > 0 ? reviews : fallbackReviews;

  return <ReviewsCarousel reviews={displayReviews} />;
}

// ── Business + Driver CTA banners ──
function PromoBanners() {
  const banners = [
    {
      kicker: "Para dueños",
      icon: Store,
      title: "¿Tenés un negocio?",
      desc: "Registrá tu bodega, minimarket o tienda y empezá a vender online gratis. Miles de clientes te esperan.",
      primary: { label: "Registrar mi negocio", href: "/marketplace/apply" },
      secondary: { label: "Ver planes", href: "/negocios" },
    },
    {
      kicker: "Para repartidores",
      icon: Bike,
      title: "¿Querés repartir?",
      desc: "Uníte como repartidor y generá ingresos extra entregando pedidos en tu zona. Vos elegís tu horario.",
      primary: { label: "Quiero ser repartidor", href: "/marketplace/repartidor" },
    },
  ];

  return (
    <section className="py-16 sm:py-20 bg-white dark:bg-gray-950">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid sm:grid-cols-2 gap-5">
          {banners.map((b, i) => {
            const Icon = b.icon;
            return (
              <Card key={i} variant="base" padding="lg" className="justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-200">
                      <Icon className="h-4 w-4" strokeWidth={1.5} />
                    </div>
                    <Kicker>{b.kicker}</Kicker>
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
                    {b.title}
                  </h3>
                  <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 max-w-md leading-relaxed">
                    {b.desc}
                  </p>
                </div>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Button asChild variant="primary" size="md">
                    <Link href={b.primary.href}>{b.primary.label}</Link>
                  </Button>
                  {b.secondary && (
                    <Button asChild variant="secondary" size="md">
                      <Link href={b.secondary.href}>{b.secondary.label}</Link>
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Popular payment methods — editorial wordmark list ──
function PaymentMethods() {
  const methods = [
    { name: "Yape", desc: "Transferencia al instante" },
    { name: "Plin", desc: "Desde tu app del banco" },
    { name: "Efectivo", desc: "Contra entrega" },
    { name: "Tarjeta", desc: "Débito y crédito" },
  ];
  return (
    <section className="py-16 sm:py-20 bg-gray-50 dark:bg-gray-900/50 border-y border-gray-200 dark:border-gray-800">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6 justify-between flex-wrap mb-8">
          <Kicker>Formas de pago aceptadas</Kicker>
          <span className="text-[10px] font-bold text-gray-400 tabular-nums uppercase tracking-wider">
            4 OPCIONES
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-gray-200 dark:divide-gray-800 border border-gray-200 dark:border-gray-800 rounded-2xl bg-white dark:bg-gray-900 overflow-hidden">
          {methods.map((m) => (
            <div key={m.name} className="px-6 py-6 sm:py-8">
              <p className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
                {m.name}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {m.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Final CTA ──
function FinalCTA() {
  return (
    <section className="py-14 sm:py-20 bg-gray-50 dark:bg-gray-900/50">
      <div className="max-w-4xl mx-auto px-4 text-center">
        <h2 className="text-fs-h1 font-extrabold tracking-[-0.02em] text-gray-900 dark:text-white">
          Todo lo que necesitas,{" "}
          <span className="text-gray-500 dark:text-gray-400">en un solo lugar</span>
        </h2>
        <p className="mt-4 text-base sm:text-lg text-gray-500 dark:text-gray-400 max-w-xl mx-auto leading-relaxed">
          Pedí a bodegas cerca tuyo. Delivery en 25 min. Pagás con Yape o efectivo al recibir.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold px-6 py-3 rounded-full text-sm hover:opacity-90 transition-opacity"
          >
            Explorar Marketplace
          </Link>
          <Link
            href="/negocios"
            className="inline-flex items-center gap-2 bg-transparent text-gray-900 dark:text-white font-bold px-6 py-3 rounded-full text-sm border border-gray-300 dark:border-gray-700 hover:border-gray-900 dark:hover:border-gray-400 transition-colors"
          >
            Abrí tu tienda →
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Main page ──
export default async function Home() {
  return (
    <main id="main-content">
      <BulejeJsonLd />
      <MarketplaceNavbar />
      <DiscountBanner />
      <Suspense fallback={<HeroSkeleton />}>
        <HeroSection />
      </Suspense>
      <CategoriesGrid />
      <Suspense fallback={<SectionSkeleton />}>
        <FeaturedStoresSection />
      </Suspense>
      <ScrollyHowItWorks />
      <Suspense fallback={<SectionSkeleton />}>
        <ReviewsSection />
      </Suspense>
      <PromoBanners />
      <PaymentMethods />
      <FinalCTA />
      <Footer />
    </main>
  );
}

function HeroSkeleton() {
  return (
    <div className="py-16 sm:py-20 bg-white dark:bg-gray-950">
      <div className="mx-auto max-w-5xl px-4 text-center">
        <div className="h-12 w-80 bg-gray-200 dark:bg-gray-800 rounded-xl mx-auto mb-4 animate-pulse" />
        <div className="h-6 w-96 bg-gray-100 dark:bg-gray-800 rounded-lg mx-auto mb-8 animate-pulse" />
        <div className="h-14 max-w-xl mx-auto bg-gray-200 dark:bg-gray-800 rounded-2xl animate-pulse" />
      </div>
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4">
        <div className="h-8 w-64 bg-gray-200 dark:bg-gray-800 rounded-lg mx-auto mb-8 animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 dark:bg-gray-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
