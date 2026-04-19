import type { Metadata } from "next";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { cacheLife, cacheTag } from "next/cache";
import {
  Store,
  ShoppingCart,
  Search,
  CreditCard,
  Truck,
  Package,
  BarChart3,
  FileText,
  Smartphone,
  Wallet,
  HelpCircle,
  Clock,
  Mail,
  Rocket,
  Star,
  Zap,
  Check,
  ArrowUpRight,
  ChevronDown,
  MapPin,
} from "@buleje/design-system/icons";
import { getProductCategoryIcon } from "@/components/marketplace/_category-icons";
import { cn } from "@/lib/utils";
import { BodegaAbriendo, MotoRuta } from "@/components/ui-system/illustrations/contextual";
import { DoniaElena, CuadernoFiadoReal } from "@/components/ui-system/illustrations/pucallpa-locals";
import { BodegueroCelebrando } from "@/components/ui-system/illustrations/success-moments";

export const metadata: Metadata = {
  title: "Buleje para Negocios — Software ERP para Bodegas del Peru | Inventario, POS, Delivery",
  description:
    "Buleje: el sistema completo para tu bodega. Inventario, punto de venta POS, delivery, fiado digital y facturacion SUNAT. Funciona con Yape y efectivo. Disponible en todo el Peru.",
  alternates: {
    canonical: "https://www.buleje.pe/negocios",
  },
  openGraph: {
    title: "Buleje para Negocios — Software para Bodegas del Peru",
    description:
      "Sistema ERP completo: inventario, POS, delivery, fiado digital y SUNAT. Empieza gratis.",
    url: "https://www.buleje.pe/negocios",
    type: "website",
    locale: "es_PE",
    images: [
      {
        url: "/api/og",
        width: 1200,
        height: 630,
        alt: "Buleje — Software ERP para Bodegas y Tiendas del Peru",
      },
    ],
  },
};

// ── Dynamic sections ──
const Footer = dynamic(() => import("@/components/Footer"), { ssr: true });
import BulejeLandingClientLoader from "@/components/BulejeLandingClientLoader";

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

// ── Cached marketplace reviews from DB ──
async function getMarketplaceReviews() {
  "use cache";
  cacheLife({ revalidate: 600, stale: 120, expire: 1800 });
  cacheTag("marketplace-reviews");
  const { prisma } = await import("@/lib/prisma");
  try {
    const reviews = await prisma.review.findMany({
      where: { status: "approved", rating: { gte: 4 }, storeId: { not: null } },
      orderBy: { date: "desc" },
      take: 6,
      select: {
        id: true,
        name: true,
        text: true,
        rating: true,
        date: true,
      },
    });
    return reviews;
  } catch {
    return [];
  }
}

// ── JSON-LD structured data ──
function BulejeJsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Buleje",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, Android, iOS",
    description:
      "Sistema ERP completo para bodegas y tiendas: inventario, POS, delivery, facturacion SUNAT y marketplace.",
    url: "https://www.buleje.pe/negocios",
    offers: [
      {
        "@type": "Offer",
        price: "0",
        priceCurrency: "PEN",
        name: "Plan Gratis",
        description: "Hasta 50 productos, tienda online basica, POS digital",
      },
      {
        "@type": "Offer",
        price: "49",
        priceCurrency: "PEN",
        name: "Plan Pro",
        description:
          "Productos ilimitados, facturacion SUNAT, delivery integrado, reportes avanzados",
      },
    ],
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      reviewCount: "50",
      bestRating: "5",
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

