/**
 * JSON-LD structured data generators for Programmatic SEO.
 *
 * Buleje = Software SaaS ERP para bodegas y tiendas de todo Peru.
 * Created in Pucallpa, national coverage.
 */

import type { Zone } from "@/data/zones";
import type { Category } from "@/data/products";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe";

// ── SoftwareApplication (main platform schema) ─────────────────────

export function generateSoftwareApplicationLD(zone?: Zone) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Buleje",
    alternateName: "Buleje ERP",
    description:
      "Software ERP para bodegas y tiendas del Peru. Inventario, ventas POS, delivery, fiado digital, facturacion SUNAT y reportes automaticos.",
    url: BASE_URL,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, Android, iOS",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "PEN",
      description: "Plan gratuito disponible. Planes de pago desde S/49/mes.",
    },
    creator: {
      "@type": "Organization",
      name: "Buleje",
      url: BASE_URL,
      address: {
        "@type": "PostalAddress",
        addressLocality: "Pucallpa",
        addressRegion: "Ucayali",
        addressCountry: "PE",
      },
    },
    ...(zone
      ? {
          areaServed: {
            "@type": "City",
            name: zone.name,
          },
        }
      : {
          areaServed: {
            "@type": "Country",
            name: "Peru",
          },
        }),
    featureList: [
      "Inventario en tiempo real",
      "Punto de venta POS",
      "Delivery a domicilio",
      "Fiado digital con score de credito",
      "Facturacion electronica SUNAT",
      "Reportes automaticos WhatsApp",
      "Multi-tienda",
      "Yape y Plin integrados",
    ],
  };
}

// ── ItemList (category product listing) ─────────────────────────────

type ProductItem = {
  name: string;
  price: number;
  image: string;
  url: string;
};

export function generateItemListLD(
  listName: string,
  products: ProductItem[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: listName,
    numberOfItems: products.length,
    itemListElement: products.slice(0, 30).map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Product",
        name: p.name,
        image: p.image.startsWith("http") ? p.image : `${BASE_URL}${p.image}`,
        url: p.url,
        offers: {
          "@type": "Offer",
          price: p.price,
          priceCurrency: "PEN",
          availability: "https://schema.org/InStock",
          seller: {
            "@type": "Organization",
            name: "Buleje",
          },
        },
      },
    })),
  };
}

// ── FAQPage ─────────────────────────────────────────────────────────

type FAQItem = {
  question: string;
  answer: string;
};

export function generateFAQPageLD(faqs: FAQItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

// ── Zone landing (SaaS platform in a city) ──────────────────────────

export function generateZoneLandingLD(
  zone: Zone,
  categories: Category[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `Buleje — Software para Bodegas en ${zone.name}`,
    description: zone.description,
    url: `${BASE_URL}/zona/${zone.slug}`,
    isPartOf: {
      "@type": "WebSite",
      name: "Buleje",
      url: BASE_URL,
    },
    about: {
      "@type": "SoftwareApplication",
      name: "Buleje ERP",
      applicationCategory: "BusinessApplication",
      areaServed: {
        "@type": "City",
        name: zone.name,
        containedInPlace: {
          "@type": "AdministrativeArea",
          name: zone.region,
        },
      },
    },
    mainEntity: {
      "@type": "ItemList",
      name: `Categorias de productos en ${zone.name}`,
      itemListElement: categories.map((cat, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: cat.label,
        url: `${BASE_URL}/zona/${zone.slug}/${cat.id}`,
      })),
    },
  };
}

// ── Breadcrumb helper ───────────────────────────────────────────────

export function zoneBreadcrumbs(
  zone: Zone,
  category?: { id: string; label: string },
) {
  const items = [
    { name: "Buleje", url: BASE_URL },
    { name: zone.name, url: `${BASE_URL}/zona/${zone.slug}` },
  ];
  if (category) {
    items.push({
      name: category.label,
      url: `${BASE_URL}/zona/${zone.slug}/${category.id}`,
    });
  }
  return items;
}

// ── Zone × Product (AggregateOffer across stores) ────────────────────

export function generateZoneProductLD(
  zone: { name: string; slug: string },
  product: { name: string; price: number; image: string; description?: string },
  stores: Array<{ name: string; inStock: boolean; retailPrice: number }>,
): Record<string, unknown> {
  const offers = stores.filter(s => s.inStock).map(s => ({
    "@type": "Offer",
    seller: { "@type": "Organization", name: s.name },
    price: s.retailPrice,
    priceCurrency: "PEN",
    availability: "https://schema.org/InStock",
  }));

  const prices = offers.map(o => o.price as number);

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: product.image,
    description: product.description || `${product.name} disponible en ${zone.name}`,
    offers: {
      "@type": "AggregateOffer",
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
      priceCurrency: "PEN",
      offerCount: offers.length,
      availability: offers.length > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      areaServed: { "@type": "City", name: zone.name.includes("Pucallpa") ? "Pucallpa" : zone.name },
      offers,
    },
  };
}

// ── Generic BreadcrumbList ───────────────────────────────────────────

export function generateBreadcrumbLD(items: Array<{ name: string; url: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
