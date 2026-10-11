/**
 * Cómo se arma cada segmento, dicho en castellano. ÚNICA fuente del texto:
 * la regla es `inferSegment` (components/admin/crm/crm-compartido.ts) y
 * acá se explica con sus mismos cortes (5 compras, 2 compras, 90 días).
 *
 * Antes Clientes › Segmentos tenía OTRA regla (VIP > S/ 500, Regular ≥ S/ 100,
 * Inactivo > 60 días) sobre datos que nadie llenaba (`includeStats` no existe
 * en /api/customers): en main salían los 15 clientes «Inactivo» y S/ 0,00,
 * mientras Mis clientes los repartía en Frecuente / Ocasional / Nuevo / Perdido.
 */
import type { Segment } from "@/components/admin/crm/crm-compartido";

export const REGLA_SEGMENTO: Record<Segment, string> = {
  frecuente: "5 compras o más y la última hace 90 días o menos",
  ocasional: "De 2 a 4 compras y la última hace 90 días o menos",
  nuevo: "Todavía ninguna compra, o una sola en los últimos 90 días",
  perdido: "Compró alguna vez, pero hace más de 90 días que no vuelve",
};

/** Para el ⓘ: qué cuenta como compra y de dónde sale. */
export const AYUDA_SEGMENTOS = {
  what: "Cada cliente cae en un grupo según cuántas veces compró y hace cuánto. Cuentan los pedidos y las ventas de mostrador con su celular.",
  affects: "Son los mismos grupos que filtran la lista de Mis clientes. Para escribirles, Mensajes masivos; para una campaña con cupón, Crecimiento › Segmentos.",
  example: "Rosa compró 6 veces y la última fue el lunes: Frecuente. Juan compró 3 veces en junio y no volvió: Perdido.",
} as const;
