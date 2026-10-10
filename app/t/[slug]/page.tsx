import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Enchufe } from "@/lib/extensiones/Enchufe";
import { resolverPiezas } from "@/lib/extensiones/resolver";
import { ENCHUFE_PAGINA, pideSinPiezas, type ParametrosDeBusqueda } from "@/extensiones/_contrato";
import { PaginaGeneral, loadPageData } from "@/components/store/pagina-publica/PaginaGeneral";
import { accesoPaginaPublica, previewDe } from "@/components/store/pagina-publica/datos-pagina-general";

interface TenantLandingProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<ParametrosDeBusqueda>;
}

export async function generateMetadata({
  params,
}: TenantLandingProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadPageData(slug);
  if (!data) return { title: "Tienda no encontrada" };

  const { customization, displayName } = data;
  // Tienda individual: el título es solo el nombre del comercio.
  // `absolute` evita que el template `%s | Buleje` del root layout añada
  // el sufijo del marketplace a la página propia del negocio.
  //
  // `??` NO servía acá: el editor del storefront guarda "" cuando el dueño
  // deja el campo en blanco, y `"" ?? displayName` devuelve "". El resultado
  // era `<title></title>` y ningún og:title en TODA landing white-label —
  // compartida por WhatsApp mostraba la URL pelada. Un campo vacío es un
  // campo sin llenar, así que se trata como ausente (mismo criterio que el
  // `||` + trim de `displayName` acá arriba).
  const primero = (...valores: Array<string | null | undefined>): string | undefined =>
    valores.find((v) => typeof v === "string" && v.trim() !== "")?.trim();

  const title = primero(customization.metaTitle, displayName) ?? displayName;
  const description =
    primero(
      customization.metaDescription,
      customization.heroSubtitle,
      `Compra en ${displayName} con delivery rápido. Paga con Yape o efectivo.`,
    ) ?? `Compra en ${displayName} con delivery rápido. Paga con Yape o efectivo.`;
  // Audit 2026-05-17 02-P2-4: fallback a /api/og?title=...&subtitle=...
  // cuando el tenant no tiene OG personalizada. Antes, sin ogImage ni
  // heroImage, el share en WhatsApp/FB no mostraba preview visual —
  // muy mala UX en discovery. Ahora siempre hay una OG con 1200×630.
  const ogFallback = `${process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe"}/api/og?title=${encodeURIComponent(displayName)}&subtitle=${encodeURIComponent("Compra con delivery rápido en Ciudad Constitución")}`;
  // Mismo criterio que el título: una URL vacía no es una imagen, y con `??`
  // ganaba sobre el fallback y emitía `images:[{url:""}]` — un preview roto.
  const ogImage = primero(customization.ogImageUrl, customization.heroImageUrl, ogFallback) ?? ogFallback;

  return {
    title: { absolute: title },
    description,
    // Audit 2026-05-17 02-P1-06: sin canonical, Google puede indexar duplicados
    // (preview=true vs normal, query strings). Fija URL canónica al slug puro.
    alternates: {
      canonical: `${process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe"}/t/${slug}`,
    },
    openGraph: {
      title,
      description,
      ...(ogImage ? { images: [{ url: ogImage, width: 1200, height: 630 }] } : {}),
      type: "website",
      locale: "es_PE",
      siteName: displayName,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

/**
 * Next 16 Cache Components canonical pattern:
 * 1. export default Page() síncrona → shell con <Suspense>
 * 2. TenantLandingContent async con await connection() → dynamic rendering
 * Sin esto, cacheComponents: true rechaza uncached data fuera de Suspense.
 */

function TenantPageSkeleton() {
  return (
    <main className="min-h-screen bg-[var(--surface-canvas)] animate-pulse">
      <section className="bg-[var(--accent)]" style={{ minHeight: "320px" }}>
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <div className="w-24 h-24 rounded-3xl mx-auto mb-6 bg-white/20" />
          <div className="h-10 w-60 bg-white/20 rounded-lg mx-auto mb-3" />
          <div className="h-5 w-80 bg-white/15 rounded mx-auto" />
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="h-8 w-48 bg-[var(--rule-soft)] dark:bg-[var(--surface-sunken)] rounded mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-[var(--surface-raised)] shadow-sm border border-[var(--rule-base)] overflow-hidden">
              <div className="aspect-square bg-[var(--surface-sunken)]" />
              <div className="p-3 space-y-2">
                <div className="h-4 w-24 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded" />
                <div className="h-5 w-16 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

/**
 * ADR-458 · la ruta decide QUÉ página se ve; la página general vive en
 * `components/store/pagina-publica/PaginaGeneral.tsx`.
 *
 * Primero los controles de siempre (negocio que existe; publicado o vista
 * previa de su dueño). Después: si el superadmin le prendió a este negocio una
 * «página propia» (enchufe `tienda.pagina`), se dibuja esa, con la general como
 * respaldo si falla o tarda; si no, la general directo — el mismo HTML de
 * antes de ADR-458. La consulta de piezas es la de ADR-457 (con caché por
 * negocio y nunca tira: ante un error, ninguna → la general).
 */
async function TenantLandingContent({ params, searchParams }: TenantLandingProps) {
  await connection();
  const { slug } = await params;
  const busqueda = await searchParams;
  const acceso = await accesoPaginaPublica(slug, previewDe(busqueda));
  if (!acceso) notFound();
  const { tenant } = acceso.datos;

  // `?sinPiezas=1`: la general pura (a donde recarga el navegador si una pieza falló al dibujarse).
  const propias = pideSinPiezas(busqueda) ? [] : await resolverPiezas(tenant.id, ENCHUFE_PAGINA);
  // Sin página propia, la general se ARMA acá mismo (llamada, no `<PaginaGeneral>`):
  // así esta ruta entrega el mismo árbol que antes de ADR-458 y el HTML sale en
  // los mismos pedazos. Como elemento aparte, React lo partía en 10 segmentos
  // más (medido 01-10: mismo DOM final, más HTML).
  if (!propias.some((p) => p.entrada.pagina)) return PaginaGeneral({ slug, searchParams: busqueda });
  return (
    <Enchufe
      nombre={ENCHUFE_PAGINA}
      tenantId={tenant.id}
      slug={tenant.slug}
      searchParams={busqueda}
      fallback={<PaginaGeneral slug={slug} searchParams={busqueda} />}
    />
  );
}

export default function TenantLandingPage({ params, searchParams }: TenantLandingProps) {
  return (
    <Suspense fallback={<TenantPageSkeleton />}>
      <TenantLandingContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
