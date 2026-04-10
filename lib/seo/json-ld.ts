/**
 * JSON-LD structured data generators for Programmatic SEO.
 *
 * Used by zone pages (/zona/[ciudad]) and category pages
 * to inject Google-friendly structured data.
 */

import type { Zone } from "@/data/zones";
import type { Category } from "@/data/products";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe";

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

// ── OfferCatalog for zone pages ─────────────────────────────────────

export function generateOfferCatalogLD(
  zone: Zone,
  categories: Category[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "GroceryStore",
    name: `Buleje — Bodega en ${zone.name}`,
    description: zone.description,
    url: `${BASE_URL}/zona/${zone.slug}`,
    address: {
      "@type": "PostalAddress",
      addressLocality: zone.name,
      addressRegion: zone.region,
      addressCountry: "PE",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: zone.geo.lat,
      longitude: zone.geo.lon,
    },
    areaServed: {
      "@type": "City",
      name: zone.name,
    },
    priceRange: "S/1 - S/200",
    currenciesAccepted: "PEN",
    paymentAccepted: "Efectivo, Yape, Plin",
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: `Productos disponibles en ${zone.name}`,
      itemListElement: categories.map((cat) => ({
        "@type": "OfferCatalog",
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
    { name: "Inicio", url: BASE_URL },
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
