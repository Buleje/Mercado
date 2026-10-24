/**
 * Catálogo del POS sin conexión (08-10).
 *
 * El mostrador de Pucallpa pierde internet seguido: si /api/products no responde al abrir
 * Vender, la grilla quedaba vacía y no se podía cobrar nada, aunque la cola sin conexión
 * (usePOSOffline) ya sabía guardar ventas. Acá se guarda la última lista buena por negocio
 * y se devuelve cuando el pedido falla. Las ventas siguen yendo a la cola y el servidor
 * recalcula precio y stock al sincronizar: esta lista es sólo para poder elegir productos.
 */

import { formatDateNumeric, formatTime, formatWeekday } from "@/lib/format";

/** Más de esto no se guarda (localStorage ~5 MB por dominio, compartido con todo el panel). */
export const TOPE_CATALOGO_BYTES = 2_000_000;

export interface CatalogoGuardado<T> {
  items: T[];
  /** ISO del momento en que se guardó. */
  guardadoEn: string;
}

type Almacen = Pick<Storage, "getItem" | "setItem">;

function almacenLocal(): Almacen | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null; // Safari privado / almacenamiento bloqueado
  }
}

/** Guarda la lista; devuelve false si no hay almacenamiento, si es muy grande o si no entra. */
export function guardarCatalogo<T>(clave: string, items: T[], ahora = new Date(), almacen: Almacen | null = almacenLocal()): boolean {
  if (!almacen || items.length === 0) return false;
  const texto = JSON.stringify({ items, guardadoEn: ahora.toISOString() } satisfies CatalogoGuardado<T>);
  if (texto.length > TOPE_CATALOGO_BYTES) return false;
  try {
    almacen.setItem(clave, texto);
    return true;
  } catch {
    return false; // cuota llena: el POS sigue igual, sólo sin respaldo
  }
}

/** Lee la última lista guardada; null si no hay o si está dañada. */
export function leerCatalogo<T>(clave: string, almacen: Almacen | null = almacenLocal()): CatalogoGuardado<T> | null {
  if (!almacen) return null;
  try {
    const crudo = almacen.getItem(clave);
    if (!crudo) return null;
    const dato = JSON.parse(crudo) as Partial<CatalogoGuardado<T>>;
    if (!Array.isArray(dato.items) || dato.items.length === 0 || typeof dato.guardadoEn !== "string") return null;
    return { items: dato.items, guardadoEn: dato.guardadoEn };
  } catch {
    return null;
  }
}

/**
 * Pasadas estas horas la lista se avisa fuerte (revisión 08-10): sin edad máxima, una lista de hace
 * una semana se veía «de las 10:32» como si fuera de hoy. Al sincronizar, el servidor rehace el total
 * con el precio de la base y rechaza la venta pagada por debajo (app/api/sales/route.ts, «amountPaid»):
 * la plata ya se cobró y la venta queda en los errores de la cola.
 */
export const HORAS_CATALOGO_VIEJO = 24;

export interface EdadCatalogo {
  horas: number;
  /** Mismo día calendario en Lima. */
  deHoy: boolean;
  /** ≥ HORAS_CATALOGO_VIEJO: los precios pueden haber cambiado. */
  viejo: boolean;
  /** «de las 10:32» si es de hoy; «del lunes 05/10 · 10:32» si no. */
  etiqueta: string;
  /** «lunes 05/10»: el aviso fuerte va sin hora para caber en la cabecera. */
  dia: string;
}

export function edadCatalogo(guardadoEn: string, ahora = new Date()): EdadCatalogo {
  const horas = Math.max(0, (ahora.getTime() - new Date(guardadoEn).getTime()) / 3_600_000);
  const deHoy = formatDateNumeric(guardadoEn) === formatDateNumeric(ahora);
  const hora = formatTime(guardadoEn);
  const dia = `${formatWeekday(guardadoEn, { largo: true }).toLowerCase()} ${formatDateNumeric(guardadoEn).slice(0, 5)}`;
  return { horas, deHoy, viejo: horas >= HORAS_CATALOGO_VIEJO, etiqueta: deHoy ? `de las ${hora}` : `del ${dia} · ${hora}`, dia };
}
