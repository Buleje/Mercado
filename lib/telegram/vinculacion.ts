import "server-only";

/**
 * lib/telegram/vinculacion.ts
 *
 * El código que empareja un chat de Telegram con un negocio.
 *
 * La mecánica (código de seis caracteres, 15 minutos, se quema al canjearlo,
 * uno solo vivo por negocio) vive ahora en `lib/asistente/vinculacion.ts`:
 * WhatsApp necesita exactamente la misma y duplicarla dejaría que un ajuste
 * —la vigencia, el alfabeto— quedara aplicado en un canal y olvidado en el
 * otro. Acá sólo queda el binding que fija el canal, para que los llamadores
 * de Telegram no tengan que enterarse del cambio.
 *
 * El canal es parte de la llave del código: pedir el de WhatsApp NO mata el de
 * Telegram que el dueño puede estar tipeando en ese momento.
 */

import {
  crearCodigo as crearCodigoCanal,
  canjearCodigo as canjearCodigoCanal,
  codigoVivoDe as codigoVivoDeCanal,
} from "@/lib/asistente/vinculacion";

/** Un código nuevo para este negocio. Invalida el anterior que tuviera vivo. */
export function crearCodigo(tenantId: string, pedidoPor: string): { codigo: string; expiraEn: number } {
  return crearCodigoCanal(tenantId, pedidoPor, "telegram");
}

/** Canjea el código. Devuelve el negocio y lo QUEMA — un código sirve una vez. */
export function canjearCodigo(codigoCrudo: string): { tenantId: string; pedidoPor: string } | null {
  return canjearCodigoCanal(codigoCrudo, "telegram");
}

/** Si hay un código vivo para este negocio, cuánto le queda. Para la pantalla. */
export function codigoVivoDe(tenantId: string): { codigo: string; quedanSegundos: number } | null {
  return codigoVivoDeCanal(tenantId, "telegram");
}
