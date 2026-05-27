/**
 * Zone/city definitions for Programmatic SEO pages.
 *
 * Buleje es un Software SaaS ERP para bodegas y tiendas de todo el Peru.
 * Creado en Pucallpa, con cobertura nacional.
 *
 * Cada zona genera:
 *   /zona/[slug]                → City landing page
 *   /zona/[slug]/[categoria]    → City × Category page
 *
 * Targets local search queries like:
 *   "software para bodegas Lima", "sistema ERP tienda Arequipa",
 *   "app de bodega Pucallpa", "gestion de inventario tienda Cusco"
 */

export type Zone = {
  slug: string;
  name: string;
  region: string;
  /** Short SEO description for this zone */
  description: string;
  /** Lat/Lon center for geo structured data */
  geo: { lat: number; lon: number };
  /** Districts/areas principales */
  districts: string[];
  /** Is delivery active in this zone for tenants? */
  deliveryActive: boolean;
};

export const zones: Zone[] = [
  // ── Selva ──
  {
    slug: "pucallpa",
    name: "Pucallpa",
    region: "Ucayali",
    description:
      "Buleje nacio en Pucallpa. Software ERP para bodegas y tiendas con delivery, inventario, ventas POS, fiado digital y facturacion SUNAT. Cobertura completa en Ucayali.",
    geo: { lat: -8.3791, lon: -74.5539 },
    districts: ["Calleria", "Manantay", "Yarinacocha", "Campo Verde"],
    deliveryActive: true,
  },
  {
    // Ciudad Constitución (Distrito de Constitución, Oxapampa — Pasco). Selva
    // central. Descripción híbrida: capta búsquedas B2C (comprar/delivery) y
    // B2B (software para bodegas) en un solo landing programático.
    slug: "ciudad-constitucion",
    name: "Ciudad Constitución",
    region: "Pasco",
    description:
      "Comprá en bodegas y tiendas de Ciudad Constitución con delivery rápido y pago con Yape o efectivo. ¿Tenés un negocio? Gestioná inventario, ventas POS, fiado digital y facturación SUNAT con Buleje. Cobertura en la selva central de Pasco.",
    geo: { lat: -9.8669, lon: -75.0017 },
    districts: ["Centro", "Sector Norte", "Sector Sur"],
    deliveryActive: true,
  },
  {
    slug: "iquitos",
    name: "Iquitos",
    region: "Loreto",
    description:
      "Buleje para bodegas y tiendas en Iquitos. Gestiona tu inventario, ventas, delivery y facturacion electronica desde tu celular. Funciona con Yape y efectivo.",
    geo: { lat: -3.7491, lon: -73.2538 },
    districts: ["Iquitos", "San Juan Bautista", "Punchana", "Belen"],
    deliveryActive: true,
  },
  {
    slug: "tarapoto",
    name: "Tarapoto",
    region: "San Martin",
    description:
      "Software de gestion para bodegas en Tarapoto. Control de inventario, ventas POS, delivery y reportes automaticos. Creado para negocios de la selva peruana.",
    geo: { lat: -6.4874, lon: -76.3600 },
    districts: ["Tarapoto", "Morales", "La Banda de Shilcayo"],
    deliveryActive: true,
  },
  // ── Costa ──
  {
    slug: "lima",
    name: "Lima",
    region: "Lima",
    description:
      "Buleje ERP para bodegas y tiendas en Lima. Sistema completo de inventario, POS, delivery, fiado digital y facturacion SUNAT. Ideal para bodegas de barrio y minimarkets.",
    geo: { lat: -12.0464, lon: -77.0428 },
    districts: [
      "San Juan de Lurigancho", "Comas", "Villa El Salvador",
      "San Martin de Porres", "Los Olivos", "Ate", "Callao",
    ],
    deliveryActive: true,
  },
  {
    slug: "arequipa",
    name: "Arequipa",
    region: "Arequipa",
    description:
      "Software ERP para bodegas y tiendas en Arequipa. Gestiona ventas, inventario, delivery y boletas electronicas. Paga con Yape, Plin o efectivo.",
    geo: { lat: -16.4090, lon: -71.5375 },
    districts: ["Cercado", "Cayma", "Cerro Colorado", "Jose Luis Bustamante y Rivero", "Paucarpata"],
    deliveryActive: true,
  },
  {
    slug: "trujillo",
    name: "Trujillo",
    region: "La Libertad",
    description:
      "Buleje para negocios en Trujillo. Sistema de gestion de bodegas con POS, inventario en tiempo real, delivery y facturacion electronica SUNAT.",
    geo: { lat: -8.1116, lon: -79.0288 },
    districts: ["Trujillo", "La Esperanza", "El Porvenir", "Victor Larco Herrera"],
    deliveryActive: true,
  },
  {
    slug: "chiclayo",
    name: "Chiclayo",
    region: "Lambayeque",
    description:
      "Software para bodegas y minimarkets en Chiclayo. Control total de inventario, ventas POS, delivery a domicilio y fiado digital con score de credito.",
    geo: { lat: -6.7714, lon: -79.8409 },
    districts: ["Chiclayo", "Jose Leonardo Ortiz", "La Victoria"],
    deliveryActive: true,
  },
  {
    slug: "piura",
    name: "Piura",
    region: "Piura",
    description:
      "Buleje ERP para tiendas en Piura. Administra tu bodega desde el celular: inventario, ventas, delivery, reportes diarios y facturacion SUNAT.",
    geo: { lat: -5.1945, lon: -80.6328 },
    districts: ["Piura", "Castilla", "26 de Octubre", "Catacaos"],
    deliveryActive: true,
  },
  {
    slug: "tacna",
    name: "Tacna",
    region: "Tacna",
    description:
      "Buleje ERP para tiendas y bodegas en Tacna. Administra tu negocio desde el celular: inventario en tiempo real, ventas POS, delivery, fiado digital y boletas SUNAT.",
    geo: { lat: -18.0146, lon: -70.2536 },
    districts: ["Tacna", "Alto de la Alianza", "Ciudad Nueva", "Gregorio Albarracin"],
    deliveryActive: true,
  },
  {
    slug: "tumbes",
    name: "Tumbes",
    region: "Tumbes",
    description:
      "Software para bodegas y minimarkets en Tumbes. Gestion completa de inventario, ventas, delivery y facturacion electronica. Buleje funciona con Yape, Plin y efectivo.",
    geo: { lat: -3.5669, lon: -80.4515 },
    districts: ["Tumbes", "Zarumilla", "Aguas Verdes", "Corrales"],
    deliveryActive: true,
  },
  // ── Sierra ──
  {
    slug: "cusco",
    name: "Cusco",
    region: "Cusco",
    description:
      "Software de gestion para bodegas y tiendas en Cusco. Sistema ERP completo con POS, inventario, delivery, fiado digital y boletas SUNAT.",
    geo: { lat: -13.5320, lon: -71.9675 },
    districts: ["Cusco", "Wanchaq", "Santiago", "San Sebastian", "San Jeronimo"],
    deliveryActive: true,
  },
  {
    slug: "huancayo",
    name: "Huancayo",
    region: "Junin",
    description:
      "Buleje para bodegas en Huancayo. Gestiona tu negocio completo: inventario, ventas, delivery, credito a clientes y facturacion electronica.",
    geo: { lat: -12.0651, lon: -75.2049 },
    districts: ["Huancayo", "El Tambo", "Chilca"],
    deliveryActive: true,
  },
  {
    slug: "puno",
    name: "Puno",
    region: "Puno",
    description:
      "Software ERP para bodegas y tiendas en Puno. Buleje te ayuda a gestionar inventario, ventas POS, delivery y fiado digital en la region altiplanica. Funciona con Yape y efectivo.",
    geo: { lat: -15.8402, lon: -70.0219 },
    districts: ["Puno", "Juliaca", "Ayaviri", "Ilave"],
    deliveryActive: true,
  },
  {
    slug: "ayacucho",
    name: "Ayacucho",
    region: "Ayacucho",
    description:
      "Buleje para bodegas en Ayacucho. Sistema completo de inventario, punto de venta, delivery a domicilio y facturacion SUNAT. Ideal para negocios de la sierra central.",
    geo: { lat: -13.1588, lon: -74.2236 },
    districts: ["Ayacucho", "San Juan Bautista", "Carmen Alto", "Jesus Nazareno"],
    deliveryActive: true,
  },
  {
    slug: "huancavelica",
    name: "Huancavelica",
    region: "Huancavelica",
    description:
      "Software de gestion para bodegas en Huancavelica. Control de inventario, ventas, delivery y reportes automaticos. Creado para negocios de la sierra peruana.",
    geo: { lat: -12.7868, lon: -74.9734 },
    districts: ["Huancavelica", "Ascension", "Acoria"],
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
 * About the Buleje platform, not a single store.
 */
export function getZoneFAQs(zone: Zone) {
  return [
    {
      question: `¿Que es Buleje y como funciona en ${zone.name}?`,
      answer: `Buleje es un software ERP para bodegas y tiendas. Con Buleje puedes manejar tu inventario, hacer ventas POS, ofrecer delivery, dar fiado digital con score de credito y emitir boletas SUNAT. Funciona en ${zone.name} y en todo el Peru.`,
    },
    {
      question: `¿Cuanto cuesta Buleje para mi bodega en ${zone.name}?`,
      answer:
        "Buleje tiene plan gratuito para empezar. Los planes de pago incluyen mas productos, delivery, fiado digital y reportes avanzados. Puedes probar gratis sin compromiso.",
    },
    {
      question: `¿Buleje funciona con Yape y Plin?`,
      answer:
        "Si, Buleje acepta Yape, Plin, efectivo contra entrega y transferencia bancaria. Tus clientes pueden pagar como les sea mas comodo.",
    },
    {
      question: `¿Puedo usar Buleje desde mi celular?`,
      answer:
        "Si, Buleje es una app web que funciona desde cualquier celular, tablet o computadora. No necesitas instalar nada especial, solo abres el navegador.",
    },
    {
      question: `¿Buleje emite boletas y facturas electronicas?`,
      answer:
        "Si, Buleje tiene integracion con SUNAT via Nubefact. Puedes emitir boletas y facturas electronicas directamente desde el sistema, con IGV calculado automaticamente.",
    },
    {
      question: `¿Que es el Fiado Digital de Buleje?`,
      answer:
        "El Fiado Digital es un sistema de credito automatico para tus clientes frecuentes. Buleje calcula un score de credito basado en historial de compras y puntualidad de pagos. Tus clientes ven su credito en /mi-credito.",
    },
  ];
}
