/**
 * District-level data for Programmatic SEO.
 *
 * Extiende el dataset `zones.ts` con coordenadas aproximadas por distrito y
 * un slug SEO-friendly. Cada ciudad lista los distritos que ya declaró
 * `zones.ts`; aqui agregamos lat/lon + un hint descriptivo para que las
 * paginas `/zona/[ciudad]/distrito/[distrito]` y
 * `/zona/[ciudad]/distrito/[distrito]/[categoria]` tengan contenido
 * hiper-local (signal SEO + JSON-LD AreaServed preciso).
 *
 * Ventajas:
 *   - Ninguna zona peligrosa tocada (sin schema.prisma)
 *   - ~825 paginas nuevas (15 ciudades × ~4-7 distritos × 6 categorias)
 *   - Targets: "bodega en Yarinacocha", "abarrotes en Los Olivos delivery"
 *
 * Todo slug sigue el formato kebab-case sin acentos (NFD normalize ya usado
 * en `slugify` de products.ts — aqui mantenemos consistencia manualmente).
 *
 * Referencia: docs/adr/060-programmatic-seo-districts.md
 */

import { zones, type Zone } from "@/data/zones";

export type District = {
  slug: string;
  name: string;
  cityslug: string; // cross-ref al `zones[].slug`
  geo: { lat: number; lon: number };
  description: string;
};

