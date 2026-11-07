/**
 * factura-xml-cruce.ts — de la factura XML leída a «qué es cada cosa en tu
 * negocio»: qué proveedor ya tienes y qué producto de tu catálogo es cada
 * línea. Es la vista previa: no escribe nada.
 *
 * Producto por línea, en este orden:
 *  1. Código exacto: el código de barras (GTIN) del papel contra tu código de
 *     barras, o el código del proveedor contra tu SKU o código de barras →
 *     confianza «alta» (si dos productos comparten el código, «media»).
 *  2. Nombre: palabras en común (sin tildes, «500 ml» = «500ml», «galletas»
 *     ≈ «galleta») → «alta» si son las mismas palabras, «media» desde 0,6.
 *  3. Si nada se parece → «ninguna» (el dueño elige o crea el producto).
 *
 * PURO: sin Prisma, React ni fetch. La API pasa los productos ya leídos.
 */

import type { Coincidencia } from "@/lib/compras/proveedor-identidad";
import type { FacturaXml, LineaFacturaXml } from "@/lib/compras/factura-xml";

/** Lo mínimo de un producto del catálogo para cruzarlo con una línea. */
export interface ProductoParaCruce {
  id: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit: string;
}

export type ConfianzaCruce = "alta" | "media" | "ninguna";
export type MotivoCruce = "codigo-barras" | "codigo-vendedor" | "nombre" | null;

export interface ProductoSugerido {
  id: number;
  nombre: string;
  unidad: string;
  sku: string | null;
  codigoBarras: string | null;
}

export interface SugerenciaDeLinea {
  /** El `numero` de la línea de la factura (1, 2, 3…). */
  numero: number;
  confianza: ConfianzaCruce;
  motivo: MotivoCruce;
  producto: ProductoSugerido | null;
  /** Hasta 3 más para elegir, con su parecido de 0 a 1. */
  alternativas: Array<ProductoSugerido & { parecido: number }>;
}

/** Lo que devuelve `POST /api/purchases/desde-xml` con 200. */
export interface VistaPreviaFacturaXml {
  factura: FacturaXml;
  proveedor: {
    /** El que ya tienes con ese RUC; `null` = proveedor nuevo. */
    existente: { id: string; nombre: string; ruc: string | null } | null;
    /** Otros que se parecen (mismo nombre, mismo documento repetido…). */
    parecidos: Coincidencia[];
  };
  lineas: SugerenciaDeLinea[];
  /** Ya hay una compra con ese número de papel (no cancelada). */
  yaCargada: { id: string; total: number; createdAt: string; supplierName: string } | null;
  /** El catálogo pasó el tope de lectura: algún nombre pudo quedar sin sugerir. */
  catalogoRecortado: boolean;
}

export type RespuestaDesdeXml =
  | { ok: true; vista: VistaPreviaFacturaXml }
  | { ok: false; error: "xml_invalido" | "datos_invalidos" | "muy_grande"; message: string };

export const UMBRAL_MEDIA = 0.6;
const UMBRAL_ALTERNATIVA = 0.34;
const TOPE_CODIGOS = 500;

const normalizarCodigo = (c: string | null | undefined): string => (c ?? "").trim().toUpperCase();

/** Códigos de las líneas para buscar en el catálogo de una vez (con y sin mayúsculas). */
export function codigosDeLineas(lineas: readonly LineaFacturaXml[]): string[] {
  const out = new Set<string>();
  for (const l of lineas) {
    for (const c of [l.codigoVendedor, l.codigoBarras]) {
      const t = (c ?? "").trim();
      if (!t || t === "-") continue;
      out.add(t);
      out.add(t.toUpperCase());
    }
  }
  return [...out].slice(0, TOPE_CODIGOS);
}

const VACIAS = new Set(["de", "del", "la", "el", "los", "las", "x", "y", "con", "en", "para", "por", "un", "una", "und", "unid", "uni"]);

/** Palabras de un nombre: sin tildes, en minúscula, cantidad y unidad juntas. */
export function palabrasDe(nombre: string): string[] {
  const base = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/(\d)[.,](\d)/g, "$1p$2")
    .replace(/(\d+(?:p\d+)?)\s*(ml|lt|l|kg|kgs|g|gr|grs|cc|oz|un|u)\b/g, "$1$2")
    .replace(/[^a-z0-9]+/g, " ");
  return [...new Set(base.split(" ").filter((p) => p.length >= 2 && !VACIAS.has(p)))];
}

