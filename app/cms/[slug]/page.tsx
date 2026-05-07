// ═══════════════════════════════════════════════════════
// DYNAMIC PAGE RENDERER
// Renders CMS pages from database
// ═══════════════════════════════════════════════════════

import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getPageBySlug } from "@/lib/cms-db/pages";
import { Metadata } from "next";
import HeroBlock from "@/components/blocks/HeroBlock";
import AboutBlock from "@/components/blocks/AboutBlock";
import BenefitsBlock from "@/components/blocks/BenefitsBlock";
import ContactBlock from "@/components/blocks/ContactBlock";
import ProductsBlock from "@/components/blocks/ProductsBlock";
import FAQBlock from "@/components/blocks/FAQBlock";
import CTABlock from "@/components/blocks/CTABlock";

// ─── Metadata ───────────────────────────────────────────
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  // SECURITY 2026-05-06: tenantId del header inyectado por proxy.ts.
  const { headers } = await import("next/headers");
  const headersList = await headers();
  const tenantId = headersList.get("x-tenant-id") ?? "main";
  const page = await getPageBySlug(slug, tenantId, false);

  if (!page || page.status !== "PUBLISHED") {
    return {
      title: "Página no encontrada",
    };
  }

  const pageUrl = `https://www.buleje.pe/cms/${slug}`;

  return {
    title: page.metaTitle || page.title,
    description: page.metaDescription || page.description || undefined,
    alternates: { canonical: pageUrl },
    openGraph: {
      title: page.metaTitle || page.title,
      description: page.metaDescription || page.description || undefined,
      url: pageUrl,
      type: "article",
      locale: "es_PE",
      siteName: "Buleje",
      ...(page.ogImage ? { images: [{ url: page.ogImage, width: 1200, height: 630, alt: page.title }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: page.metaTitle || page.title,
      description: page.metaDescription || page.description || undefined,
      ...(page.ogImage ? { images: [page.ogImage] } : {}),
    },
  };
}

// ─── Component Registry ─────────────────────────────────
// Map block types to components
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BLOCK_COMPONENTS: Record<string, React.ComponentType<any>> = {
  hero: HeroBlock,
  about: AboutBlock,
  benefits: BenefitsBlock,
  contact: ContactBlock,
  products: ProductsBlock,
  faq: FAQBlock,
  cta: CTABlock,
};

// ─── Page Component ─────────────────────────────────────
async function DynamicPageContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();
  // Fetch page from database
  const { slug } = await params;
  const { headers } = await import("next/headers");
  const headersList = await headers();
  const tenantId = headersList.get("x-tenant-id") ?? "main";
  const page = await getPageBySlug(slug, tenantId, true);

  // 404 if not found or not published
  if (!page || page.status !== "PUBLISHED") {
    notFound();
  }

  // Filter visible blocks and sort by order
  // TECH-DEBT: Prisma return type when include.blocks is conditionally false/truthy
  // loses the `blocks` field. Cast to access it safely since we always pass true here.
  const pageWithBlocks = page as typeof page & { blocks: Array<{ id?: string; visible: boolean; order: number; type: string; props?: unknown; styles?: Record<string, unknown> }> };
  const visibleBlocks = (pageWithBlocks.blocks ?? [])
    .filter((block) => block.visible)
    .sort((a, b) => a.order - b.order);

  return (
    <main className="dynamic-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: page.title,
            description: page.metaDescription || page.description,
            url: `https://www.buleje.pe/cms/${slug}`,
            ...(page.ogImage ? { image: page.ogImage } : {}),
            author: { "@type": "Organization", name: "Buleje" },
            publisher: {
              "@type": "Organization",
              name: "Buleje",
              logo: { "@type": "ImageObject", url: "https://www.buleje.pe/api/og" },
            },
            // TD-018/Next16: page.createdAt/updatedAt siempre existen (Prisma required fields).
            // El fallback a new Date() violaba cacheComponents ("non-deterministic data during prerender").
            datePublished: page.createdAt ? new Date(page.createdAt).toISOString() : undefined,
            dateModified: page.updatedAt ? new Date(page.updatedAt).toISOString() : undefined,
          }),
        }}
      />
      {visibleBlocks.map((block) => {
        const BlockComponent = BLOCK_COMPONENTS[block.type];

        if (!BlockComponent) {
          if (process.env.NODE_ENV === "development") {
            console.warn(`[DynamicPage] Block type "${block.type}" not registered`);
          }
          return null;
        }

        return (
          <BlockComponent
            key={block.id}
            {...(block.props as Record<string, unknown>)}
            style={block.styles}
          />
        );
      })}
    </main>
  );
}

function CmsPageSkeleton() {
  return (
    <main className="dynamic-page min-h-screen animate-pulse">
      <div className="max-w-4xl mx-auto px-4 py-20 space-y-8">
        <div className="h-12 w-2/3 bg-gray-200 dark:bg-gray-800 rounded" />
        <div className="h-6 w-1/2 bg-gray-200 dark:bg-gray-800 rounded" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-4 bg-gray-100 dark:bg-gray-800 rounded" />
          ))}
        </div>
      </div>
    </main>
  );
}

export default function DynamicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={<CmsPageSkeleton />}>
      <DynamicPageContent params={params} />
    </Suspense>
  );
}