export const districts: District[] = [
  // ── Pucallpa / Ucayali ───────────────────────────────────────────
  {
    slug: "calleria",
    name: "Calleria",
    cityslug: "pucallpa",
    geo: { lat: -8.3791, lon: -74.5539 },
    description:
      "Calleria es el distrito centro de Pucallpa donde nacio Buleje. Bodegas de Jr. Ucayali, Av. Centenario y el mercado Bellavista ya usan el sistema.",
  },
  {
    slug: "manantay",
    name: "Manantay",
    cityslug: "pucallpa",
    geo: { lat: -8.4403, lon: -74.5486 },
    description:
      "Manantay concentra bodegas y minimarkets al sur de Pucallpa. Buleje entrega software ERP con delivery, inventario y fiado digital.",
  },
  {
    slug: "yarinacocha",
    name: "Yarinacocha",
    cityslug: "pucallpa",
    geo: { lat: -8.3086, lon: -74.5858 },
    description:
      "Yarinacocha combina turismo y comercio de barrio. Las bodegas del Puerto Callao y San Jose usan Buleje para vender abarrotes y bebidas con delivery.",
  },
  {
    slug: "campo-verde",
    name: "Campo Verde",
    cityslug: "pucallpa",
    geo: { lat: -8.4894, lon: -74.7936 },
    description:
      "Campo Verde es el distrito rural de Ucayali. Las tiendas locales venden abarrotes y productos basicos con Buleje — ideal para zonas sin POS tradicional.",
  },

  // ── Iquitos / Loreto ─────────────────────────────────────────────
  {
    slug: "iquitos-centro",
    name: "Iquitos Centro",
    cityslug: "iquitos",
    geo: { lat: -3.7491, lon: -73.2538 },
    description:
      "El centro de Iquitos concentra el Mercado de Belen y comercio de la Plaza de Armas. Buleje da a las bodegas inventario, delivery fluvial y boletas SUNAT.",
  },
  {
    slug: "san-juan-bautista-iquitos",
    name: "San Juan Bautista",
    cityslug: "iquitos",
    geo: { lat: -3.7876, lon: -73.2625 },
    description:
      "San Juan Bautista es el distrito sur de Iquitos. Bodegas de la Carretera a Nauta y Quistococha gestionan ventas con Buleje ERP.",
  },
  {
    slug: "punchana",
    name: "Punchana",
    cityslug: "iquitos",
    geo: { lat: -3.7120, lon: -73.2437 },
    description:
      "Punchana reune bodegas y tiendas junto al rio Amazonas. Buleje ofrece delivery, fiado digital y reportes por WhatsApp para negocios ribereños.",
  },
  {
    slug: "belen",
    name: "Belen",
    cityslug: "iquitos",
    geo: { lat: -3.7821, lon: -73.2456 },
    description:
      "El Mercado de Belen es el corazon comercial de Iquitos. Las bodegas del distrito usan Buleje para llevar inventario y vender abarrotes con delivery.",
  },

  // ── Tarapoto / San Martin ────────────────────────────────────────
  {
    slug: "tarapoto-centro",
    name: "Tarapoto",
    cityslug: "tarapoto",
    geo: { lat: -6.4874, lon: -76.3600 },
    description:
      "Tarapoto es el centro comercial de la selva norte. Bodegas del Jr. San Martin y Jr. Angel Delgado venden con Buleje y delivery.",
  },
  {
    slug: "morales",
    name: "Morales",
    cityslug: "tarapoto",
    geo: { lat: -6.4771, lon: -76.3812 },
    description:
      "Morales concentra bodegas y tiendas al oeste de Tarapoto. Buleje entrega software ERP con POS, inventario y facturacion SUNAT.",
  },
  {
    slug: "la-banda-de-shilcayo",
    name: "La Banda de Shilcayo",
    cityslug: "tarapoto",
    geo: { lat: -6.5062, lon: -76.3428 },
    description:
      "La Banda de Shilcayo es el distrito residencial de Tarapoto con alta demanda de delivery. Buleje ayuda a bodegas a cubrir ese mercado.",
  },

  // ── Lima / Lima ──────────────────────────────────────────────────
  {
    slug: "san-juan-de-lurigancho",
    name: "San Juan de Lurigancho",
    cityslug: "lima",
    geo: { lat: -12.0047, lon: -76.9956 },
    description:
      "San Juan de Lurigancho es el distrito mas poblado de Lima. Miles de bodegas, minimarkets y tiendas de barrio gestionan ventas e inventario con Buleje.",
  },
  {
    slug: "comas",
    name: "Comas",
    cityslug: "lima",
    geo: { lat: -11.9381, lon: -77.0489 },
    description:
      "Comas tiene alta densidad de bodegas familiares. Buleje ofrece ERP con fiado digital, delivery y facturacion SUNAT para Cono Norte.",
  },
  {
    slug: "villa-el-salvador",
    name: "Villa El Salvador",
    cityslug: "lima",
    geo: { lat: -12.2142, lon: -76.9397 },
    description:
      "Villa El Salvador concentra bodegas de Cono Sur. Buleje entrega inventario en tiempo real, POS y delivery para tiendas de barrio.",
  },
  {
    slug: "san-martin-de-porres",
    name: "San Martin de Porres",
    cityslug: "lima",
    geo: { lat: -12.0039, lon: -77.0817 },
    description:
      "San Martin de Porres combina residencial y comercial. Bodegas de Las Dunas, Pro y Los Libertadores venden con Buleje y delivery.",
  },
  {
    slug: "los-olivos",
    name: "Los Olivos",
    cityslug: "lima",
    geo: { lat: -11.9897, lon: -77.0728 },
    description:
      "Los Olivos es distrito residencial de Cono Norte. Buleje opera en bodegas del Megaplaza, Pro y Naranjal con delivery y fiado digital.",
  },
  {
    slug: "ate",
    name: "Ate",
    cityslug: "lima",
    geo: { lat: -12.0267, lon: -76.9175 },
    description:
      "Ate Vitarte tiene bodegas y minimarkets en crecimiento. Buleje ayuda a gestionar inventario, ventas y facturacion SUNAT en Cono Este.",
  },
  {
    slug: "callao",
    name: "Callao",
    cityslug: "lima",
    geo: { lat: -12.0566, lon: -77.1181 },
    description:
      "Callao es el puerto de Lima con alta actividad comercial. Bodegas de Bellavista, Carmen de la Legua y Ventanilla usan Buleje para ERP completo.",
  },

  // ── Arequipa / Arequipa ──────────────────────────────────────────
  {
    slug: "arequipa-cercado",
    name: "Cercado",
    cityslug: "arequipa",
    geo: { lat: -16.4090, lon: -71.5375 },
    description:
      "Cercado es el casco historico de Arequipa. Bodegas de la Plaza de Armas, Mercado San Camilo y Av. La Marina venden con Buleje.",
  },
  {
    slug: "cayma",
    name: "Cayma",
    cityslug: "arequipa",
    geo: { lat: -16.3770, lon: -71.5485 },
    description:
      "Cayma combina zonas residenciales con bodegas establecidas. Buleje entrega POS, delivery y boletas electronicas para Arequipa norte.",
  },
  {
    slug: "cerro-colorado",
    name: "Cerro Colorado",
    cityslug: "arequipa",
    geo: { lat: -16.3820, lon: -71.5732 },
    description:
      "Cerro Colorado es el distrito mas poblado de Arequipa. Miles de bodegas gestionan inventario y fiado con Buleje.",
  },
  {
    slug: "jose-luis-bustamante-y-rivero",
    name: "Jose Luis Bustamante y Rivero",
    cityslug: "arequipa",
    geo: { lat: -16.4296, lon: -71.5357 },
    description:
      "Jose Luis Bustamante y Rivero tiene minimarkets y bodegas residenciales. Buleje ofrece ERP con delivery y fiado digital.",
  },
  {
    slug: "paucarpata",
    name: "Paucarpata",
    cityslug: "arequipa",
    geo: { lat: -16.4306, lon: -71.5018 },
    description:
      "Paucarpata concentra bodegas del Cono Este de Arequipa. Buleje ayuda a vender abarrotes y bebidas con delivery.",
  },

  // ── Trujillo / La Libertad ───────────────────────────────────────
  {
    slug: "trujillo-centro",
    name: "Trujillo",
    cityslug: "trujillo",
    geo: { lat: -8.1116, lon: -79.0288 },
    description:
      "El centro de Trujillo concentra el Mercado Central y la Plaza Mayor. Buleje da ERP completo a bodegas del centro historico.",
  },
  {
    slug: "la-esperanza",
    name: "La Esperanza",
    cityslug: "trujillo",
    geo: { lat: -8.0742, lon: -79.0452 },
    description:
      "La Esperanza es distrito popular de Trujillo con alta densidad de bodegas. Buleje ofrece POS, inventario y fiado digital.",
  },
  {
    slug: "el-porvenir",
    name: "El Porvenir",
    cityslug: "trujillo",
    geo: { lat: -8.0872, lon: -79.0283 },
    description:
      "El Porvenir es distrito comercial de Trujillo Este. Bodegas y minimarkets gestionan ventas con Buleje.",
  },
  {
    slug: "victor-larco-herrera",
    name: "Victor Larco Herrera",
    cityslug: "trujillo",
    geo: { lat: -8.1402, lon: -79.0476 },
    description:
      "Victor Larco Herrera incluye Buenos Aires y Huanchaco. Buleje ayuda a bodegas residenciales con delivery.",
  },

  // ── Chiclayo / Lambayeque ────────────────────────────────────────
  {
    slug: "chiclayo-centro",
    name: "Chiclayo",
    cityslug: "chiclayo",
    geo: { lat: -6.7714, lon: -79.8409 },
    description:
      "Chiclayo centro concentra el Mercado Modelo y la Plaza de Armas. Buleje entrega ERP completo a bodegas del casco urbano.",
  },
  {
    slug: "jose-leonardo-ortiz",
    name: "Jose Leonardo Ortiz",
    cityslug: "chiclayo",
    geo: { lat: -6.7563, lon: -79.8404 },
    description:
      "Jose Leonardo Ortiz es distrito popular con alta demanda de fiado digital. Buleje da score de credito automatico a bodegueros.",
  },
  {
    slug: "la-victoria-chiclayo",
    name: "La Victoria",
    cityslug: "chiclayo",
    geo: { lat: -6.7989, lon: -79.8311 },
    description:
      "La Victoria concentra bodegas y minimarkets al sur de Chiclayo. Buleje ofrece POS, delivery y boletas SUNAT.",
  },

  // ── Piura / Piura ────────────────────────────────────────────────
  {
    slug: "piura-centro",
    name: "Piura",
    cityslug: "piura",
    geo: { lat: -5.1945, lon: -80.6328 },
    description:
      "Piura centro reune el Mercado Modelo y la Plaza de Armas. Buleje ayuda a bodegas del Jr. Lima y Av. Grau.",
  },
  {
    slug: "castilla",
    name: "Castilla",
    cityslug: "piura",
    geo: { lat: -5.2055, lon: -80.6247 },
    description:
      "Castilla es el distrito al este del rio Piura. Bodegas de Miraflores y Sector Oeste usan Buleje para inventario y delivery.",
  },
  {
    slug: "veintiseis-de-octubre",
    name: "26 de Octubre",
    cityslug: "piura",
    geo: { lat: -5.1839, lon: -80.6558 },
    description:
      "26 de Octubre es distrito joven con alta densidad de bodegas. Buleje entrega ERP con fiado digital y facturacion SUNAT.",
  },
  {
    slug: "catacaos",
    name: "Catacaos",
    cityslug: "piura",
    geo: { lat: -5.2683, lon: -80.6856 },
    description:
      "Catacaos es distrito artesanal con bodegas tradicionales. Buleje ayuda a modernizar ventas con POS movil.",
  },

  // ── Tacna / Tacna ────────────────────────────────────────────────
  {
    slug: "tacna-centro",
    name: "Tacna",
    cityslug: "tacna",
    geo: { lat: -18.0146, lon: -70.2536 },
    description:
      "Tacna centro concentra el Mercado Central y la Av. Bolognesi. Buleje da ERP con delivery y Yape integrado.",
  },
  {
    slug: "alto-de-la-alianza",
    name: "Alto de la Alianza",
    cityslug: "tacna",
    geo: { lat: -17.9896, lon: -70.2464 },
    description:
      "Alto de la Alianza es distrito popular de Tacna. Bodegas gestionan inventario y fiado digital con Buleje.",
  },
  {
    slug: "ciudad-nueva",
    name: "Ciudad Nueva",
    cityslug: "tacna",
    geo: { lat: -17.9721, lon: -70.2348 },
    description:
      "Ciudad Nueva es zona residencial con minimarkets en crecimiento. Buleje ofrece POS y delivery con boletas SUNAT.",
  },
  {
    slug: "gregorio-albarracin",
    name: "Gregorio Albarracin",
    cityslug: "tacna",
    geo: { lat: -18.0427, lon: -70.2712 },
    description:
      "Gregorio Albarracin concentra bodegas familiares al sur de Tacna. Buleje entrega ERP accesible desde celular.",
  },

  // ── Tumbes / Tumbes ──────────────────────────────────────────────
  {
    slug: "tumbes-centro",
    name: "Tumbes",
    cityslug: "tumbes",
    geo: { lat: -3.5669, lon: -80.4515 },
    description:
      "Tumbes centro reune el mercado y la Av. Tumbes. Buleje da ERP con inventario, POS y facturacion electronica.",
  },
  {
    slug: "zarumilla",
    name: "Zarumilla",
    cityslug: "tumbes",
    geo: { lat: -3.5047, lon: -80.2722 },
    description:
      "Zarumilla es distrito fronterizo con alta actividad comercial. Buleje ayuda a bodegas a gestionar ventas y boletas SUNAT.",
  },
  {
    slug: "aguas-verdes",
    name: "Aguas Verdes",
    cityslug: "tumbes",
    geo: { lat: -3.4883, lon: -80.2533 },
    description:
      "Aguas Verdes concentra comercio binacional Peru-Ecuador. Buleje entrega ERP con Yape, efectivo y soles.",
  },
  {
    slug: "corrales",
    name: "Corrales",
    cityslug: "tumbes",
    geo: { lat: -3.6228, lon: -80.4714 },
    description:
      "Corrales es distrito residencial de Tumbes. Bodegas locales usan Buleje para POS y delivery.",
  },

  // ── Cusco / Cusco ────────────────────────────────────────────────
  {
    slug: "cusco-centro",
    name: "Cusco",
    cityslug: "cusco",
    geo: { lat: -13.5320, lon: -71.9675 },
    description:
      "Cusco centro concentra el Mercado de San Pedro y la Plaza Regocijo. Buleje da ERP para bodegas del casco historico.",
  },
  {
    slug: "wanchaq",
    name: "Wanchaq",
    cityslug: "cusco",
    geo: { lat: -13.5367, lon: -71.9535 },
    description:
      "Wanchaq es distrito residencial con minimarkets en crecimiento. Buleje ofrece POS, delivery y facturacion SUNAT.",
  },
  {
    slug: "santiago",
    name: "Santiago",
    cityslug: "cusco",
    geo: { lat: -13.5246, lon: -71.9820 },
    description:
      "Santiago es distrito popular de Cusco. Bodegas gestionan inventario y fiado digital con Buleje.",
  },
  {
    slug: "san-sebastian",
    name: "San Sebastian",
    cityslug: "cusco",
    geo: { lat: -13.5344, lon: -71.9264 },
    description:
      "San Sebastian concentra bodegas al este del Cusco. Buleje entrega ERP con Yape y boletas electronicas.",
  },
  {
    slug: "san-jeronimo",
    name: "San Jeronimo",
    cityslug: "cusco",
    geo: { lat: -13.5495, lon: -71.8873 },
    description:
      "San Jeronimo es distrito suburbano de Cusco. Bodegas locales venden con Buleje y delivery.",
  },

  // ── Huancayo / Junin ─────────────────────────────────────────────
  {
    slug: "huancayo-centro",
    name: "Huancayo",
    cityslug: "huancayo",
    geo: { lat: -12.0651, lon: -75.2049 },
    description:
      "Huancayo centro reune el Mercado Mayorista y la Calle Real. Buleje da ERP a bodegas del valle del Mantaro.",
  },
  {
    slug: "el-tambo",
    name: "El Tambo",
    cityslug: "huancayo",
    geo: { lat: -12.0439, lon: -75.2175 },
    description:
      "El Tambo es distrito comercial con alta densidad de bodegas. Buleje ofrece POS, delivery y fiado digital.",
  },
  {
    slug: "chilca",
    name: "Chilca",
    cityslug: "huancayo",
    geo: { lat: -12.0789, lon: -75.2169 },
    description:
      "Chilca concentra bodegas familiares al sur de Huancayo. Buleje entrega ERP accesible y facturacion SUNAT.",
  },

  // ── Puno / Puno ──────────────────────────────────────────────────
  {
    slug: "puno-centro",
    name: "Puno",
    cityslug: "puno",
    geo: { lat: -15.8402, lon: -70.0219 },
    description:
      "Puno centro concentra el Mercado Central y la Plaza de Armas. Buleje da ERP a bodegas del altiplano.",
  },
  {
    slug: "juliaca",
    name: "Juliaca",
    cityslug: "puno",
    geo: { lat: -15.4998, lon: -70.1268 },
    description:
      "Juliaca es el distrito comercial mas grande de Puno. Bodegas y ferias usan Buleje para inventario y delivery.",
  },
  {
    slug: "ayaviri",
    name: "Ayaviri",
    cityslug: "puno",
    geo: { lat: -14.8810, lon: -70.5887 },
    description:
      "Ayaviri es provincia ganadera con bodegas tradicionales. Buleje ayuda a modernizar ventas con POS movil.",
  },
  {
    slug: "ilave",
    name: "Ilave",
    cityslug: "puno",
    geo: { lat: -16.0861, lon: -69.6453 },
    description:
      "Ilave es distrito aymara con comercio activo. Buleje entrega ERP con Yape, efectivo y boletas SUNAT.",
  },

  // ── Ayacucho / Ayacucho ──────────────────────────────────────────
  {
    slug: "ayacucho-centro",
    name: "Ayacucho",
    cityslug: "ayacucho",
    geo: { lat: -13.1588, lon: -74.2236 },
    description:
      "Ayacucho centro concentra el Mercado 12 de Abril y la Plaza Mayor. Buleje da ERP a bodegas del casco historico.",
  },
  {
    slug: "san-juan-bautista-ayacucho",
    name: "San Juan Bautista",
    cityslug: "ayacucho",
    geo: { lat: -13.1722, lon: -74.2259 },
    description:
      "San Juan Bautista es distrito popular de Ayacucho. Bodegas usan Buleje para POS, inventario y delivery.",
  },
  {
    slug: "carmen-alto",
    name: "Carmen Alto",
    cityslug: "ayacucho",
    geo: { lat: -13.1672, lon: -74.2334 },
    description:
      "Carmen Alto concentra bodegas al oeste de Ayacucho. Buleje entrega fiado digital con score automatico.",
  },
  {
    slug: "jesus-nazareno",
    name: "Jesus Nazareno",
    cityslug: "ayacucho",
    geo: { lat: -13.1494, lon: -74.2089 },
    description:
      "Jesus Nazareno es distrito residencial con minimarkets. Buleje ofrece ERP con boletas SUNAT y Yape.",
  },

  // ── Huancavelica / Huancavelica ──────────────────────────────────
  {
    slug: "huancavelica-centro",
    name: "Huancavelica",
    cityslug: "huancavelica",
    geo: { lat: -12.7868, lon: -74.9734 },
    description:
      "Huancavelica centro reune el mercado principal y la Plaza de Armas. Buleje da ERP a bodegas altoandinas.",
  },
  {
    slug: "ascension",
    name: "Ascension",
    cityslug: "huancavelica",
    geo: { lat: -12.7739, lon: -74.9802 },
    description:
      "Ascension es distrito residencial de Huancavelica. Bodegas usan Buleje para POS y delivery.",
  },
  {
    slug: "acoria",
    name: "Acoria",
    cityslug: "huancavelica",
    geo: { lat: -12.6331, lon: -74.8889 },
    description:
      "Acoria es distrito rural con bodegas comunales. Buleje entrega ERP accesible sin internet constante.",
  },
];

