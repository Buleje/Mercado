import { Suspense } from "react";
import dynamic from "next/dynamic";
import { Reveal } from "@/components/landing/Reveal";
import CatalogSortTabs from "@/components/marketplace/home/CatalogSortTabs";
import SectionHeading from "@/components/marketplace/home/SectionHeading";

// Catálogo de productos completo (fusión /marketplace → /, Brandon 2026-06-08).
const HomeCatalog = dynamic(
  () => import("@/components/marketplace/home/HomeCatalog"),
);

export default function CatalogoSeccion() {
  return (
    <Reveal>
      <section
        id="catalogo"
        aria-label="Catálogo de productos"
        className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 scroll-mt-24"
      >
        <SectionHeading eyebrow="Catálogo" title="Todos los productos" />
        {/* Tabs de orden → un solo grid que se reordena; setea ?sort= que el catálogo consume. */}
        <Suspense fallback={<div className="mb-3 h-11 border-b border-[var(--rule-soft)]" />}>
          <CatalogSortTabs />
        </Suspense>
        <HomeCatalog />
      </section>
    </Reveal>
  );
}
