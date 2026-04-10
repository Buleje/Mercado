/**
 * Zone/city definitions for Programmatic SEO pages.
 *
 * Each zone generates:
 *   /zona/[slug]                → City landing page
 *   /zona/[slug]/[categoria]    → City × Category product listing
 *
 * Designed to target local search queries like:
 *   "bodega delivery Pucallpa", "comprar abarrotes Pucallpa"
 */

export type Zone = {
  slug: string;
  name: string;
  region: string;
  /** Short SEO description of the zone */
  description: string;
  /** Lat/Lon center for geo structured data */
  geo: { lat: number; lon: number };
  /** Distritos que cubre esta zona */
  districts: string[];
  /** Delivery available? */
  deliveryActive: boolean;
};

export const zones: Zone[] = [
  {
    slug: "pucallpa",
    name: "Pucallpa",
    region: "Ucayali",
    description:
      "Tu bodega online en Pucallpa con delivery rapido. Abarrotes, bebidas, carnes, frutas y mas a precios de bodega.",
    geo: { lat: -8.3791, lon: -74.5539 },
    districts: ["Calleria", "Manantay", "Yarinacocha"],
    deliveryActive: true,
  },
];

/** All zone slugs for generateStaticParams */
export const zoneSlugs = zones.map((z) => z.slug);

/** Find zone by slug */
export function findZone(slug: string): Zone | undefined {
  return zones.find((z) => z.slug === slug);
}

/**
 * FAQ items per zone — used for FAQPage JSON-LD.
 * Programmatic: each zone gets localized questions.
 */
export function getZoneFAQs(zone: Zone) {
  return [
    {
      question: `¿Hacen delivery en ${zone.name}?`,
      answer: `Si, hacemos delivery en ${zone.name} y los distritos de ${zone.districts.join(", ")}. Delivery gratis en pedidos desde S/50.`,
    },
    {
      question: `¿Que metodos de pago aceptan en ${zone.name}?`,
      answer:
        "Aceptamos Yape, Plin, efectivo contra entrega y transferencia bancaria. Puedes pagar como te sea mas comodo.",
    },
    {
      question: `¿Cuanto demora el delivery en ${zone.name}?`,
      answer: `El delivery en ${zone.name} demora entre 30 a 60 minutos dependiendo de tu distrito. Pedidos realizados antes de las 8pm llegan el mismo dia.`,
    },
    {
      question: `¿Tienen precios de bodega?`,
      answer:
        "Si, nuestros precios son de bodega — sin sobrecostos de supermercado. Compramos directo de mayoristas para darte el mejor precio.",
    },
    {
      question: `¿Puedo comprar al credito (fiado)?`,
      answer:
        "Si, ofrecemos Fiado Digital para clientes frecuentes. Tu score de credito se calcula automaticamente y puedes ver tu limite en /mi-credito.",
    },
  ];
}
