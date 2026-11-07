/**
 * feed-productos — el feed de productos de UN negocio para Google Merchant
 * Center y el catálogo de Meta (formato RSS 2.0 con el espacio `g:`).
 *
 * Antes (`app/api/shopping-feed`) se publicaban los productos activos de TODOS
 * los negocios con la marca «Buleje» y enlaces a `www.buleje.pe/tienda/<id>`
 * (una ruta que busca por nombre, no por id: cada enlace daba «no encontrado»).
 * Ahora cada negocio publica solo lo suyo, con su nombre y la dirección real
 * de su tienda (`baseVerificacion`: dominio propio, subdominio, `/t/<slug>` o
 * la principal para el negocio por defecto).
 *
 * PURO (sin base de datos ni `server-only`): lo prueba vitest sin mocks.
 */

import { slugify } from "@/data/products";

/** Lo que el feed necesita de un producto. Nada de costo ni cantidad en stock. */
export interface ProductoDelFeed {
  id: number;
  nombre: string;
  categoria: string;
  unidad: string;
  precio: number;
  imagen: string;
  imagenesExtra: readonly string[];
  descripcion: string | null;
  marca: string | null;
  codigoBarras: string | null;
  etiqueta: string | null;
  /** `true` si se puede vender hoy (stock sin control o mayor que cero). */
  disponible: boolean;
}

export interface NegocioDelFeed {
  nombre: string;
  /** Base pública de la tienda, sin barra final: `https://musa.buleje.pe` o `https://www.buleje.pe/t/musa`. */
  base: string;
}

const MAX_TITULO = 150;
const MAX_DESCRIPCION = 5000;
const MAX_IMAGENES_EXTRA = 10;

/** Caracteres de control que rompen un XML 1.0 (el lector de Google descarta el archivo entero). */
const CONTROL_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function escaparXml(texto: string): string {
  return texto
    .replace(CONTROL_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function recortar(texto: string, max: number): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length > max ? `${limpio.slice(0, max - 1).trimEnd()}…` : limpio;
}

/** Origen (`https://host`) de la base de la tienda; `null` si la base no es una URL. */
export function origenDe(base: string): string | null {
  try {
    return new URL(base).origin;
  } catch {
    return null;
  }
}

/**
 * La ficha del producto en la tienda del negocio: `<base>/tienda/<nombre-en-slug>`,
 * la misma que arman `ProductCard` y las páginas propias (la ficha busca por
 * `slugify(nombre)`).
 */
export function urlDeProducto(base: string, nombre: string): string | null {
  const slug = slugify(nombre);
  if (!slug) return null;
  return `${base.replace(/\/+$/, "")}/tienda/${slug}`;
}

/** Imagen absoluta: `http(s)` tal cual, `/ruta` sobre el origen de la tienda; lo demás (data:, vacío) no sirve. */
export function urlDeImagen(origen: string | null, imagen: string | null | undefined): string | null {
  const v = (imagen ?? "").trim();
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith("/") && !v.startsWith("//") && origen) return `${origen}${v}`;
  return null;
}

/**
 * ¿Es un GTIN (EAN-8, UPC-A, EAN-13, GTIN-14) con dígito verificador bueno?
 * Los códigos de uso interno (EAN-13 que empiezan con 2: balanza, góndola)
 * no valen para Google aunque el dígito cuadre.
 */
export function gtinValido(codigo: string | null | undefined): string | null {
  const v = (codigo ?? "").replace(/\s+/g, "");
  if (!/^(\d{8}|\d{12,14})$/.test(v)) return null;
  if (v.length === 13 && v.startsWith("2")) return null;
  if (/^0+$/.test(v)) return null;
  const digitos = v.split("").map(Number);
  const verificador = digitos.pop() as number;
  const suma = digitos
    .reverse()
    .reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (suma % 10)) % 10 === verificador ? v : null;
}

/**
 * Los productos que van al feed: precio mayor que cero, con ficha alcanzable y
 * uno solo por ficha. Si dos productos dan el mismo slug, la ficha muestra el
 * de id menor (`ProductsDB.getAll` ordena por id y `find` toma el primero):
 * publicar el otro sería un precio que la página no muestra.
 */
