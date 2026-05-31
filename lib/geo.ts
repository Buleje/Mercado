/**
 * lib/geo.ts — Geo/branding del marketplace público (SEO local).
 *
 * Buleje LANZA primero en CIUDAD CONSTITUCIÓN (Selva Central) y luego se
 * expandirá a Pucallpa y el resto del Perú. Centralizamos la ciudad objetivo,
 * la jerarquía administrativa y las coordenadas para SEO local (LocalBusiness
 * JSON-LD, metadata Open Graph, geo meta tags, sitemap).
 *
 * Cambiar de ciudad objetivo = editar SOLO este archivo. No hardcodear
 * "Pucallpa"/"Ucayali" en componentes públicos — importar BRAND_GEO.
 *
 * Coordenadas: Municipalidad Distrital de Constitución (9°51′18″S 75°01′17″O).
 * Fuente: https://municonstitucion.gob.pe/ubicacion/
 */

export const BRAND_GEO = {
  /** Ciudad/capital objetivo del lanzamiento. */
  city: "Ciudad Constitución",
  /** Distrito (mismo nombre que la capital). */
  district: "Constitución",
  /** Provincia. */
  province: "Oxapampa",
  /** Departamento/Región. */
  region: "Pasco",
  /** País. */
  country: "Perú",
  /** ISO 3166-1 alpha-2. */
  countryCode: "PE",
  /** ISO 3166-2:PE para la región Pasco (geo.region meta tag). */
  regionCode: "PE-PAS",
  /** Locale BCP-47 para Open Graph / hreflang. */
  locale: "es_PE",
  /** Coordenadas del centro (LocalBusiness + ICBM + geo.position). */
  lat: -9.8549,
  lng: -75.0213,
  /** Teléfono de contacto (E.164). */
  phone: "+51929340532",

  // ── Derivados para copy + structured data ──────────────────────────────
  /** "Ciudad Constitución, Pasco" — para subtítulos y OG. */
  cityRegion: "Ciudad Constitución, Pasco",
  /** Zona de servicio (LocalBusiness.areaServed + keywords long-tail). */
  areaServed: ["Ciudad Constitución", "Oxapampa", "Pasco", "Selva Central"],
} as const;

/** "geo.placename" meta tag → "Ciudad Constitución, Pasco, Perú". */
export const GEO_PLACENAME = `${BRAND_GEO.city}, ${BRAND_GEO.region}, ${BRAND_GEO.country}`;
/** "geo.position" / "ICBM" → "-9.8549;-75.0213". */
export const GEO_POSITION = `${BRAND_GEO.lat};${BRAND_GEO.lng}`;
