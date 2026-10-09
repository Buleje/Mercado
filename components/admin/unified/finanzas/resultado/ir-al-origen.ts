/**
 * El clic en una fila del detalle lleva a su ORIGEN: la corrida en el Libro,
 * el gasto en Movimientos, la persona en Recursos Humanos.
 *
 * Misma receta que `abrirFichaDelPermiso` (ficha-del-permiso-url.ts):
 *  - a OTRO módulo: `admin:navigate` (historial, recientes, limpia los
 *    parámetros del módulo que se deja) y DESPUÉS se escriben los parámetros
 *    propios con `replaceState` — antes, `navigateTab` los borraría;
 *  - al MISMO módulo (una fila de Gastos desde Resultado, ambos en Mi Plata):
 *    `navigateTab` al tab abierto REEMPLAZA la entrada y el «atrás» ya no
 *    volvería al resultado, así que va un `pushState` propio.
 * En los dos casos, un `popstate` al final: con el módulo montado nada se
 * remonta y `useVistaModulo` sólo relee la URL al montar o con el «atrás».
 */

import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { hrefDeDestino } from "@/lib/admin/enlaces-panel";
import type { EnlaceOrigen } from "@/lib/finance/resultado-del-negocio";

/** Desde el 09-10, la receta vive en `irAEnlace` (la usan todos los hipervínculos del panel). */
export function irAlOrigen(enlace: EnlaceOrigen): void {
  irAEnlace(hrefDeDestino(enlace));
}
