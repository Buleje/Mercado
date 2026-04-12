import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; productId: string }>;
}): Promise<Metadata> {
  const { slug, productId } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://buleje.com";

  try {
    const res = await fetch(`${baseUrl}/api/marketplace/products/${productId}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return { title: "Producto no encontrado" };
    const { data } = await res.json();
    return {
      title: data.metaTitle || `${data.name} — ${data.store?.name || "Buleje"}`,
      description:
        data.metaDescription || data.description || `Compra ${data.name} en Buleje Marketplace`,
      openGraph: {
        title: data.metaTitle || data.name,
        description: data.metaDescription || data.description || "",
        images: data.ogImage || data.image ? [{ url: data.ogImage || data.image }] : [],
        url: `${baseUrl}/marketplace/${slug}/producto/${productId}`,
        type: "website",
      },
    };
  } catch {
    return { title: "Producto — Buleje" };
  }
}

export { default } from "./ProductDetailPage";