export function productosPublicables(productos: readonly ProductoDelFeed[]): ProductoDelFeed[] {
  const porSlug = new Map<string, ProductoDelFeed>();
  for (const p of [...productos].sort((a, b) => a.id - b.id)) {
    const slug = slugify(p.nombre);
    if (!slug || !(p.precio > 0) || !Number.isFinite(p.precio)) continue;
    if (!porSlug.has(slug)) porSlug.set(slug, p);
  }
  return [...porSlug.values()];
}

function itemXml(p: ProductoDelFeed, negocio: NegocioDelFeed, origen: string | null): string | null {
  const link = urlDeProducto(negocio.base, p.nombre);
  if (!link) return null;
  const imagen = urlDeImagen(origen, p.imagen);
  const extras = p.imagenesExtra
    .map((u) => urlDeImagen(origen, u))
    .filter((u): u is string => !!u && u !== imagen)
    .slice(0, MAX_IMAGENES_EXTRA);
  const gtin = gtinValido(p.codigoBarras);
  const marca = p.marca?.trim() || negocio.nombre;
  const descripcion = p.descripcion?.trim()
    ? p.descripcion
    : `${p.nombre} · Categoría: ${p.categoria} · Medida: ${p.unidad}`;

  const lineas = [
    `<g:id>${p.id}</g:id>`,
    `<g:title>${escaparXml(recortar(p.nombre, MAX_TITULO))}</g:title>`,
    `<g:description>${escaparXml(recortar(descripcion, MAX_DESCRIPCION))}</g:description>`,
    `<g:link>${escaparXml(link)}</g:link>`,
    // Sin imagen, Merchant Center marca el producto «falta imagen»: es un aviso
    // útil para el dueño (antes iba un /placeholder.png que no existe).
    ...(imagen ? [`<g:image_link>${escaparXml(imagen)}</g:image_link>`] : []),
    ...extras.map((u) => `<g:additional_image_link>${escaparXml(u)}</g:additional_image_link>`),
    `<g:condition>new</g:condition>`,
    `<g:availability>${p.disponible ? "in_stock" : "out_of_stock"}</g:availability>`,
    `<g:price>${p.precio.toFixed(2)} PEN</g:price>`,
    `<g:brand>${escaparXml(recortar(marca, 70))}</g:brand>`,
    gtin ? `<g:gtin>${gtin}</g:gtin>` : `<g:identifier_exists>no</g:identifier_exists>`,
    `<g:product_type>${escaparXml(recortar(p.categoria, 750))}</g:product_type>`,
    ...(p.etiqueta ? [`<g:custom_label_0>${escaparXml(recortar(p.etiqueta, 100))}</g:custom_label_0>`] : []),
  ];
  return `    <item>\n      ${lineas.join("\n      ")}\n    </item>`;
}

/**
 * El XML completo. El envío (`g:shipping`) y la categoría de Google no van:
 * cambian por negocio (antes decía «Ucayali, gratis, alimentos» para todos) y
 * Merchant Center los toma de la configuración de la cuenta del dueño.
 */
export function armarFeedXml(
  negocio: NegocioDelFeed,
  productos: readonly ProductoDelFeed[],
  generadoEn: Date,
): { xml: string; items: number } {
  const origen = origenDe(negocio.base);
  const items = productosPublicables(productos)
    .map((p) => itemXml(p, negocio, origen))
    .filter((x): x is string => x !== null);
  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">`,
    `  <channel>`,
    `    <title>${escaparXml(negocio.nombre)}</title>`,
    `    <link>${escaparXml(negocio.base)}</link>`,
    `    <description>Catálogo de productos de ${escaparXml(negocio.nombre)}</description>`,
    `    <lastBuildDate>${generadoEn.toUTCString()}</lastBuildDate>`,
    ...items,
    `  </channel>`,
    `</rss>`,
  ].join("\n");
  return { xml, items: items.length };
}
