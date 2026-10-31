import { inferSegment, type Customer as ClienteCrm, type Segment as SegmentoCrm } from "@/components/admin/crm/crm-compartido";
import { formatCurrency, formatDate } from "@/lib/format";

/** Un cliente tal como lo necesita el envío. La llave es el teléfono (la API de clientes no trae `id`). */
export interface Destinatario {
  phone: string;
  name: string;
  totalSpent: number;
  /** Lo que debe hoy en fiados (`creditBalance`, el mismo dato de «Mis clientes»). */
  debt: number;
  /** Última compra (pedido o venta de mostrador), como la calcula «Mis clientes». */
  lastOrderDate: string | null;
  orderCount: number;
  /** Nivel de puntos (`loyaltyTier`): «VIP» = oro o diamante, como lo arma el servidor. */
  tier?: string | null;
  /** Cumpleaños en ISO (`birthday`): sólo importa el mes. */
  birthday?: string | null;
}

/** Las mismas reglas de «Mis clientes» (activo = compró en los últimos 30 días; segmentos de `inferSegment`). */
export type Segmento =
  | "todos"
  | "activos-30"
  | "inactivos-30"
  | "deuda"
  | "alto-valor"
  | "vip"
  | "cumpleanos"
  | SegmentoCrm
  | "rfm-preset";

/* Los rótulos y el orden del selector viven en `lib/admin/grupos-mensaje.ts`
   (un solo «Para quién» para «Uno por uno» y «Automático»). */

export const PLANTILLAS = [
  { clave: "oferta", rotulo: "Oferta", texto: "Hola {nombre}, tenemos ofertas especiales para ti esta semana. Ven a visitarnos o escríbenos para más info." },
  { clave: "reactivar", rotulo: "Te extrañamos", texto: "Hola {nombre}, hace tiempo no te vemos por aquí. Te esperamos con productos frescos y buenos precios." },
  { clave: "deuda", rotulo: "Saldo", texto: "Hola {nombre}, te recordamos que tienes un saldo pendiente de {deuda}. Puedes pasar a regularizarlo cuando gustes." },
  { clave: "nueva", rotulo: "Gracias", texto: "Hola {nombre}, gracias por tu última compra el {ultimaCompra}. Tenemos novedades que te pueden interesar." },
] as const;

export const VARIABLES = ["{nombre}", "{ultimaCompra}", "{deuda}"] as const;

export function diasDesde(fecha: string | null | undefined, ahora = Date.now()): number {
  if (!fecha) return 9999;
  return Math.floor((ahora - new Date(fecha).getTime()) / 86400000);
}

export function soloDigitos(tel: string | null | undefined): string {
  return (tel ?? "").replace(/\D/g, "");
}

/** Cliente de «Mis clientes» con los campos que `inferSegment` necesita. */
function comoClienteCrm(c: Destinatario): ClienteCrm {
  return { phone: c.phone, name: c.name, _orderCount: c.orderCount, _lastOrder: c.lastOrderDate };
}

export function perteneceAlSegmento(c: Destinatario, segmento: Segmento, telefonosDelPreset: Set<string> | null, ahora = Date.now()): boolean {
  switch (segmento) {
    case "todos":
      return true;
    case "activos-30":
      return diasDesde(c.lastOrderDate, ahora) <= 30;
    case "inactivos-30":
      return diasDesde(c.lastOrderDate, ahora) > 30;
    case "deuda":
      return c.debt > 0;
    case "alto-valor":
      return c.totalSpent >= 200;
    case "vip":
      return c.tier === "oro" || c.tier === "diamante";
    case "cumpleanos": {
      /* El mes del ISO tal cual (sin pasar por Date: un 1/10 a medianoche UTC sería 30/09 en Lima). */
      const mes = c.birthday?.slice(5, 7);
      return Boolean(mes) && Number(mes) === new Date(ahora).getMonth() + 1;
    }
    case "rfm-preset": {
      const d = soloDigitos(c.phone);
      return Boolean(telefonosDelPreset && d && telefonosDelPreset.has(d));
    }
    default:
      return inferSegment(comoClienteCrm(c)) === segmento;
  }
}

export function aplicarPlantilla(plantilla: string, c: Destinatario): string {
  const ultima = c.lastOrderDate ? formatDate(c.lastOrderDate) : "una fecha anterior";
  return plantilla
    .replace(/\{nombre\}/g, c.name)
    .replace(/\{ultimaCompra\}/g, ultima)
    .replace(/\{deuda\}/g, formatCurrency(c.debt));
}

/** El número con el código del Perú una sola vez (un celular guardado con «51» no sale «5151…»); `null` sin número. */
export function numeroWhatsApp(tel: string | null | undefined): string | null {
  const d = soloDigitos(tel);
  if (!d) return null;
  return d.startsWith("51") ? d : `51${d}`;
}

/** Enlace de WhatsApp con el mensaje ya escrito (el único «envío»: lo abre la persona, uno por uno). */
export function enlaceWhatsApp(c: Destinatario, mensaje: string): string | null {
  const completo = numeroWhatsApp(c.phone);
  if (!completo) return null;
  return `https://wa.me/${completo}?text=${encodeURIComponent(mensaje)}`;
}
