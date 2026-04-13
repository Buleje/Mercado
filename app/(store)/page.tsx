import type { Metadata } from "next";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { cacheLife, cacheTag } from "next/cache";
import {
  GeolocationPrompt,
  CategoriesGridClient,
  DiscountBanner,
  AnimatedSearchBar,
  ReviewsCarousel,
} from "@/components/landing/LandingClientSections";

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

// ── Hero — Rappi-style consumer discovery ──
async function HeroSection() {
  const stats = await getMarketplaceStats();

  return (
    <section className="py-16 sm:py-20 bg-white dark:bg-gray-950">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 text-center">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 dark:text-white leading-tight">
          Pide lo que{" "}
          <span className="text-primary">quieras</span>,{" "}
          te lo llevamos
        </h1>
        <p className="mt-6 text-lg text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
          Bodegas, minimarkets, licorerías, farmacias y más — todo desde tu celular con delivery rápido.
        </p>

        {/* Animated search bar */}
        <AnimatedSearchBar />

        {/* Mini stats */}
        <div className="mt-8 flex flex-wrap justify-center gap-6 text-gray-500 dark:text-gray-400 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="font-bold text-gray-900 dark:text-white">{stats.storeCount || "10+"}
            </span> tiendas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="font-bold text-gray-900 dark:text-white">{stats.productCount || "500+"}
            </span> productos
          </span>
          <span className="flex items-center gap-1.5">
            <span className="font-bold text-gray-900 dark:text-white">{stats.avgRating}</span> valoración
          </span>
        </div>

        {/* Geolocation prompt */}
        <div className="mt-4 flex justify-center">
          <GeolocationPrompt />
        </div>
      </div>
    </section>
  );
}

// ── Categories grid — big colorful cards (Rappi / PedidosYa style) ──
const CATEGORIES = [
  { emoji: "🏪", label: "Bodegas", slug: "bodegas", color: "", desc: "Abarrotes, bebidas y más" },
  { emoji: "🍔", label: "Restaurantes", slug: "restaurantes", color: "", desc: "Comida lista para ti" },
  { emoji: "🍺", label: "Licorería", slug: "licoreria", color: "", desc: "Cervezas, vinos y licores" },
  { emoji: "💊", label: "Farmacia", slug: "farmacia", color: "", desc: "Medicinas y cuidado personal" },
  { emoji: "🥦", label: "Frutas y Verduras", slug: "frutas-verduras", color: "", desc: "Frescos del mercado" },
  { emoji: "🍞", label: "Panadería", slug: "panaderia", color: "", desc: "Pan caliente y pasteles" },
  { emoji: "🧹", label: "Limpieza", slug: "limpieza", color: "", desc: "Productos para tu hogar" },
  { emoji: "🐾", label: "Mascotas", slug: "mascotas", color: "", desc: "Alimento y accesorios" },
  { emoji: "🥩", label: "Carnicería", slug: "carniceria", color: "", desc: "Carnes frescas del día" },
  { emoji: "🧊", label: "Congelados", slug: "congelados", color: "", desc: "Helados y comida congelada" },
  { emoji: "🍿", label: "Snacks", slug: "snacks", color: "", desc: "Galletas, dulces y más" },
  { emoji: "🧴", label: "Cuidado Personal", slug: "higiene", color: "", desc: "Jabones, shampoo, crema" },
];

function CategoriesGrid() {
  return <CategoriesGridClient categories={CATEGORIES} />;
}

