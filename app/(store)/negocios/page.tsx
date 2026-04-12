import type { Metadata } from "next";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { cacheLife, cacheTag } from "next/cache";

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

// ── Hero Server — dark-bg styled hero ──
async function BulejeHeroServer() {
  const stats = await getMarketplaceStats();

  return (
    <section
      className="relative overflow-hidden py-20 sm:py-28 lg:py-36"
      style={{ background: "#060e08" }}
    >
      {/* Blobs decorativos */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 h-125 w-125 rounded-full bg-[#00B4A6]/15 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-100 w-100 rounded-full bg-[#4ade80]/10 blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
        {/* Badge */}
        <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#00B4A6] mb-6 bg-[#00B4A6]/10 rounded-full px-5 py-2 border border-[#00B4A6]/20">
          🏪 La plataforma #1 para bodegas
        </span>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight">
          El software que potencia{" "}
          <span className="text-transparent bg-clip-text bg-linear-to-r from-[#00B4A6] to-[#4ade80]">
            tu bodega
          </span>
        </h1>
        <p className="mt-5 text-lg sm:text-xl text-white/60 max-w-2xl mx-auto">
          Inventario, punto de venta, delivery, fiado digital y facturacion SUNAT
          — todo en un sistema facil de usar. Empieza gratis hoy.
        </p>

        {/* CTA buttons */}
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 bg-[#00B4A6] hover:bg-primary-dark text-white font-bold px-8 py-4 rounded-xl transition-all shadow-lg shadow-primary/25 text-lg"
          >
            🛒 Explorar Marketplace
          </Link>
          <Link
            href="/marketplace/registrar"
            className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold px-8 py-4 rounded-xl border border-white/20 transition-all text-lg"
          >
            🏪 Abre tu tienda gratis
          </Link>
        </div>

        {/* Stats */}
        <div className="mt-14 grid grid-cols-3 gap-4 max-w-xl mx-auto">
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-2xl sm:text-3xl font-extrabold text-white">
              {stats.storeCount || "10+"}
            </p>
            <p className="text-xs text-white/50 mt-1">Tiendas activas</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-2xl sm:text-3xl font-extrabold text-white">
              {stats.productCount || "500+"}
            </p>
            <p className="text-xs text-white/50 mt-1">Productos</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-2xl sm:text-3xl font-extrabold text-[#00B4A6]">
              ⭐ {stats.avgRating}
            </p>
            <p className="text-xs text-white/50 mt-1">Valoracion promedio</p>
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
    <section className="py-16 sm:py-24 bg-[#00B4A6]/5">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-14">
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#00B4A6] mb-3 bg-[#00B4A6]/8 rounded-full px-4 py-1.5">
            ⭐ Opiniones
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white">
            Lo que dicen nuestros <span className="text-[#00B4A6]">clientes</span>
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
    { num: "01", emoji: "🔍", title: "Busca lo que necesitas", desc: "Entra al Marketplace, explora las tiendas o busca un producto especifico." },
    { num: "02", emoji: "🛒", title: "Agrega al carrito", desc: "Elige tus productos de cualquier tienda. El carrito organiza todo por tienda automaticamente." },
    { num: "03", emoji: "💳", title: "Paga facil", desc: "Elige Yape, Plin o efectivo contra entrega. Sin tarjetas, sin complicaciones." },
    { num: "04", emoji: "🚚", title: "Recibe en tu puerta", desc: "Cada tienda prepara y envia tu pedido. Delivery rapido a toda tu zona." },
  ];

  return (
    <section className="py-16 sm:py-24 bg-white dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#00B4A6] mb-3 bg-[#00B4A6]/8 rounded-full px-4 py-1.5">
            ⚡ Asi de facil
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white">
            ¿Como funciona el{" "}
            <span className="text-[#00B4A6]">Marketplace</span>?
          </h2>
          <p className="mt-3 text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
            Comprar en Buleje es tan facil como ir a la bodega de la esquina — pero sin salir de casa.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s) => (
            <div key={s.num} className="relative bg-gray-50 dark:bg-gray-900 rounded-2xl p-6 border border-gray-100 dark:border-gray-800 hover:border-[#00B4A6]/30 transition-colors group">
              <span className="text-4xl mb-4 block">{s.emoji}</span>
              <span className="text-xs font-bold text-[#00B4A6] tracking-wider">PASO {s.num}</span>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mt-1">{s.title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Categorías — enlaza al marketplace ──
function CategoriesSection() {
  const cats = [
    { emoji: "🛒", label: "Abarrotes", slug: "abarrotes" },
    { emoji: "🧃", label: "Bebidas", slug: "bebidas" },
    { emoji: "🥩", label: "Carnes", slug: "carnes" },
    { emoji: "🥦", label: "Verduras", slug: "verduras" },
    { emoji: "🍎", label: "Frutas", slug: "frutas" },
    { emoji: "🥛", label: "Lacteos", slug: "lacteos" },
    { emoji: "🍞", label: "Panaderia", slug: "panaderia" },
    { emoji: "🧹", label: "Limpieza", slug: "limpieza" },
    { emoji: "🧴", label: "Higiene", slug: "higiene" },
    { emoji: "🍿", label: "Snacks", slug: "snacks" },
    { emoji: "🌭", label: "Embutidos", slug: "embutidos" },
    { emoji: "🧊", label: "Congelados", slug: "congelados" },
  ];

  return (
    <section className="py-16 sm:py-24 bg-gray-50 dark:bg-gray-900/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#00B4A6] mb-3 bg-[#00B4A6]/8 rounded-full px-4 py-1.5">
            📦 Categorias
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white">
            Encuentra{" "}
            <span className="text-[#00B4A6]">todo</span>{" "}
            lo que necesitas
          </h2>
          <p className="mt-3 text-gray-500 dark:text-gray-400 max-w-lg mx-auto">
            Miles de productos de distintas bodegas, organizados para ti.
          </p>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {cats.map((c) => (
            <Link
              key={c.slug}
              href={`/marketplace?categoria=${c.slug}`}
              className="flex flex-col items-center gap-2 bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 hover:border-[#00B4A6]/40 hover:shadow-lg hover:-translate-y-0.5 transition-all group"
            >
              <span className="text-3xl group-hover:scale-110 transition-transform">{c.emoji}</span>
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{c.label}</span>
            </Link>
          ))}
        </div>
        <div className="text-center mt-10">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 text-[#00B4A6] font-bold hover:underline"
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
    { emoji: "📦", title: "Inventario inteligente", desc: "Control de stock en tiempo real con alertas automaticas cuando un producto esta por agotarse." },
    { emoji: "🏪", title: "Punto de venta (POS)", desc: "Caja registradora digital con soporte para Yape, efectivo y multiples metodos de pago." },
    { emoji: "🚚", title: "Delivery integrado", desc: "Tus clientes piden online y reciben en su puerta. Gestion de repartos incluida." },
    { emoji: "📊", title: "Reportes y metricas", desc: "Dashboards con ventas del dia, productos mas vendidos, clientes frecuentes y mas." },
    { emoji: "🧾", title: "Facturacion SUNAT", desc: "Genera boletas y facturas electronicas directamente desde el sistema." },
    { emoji: "📱", title: "Tu tienda online", desc: "Cada negocio recibe su propia tienda web con catalogo, carrito y checkout." },
  ];

  return (
    <section className="py-16 sm:py-24 bg-white dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-secondary mb-3 bg-secondary/8 rounded-full px-4 py-1.5">
            🚀 Funcionalidades
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white">
            Todo lo que tu bodega{" "}
            <span className="text-secondary">necesita</span>
          </h2>
          <p className="mt-3 text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
            Buleje es el sistema ERP disenado para bodegas, minimarkets y tiendas de barrio en Peru.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="bg-gray-50 dark:bg-gray-900 rounded-2xl p-6 border border-gray-100 dark:border-gray-800 hover:border-secondary/30 transition-colors">
              <span className="text-3xl mb-3 block">{f.emoji}</span>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{f.title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Precios / Planes ──
function PricingSection() {
  return (
    <section className="py-16 sm:py-24 bg-gray-50 dark:bg-gray-900/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#00B4A6] mb-3 bg-[#00B4A6]/8 rounded-full px-4 py-1.5">
            💰 Planes
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white">
            Empieza{" "}
            <span className="text-[#00B4A6]">gratis</span>,{" "}
            crece a tu ritmo
          </h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {/* Free */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Gratis</h3>
            <p className="text-3xl font-extrabold text-gray-900 dark:text-white mt-2">S/0<span className="text-sm font-normal text-gray-400">/mes</span></p>
            <ul className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-300">
              <li>✅ Hasta 50 productos</li>
              <li>✅ Tienda online basica</li>
              <li>✅ POS digital</li>
              <li>✅ Reportes basicos</li>
            </ul>
            <Link href="/marketplace/registrar" className="mt-6 block text-center bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-semibold py-2.5 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
              Comenzar gratis
            </Link>
          </div>
          {/* Pro */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border-2 border-[#00B4A6] relative">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#00B4A6] text-white text-xs font-bold px-3 py-1 rounded-full">Popular</span>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Pro</h3>
            <p className="text-3xl font-extrabold text-[#00B4A6] mt-2">S/49<span className="text-sm font-normal text-gray-400">/mes</span></p>
            <ul className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-300">
              <li>✅ Productos ilimitados</li>
              <li>✅ Facturacion SUNAT</li>
              <li>✅ Delivery integrado</li>
              <li>✅ Reportes avanzados</li>
              <li>✅ Soporte prioritario</li>
            </ul>
            <Link href="/marketplace/registrar" className="mt-6 block text-center bg-[#00B4A6] text-white font-semibold py-2.5 rounded-xl hover:bg-primary-dark transition-colors">
              Empezar ahora
            </Link>
          </div>
          {/* Enterprise */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Enterprise</h3>
            <p className="text-3xl font-extrabold text-gray-900 dark:text-white mt-2">A medida</p>
            <ul className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-300">
              <li>✅ Multi-sucursal</li>
              <li>✅ API personalizada</li>
              <li>✅ Integracion ERP</li>
              <li>✅ SLA dedicado</li>
              <li>✅ Onboarding premium</li>
            </ul>
            <Link href="/marketplace/registrar" className="mt-6 block text-center bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-semibold py-2.5 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
              Contactar ventas
            </Link>
          </div>
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
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#00B4A6] mb-3 bg-[#00B4A6]/8 rounded-full px-4 py-1.5">
            ❓ Preguntas frecuentes
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white">
            ¿Tienes dudas?
          </h2>
        </div>
        <div className="space-y-3">
          {faqs.map((f) => (
            <details key={f.q} className="group bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-left font-semibold text-gray-900 dark:text-white hover:text-[#00B4A6] transition-colors">
                <span>{f.q}</span>
                <span className="ml-3 text-gray-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="px-5 pb-5 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
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
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-secondary mb-3 bg-secondary/8 rounded-full px-4 py-1.5">
              🕐 Horarios
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
                  <span className="text-[#00B4A6] font-bold">{h.time}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-linear-to-br from-[#00B4A6] to-primary-dark rounded-2xl p-8 text-white">
            <h3 className="text-2xl font-extrabold mb-4">¿Tienes una bodega?</h3>
            <p className="text-white/80 mb-6">
              Registra tu negocio en Buleje y empieza a vender online hoy. Es gratis, rapido y sin compromisos.
            </p>
            <Link href="/marketplace/registrar" className="inline-flex items-center gap-2 bg-white text-[#00B4A6] font-bold px-6 py-3 rounded-xl hover:bg-white/90 transition-colors">
              🏪 Registrar mi bodega
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
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#00B4A6] mb-3 bg-[#00B4A6]/8 rounded-full px-4 py-1.5">
            📩 Contacto
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white">
            ¿Quieres saber mas?
          </h2>
          <p className="mt-3 text-gray-500 dark:text-gray-400 max-w-lg mx-auto">
            Dejanos tus datos y te contactamos para mostrarte como Buleje puede ayudar a tu negocio.
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
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/40 focus:border-[#00B4A6]"
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
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/40 focus:border-[#00B4A6]"
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
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/40 focus:border-[#00B4A6]"
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
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/40 focus:border-[#00B4A6] resize-none"
            />
          </div>
          <button
            type="submit"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#00B4A6] hover:bg-primary-dark text-white font-bold px-8 py-3.5 rounded-xl transition-all shadow-lg shadow-primary/25"
          >
            📩 Enviar mensaje
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
          <span className="text-transparent bg-clip-text bg-linear-to-r from-[#00B4A6] to-[#4ade80]">hoy</span>
        </h2>
        <p className="mt-4 text-lg text-white/60 max-w-xl mx-auto">
          Unete a las tiendas que ya confian en Buleje para crecer su negocio.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 bg-[#00B4A6] hover:bg-primary-dark text-white font-bold px-8 py-4 rounded-xl transition-all shadow-lg shadow-primary/25 text-lg"
          >
            🛒 Ir al Marketplace
          </Link>
          <Link
            href="/marketplace/registrar"
            className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold px-8 py-4 rounded-xl border border-white/20 transition-all text-lg"
          >
            🏪 Abrir mi tienda
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
      <HowBulejeWorks />
      <CategoriesSection />
      <BulejeFeatures />
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
    <section className="py-16 sm:py-24 bg-[#00B4A6]/5">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-14">
          <div className="h-5 w-24 bg-[#00B4A6]/10 rounded-full mx-auto mb-3 animate-pulse" />
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
