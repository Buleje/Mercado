// ═══════════════════════════════════════════════════════
// DYNAMIC PAGE RENDERER
// Renders CMS pages from database
// ═══════════════════════════════════════════════════════

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
  const page = await getPageBySlug(slug, false);

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
export default async function DynamicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // Fetch page from database
  const { slug } = await params;
  const page = await getPageBySlug(slug, true);

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
              logo: { "@type": "ImageObject", url: "https://www.buleje.pe/og-image.jpg" },
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
