/**
 * JSON-LD structured data for Local Business SEO.
 * Dinámico: lee datos del negocio desde Settings de la DB.
 * Server component — no "use client" needed.
 */

import { SettingsDB } from "@/lib/db/settings.db";
import { headers } from "next/headers";
import { BRAND_GEO } from "@/lib/geo";
import { safeJsonLdStringify } from "@/lib/seo/json-ld";

export default async function LocalBusinessJsonLd() {
  // Brandon 2026-05-20 v9 audit P0: fallback "Mi Tienda" → "Buleje".
  // Si SettingsDB falla en marketplace publico, mostrabamos "Mi Tienda"
  // generico — perjudica branding en Google Knowledge Graph.
  let name = "Buleje";
  let description = `Marketplace de bodegas, restaurantes y tiendas con delivery en ${BRAND_GEO.city}.`;
  let phone = "";
  let address = "";
  let logo = "/brand/buleje-logo.png";
  let lat: number = BRAND_GEO.lat;
  let lon: number = BRAND_GEO.lng;

  try {
    const hdrs = await headers();
    const tenantId = hdrs.get("x-tenant-id") ?? "main";
    const s = await SettingsDB.get(tenantId);
    name = s.businessName ?? name;
    description = s.description ?? description;
    phone = s.businessPhone ?? phone;
    address = s.businessAddress ?? address;
    logo = s.logoUrl ?? logo;
    lat = s.businessLat ?? lat;
    lon = s.businessLon ?? lon;
  } catch { /* use defaults */ }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "GroceryStore",
    name,
    alternateName: `${name} - Abarrotes Delivery`,
    description,
    url: baseUrl,
    telephone: phone ? `+51${phone}` : undefined,
    image: logo.startsWith("http") ? logo : `${baseUrl}${logo}`,
    logo: logo.startsWith("http") ? logo : `${baseUrl}${logo}`,
    priceRange: "S/1 - S/200",
    currenciesAccepted: "PEN",
    paymentAccepted: "Efectivo, Yape, Plin",
    // Brandon 2026-05-20 v10 audit P0: streetAddress vacio es invalido
    // y Google puede rechazar el schema completo. Solo lo emitimos si
    // existe direccion real (settings.businessAddress no vacio).
    address: {
      "@type": "PostalAddress",
      ...(address ? { streetAddress: address } : {}),
      addressLocality: BRAND_GEO.city,
      addressRegion: BRAND_GEO.region,
      addressCountry: BRAND_GEO.countryCode,
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: lat,
      longitude: lon,
    },
    areaServed: {
      "@type": "City",
      name: BRAND_GEO.city,
    },
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        opens: "07:00",
        closes: "22:00",
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: "Sunday",
        opens: "08:00",
        closes: "20:00",
      },
    ],
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Productos de bodega",
      itemListElement: [
        { "@type": "Offer", itemOffered: { "@type": "Product", name: "Abarrotes" } },
        { "@type": "Offer", itemOffered: { "@type": "Product", name: "Bebidas" } },
        { "@type": "Offer", itemOffered: { "@type": "Product", name: "Limpieza" } },
      ],
    },
    // SEO E-E-A-T: cuando el negocio cree su Google Business Profile, agregar
    // acá la URL de Google Maps (mayor señal de entidad local en Pucallpa) +
    // redes reales. No inventar URLs — Google penaliza sameAs falso.
    sameAs: [],
  };

  return (
    <script
      type="application/ld+json"
      // Audit 2026-06-10: datos tenant-controlados (businessName/address) —
      // safeJsonLdStringify escapa </script> breakout (XSS stored).
      dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(jsonLd) }}
    />
  );
}