/**
 * Districts indexed by cityslug, for fast lookup from city pages.
 */
export const districtsByCity: Record<string, District[]> = districts.reduce(
  (acc, d) => {
    if (!acc[d.cityslug]) acc[d.cityslug] = [];
    acc[d.cityslug].push(d);
    return acc;
  },
  {} as Record<string, District[]>,
);

/** Find a district by city slug + district slug */
export function findDistrict(
  citySlug: string,
  districtSlug: string,
): District | undefined {
  return districts.find(
    (d) => d.cityslug === citySlug && d.slug === districtSlug,
  );
}

/** Get all districts for a city, or [] if none */
export function getDistrictsForCity(citySlug: string): District[] {
  return districtsByCity[citySlug] ?? [];
}

/** Get the parent Zone for a district */
export function getZoneForDistrict(district: District): Zone | undefined {
  return zones.find((z) => z.slug === district.cityslug);
}

/** FAQ items specific to a district (hyperlocal signal) */
export function getDistrictFAQs(district: District, zone: Zone) {
  return [
    {
      question: `¿Como funciona Buleje para bodegas en ${district.name}, ${zone.name}?`,
      answer: `Buleje es un software ERP pensado para bodegas de ${district.name}. Gestiona inventario en tiempo real, emite boletas SUNAT, controla fiado digital con score de credito y coordina delivery local. Funciona desde cualquier celular con Yape, Plin o efectivo.`,
    },
    {
      question: `¿Cuanto cuesta Buleje en ${district.name}?`,
      answer: `Buleje tiene plan gratuito para empezar en ${district.name}. Los planes de pago incluyen mas productos, delivery y reportes automaticos — accesibles para cualquier bodeguero de ${zone.name}.`,
    },
    {
      question: `¿Buleje entrega delivery en ${district.name}?`,
      answer: `Si. Cada bodega que usa Buleje en ${district.name} puede activar delivery con su propio repartidor o integrarse con los couriers locales. El cliente hace el pedido por web o WhatsApp y la bodega coordina la entrega.`,
    },
    {
      question: `¿Funciona Buleje con Yape y Plin en ${district.name}?`,
      answer: `Si. Buleje acepta Yape, Plin, efectivo contra entrega y transferencias. En ${district.name} — como en todo Peru — tus clientes pagan como les sea mas comodo y el sistema registra automaticamente el cobro.`,
    },
  ];
}