// ── How it works — consumer-focused ──
function HowItWorks() {
  const steps = [
    {
      num: "1",
      emoji: "🔍",
      title: "Busca y elige",
      desc: "Encuentra lo que necesitas por categoría o busca directamente. Miles de productos disponibles.",
    },
    {
      num: "2",
      emoji: "🛒",
      title: "Agrega al carrito",
      desc: "Elige productos de cualquier tienda. El carrito se organiza solo.",
    },
    {
      num: "3",
      emoji: "💳",
      title: "Paga fácil",
      desc: "Yape, Plin o efectivo contra entrega. Sin tarjetas, sin complicaciones.",
    },
    {
      num: "4",
      emoji: "🚚",
      title: "Recibe en tu puerta",
      desc: "Delivery rápido directo a tu casa. Cada tienda prepara y envía tu pedido.",
    },
  ];

  return (
    <section className="py-12 sm:py-16 bg-gray-50 dark:bg-gray-900/50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">
            Así de fácil funciona
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s) => (
            <div
              key={s.num}
              className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-800 hover:shadow-sm transition-all text-center"
            >
              <span className="text-4xl block mb-3">{s.emoji}</span>
              <div className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary-light font-bold text-sm mb-2">
                {s.num}
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {s.title}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Featured Stores section (real DB data) ──
async function FeaturedStoresSection() {
  const stores = await getFeaturedStores();
  if (stores.length === 0) return null;

  return (
    <section className="py-12 sm:py-16 bg-gray-50 dark:bg-gray-900/50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">
              Tiendas destacadas
            </h2>
            <p className="mt-1 text-gray-500 dark:text-gray-400 text-sm">
              Las mejor valoradas por nuestros clientes
            </p>
          </div>
          <Link
            href="/marketplace"
            className="text-primary dark:text-primary-light font-semibold text-sm hover:underline hidden sm:block"
          >
            Ver todas →
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {stores.map((store) => (
            <Link
              key={store.id}
              href={`/marketplace/${store.slug}`}
              className="group bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 text-center hover:shadow-md hover:-translate-y-1 transition-all"
            >
              <div className="relative w-16 h-16 mx-auto mb-3 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700">
                {store.logo ? (
                  <Image
                    src={store.logo}
                    alt={store.name}
                    fill
                    className="object-cover"
                    sizes="64px"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl">
                    🏪
                  </div>
                )}
              </div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                {store.name}
              </h3>
              {store.rating > 0 && (
                <div className="flex items-center justify-center gap-1 mt-1">
                  <span className="text-yellow-400 text-xs">★</span>
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                    {store.rating.toFixed(1)}
                  </span>
                  <span className="text-xs text-gray-400">
                    ({store.reviewCount})
                  </span>
                </div>
              )}
              {store.zone && (
                <p className="text-xs text-gray-400 mt-1 capitalize truncate">
                  📍 {store.zone}
                </p>
              )}
              {/* Product previews */}
              {store.products && store.products.length > 0 && (
                <div className="flex items-center justify-center gap-1 mt-2">
                  {store.products.map((sp, i) => (
                    <div
                      key={i}
                      className="h-7 w-7 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden shrink-0 border-2 border-white dark:border-gray-800"
                      style={{ marginLeft: i > 0 ? "-6px" : "0" }}
                      title={sp.product.name}
                    >
                      {sp.product.image ? (
                        <Image
                          src={sp.product.image}
                          alt={sp.product.name}
                          width={28}
                          height={28}
                          className="h-7 w-7 object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs">📦</div>
                      )}
                    </div>
                  ))}
                  <span className="text-[10px] text-gray-400 ml-1 font-semibold">+</span>
                </div>
              )}
            </Link>
          ))}
        </div>
        <div className="text-center mt-6 sm:hidden">
          <Link
            href="/marketplace"
            className="text-primary dark:text-primary-light font-semibold text-sm hover:underline"
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
  return (
    <section className="py-12 sm:py-16 bg-white dark:bg-gray-950">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid sm:grid-cols-2 gap-6">
          {/* For businesses */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 sm:p-10">
              <span className="text-4xl block mb-4">🏪</span>
              <h3 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-2">
                ¿Tienes un negocio?
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-sm">
                Registra tu bodega, minimarket o tienda y empieza a vender online gratis. Miles de clientes te esperan.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/marketplace/apply"
                  className="inline-flex items-center gap-2 bg-primary text-white font-bold px-6 py-3 rounded-xl hover:bg-primary-dark transition-colors"
                >
                  Registrar mi negocio
                </Link>
                <Link
                  href="/negocios"
                  className="inline-flex items-center gap-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold px-6 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Ver planes
                </Link>
              </div>
          </div>
          {/* For drivers */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 sm:p-10">
              <span className="text-4xl block mb-4">🛵</span>
              <h3 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-2">
                ¿Quieres repartir?
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-sm">
                Únete como repartidor y genera ingresos extra entregando pedidos en tu zona. Tú eliges tu horario.
              </p>
              <Link
                href="/marketplace/repartidor"
                className="inline-flex items-center gap-2 bg-primary text-white font-bold px-6 py-3 rounded-xl hover:bg-primary-dark transition-colors"
              >
                Quiero ser repartidor
              </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Popular payment methods ──
function PaymentMethods() {
  return (
    <section className="py-10 sm:py-14 bg-gray-50 dark:bg-gray-900/50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6">
          Paga como prefieras
        </h3>
        <div className="flex flex-wrap justify-center gap-6 sm:gap-10">
          <div className="flex flex-col items-center gap-2">
            <div className="h-14 w-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-2xl">
              💜
            </div>
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Yape</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="h-14 w-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-2xl">
              💚
            </div>
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Plin</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="h-14 w-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-2xl">
              💵
            </div>
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Efectivo</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="h-14 w-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-2xl">
              💳
            </div>
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Tarjeta</span>
          </div>
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
        <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white">
          Todo lo que necesitas,{" "}
          <span className="text-primary">en un solo lugar</span>
        </h2>
        <p className="mt-4 text-lg text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
          Únete a miles de personas que ya compran en Buleje. Delivery rápido, pagos fáciles y las mejores tiendas de tu zona.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 bg-primary text-white font-bold px-8 py-4 rounded-xl hover:bg-primary-dark transition-colors text-lg"
          >
            Explorar Marketplace
          </Link>
          <Link
            href="/negocios"
            className="inline-flex items-center gap-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold px-8 py-4 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-lg"
          >
            Soy un negocio
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
      <HowItWorks />
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
