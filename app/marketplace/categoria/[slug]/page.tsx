import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getCategoriaDef,
  listCategoriaSlugs,
  MarketplaceCatalogDB,
} from "@/lib/db/marketplace-catalog.db";
import CategoriaClient from "@/components/marketplace/categoria/CategoriaClient";

const BASE_URL = "https://www.buleje.pe";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * SEO dinamica — 1 metadata por slug. Si el slug no existe, next/navigation
 * maneja el 404 en el componente.
 */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const def = getCategoriaDef(slug);

  if (!def) {
    return {
      title: "Categoria no encontrada — Buleje",
      description: "La categoria que buscas no existe.",
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `${def.label} — Explorar en Buleje Pucallpa`,
    description: `Todos los productos de ${def.label} en bodegas cerca tuyo. ${def.subtitle}`,
    alternates: {
      canonical: `${BASE_URL}/marketplace/categoria/${slug}`,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title: `${def.label} — Buleje`,
      description: def.subtitle,
      url: `${BASE_URL}/marketplace/categoria/${slug}`,
      siteName: "Buleje",
      locale: "es_PE",
      type: "website",
    },
  };
}

/**
 * Permite al build generar rutas estaticas — opcional, se puede comentar
 * si prefieres SSG dinamico. El handler de `notFound()` sigue funcionando
 * para slugs fuera del registro.
 */
export async function generateStaticParams() {
  return listCategoriaSlugs().map((slug) => ({ slug }));
}

/**
 * `/marketplace/categoria/[slug]` — Pagina de listado por categoria estilo
 * Amazon adaptada a Buleje (minimalismo Holded, ilustraciones monoline).
 *
 * Server Component: fetcha productos + tiendas de la categoria y delega
 * todo el estado de filtros/sort al CategoriaClient.
 */
export default async function CategoriaPage({ params }: PageProps) {
  const { slug } = await params;
  const def = getCategoriaDef(slug);

  if (!def) {
    notFound();
  }

  // Fetch inicial en paralelo — productos + tiendas.
  const [initial, storesFacet] = await Promise.all([
    MarketplaceCatalogDB.getProductsByCategory(slug, { limit: 24 }),
    MarketplaceCatalogDB.getStoresWithCategory(slug),
  ]);

  return (
    <CategoriaClient
      slug={slug}
      categoria={def}
      initialProducts={initial.products}
      initialTotal={initial.total}
      storesFacet={storesFacet}
    />
  );
}
