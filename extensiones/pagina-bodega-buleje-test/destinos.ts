/**
 * A dónde lleva cada botón de la página (sin React: lo usan servidor y cliente).
 *
 * El catálogo de la tienda (`/t/<negocio>/tienda`) entiende `?q=` (busca por
 * nombre, categoría y marca), `?categoria=` (salta a esa categoría) y
 * `?oferta=1` (sólo rebajados). La bolsa se abre allá con `?carrito=abrir`.
 */
import { formatCurrency } from "@/lib/currency";
import type { Destino } from "./anuncios";

export function rutas(slug: string) {
  const base = `/t/${encodeURIComponent(slug)}`;
  const catalogo = `${base}/tienda`;
  return {
    base,
    catalogo,
    categoria: (c: string) => `${catalogo}?categoria=${encodeURIComponent(c)}`,
    buscar: (q: string) => `${catalogo}?q=${encodeURIComponent(q)}`,
    ofertas: `${catalogo}?oferta=1`,
    pagar: `${catalogo}?carrito=abrir`,
  };
}

/** Enlace de WhatsApp con el mensaje armado. Sin número: el selector de chats de WhatsApp. */
export function enlaceWhatsapp(numero: string | null, mensaje: string): string {
  return `https://wa.me/${numero ?? ""}?text=${encodeURIComponent(mensaje)}`;
}

export function hrefDestino(d: Destino, slug: string, whatsapp: string | null): { href: string; externo: boolean } {
  const r = rutas(slug);
  if ("categoria" in d) return { href: r.categoria(d.categoria), externo: false };
  if ("buscar" in d) return { href: r.buscar(d.buscar), externo: false };
  if ("ancla" in d) return { href: `#${d.ancla}`, externo: false };
  return { href: enlaceWhatsapp(whatsapp, d.whatsapp), externo: true };
}

/** Llena `{descuento}` con el % real; sin rebaja devuelve null (el texto no se muestra). */
export function conDescuento(texto: string, descuento: number | null): string | null {
  return rellenar(texto, { descuento: descuento ? String(descuento) : null });
}

/** Llena `{clave}` con su valor; si falta alguno de los que usa el texto, null (el texto no se muestra). */
export function rellenar(texto: string, valores: Record<string, string | null>): string | null {
  let falta = false;
  const salida = texto.replace(/\{(\w+)\}/g, (todo, clave: string) => {
    const v = valores[clave];
    if (v == null) falta = true;
    return v ?? todo;
  });
  return falta ? null : salida;
}

/** «S/ 43.90» — el mismo formato de moneda del resto de la tienda. */
export const soles = (n: number): string => formatCurrency(n);
