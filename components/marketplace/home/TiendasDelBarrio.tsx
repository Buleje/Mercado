import dynamic from "next/dynamic";
import { Reveal } from "@/components/landing/Reveal";
import { getFeaturedStoresWithProducts } from "@/lib/db/marketplace-featured.db";

// Banda animada con los logos de TODAS las tiendas (marquee infinito).
const StoreLogosMarquee = dynamic(
  () => import("@/components/marketplace/home/StoreLogosMarquee"),
);

// perf audit P1: el marquee de logos también se resuelve en el SERVER (los
// logos vienen ya pintados, sin fetch client). getFeaturedStoresWithProducts
// cachea internamente (getOrSet). productsPerStore:0 = solo identidad de tienda.
async function StoreLogosMarqueeRSC() {
  const stores = await getFeaturedStoresWithProducts({ limit: 20, productsPerStore: 0 }).catch(
    () => [] as Awaited<ReturnType<typeof getFeaturedStoresWithProducts>>,
  );
  return (
    <StoreLogosMarquee
      initialStores={stores.map((s) => ({
        slug: s.slug,
        name: s.name,
        logo: s.logo,
        category: s.category,
        zone: s.zone,
        rating: s.rating,
        reviewCount: s.reviewCount,
        productsCount: s.productsCount,
      }))}
    />
  );
}

export default function TiendasDelBarrio() {
  return (
    <Reveal>
      <StoreLogosMarqueeRSC />
    </Reveal>
  );
}
