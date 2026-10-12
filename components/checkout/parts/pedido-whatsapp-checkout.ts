/**
 * El pedido como mensaje e imagen de WhatsApp para el negocio (2026-10-11,
 * `pedidosCliente.pedidoComoImagen`). Funciones puras. Dos usos:
 *   · pedido YA confirmado (con `numero`): `total` = el que devolvió el servidor;
 *   · carrito en modo WhatsApp (sin `numero`): no hay pedido en el sistema y el
 *     total es la vista previa del carrito.
 *
 * - El descuento es UNO solo: subtotal de los renglones − total final (promo,
 *   cupón, primera compra y puntos juntos); así siempre cuadra con el total.
 * - El total dice «(lo confirma el negocio)»: el negocio lo revisa en su panel.
 */

import type { DatosImagenPedido } from "@/lib/tienda-cliente/contrato";
import { formatearCelularPe } from "@/lib/tienda-cliente/celular";
import { formatCurrency } from "@/lib/utils";
import type { PaymentMethod } from "../types";
import { ubicacionDeEnlace } from "./ubicacion-en-notas";

export interface LineaPedidoCheckout {
  name: string;
  price: number;
  quantity: number;
  unit?: string;
  image?: string;
  note?: string;
}

export interface ClientePedidoCheckout {
  nombre: string;
  celular: string;
  direccion: string;
  referencia: string;
  pago: PaymentMethod | null;
  /** «Mensaje especial» que escribió el cliente. */
  notas: string;
  /** Enlace de Google Maps de la ubicación ("" = no la compartió). */
  ubicacion: string;
}

export interface PedidoWhatsapp {
  negocio: string;
  /** Id del pedido que devolvió `POST /api/orders`; sin él = pedido del carrito. */
  numero?: string;
  items: readonly LineaPedidoCheckout[];
  /** Total del servidor (confirmado) o de la vista previa del carrito. */
  total: number;
  cliente: ClientePedidoCheckout;
}
/** @deprecated nombre anterior; usa `PedidoWhatsapp`. */
export type PedidoConfirmado = PedidoWhatsapp;

const PAGO: Record<PaymentMethod, string> = {
  yape: "Yape",
  efectivo: "Efectivo",
  fiado: "Fiado (pago el día de pago)",
};

const LARGO_NOTA = 160;

function entregaDe(c: ClientePedidoCheckout): string {
  const dir = c.direccion.trim();
  const ref = c.referencia.trim();
  if (dir && ref) return `${dir} (${ref})`;
  return dir || ref;
}

function recortar(texto: string, max: number): string {
  return texto.length > max ? `${texto.slice(0, max - 1).trimEnd()}…` : texto;
}

/** Subtotal de los renglones − total del servidor, en céntimos para no arrastrar decimales. */
export function descuentoTotal(p: Pick<PedidoWhatsapp, "items" | "total">): number {
  const subtotal = p.items.reduce((s, i) => s + Math.round(i.price * 100) * i.quantity, 0);
  const diferencia = subtotal - Math.round(p.total * 100);
  return diferencia > 0 ? diferencia / 100 : 0;
}

/** El mensaje que va siempre (respaldo de la imagen y lo que se lee en el chat). */
export function textoPedidoWhatsapp(p: PedidoWhatsapp): string {
  const c = p.cliente;
  const saludo = p.numero
    ? `Hola ${p.negocio}, acabo de hacer el pedido #${p.numero} en la tienda en línea:`
    : `Hola ${p.negocio}, te envío mi pedido de la tienda en línea:`;
  const renglones: string[] = [saludo, ""];
  for (const i of p.items) {
    renglones.push(`• ${i.name} x${i.quantity} — ${formatCurrency(i.price * i.quantity)}`);
    if (i.note) renglones.push(`  Nota: ${i.note}`);
  }
  renglones.push("");
  const descuento = descuentoTotal(p);
  if (descuento > 0) renglones.push(`Descuentos: −${formatCurrency(descuento)}`);
  renglones.push(`Total: ${formatCurrency(p.total)} (lo confirma el negocio)`, "");
  if (c.nombre.trim()) renglones.push(`Nombre: ${c.nombre.trim()}`);
  if (c.celular.trim()) renglones.push(`Celular: ${formatearCelularPe(c.celular)}`);
  const entrega = entregaDe(c);
  if (entrega) renglones.push(`Entrega: ${entrega}`);
  const ubicacion = ubicacionDeEnlace(c.ubicacion);
  if (ubicacion) renglones.push(`Ubicación: ${ubicacion.enlaceMapa}`);
  if (c.pago) renglones.push(`Pago: ${PAGO[c.pago]}`);
  const nota = c.notas.trim();
  if (nota) renglones.push(`Notas: ${nota}`);
  return renglones.join("\n").trim();
}

/** Los datos para `dibujarImagenPedido` (productos con foto, precios, cliente). */
export function datosImagenCheckout(
  p: PedidoWhatsapp,
  marca: { colorAcento: string; logo: string | null },
): DatosImagenPedido {
  const c = p.cliente;
  const nota = c.notas.trim();
  const descuento = descuentoTotal(p);
  const notas: string[] = p.numero ? [`Pedido #${p.numero}`] : [];
  if (descuento > 0) notas.push(`Descuentos: −${formatCurrency(descuento)}`);
  if (nota) notas.push(`Nota: ${recortar(nota.replace(/\s+/g, " "), LARGO_NOTA)}`);
  return {
    negocio: { nombre: p.negocio, colorAcento: marca.colorAcento, logo: marca.logo },
    lineas: p.items.map((i) => ({
      nombre: i.name,
      codigo: null,
      cantidad: i.quantity,
      precio: i.price,
      imagen: i.image || null,
      nota: i.note || null,
    })),
    total: p.total,
    cliente: {
      nombre: c.nombre.trim(),
      celular: c.celular.trim() || null,
      entrega: entregaDe(c) || null,
      ubicacion: ubicacionDeEnlace(c.ubicacion),
      pago: c.pago ? PAGO[c.pago] : null,
    },
    notas,
  };
}
