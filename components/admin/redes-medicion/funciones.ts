/**
 * Qué desbloquea cada red (el ⓘ de cada fila de Tienda online › Redes y
 * medición). Sólo texto: se muestra dentro de los InfoTip.
 */
import type { ComponentType } from "react";
import { BarChart3, Boxes, Layers, Radio, ShieldCheck, ShoppingBag, Tag, TrendingUp, Users } from "@buleje/design-system/icons";

export type Icon = ComponentType<{ className?: string }>;
export type Feature = { Icon: Icon; title: string; desc: string };

export const META_FEATURES: Feature[] = [
  { Icon: ShoppingBag, title: "Facebook Shop / Instagram Shopping", desc: "Tienda y catálogo en Facebook e Instagram, gestionado desde Commerce Manager." },
  { Icon: Tag, title: "Etiquetado de productos", desc: "Etiqueta productos directamente en publicaciones e historias de Instagram." },
  { Icon: BarChart3, title: "Meta Pixel", desc: "Mide cada visitante, optimiza anuncios y permite remarketing a quien ya te visitó." },
  { Icon: ShieldCheck, title: "API de Conversiones (CAPI)", desc: "Envía eventos desde tu servidor: menos afectado por bloqueadores, más control del dato." },
  { Icon: Boxes, title: "Catálogo sincronizado", desc: "Sincroniza el catálogo con Meta para anuncios dinámicos y campañas Advantage+." },
  { Icon: TrendingUp, title: "Embudo completo + Advantage+", desc: "Rastrea vista, carrito, pago y compra; la IA de Meta optimiza la entrega de anuncios." },
];

export const TIKTOK_FEATURES: Feature[] = [
  { Icon: Boxes, title: "Catálogo sincronizado", desc: "Inventario, cumplimiento de pedidos y campañas de compra en vivo, coordinados." },
  { Icon: BarChart3, title: "Píxel de TikTok", desc: "Instalación directa para crear y administrar campañas publicitarias de TikTok." },
  { Icon: Layers, title: "Pedidos centralizados", desc: "Consolida pedidos de varios canales, evita sobreventa con stock en tiempo real." },
  { Icon: Radio, title: "Live Shopping", desc: "Transmisiones en vivo donde la gente compra mientras ve, sin salir de TikTok." },
  { Icon: ShoppingBag, title: "Checkout nativo", desc: "Catálogo, pago y servicio dentro de la app — el cliente nunca sale de TikTok." },
  { Icon: Users, title: "Afiliados / creadores", desc: "Creadores promocionan tu producto a cambio de comisión por venta." },
];

export const COMBINED: Feature[] = [
  { Icon: Boxes, title: "Inventario único, multi-canal", desc: "Un solo stock se descuenta vendas donde vendas — TikTok, Meta o tu tienda." },
  { Icon: Users, title: "Atribución cruzada", desc: "TikTok capta la compra impulsiva; tu sitio/Meta construye tu base de clientes." },
  { Icon: Radio, title: "Doble fuente de tráfico", desc: "Si una plataforma cambia su algoritmo, la otra sigue funcionando." },
  { Icon: ShieldCheck, title: "Datos propios vs prestados", desc: "Cada pedido en tu sitio es tu dato de cliente — público propio y compras repetidas." },
];

export const GA_FEATURES: Feature[] = [
  { Icon: Users, title: "Audiencia y comportamiento", desc: "Cuántos entran, de dónde vienen, qué páginas ven y cuánto se quedan." },
  { Icon: TrendingUp, title: "Embudo de conversión", desc: "Del catálogo al pago: dónde abandonan y qué canal/campaña trae ventas." },
  { Icon: ShoppingBag, title: "Evento de compra automático", desc: "Cada pedido confirmado dispara 'purchase' con el monto — ROI real por canal." },
];
