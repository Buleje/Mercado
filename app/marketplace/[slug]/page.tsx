import type { Metadata } from "next";
import StoreDetail from "@/components/marketplace/StoreDetail";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  try {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.buleje.pe";
    const res = await fetch(`${base}/api/marketplace/stores/${slug}`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const { data } = await res.json();
      return {
        title: `${data.name} | Marketplace Buleje`,
        description:
          data.description ??
          `Compra en ${data.name}, ${data.category} en ${data.zone}. Delivery rápido en Pucallpa.`,
        openGraph: {
          title: `${data.name} | Marketplace Buleje`,
          description: data.description ?? `Tienda ${data.category} en ${data.zone}, Pucallpa.`,
          url: `https://www.buleje.pe/marketplace/${slug}`,
          siteName: "Buleje",
          locale: "es_PE",
          type: "website",
          ...(data.logo ? { images: [{ url: data.logo, width: 400, height: 400, alt: data.name }] } : {}),
        },
      };
    }
  } catch {
    // fallback silencioso
  }

  return {
    title: "Tienda | Marketplace Buleje",
    description: "Descubre esta tienda en el Marketplace de Buleje.",
  };
}

export default async function StoreDetailPage({ params }: Props) {
  const { slug } = await params;
  return <StoreDetail slug={slug} />;
}