function mismaPalabra(a: string, b: string): boolean {
  if (a === b) return true;
  if (/\d/.test(a) || /\d/.test(b)) return false; // «500ml» ≠ «1l»
  return Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a));
}

/** Parecido de 0 a 1 entre dos listas de palabras (coeficiente de Dice). */
export function parecidoDePalabras(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const usadas = new Set<number>();
  let comunes = 0;
  for (const pa of a) {
    const j = b.findIndex((pb, k) => !usadas.has(k) && mismaPalabra(pa, pb));
    if (j >= 0) {
      usadas.add(j);
      comunes++;
    }
  }
  return (2 * comunes) / (a.length + b.length);
}

function sugerido(p: ProductoParaCruce): ProductoSugerido {
  return { id: p.id, nombre: p.name, unidad: p.unit, sku: p.sku, codigoBarras: p.barcode };
}

/** Catálogo con sus palabras ya calculadas (se arma una vez por factura). */
export interface CatalogoIndexado {
  productos: ReadonlyArray<{ producto: ProductoParaCruce; palabras: string[] }>;
}

export function indexarCatalogo(catalogo: readonly ProductoParaCruce[]): CatalogoIndexado {
  return { productos: catalogo.map((producto) => ({ producto, palabras: palabrasDe(producto.name) })) };
}

/** El producto de tu catálogo que es esta línea, con cuánta confianza. */
export function sugerirProducto(
  linea: Pick<LineaFacturaXml, "numero" | "descripcion" | "codigoVendedor" | "codigoBarras">,
  porCodigo: readonly ProductoParaCruce[],
  catalogo: CatalogoIndexado,
): SugerenciaDeLinea {
  const gtin = normalizarCodigo(linea.codigoBarras);
  const delVendedor = normalizarCodigo(linea.codigoVendedor);
  const porBarras = gtin ? porCodigo.filter((p) => normalizarCodigo(p.barcode) === gtin) : [];
  const porVendedor = delVendedor
    ? porCodigo.filter((p) => normalizarCodigo(p.barcode) === delVendedor || normalizarCodigo(p.sku) === delVendedor)
    : [];
  const [exactos, motivo]: [ProductoParaCruce[], MotivoCruce] = porBarras.length > 0
    ? [porBarras, "codigo-barras"]
    : [porVendedor, "codigo-vendedor"];

  const palabras = palabrasDe(linea.descripcion);
  const ranking = catalogo.productos
    .map(({ producto, palabras: suyas }) => ({ producto, parecido: parecidoDePalabras(palabras, suyas) }))
    .filter((r) => r.parecido >= UMBRAL_ALTERNATIVA)
    .sort((a, b) => b.parecido - a.parecido || a.producto.name.length - b.producto.name.length);

  const primero = exactos[0];
  if (primero) {
    const otros = [
      ...exactos.slice(1).map((p) => ({ producto: p, parecido: 1 })),
      ...ranking.filter((r) => !exactos.some((e) => e.id === r.producto.id)),
    ];
    return {
      numero: linea.numero,
      confianza: exactos.length === 1 ? "alta" : "media",
      motivo,
      producto: sugerido(primero),
      alternativas: otros.slice(0, 3).map((r) => ({ ...sugerido(r.producto), parecido: Math.round(r.parecido * 100) / 100 })),
    };
  }

  const mejor = ranking[0];
  if (!mejor || mejor.parecido < UMBRAL_MEDIA) {
    return {
      numero: linea.numero,
      confianza: "ninguna",
      motivo: null,
      producto: null,
      alternativas: ranking.slice(0, 3).map((r) => ({ ...sugerido(r.producto), parecido: Math.round(r.parecido * 100) / 100 })),
    };
  }
  const empatados = ranking.filter((r) => r.parecido === mejor.parecido).length;
  return {
    numero: linea.numero,
    confianza: mejor.parecido === 1 && empatados === 1 ? "alta" : "media",
    motivo: "nombre",
    producto: sugerido(mejor.producto),
    alternativas: ranking.slice(1, 4).map((r) => ({ ...sugerido(r.producto), parecido: Math.round(r.parecido * 100) / 100 })),
  };
}
