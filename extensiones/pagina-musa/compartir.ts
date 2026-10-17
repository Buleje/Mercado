/**
 * Lo que se ve al COMPARTIR Musa (WhatsApp, Facebook, Instagram): título,
 * descripción y tarjeta de 1200 × 630 de la portada y del catálogo
 * (`metadatosPagina`), y la tarjeta de cada producto (la usa `metadatosFicha`).
 *
 * Musa se vende pasando el enlace por WhatsApp: sin tarjeta, el chat muestra la
 * URL pelada. Las tarjetas son JPG estáticos en `public/musa/` (los genera
 * `scripts/musa-tarjetas-compartir.mjs` con las fuentes y los envases de la
 * marca; 30-48 KB cada uno). Las rutas van RELATIVAS: el sistema les pone el
 * dominio con el que entró la petición (nunca buleje.pe, que no existe).
 *
 * Textos: sólo lo que el manual promete (envío gratis en Constitución, fuera
 * desde S/ 99; asesoría gratis por WhatsApp). Nada de precios escritos a mano.
 */
import "server-only";
import type { MetadatosPagina, PropsPagina, VistaCompartible } from "../_contrato";
import { CATEGORIAS } from "./anuncios";
import { cargarMarco } from "./datos";
import type { Opciones } from "./manifest";
import { ENVIO_GRATIS_DESDE } from "./pedido-whatsapp";

export const LEMA = "Belleza profesional, cerca de ti";

const TARJETA_PORTADA = {
  ruta: "/musa/og.jpg",
  ancho: 1200,
  alto: 630,
  alt: `Musa · ${LEMA}: cabello, rostro y cuerpo en Ciudad Constitución, con asesoría gratis por WhatsApp`,
} as const;

/** Los códigos que ya tienen su tarjeta en `public/musa/og/` (si se suma un producto, correr el script y agregarlo acá). */
const CON_TARJETA = new Set([
  "KT01", "KT02", "KT03", "KT04", "KT05",
  "MU001", "MU002", "MU003", "MU004", "MU005", "MU006", "MU007", "MU008", "MU009", "MU010",
  "MU011", "MU012", "MU013", "MU013-2", "MU014", "MU015", "MU016", "MU016-2", "MU017", "MU018", "MU019", "MU020",
]);

/** La tarjeta de un producto (`/musa/og/MU001.jpg`) o, sin ella, la de la portada: nunca un envase con fondo transparente. */
export function tarjetaDe(codigo: string | null): string {
  return codigo && CON_TARJETA.has(codigo) ? `/musa/og/${encodeURIComponent(codigo)}.jpg` : TARJETA_PORTADA.ruta;
}

const DESCRIPCION =
  `Cabello, rostro y cuerpo con asesoría gratis de Drucila por WhatsApp. Envío gratis en Ciudad Constitución; ` +
  `fuera, gratis desde S/ ${ENVIO_GRATIS_DESDE}. Elige y pide por WhatsApp.`;

/** `?categoria=Rostro` en el catálogo comparte esa categoría con su texto; lo demás, la tienda entera. */
export async function metadatosPagina({ ctx, searchParams, vista }: PropsPagina<Opciones> & { vista: VistaCompartible }): Promise<MetadatosPagina> {
  const nombre = (await cargarMarco(ctx.tenantId)).nombre;
  const pedida = vista === "catalogo" ? searchParams.categoria : undefined;
  const categoria = CATEGORIAS.find((c) => c.nombre === (Array.isArray(pedida) ? pedida[0] : pedida));
  return {
    sitio: nombre,
    titulo: categoria ? `${categoria.nombre} — ${nombre} · ${LEMA}` : `${nombre} — ${LEMA}`,
    ...(categoria ? { consulta: `?categoria=${encodeURIComponent(categoria.nombre)}` } : {}),
    descripcion: categoria ? `${categoria.texto} Asesoría gratis por WhatsApp y envío gratis en Ciudad Constitución.` : DESCRIPCION,
    imagen: TARJETA_PORTADA,
  };
}
