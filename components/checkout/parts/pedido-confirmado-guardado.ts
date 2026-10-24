/**
 * El pedido recién confirmado, guardado en `sessionStorage` para que «Enviar
 * mi pedido por WhatsApp» siga en pie si el cliente recarga la página
 * (2026-10-11). Sólo lo que el mensaje ya mostraba: renglones, total del
 * servidor, nombre, celular, entrega, forma de pago y enlace de ubicación.
 *
 * - Una clave por pedido (`buleje-pedido-wa:<id>`); se borra sola a las 24 h
 *   (se poda al leer o guardar) o al cerrar la pestaña (es sessionStorage).
 * - Nunca viaja al servidor. Todo con try/catch: sin almacenamiento (modo
 *   privado, cuota llena) el botón simplemente no sobrevive a la recarga.
 */

import { z } from "zod";

export const PREFIJO_PEDIDO_GUARDADO = "buleje-pedido-wa:";
export const VIGENCIA_PEDIDO_GUARDADO_MS = 24 * 60 * 60 * 1000;

const lineaSchema = z.object({
  name: z.string(),
  quantity: z.number().positive(),
  price: z.number().nonnegative(),
  image: z.string().optional(),
});

/** `buleje-last-order` (lo escribe `saveLastOrder` con el total del servidor). */
export const ultimoPedidoSchema = z.object({
  id: z.string().min(1),
  total: z.number().nonnegative(),
  items: z.array(lineaSchema.extend({ unit: z.string().optional() })).min(1),
});
export type UltimoPedido = z.infer<typeof ultimoPedidoSchema>;

const guardadoSchema = z.object({
  v: z.literal(1),
  id: z.string().min(1),
  guardadoEn: z.number(),
  total: z.number().nonnegative(),
  items: z.array(lineaSchema).min(1),
  cliente: z.object({
    nombre: z.string(),
    celular: z.string(),
    direccion: z.string(),
    referencia: z.string(),
    pago: z.enum(["yape", "efectivo", "fiado"]).nullable(),
    ubicacion: z.string(),
  }),
});
export type PedidoGuardado = z.infer<typeof guardadoSchema>;
export type DatosPedidoGuardado = Omit<PedidoGuardado, "v" | "guardadoEn">;

function almacen(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Borra las copias de más de 24 h (y las que no se dejan leer). */
export function podarPedidosGuardados(ahora = Date.now()): void {
  const s = almacen();
  if (!s) return;
  try {
    const claves: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k?.startsWith(PREFIJO_PEDIDO_GUARDADO)) claves.push(k);
    }
    for (const k of claves) {
      const r = guardadoSchema.safeParse(JSON.parse(s.getItem(k) ?? "null"));
      if (!r.success || ahora - r.data.guardadoEn > VIGENCIA_PEDIDO_GUARDADO_MS) s.removeItem(k);
    }
  } catch {
    /* almacenamiento bloqueado: nada que podar */
  }
}

export function guardarPedidoConfirmado(datos: DatosPedidoGuardado, ahora = Date.now()): boolean {
  const s = almacen();
  if (!s) return false;
  podarPedidosGuardados(ahora);
  const r = guardadoSchema.safeParse({ ...datos, v: 1, guardadoEn: ahora });
  if (!r.success) return false;
  try {
    s.setItem(`${PREFIJO_PEDIDO_GUARDADO}${datos.id}`, JSON.stringify(r.data));
    return true;
  } catch {
    return false;
  }
}

export function leerPedidoConfirmado(id: string, ahora = Date.now()): PedidoGuardado | null {
  const s = almacen();
  if (!s) return null;
  podarPedidosGuardados(ahora);
  try {
    const r = guardadoSchema.safeParse(JSON.parse(s.getItem(`${PREFIJO_PEDIDO_GUARDADO}${id}`) ?? "null"));
    return r.success && r.data.id === id ? r.data : null;
  } catch {
    return null;
  }
}

export function leerUltimoPedido(): UltimoPedido | null {
  try {
    const r = ultimoPedidoSchema.safeParse(JSON.parse(localStorage.getItem("buleje-last-order") ?? "null"));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}
