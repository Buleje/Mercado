/**
 * A dónde lleva cada botón de la página (sin React: lo usan servidor y cliente).
 *
 * El catálogo de la tienda (`/t/<negocio>/tienda`) entiende `?q=` (busca por
 * nombre, categoría y marca), `?categoria=` (salta a esa categoría) y
 * `?oferta=1` (sólo rebajados), además de `orden`, `marca` y `disponibles=1`
 * (ver `filtros.ts`). La bolsa se abre allá con `?carrito=abrir`.
 */
import { formatCurrency } from "@/lib/currency";
import type { Destino } from "./anuncios";
import type { ProductoSalon } from "./datos";

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
    /** Las secciones de la portada con su ruta completa: el encabezado y el pie también salen en las otras páginas (ADR-460). */
    servicios: `${base}#servicios`,
    mejorar: `${base}#mejorar`,
    promociones: `${base}#ofertas`,
  };
}

/** «1 producto», «3 productos». */
export const unidades = (n: number) => `${n} ${n === 1 ? "producto" : "productos"}`;

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

/** «S/ 159» sin céntimos cuando el precio es entero (vitrina editorial); «S/ 43.90» si no. */
export const solesCortos = (n: number): string => (Number.isInteger(n) ? `S/ ${n}` : soles(n));

/** El WhatsApp para leerlo: 51921585006 → «921 585 006». Sin número, null. */
export function numeroVisible(whatsapp: string | null): string | null {
  if (!whatsapp) return null;
  const local = whatsapp.startsWith("51") && whatsapp.length === 11 ? whatsapp.slice(2) : whatsapp;
  return local.length === 9 ? `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}` : local;
}

/** La fecha de hoy en Perú («2026-11-09»): las campañas empiezan y terminan a la hora de Lima, no del servidor. */
export const hoyEnLima = (ahora: Date = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);

/** El mensaje de WhatsApp para reservar un servicio: qué, cuánto dura y cuánto cuesta. */
export const mensajeReserva = (s: Pick<ProductoSalon, "nombre" | "duracion" | "precio">) =>
  `Hola, quiero reservar: ${s.nombre}${s.duracion ? ` (${s.duracion})` : ""} — ${soles(s.precio)}. ¿Qué horarios tienen disponibles?`;
