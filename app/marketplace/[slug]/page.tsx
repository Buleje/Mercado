import type { Metadata } from "next";
import StoreDetail from "@/components/marketplace/StoreDetail";

interface Props {
  params: Promise<{ slug: string }>;
}

interface StoreApiData {
  name: string;
  description?: string;
  category?: string;
  zone?: string;
  logo?: string;
  banner?: string;
  rating?: number;
  reviewCount?: number;
  slug?: string;
}

async function fetchStoreData(slug: string): Promise<StoreApiData | null> {
  try {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.buleje.pe";
    const res = await fetch(`${base}/api/marketplace/stores/${slug}`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const { data } = await res.json();
      return data;
    }
  } catch {
    // fallback silencioso
  }
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchStoreData(slug);

  if (!data) {
    return {
      title: "Tienda | Marketplace Buleje",
      description: "Descubre esta tienda en el Marketplace de Buleje.",
    };
  }

  const storeUrl = `https://www.buleje.pe/marketplace/${slug}`;
  const desc =
    data.description ??
    `Compra en ${data.name}, ${data.category ?? "bodega"} en ${data.zone ?? "Pucallpa"}. Delivery rápido en Pucallpa. Paga con Yape o efectivo.`;

  return {
    title: `${data.name} — Tienda en Pucallpa | Marketplace Buleje`,
    description: desc,
    alternates: {
      canonical: storeUrl,
    },
    openGraph: {
      title: `${data.name} — Compra con delivery en Pucallpa`,
      description: desc,
      url: storeUrl,
      siteName: "Buleje",
      locale: "es_PE",
      type: "website",
      ...(data.logo
        ? { images: [{ url: data.logo, width: 400, height: 400, alt: `Logo de ${data.name}` }] }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: `${data.name} | Marketplace Buleje`,
      description: desc,
      ...(data.logo ? { images: [data.logo] } : {}),
    },
  };
}

function StoreJsonLd({ data, slug }: { data: StoreApiData; slug: string }) {
  const storeUrl = `https://www.buleje.pe/marketplace/${slug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: data.name,
    description:
      data.description ??
      `Tienda ${data.category ?? ""} en ${data.zone ?? "Pucallpa"}, Perú. Delivery rápido.`,
    url: storeUrl,
    ...(data.logo && { image: data.logo }),
    address: {
      "@type": "PostalAddress",
      addressLocality: data.zone ?? "Pucallpa",
      addressRegion: "Ucayali",
      addressCountry: "PE",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: -8.3791,
      longitude: -74.5539,
    },
    ...(data.rating && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: data.rating,
        reviewCount: data.reviewCount ?? 0,
        bestRating: 5,
        worstRating: 1,
      },
    }),
    priceRange: "S/",
    paymentAccepted: "Efectivo, Yape",
    areaServed: {
      "@type": "City",
      name: "Pucallpa",
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export default async function StoreDetailPage({ params }: Props) {
  const { slug } = await params;
  const data = await fetchStoreData(slug);

  return (
    <>
      {data && <StoreJsonLd data={data} slug={slug} />}
      <StoreDetail slug={slug} />
    </>
  );
}
