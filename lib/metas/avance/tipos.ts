/**
 * lib/metas/avance/tipos.ts — contrato de las calculadoras del avance de metas (ADR-488).
 *
 * Una calculadora por categoría (`comercial.ts`, `forestal.ts`): recibe la
 * ventana del período (día de Lima) y devuelve lo que lleva, leído por las
 * clases `lib/db/*.db.ts` de siempre. Nunca escribe.
 *
 * Caché: una clave por (negocio, categoría, unidad, ventana). La meta no entra
 * en la clave: dos metas iguales de distinto objetivo comparten la lectura.
 * `AdminGoalsDB` borra el prefijo del negocio tras crear, editar o borrar.
 */
import "server-only";
import type { VentanaMeta } from "@/lib/admin/metas-periodo";

export interface Medicion {
  /** En la unidad pedida. `null` = no se pudo medir (se muestra «sin dato», nunca 0). */
  valor: number | null;
  /** El dato está incompleto y por qué («2 despachos sin precio»). */
  parcial?: string;
  /** Una línea para el ⓘ («12 ventas y 3 pedidos»). */
  detalle?: string;
}

/** Junta lecturas repetidas dentro de un mismo pedido (ingreso, producción y despacho leen el mismo libro). */
export interface MemoLectura {
  una<T>(clave: string, fn: () => Promise<T>): Promise<T>;
}

export type Calculadora = (tenantId: string, v: VentanaMeta, unidad: string, memo: MemoLectura) => Promise<Medicion>;

/** Un memo nuevo por pedido: la misma clave devuelve la misma promesa (también si falla). */
export function crearMemoLectura(): MemoLectura {
  const hechas = new Map<string, Promise<unknown>>();
  return {
    una<T>(clave: string, fn: () => Promise<T>): Promise<T> {
      const previa = hechas.get(clave);
      if (previa) return previa as Promise<T>;
      const nueva = fn();
      hechas.set(clave, nueva);
      return nueva;
    },
  };
}

/** Segundos de caché: una ventana abierta cambia con cada venta; una cerrada ya no. */
export const TTL_AVANCE_ABIERTA = 60;
export const TTL_AVANCE_CERRADA = 600;

/** Con `:` al final: el prefijo del negocio «t1» no borra el de «t10». */
export function prefijoCacheAvance(tenantId: string): string {
  return `metas-avance:${tenantId}:`;
}

export function claveCacheAvance(tenantId: string, category: string, unidad: string, v: VentanaMeta): string {
  return `${prefijoCacheAvance(tenantId)}${category}:${unidad}:${v.desde}:${v.hasta}`;
}
