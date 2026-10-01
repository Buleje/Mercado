import { safeJsonLdStringify } from "@/lib/seo/json-ld";
// ═══════════════════════════════════════════════════════
// PÁGINA POR BLOQUES — /cms/<slug>, /t/<negocio>/cms/<slug>, subdominio
// Muestra la página PUBLICADA del negocio de la visita. Sin negocio → 404.
// ═══════════════════════════════════════════════════════

import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { CmsPagesDB } from "@/lib/db/cms-pages.db";
import RenderBloques from "@/components/cms/RenderBloques";
import { negocioDelHost } from "../_lib/negocio-del-host";

// ─── Metadata ───────────────────────────────────────────
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tenantId = await negocioDelHost();
  const page = tenantId ? await CmsPagesDB.publicadaPorSlug(tenantId, slug) : null;

  if (!page) {
    return {
      title: "Página no encontrada",
    };
  }

  // Relativa: se resuelve contra el host de ESTE negocio, no contra buleje.pe.
  const pageUrl = `/cms/${slug}`;

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

// ─── Page Component ─────────────────────────────────────
async function DynamicPageContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();
  const { slug } = await params;
  const tenantId = await negocioDelHost();
  // 404 si no se sabe de qué negocio es la visita, si no existe o no está publicada
  const page = tenantId ? await CmsPagesDB.publicadaPorSlug(tenantId, slug) : null;
  if (!page) notFound();

  return (
    <main className="dynamic-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLdStringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: page.title,
            description: page.metaDescription || page.description,
            ...(page.ogImage ? { image: page.ogImage } : {}),
            author: { "@type": "Organization", name: "Buleje" },
            publisher: {
              "@type": "Organization",
              name: "Buleje",
              logo: { "@type": "ImageObject", url: "https://www.buleje.pe/api/og" },
            },
            // TD-018/Next16: page.createdAt/updatedAt siempre existen (Prisma required fields).
            // El fallback a new Date() violaba cacheComponents ("non-deterministic data during prerender").
            datePublished: page.createdAt,
            dateModified: page.updatedAt,
          }),
        }}
      />
      <RenderBloques bloques={page.blocks} />
    </main>
  );
}

function CmsPageSkeleton() {
  return (
    <main className="dynamic-page min-h-screen animate-pulse">
      <div className="max-w-4xl mx-auto px-4 py-20 space-y-8">
        <div className="h-12 w-2/3 bg-[var(--rule-base)] rounded" />
        <div className="h-6 w-1/2 bg-[var(--rule-base)] rounded" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-4 bg-[var(--rule-soft)] rounded" />
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
