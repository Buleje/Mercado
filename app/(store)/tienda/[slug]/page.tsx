import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { products, slugify, getProductBySlug, categories } from "@/data/products";
import ProductDetailClient from "@/components/ProductDetailClient";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return products.map((p) => ({ slug: slugify(p.name) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) return { title: "Producto no encontrado" };

  const category = categories.find((c) => c.id === product.category);
  const productUrl = `https://www.buleje.pe/tienda/${slug}`;

  return {
    title: `${product.name} — S/${product.price.toFixed(2)} | Buleje Pucallpa`,
    description: `Compra ${product.name} a S/${product.price.toFixed(2)} por ${product.unit} en Pucallpa. ${category?.label ?? "Producto"} con delivery gratis desde S/50. Paga con Yape o efectivo. Buleje — tu bodega de confianza en Pucallpa, Ucayali.`,
    alternates: {
      canonical: productUrl,
    },
    openGraph: {
      title: `${product.name} — S/${product.price.toFixed(2)} | Buleje`,
      description: `${product.name} a S/${product.price.toFixed(2)}/${product.unit}. ${category?.label ?? ""} con delivery gratis en Pucallpa. Paga con Yape o efectivo.`,
      url: productUrl,
      images: [{ url: product.image, width: 600, height: 600, alt: `${product.name} — compra online con delivery en Pucallpa` }],
      type: "website",
      locale: "es_PE",
      siteName: "Buleje",
    },
    twitter: {
      card: "summary_large_image",
      title: `${product.name} — S/${product.price.toFixed(2)}`,
      description: `Compra ${product.name} con delivery en Pucallpa.`,
      images: [product.image],
    },
  };
}

export default async function ProductDetailPage({ params }: Props) {
  const { slug } = await params;
  const product = getProductBySlug(slug);

  if (!product) notFound();

  const category = categories.find((c) => c.id === product.category);

  const breadcrumbs = [
    { name: "Inicio", url: "https://www.buleje.pe" },
    { name: "Tienda", url: "https://www.buleje.pe/tienda" },
    ...(category
      ? [{ name: category.label, url: `https://www.buleje.pe/tienda/categoria/${category.id}` }]
      : []),
    { name: product.name, url: `https://www.buleje.pe/tienda/${slug}` },
  ];

  return (
    <>
      <BreadcrumbSchema items={breadcrumbs} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: product.name,
            image: product.image,
            sku: `BSM-${product.id}`,
            description: `${product.name} — ${category?.label ?? "Producto"} disponible con delivery en Pucallpa. Paga con Yape o efectivo. Buleje.`,
            category: category?.label,
            brand: {
              "@type": "Organization",
              name: "Buleje",
            },
            offers: {
              "@type": "Offer",
              url: `https://www.buleje.pe/tienda/${slug}`,
              price: product.price.toFixed(2),
              priceCurrency: "PEN",
              priceValidUntil: new Date(new Date().getFullYear(), 11, 31).toISOString().split("T")[0],
              availability: product.badge?.toLowerCase() === "agotado"
                ? "https://schema.org/OutOfStock"
                : "https://schema.org/InStock",
              itemCondition: "https://schema.org/NewCondition",
              eligibleRegion: {
                "@type": "Place",
                name: "Pucallpa, Ucayali, Perú",
              },
              shippingDetails: {
                "@type": "OfferShippingDetails",
                shippingRate: {
                  "@type": "MonetaryAmount",
                  value: "0",
                  currency: "PEN",
                },
                shippingDestination: {
                  "@type": "DefinedRegion",
                  addressCountry: "PE",
                  addressRegion: "Ucayali",
                },
                deliveryTime: {
                  "@type": "ShippingDeliveryTime",
                  handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" },
                  transitTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 0, unitCode: "DAY" },
                },
              },
              seller: {
                "@type": "Organization",
                name: "Buleje",
              },
            },
          }),
        }}
      />
      <ProductDetailClient product={product} />
    </>
  );
}
