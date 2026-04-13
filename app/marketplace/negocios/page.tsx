import type { Metadata } from "next";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import { cacheLife, cacheTag } from "next/cache";

export const metadata: Metadata = {
  title: "Buleje para Negocios — Software ERP para Bodegas del Peru",
  description:
    "Buleje: el sistema completo para tu bodega. Inventario, POS, delivery, fiado digital y facturación SUNAT.",
};

const Footer = dynamic(() => import("@/components/Footer"), { ssr: true });
import BulejeLandingClientLoader from "@/components/BulejeLandingClientLoader";

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
      select: { id: true, name: true, text: true, rating: true, date: true },
    });
    return reviews;
  } catch {
    return [];
  }
}

export default async function NegociosPage() {
  const [stats, reviews] = await Promise.all([
    getMarketplaceStats(),
    getMarketplaceReviews(),
  ]);

  return (
    <>
      <section className="relative overflow-hidden py-20 sm:py-28 lg:py-36 bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-950">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -left-32 h-125 w-125 rounded-full bg-blue-500/20 blur-[120px]" />
          <div className="absolute -bottom-40 -right-40 h-100 w-100 rounded-full bg-violet-500/15 blur-[100px]" />
        </div>
        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-300 mb-6 bg-blue-500/15 rounded-full px-5 py-2 border border-blue-400/30">
            Software ERP + Marketplace
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-tight tracking-tight">
            Tu bodega, <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-400">digital</span>
          </h1>
          <p className="mt-6 text-lg text-blue-200/70 max-w-2xl mx-auto">
            Inventario, punto de venta, delivery y facturación SUNAT. Todo en una plataforma diseñada para bodegas peruanas.
          </p>
          <div className="flex items-center justify-center gap-6 mt-8 text-sm text-blue-300/60">
            <span><strong className="text-white">{stats.storeCount}</strong> tiendas</span>
            <span><strong className="text-white">{stats.productCount}</strong> productos</span>
            <span><strong className="text-white">{stats.avgRating}</strong> rating</span>
          </div>
        </div>
      </section>

      <Suspense fallback={null}>
        <BulejeLandingClientLoader />
      </Suspense>

      <Footer />
    </>
  );
}
