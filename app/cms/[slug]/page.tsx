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
  params: { slug: string };
}): Promise<Metadata> {
  const page = await getPageBySlug(params.slug, false);

  if (!page || page.status !== "PUBLISHED") {
    return {
      title: "Página no encontrada",
    };
  }

  return {
    title: page.metaTitle || page.title,
    description: page.metaDescription || page.description,
    openGraph: page.ogImage
      ? {
          images: [page.ogImage],
        }
      : undefined,
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
  params: { slug: string };
}) {
  // Fetch page from database
  const page = await getPageBySlug(params.slug, true);

  // 404 if not found or not published
  if (!page || page.status !== "PUBLISHED") {
    notFound();
  }

  // Filter visible blocks and sort by order
  const visibleBlocks = page.blocks
    .filter((block) => block.visible)
    .sort((a, b) => a.order - b.order);

  return (
    <main className="dynamic-page">
      {visibleBlocks.map((block) => {
        const BlockComponent = BLOCK_COMPONENTS[block.type];

        if (!BlockComponent) {
          console.warn(
            `[DynamicPage] Block type "${block.type}" not registered`
          );
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
