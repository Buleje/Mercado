/**
 * seo-store-schema — helpers JSON-LD para las tiendas del marketplace.
 *
 * Brandon 2026-06-01 (audit SEO local): el ItemList de la home y de /tiendas
 * emitía cada tienda solo como `ListItem { url, name }`. Google no entendía
 * que cada item es un NEGOCIO LOCAL real. Ahora cada item lleva su propia
 * entidad (`@type` Restaurant / GroceryStore / Pharmacy / Store según rubro)
 * con `address` (PostalAddress city-level verídico).
 *
 * NOTA — sin `geo` por tienda a propósito: no tenemos coordenadas reales por
 * tienda; emitir el centroide de la ciudad para TODAS sería inexacto y Google
 * lo puede leer como manipulación. El `address` (localidad + región + país +
 * zona) ya da la señal local correcta.
 */

import { BRAND_GEO } from "@/lib/geo";

/** Mapea la categoría de la tienda al tipo Schema.org de negocio local. */
export function storeSchemaType(category?: string | null): string {
  const c = (category ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (/(restaurant|pizz|polleria|pollo|comida|cevicher|chifa|broaster|menu|cafe|food)/.test(c))
    return "Restaurant";
  if (/(farmacia|botica|pharmacy|boticas)/.test(c)) return "Pharmacy";
  if (/(bodega|abarrote|minimarket|market|mercado|grocer|minimarket|tienda de barrio)/.test(c))
    return "GroceryStore";
  return "Store";
}

/** PostalAddress JSON-LD city-level para una tienda (zona opcional). */
export function storeLdAddress(zone?: string | null) {
  return {
    "@type": "PostalAddress",
    ...(zone ? { streetAddress: zone } : {}),
    addressLocality: BRAND_GEO.city,
    addressRegion: BRAND_GEO.region,
    addressCountry: BRAND_GEO.countryCode,
  };
}

interface StoreLike {
  slug: string;
  name: string;
  category?: string | null;
  zone?: string | null;
  logo?: string | null;
}

/**
 * Construye el `item` (negocio local) para un `ListItem` del ItemList.
 * Devuelve la entidad rica que Google usa para SEO local + rich results.
 */
export function storeListItem(s: StoreLike) {
  return {
    "@type": storeSchemaType(s.category),
    name: s.name,
    url: `https://www.buleje.pe/marketplace/${s.slug}`,
    ...(s.logo ? { image: s.logo } : {}),
    address: storeLdAddress(s.zone),
    areaServed: { "@type": "City", name: s.zone ?? BRAND_GEO.city },
    priceRange: "S/",
    currenciesAccepted: "PEN",
    paymentAccepted: "Yape, Plin, Efectivo, Tarjeta",
    // SIN aggregateRating: el rating/reviewCount del feed de la home es
    // SEMBRADO (no reseñas reales). Emitirlo sería rich-snippet inválido en
    // GSC. /tiendas sí lo emite porque agrega Review reales (storeReviewAgg).
  };
}