// ── Hero Server — 2-column B2B con autoridad + ilustracion bodeguera ──
async function BulejeHeroServer() {
  const stats = await getMarketplaceStats();

  return (
    <section
      className="relative overflow-hidden py-16 sm:py-20 lg:py-24"
      style={{ background: "#060e08" }}
    >
      {/* Blobs decorativos */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -top-32 -left-32 h-125 w-125 rounded-full bg-primary/15 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-100 w-100 rounded-full bg-green-400/10 blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-8 lg:gap-12 items-center">
          {/* LEFT — content B2B */}
          <div className="order-2 lg:order-1">
            {/* Eyebrow autoridad */}
            <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.22em] text-white/55 mb-5">
              <Store className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
              Para dueños de bodega
            </span>

            {/* H1 beneficio directo */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-[1.02] tracking-[-0.025em]">
              Vendé más{" "}
              <span className="text-white/50">sin dejar tu caja</span>
            </h1>
            <p className="mt-6 text-base sm:text-lg text-white/65 max-w-xl leading-relaxed">
              Buleje te conecta con vecinos que pueden pedirte al toque.
              Sin comisión fija, sin complicaciones técnicas — solo tu bodega
              online, gestionada desde tu celular.
            </p>

            {/* CTA — primary + secondary (reduce friction) */}
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/marketplace/registrar"
                className="inline-flex items-center gap-2 bg-primary text-white font-bold px-6 py-3 rounded-full transition-all hover:bg-primary/90 active:scale-[0.98] text-sm shadow-lg shadow-primary/20"
              >
                Abre tu tienda gratis
                <ArrowUpRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </Link>
              <Link
                href="#preguntas"
                className="inline-flex items-center gap-2 bg-transparent text-white font-bold px-6 py-3 rounded-full border border-white/20 hover:bg-white/10 transition-all text-sm"
              >
                Ver cómo funciona
              </Link>
            </div>

            {/* Trust row — reduce fricción signup (Cialdini) */}
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[length:var(--ts-2xs)] text-white/55">
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
                14 días gratis
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
                Sin permanencia
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
                Setup 5 minutos
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
                Soporte WhatsApp
              </span>
            </div>

            {/* Stats social proof */}
            <div className="mt-10 pt-8 border-t border-white/10 grid grid-cols-3 gap-4 max-w-lg">
              {[
                { value: stats.storeCount || "10+", label: "Bodegas activas" },
                { value: stats.productCount || "500+", label: "Productos en stock" },
                { value: stats.avgRating, label: "Valoración" },
              ].map((s, i) => (
                <div
                  key={s.label}
                  className={i > 0 ? "border-l border-white/10 pl-4" : ""}
                >
                  <p className="text-xl sm:text-2xl font-extrabold text-white tabular-nums tracking-tight">
                    {s.value}
                  </p>
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.18em] text-white/45 mt-1.5">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT — ilustracion bodeguero */}
          <div
            className="order-1 lg:order-2 flex flex-col items-center gap-5 sm:gap-6"
            aria-hidden="true"
          >
            <div className="relative w-full max-w-[340px] aspect-square rounded-3xl border border-white/10 bg-white/[0.03] flex items-center justify-center overflow-hidden backdrop-blur-sm">
              <div className="absolute inset-0 bg-primary/5" />
              <BodegaAbriendo
                size={240}
                className="relative text-white/80"
              />
              {/* Accent pulse */}
              <div className="absolute top-6 right-6 h-2 w-2 rounded-full bg-primary animate-pulse shadow-lg shadow-primary/50" />
            </div>
            <div className="relative w-full max-w-[340px] aspect-[4/3] rounded-3xl border border-white/10 bg-white/[0.03] flex items-center justify-center overflow-hidden backdrop-blur-sm">
              <DoniaElena
                size={170}
                className="relative text-white/80"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Reviews section ──
async function MarketplaceReviewsServer() {
  const reviews = await getMarketplaceReviews();

  const fallbackReviews = [
    { id: "f1", name: "Maria L.", text: "Increible lo facil que es manejar mi inventario ahora. Antes usaba cuadernos y perdia productos.", rating: 5, date: new Date("2025-12-15") },
    { id: "f2", name: "Carlos R.", text: "Mis clientes piden por WhatsApp y el pedido llega directo al sistema. Me ahorro horas.", rating: 5, date: new Date("2025-11-20") },
    { id: "f3", name: "Ana P.", text: "El punto de venta es super rapido. Mis clientes ya no hacen cola.", rating: 4, date: new Date("2025-10-10") },
  ];

  const displayReviews = reviews.length > 0 ? reviews : fallbackReviews;

  return (
    <section className="py-16 sm:py-24 bg-primary/5">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-14">
          <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-gray-400 mb-3">
            <Star className="h-3 w-3" strokeWidth={2} />
            Opiniones
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white">
            Lo que dicen nuestros <span className="text-primary">clientes</span>
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayReviews.slice(0, 6).map((r) => (
            <div
              key={r.id}
              className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-1 text-yellow-400 mb-2">
                {Array.from({ length: r.rating }, (_, i) => (
                  <span key={i}>★</span>
                ))}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-3">
                &ldquo;{r.text}&rdquo;
              </p>
              <p className="text-xs text-gray-400 font-semibold">
                — {r.name}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Cómo funciona ──
function HowBulejeWorks() {
  const steps = [
    { num: "01", Icon: Search, title: "Buscá lo que necesitás", desc: "Entrá al Marketplace, explorá las tiendas o busca un producto específico." },
    { num: "02", Icon: ShoppingCart, title: "Armá tu pedido", desc: "Elegí tus productos de cualquier tienda. El carrito organiza todo por tienda automáticamente." },
    { num: "03", Icon: CreditCard, title: "Pagá fácil", desc: "Elegí Yape, Plin o efectivo contra entrega. Sin tarjetas, sin complicaciones." },
    { num: "04", Icon: Truck, title: "Recibí en tu puerta", desc: "Cada tienda prepara y envía tu pedido. Delivery rápido a toda tu zona." },
  ];

  return (
    <section className="py-20 sm:py-24 bg-white dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12 sm:mb-16 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-gray-400 mb-3">
            <Zap className="h-3 w-3" strokeWidth={2} />
            Así de fácil
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.02em] text-gray-900 dark:text-white leading-[1.05]">
            ¿Cómo funciona el Marketplace?
          </h2>
          <p className="mt-3 text-gray-500 dark:text-gray-400 leading-relaxed">
            Comprar en Buleje es tan fácil como ir a la bodega de la esquina — pero sin salir de casa.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {steps.map((s) => {
            const SIcon = s.Icon;
            return (
              <div
                key={s.num}
                className="group relative bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800 hover:border-gray-900 dark:hover:border-gray-500 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="h-9 w-9 rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-200">
                    <SIcon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                  </div>
                  <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.2em] text-gray-400 tabular-nums">
                    Paso {s.num}
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-extrabold tracking-tight text-gray-900 dark:text-white">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  {s.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Categorías — enlaza al marketplace ──
function CategoriesSection() {
  const cats = [
    { key: "abarrotes", label: "Abarrotes", slug: "abarrotes" },
    { key: "bebidas", label: "Bebidas", slug: "bebidas" },
    { key: "carnes", label: "Carnes", slug: "carnes" },
    { key: "verduras", label: "Verduras", slug: "verduras" },
    { key: "frutas", label: "Frutas", slug: "frutas" },
    { key: "lacteos", label: "Lácteos", slug: "lacteos" },
    { key: "panadería", label: "Panadería", slug: "panaderia" },
    { key: "limpieza", label: "Limpieza", slug: "limpieza" },
    { key: "otros", label: "Higiene", slug: "higiene" },
    { key: "snacks", label: "Snacks", slug: "snacks" },
    { key: "carnes", label: "Embutidos", slug: "embutidos" },
    { key: "otros", label: "Congelados", slug: "congelados" },
  ];

  return (
    <section className="py-20 sm:py-24 bg-gray-50 dark:bg-gray-900/50 border-y border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-gray-400 mb-3">
            <Package className="h-3 w-3" strokeWidth={2} />
            Categorías
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.02em] text-gray-900 dark:text-white leading-[1.05]">
            Encontrá todo lo que necesitás
          </h2>
          <p className="mt-3 text-gray-500 dark:text-gray-400 leading-relaxed">
            Miles de productos de distintas bodegas, organizados para vos.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {cats.map((c, i) => {
            const CIcon = getProductCategoryIcon(c.key);
            return (
              <Link
                key={`${c.slug}-${i}`}
                href={`/marketplace?categoria=${c.slug}`}
                className="group flex flex-col gap-3 bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-800 hover:border-gray-900 dark:hover:border-gray-500 transition-all"
              >
                <div className="h-9 w-9 rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-200">
                  <CIcon className="h-4 w-4" strokeWidth={1.5} />
                </div>
                <span className="text-sm font-extrabold tracking-tight text-gray-900 dark:text-white">
                  {c.label}
                </span>
              </Link>
            );
          })}
        </div>
        <div className="mt-8">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-900 dark:text-white link-underline"
          >
            Ver todas las tiendas en el Marketplace →
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Lo que ofrece Buleje (features) ──
function BulejeFeatures() {
  const features = [
    { Icon: Package, title: "Inventario inteligente", desc: "Control de stock en tiempo real con alertas automáticas cuando un producto está por agotarse." },
    { Icon: Store, title: "Punto de venta (POS)", desc: "Caja registradora digital con soporte para Yape, efectivo y múltiples métodos de pago." },
    { Icon: Truck, title: "Delivery integrado", desc: "Tus clientes piden online y reciben en su puerta. Gestión de repartos incluida." },
    { Icon: BarChart3, title: "Reportes y métricas", desc: "Dashboards con ventas del día, productos más vendidos, clientes frecuentes y más." },
    { Icon: FileText, title: "Facturación SUNAT", desc: "Generá boletas y facturas electrónicas directamente desde el sistema." },
    { Icon: Smartphone, title: "Tu tienda online", desc: "Cada negocio recibe su propia tienda web con catálogo, carrito y checkout." },
  ];

  return (
    <section className="py-20 sm:py-24 bg-white dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-gray-400 mb-3">
            <Rocket className="h-3 w-3" strokeWidth={2} />
            Funcionalidades
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.02em] text-gray-900 dark:text-white leading-[1.05]">
            Todo lo que tu bodega necesita
          </h2>
          <p className="mt-3 text-gray-500 dark:text-gray-400 leading-relaxed">
            Buleje es el sistema ERP diseñado para bodegas, minimarkets y tiendas de barrio en Perú.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => {
            const FIcon = f.Icon;
            return (
              <div
                key={f.title}
                className="group bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800 hover:border-gray-900 dark:hover:border-gray-500 transition-colors"
              >
                <div className="h-10 w-10 rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-200 mb-5">
                  <FIcon className="h-4 w-4" strokeWidth={1.5} />
                </div>
                <h3 className="text-lg font-extrabold tracking-tight text-gray-900 dark:text-white">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  {f.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Precios / Planes ──
function PricingSection() {
  const plans = [
    {
      name: "Gratis",
      price: "S/0",
      period: "/mes",
      priceColor: "text-gray-900 dark:text-white",
      features: ["Hasta 50 productos", "Tienda online básica", "POS digital", "Reportes básicos"],
      cta: "Comenzar gratis",
      ctaVariant: "secondary" as const,
      popular: false,
    },
    {
      name: "Pro",
      price: "S/49",
      period: "/mes",
      priceColor: "text-gray-900 dark:text-white",
      features: ["Productos ilimitados", "Facturación SUNAT", "Delivery integrado", "Reportes avanzados", "Soporte prioritario"],
      cta: "Empezar ahora",
      ctaVariant: "primary" as const,
      popular: true,
    },
    {
      name: "Enterprise",
      price: "A medida",
      period: "",
      priceColor: "text-gray-900 dark:text-white",
      features: ["Multi-sucursal", "API personalizada", "Integración ERP", "SLA dedicado", "Onboarding premium"],
      cta: "Contactar ventas",
      ctaVariant: "secondary" as const,
      popular: false,
    },
  ];

  return (
    <section className="py-20 sm:py-24 bg-gray-50 dark:bg-gray-900/50 border-y border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-gray-400 mb-3">
            <Wallet className="h-3 w-3" strokeWidth={2} />
            Planes
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.02em] text-gray-900 dark:text-white leading-[1.05]">
            Empezá gratis, crecé a tu ritmo
          </h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-4 max-w-5xl">
          {plans.map((p) => (
            <div
              key={p.name}
              className={cn(
                "relative bg-white dark:bg-gray-900 rounded-xl p-6 sm:p-7 transition-colors",
                p.popular
                  ? "border-2 border-gray-900 dark:border-white"
                  : "border border-gray-200 dark:border-gray-800",
              )}
            >
              {p.popular && (
                <span className="absolute -top-2.5 left-6 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.15em] px-2.5 py-1 rounded-full">
                  Popular
                </span>
              )}
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.2em] text-gray-400">
                Plan
              </p>
              <h3 className="mt-1 text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white">
                {p.name}
              </h3>
              <p className={cn("mt-4 text-4xl font-extrabold tracking-tight tabular-nums", p.priceColor)}>
                {p.price}
                {p.period && (
                  <span className="text-sm font-semibold text-gray-400">{p.period}</span>
                )}
              </p>
              <ul className="mt-6 space-y-2.5">
                {p.features.map((feat) => (
                  <li
                    key={feat}
                    className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300"
                  >
                    <Check
                      className="h-4 w-4 mt-0.5 shrink-0 text-gray-900 dark:text-white"
                      strokeWidth={2}
                    />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/marketplace/registrar"
                className={cn(
                  "mt-7 block text-center font-bold text-sm py-2.5 rounded-full transition-colors border",
                  p.ctaVariant === "primary"
                    ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white hover:bg-gray-800 dark:hover:bg-gray-100"
                    : "bg-transparent text-gray-900 dark:text-white border-gray-200 dark:border-gray-700 hover:border-gray-900 dark:hover:border-gray-400",
                )}
              >
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Value stack B2B — 4 beneficios con iconos + ilustraciones ──
function ValueStackB2B() {
  const values = [
    {
      Icon: Rocket,
      title: "Sin código",
      desc: "Tu tienda lista en 5 minutos. Sin instalar nada, sin pagar diseñador.",
    },
    {
      IconIllustration: MotoRuta,
      title: "Delivery gestionado",
      desc: "Nosotros coordinamos la entrega. Vos te dedicás a vender.",
    },
    {
      Icon: Wallet,
      title: "Pagos locales",
      desc: "Yape, Plin, efectivo — lo que tus clientes ya usan cada día.",
    },
    {
      Icon: BarChart3,
      title: "Reportes diarios",
      desc: "Sabés cuánto vendiste hoy en tiempo real, desde tu celular.",
    },
  ];

  return (
    <section className="py-20 sm:py-24 bg-white dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-gray-400 mb-3">
            <Zap className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
            Por qué Buleje
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.02em] text-gray-900 dark:text-white leading-[1.05]">
            Diseñado para bodegueros peruanos
          </h2>
          <p className="mt-3 text-gray-500 dark:text-gray-400 leading-relaxed">
            4 beneficios pensados para tu realidad: celular en mano, tiempo
            escaso, clientes del barrio.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {values.map((v) => {
            const IconComp = v.Icon;
            const IllComp = v.IconIllustration;
            return (
              <div
                key={v.title}
                className="group bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800 hover:border-primary/40 hover:-translate-y-0.5 transition-all"
              >
                <div className="h-12 w-12 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center text-primary mb-5">
                  {IconComp ? (
                    <IconComp className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                  ) : IllComp ? (
                    <IllComp size={28} strokeWidth={1.75} className="text-primary" />
                  ) : null}
                </div>
                <h3 className="text-lg font-extrabold tracking-tight text-gray-900 dark:text-white">
                  {v.title}
                </h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  {v.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Testimonios bodegueros — social proof con ilustraciones locales ──
function BodegueroTestimonials() {
  const testimonials = [
    {
      quote: "Desde que abrí mi tienda en Buleje, vendo 40% más. Los vecinos piden por WhatsApp y ya no tengo que atender cola tras cola.",
      name: "Doña Elena",
      role: "Buleje · Callería",
      stat: "+40% ventas primer mes",
      Illustration: DoniaElena,
    },
    {
      quote: "Antes anotaba todo en cuaderno. Ahora Buleje me dice qué se está acabando y cuánto gané hoy. Me ahorra 2 horas cada noche.",
      name: "Don Julio",
      role: "Minimarket Yarinacocha",
      stat: "2h ahorradas cada día",
      Illustration: CuadernoFiadoReal,
    },
    {
      quote: "Pucallpa necesitaba algo así. Mis clientes piden desde la casa y pagan con Yape. Cero vueltos, cero problemas.",
      name: "Sra. Rosa",
      role: "Bodega Manantay",
      stat: "100% pagos digitales",
      Illustration: BodegueroCelebrando,
    },
  ];

  return (
    <section className="py-20 sm:py-24 bg-gray-50 dark:bg-gray-900/50 border-y border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-gray-400 mb-3">
            <Star className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
            Casos reales
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.02em] text-gray-900 dark:text-white leading-[1.05]">
            Bodegueros que ya venden más
          </h2>
          <p className="mt-3 text-gray-500 dark:text-gray-400 leading-relaxed">
            Historias de dueños de bodega en Pucallpa que crecieron con Buleje.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {testimonials.map((t) => {
            const Ill = t.Illustration;
            return (
              <div
                key={t.name}
                className="flex flex-col bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-200 dark:border-gray-800 hover:border-gray-900 dark:hover:border-gray-500 transition-colors"
              >
                <div className="h-20 w-20 rounded-xl bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-200 mb-4">
                  <Ill size={64} strokeWidth={1.5} />
                </div>
                <blockquote className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed italic mb-5 flex-1">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-800">
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">
                      {t.name}
                    </p>
                    <p className="text-[length:var(--ts-2xs)] text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                      {t.role}
                    </p>
                  </div>
                  <span className="text-[length:var(--ts-2xs)] font-bold text-primary bg-primary/10 px-2 py-1 rounded-full whitespace-nowrap">
                    {t.stat}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── FAQ del Marketplace ──
function MarketplaceFAQ() {
  const faqs = [
    { q: "¿Que es Buleje?", a: "Buleje es una plataforma que conecta bodegas y tiendas de barrio con sus clientes a traves de un marketplace digital. Cada tienda tiene su propio panel de administracion con inventario, ventas, delivery y mas." },
    { q: "¿Como compro en el Marketplace?", a: "Entra a la seccion Marketplace, explora las tiendas disponibles, agrega productos al carrito y completa tu pedido. Puedes pagar con Yape, Plin o efectivo contra entrega." },
    { q: "¿El delivery es gratis?", a: "El delivery es gratis en pedidos mayores a S/50 dentro de la zona de cobertura de cada tienda. Para pedidos menores, el costo de envio lo define cada tienda." },
    { q: "¿Que productos puedo encontrar?", a: "Abarrotes, bebidas, carnes, frutas, verduras, lacteos, productos de limpieza, higiene personal, snacks y mucho mas. Cada tienda ofrece su propio catalogo de productos." },
    { q: "¿Puedo pagar con Yape?", a: "Si, aceptamos Yape y Plin como metodos de pago. Tambien puedes pagar en efectivo cuando recibas tu pedido." },
    { q: "¿Como abro mi tienda en Buleje?", a: "Haz clic en 'Abre tu tienda gratis', completa el registro con los datos de tu negocio y en minutos tendras tu tienda online lista para vender." },
    { q: "¿Cuanto demora el delivery?", a: "El tiempo promedio de entrega es de 30 minutos dentro de la zona de cobertura. Puede variar segun la distancia y la disponibilidad del repartidor." },
    { q: "¿Puedo devolver un producto?", a: "Si recibiste un producto en mal estado o diferente al pedido, contacta a la tienda a traves del Marketplace y te lo cambian o devuelven tu dinero dentro de 24 horas." },
  ];

  return (
    <section id="preguntas" className="py-16 sm:py-24 bg-white dark:bg-gray-950">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-gray-400 mb-3">
            <HelpCircle className="h-3 w-3" strokeWidth={2} />
            Preguntas frecuentes
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.02em] text-gray-900 dark:text-white leading-[1.05]">
            ¿Tenés dudas?
          </h2>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-800 border-y border-gray-200 dark:border-gray-800">
          {faqs.map((f) => (
            <details
              key={f.q}
              className="group"
            >
              <summary className="flex items-center justify-between cursor-pointer py-5 text-left font-extrabold text-gray-900 dark:text-white hover:text-gray-600 dark:hover:text-gray-400 transition-colors list-none">
                <span>{f.q}</span>
                <ChevronDown
                  className="ml-3 h-4 w-4 shrink-0 text-gray-400 group-open:rotate-180 transition-transform"
                  strokeWidth={1.75}
                />
              </summary>
              <div className="pb-5 pr-8 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                {f.a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Horarios ──
function ScheduleSection() {
  const hours = [
    { day: "Lunes a Viernes", time: "7:00 AM — 10:00 PM" },
    { day: "Sabados", time: "7:00 AM — 10:00 PM" },
    { day: "Domingos", time: "8:00 AM — 8:00 PM" },
  ];

  return (
    <section className="py-16 sm:py-24 bg-gray-50 dark:bg-gray-900/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-gray-400 mb-3">
              <Clock className="h-3 w-3" strokeWidth={2} />
              Horarios
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white">
              Horario de{" "}
              <span className="text-secondary">atencion</span>
            </h2>
            <p className="mt-3 text-gray-500 dark:text-gray-400">
              El Marketplace esta disponible las 24 horas. Los pedidos se procesan dentro del horario de cada tienda.
            </p>
            <div className="mt-6 space-y-3">
              {hours.map((h) => (
                <div key={h.day} className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                  <span className="font-semibold text-gray-900 dark:text-white">{h.day}</span>
                  <span className="text-primary font-bold">{h.time}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-2xl p-8 border border-gray-900 dark:border-gray-200">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.2em] text-white/55 dark:text-gray-500 mb-3">
              Dueños de bodega
            </p>
            <h3 className="text-2xl font-extrabold tracking-tight mb-4">
              ¿Tenés una bodega?
            </h3>
            <p className="text-white/70 dark:text-gray-600 mb-6 text-sm leading-relaxed">
              Registrá tu negocio en Buleje y empezá a vender online hoy. Es gratis, rápido y sin compromisos.
            </p>
            <Link
              href="/marketplace/registrar"
              className="inline-flex items-center gap-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-bold px-5 py-2.5 rounded-full text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Registrar mi bodega
              <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Formulario de contacto ──
function ContactSection() {
  return (
    <section id="contacto" className="py-16 sm:py-24 bg-white dark:bg-gray-950">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-gray-400 mb-3">
            <Mail className="h-3 w-3" strokeWidth={2} />
            Contacto
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.02em] text-gray-900 dark:text-white leading-[1.05]">
            ¿Querés saber más?
          </h2>
          <p className="mt-3 text-gray-500 dark:text-gray-400 max-w-lg mx-auto leading-relaxed">
            Dejanos tus datos y te contactamos para mostrarte cómo Buleje puede ayudar a tu negocio.
          </p>
        </div>
        <form
          action="/api/contact"
          method="POST"
          className="bg-gray-50 dark:bg-gray-900 rounded-2xl p-6 sm:p-8 border border-gray-100 dark:border-gray-800 space-y-5"
        >
          <div className="grid sm:grid-cols-2 gap-5">
            <div>
              <label htmlFor="contact-name" className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">
                Nombre
              </label>
              <input
                id="contact-name"
                name="name"
                type="text"
                required
                placeholder="Tu nombre"
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
            </div>
            <div>
              <label htmlFor="contact-phone" className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">
                Telefono / WhatsApp
              </label>
              <input
                id="contact-phone"
                name="phone"
                type="tel"
                required
                placeholder="999 999 999"
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
            </div>
          </div>
          <div>
            <label htmlFor="contact-email" className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">
              Email (opcional)
            </label>
            <input
              id="contact-email"
              name="email"
              type="email"
              placeholder="tu@email.com"
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
            />
          </div>
          <div>
            <label htmlFor="contact-message" className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">
              Mensaje
            </label>
            <textarea
              id="contact-message"
              name="message"
              required
              rows={4}
              placeholder="Cuentanos sobre tu negocio..."
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary resize-none"
            />
          </div>
          <button
            type="submit"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold px-7 py-3 rounded-full text-sm hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
          >
            Enviar mensaje
            <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
          </button>
        </form>
      </div>
    </section>
  );
}

// ── CTA Final ──
function FinalCTA() {
  return (
    <section className="py-16 sm:py-24 bg-linear-to-br from-[#060e08] to-[#0a1f0d] text-white">
      <div className="max-w-4xl mx-auto px-4 text-center">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold">
          Empieza a comprar o vender{" "}
          <span className="text-transparent bg-clip-text bg-linear-to-r from-primary to-green-400">hoy</span>
        </h2>
        <p className="mt-4 text-lg text-white/60 max-w-xl mx-auto">
          Unete a las tiendas que ya confian en Buleje para crecer su negocio.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 bg-white text-gray-900 font-bold px-6 py-3 rounded-full transition-all hover:bg-gray-100 text-sm"
          >
            Ir al Marketplace
            <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
          </Link>
          <Link
            href="/marketplace/registrar"
            className="inline-flex items-center gap-2 bg-transparent text-white font-bold px-6 py-3 rounded-full border border-white/20 hover:bg-white/10 transition-all text-sm"
          >
            Abrir mi tienda
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Main page ──
export default async function NegociosPage() {
  return (
    <main id="main-content">
      <BulejeJsonLd />
      <BulejeLandingClientLoader />
      <Suspense fallback={<div className="h-[70vh] bg-[#060e08]" />}>
        <BulejeHeroServer />
      </Suspense>
      <ValueStackB2B />
      <HowBulejeWorks />
      <CategoriesSection />
      <BulejeFeatures />
      <BodegueroTestimonials />
      <PricingSection />
      <Suspense fallback={<ReviewsSkeleton />}>
        <MarketplaceReviewsServer />
      </Suspense>
      <ScheduleSection />
      <MarketplaceFAQ />
      <ContactSection />
      <FinalCTA />
      <Footer />
    </main>
  );
}

function ReviewsSkeleton() {
  return (
    <section className="py-16 sm:py-24 bg-primary/5">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-14">
          <div className="h-5 w-24 bg-primary/10 rounded-full mx-auto mb-3 animate-pulse" />
          <div className="h-10 w-64 bg-gray-200 dark:bg-gray-700 rounded-xl mx-auto animate-pulse" />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700 animate-pulse">
              <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
              <div className="h-16 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
