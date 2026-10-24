/**
 * Lo que Puntos manda por WhatsApp. Antes decía «en Buleje» en TODAS las
 * tiendas y anteponía 51 aunque el número ya lo trajera (wa.me/5151…).
 */
import { formatCurrency } from "@/lib/format";

/** Lo que vale un punto al canjear (el mismo S/ 0,10 que ya mostraba la vista). */
export const VALOR_PUNTO = 0.1;

export const solesDePuntos = (puntos: number) => formatCurrency(puntos * VALOR_PUNTO);

export function mensajeDePuntos(nombre: string, puntos: number, negocio: string): string {
  return `${nombre}, tienes ${puntos} puntos en ${negocio}. ¡Canjéalos en tu próxima compra! Valen ${solesDePuntos(puntos)}.`;
}

export function mensajeDeReferido(codigo: string, negocio: string): string {
  return `¡Únete a ${negocio} con mi código ${codigo}!`;
}

/** wa.me con el mensaje escrito; `null` si el número no tiene dígitos. */
export function enlaceWhatsApp(telefono: string, mensaje: string): string | null {
  const d = telefono.replace(/\D/g, "");
  if (!d) return null;
  return `https://wa.me/${d.startsWith("51") ? d : `51${d}`}?text=${encodeURIComponent(mensaje)}`;
}
