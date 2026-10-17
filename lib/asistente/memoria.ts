import "server-only";

/**
 * lib/asistente/memoria.ts
 *
 * De qué venían hablando.
 *
 * ── El problema que resuelve ─────────────────────────────────────────────────
 * Sin esto, cada mensaje arranca de cero. El bot pregunta «¿el camión N12 o el
 * N7?», el dueño contesta «el N12», y del otro lado llega una frase suelta que
 * no significa nada. Eso es exactamente lo que se siente como «no entiende»:
 * no es que el modelo sea malo, es que le estábamos borrando la memoria entre
 * una frase y la siguiente.
 *
 * ── Por qué en memoria y no en la base ───────────────────────────────────────
 * Es una conversación, no un registro. Lo que hay que conservar dura lo que
 * dura el ida y vuelta —minutos— y lo que IMPORTA de verdad ya quedó escrito en
 * los libros del negocio. Persistirlo sería guardar el andamio después de
 * construir la pared.
 *
 * Se pierde al reiniciar el servidor: la próxima frase empieza conversación
 * nueva, que es lo mismo que pasa hoy y nadie extraña.
 */

import { logger } from "@/lib/logger";

/** El mensaje como lo espera el proveedor de LLM. */
export interface MensajeTurno {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: unknown[];
}

interface Sesion {
  tenantId: string;
  /** Sin el `system`: ese se rearma en cada turno con datos frescos. */
  mensajes: MensajeTurno[];
  expira: number;
}

/**
 * Media hora sin hablar y la conversación se cierra.
 *
 * Retomar un hilo de la mañana a la tarde con «sí, ese» es más peligroso que
 * empezar de nuevo: el «ese» se referiría a algo que el dueño ya no tiene en la
 * cabeza, y del otro lado hay una escritura.
 */
const VIDA_MS = 30 * 60 * 1000;

/**
 * Cuántos mensajes se recuerdan.
 *
 * Doce alcanza para tres o cuatro idas y vueltas con sus resultados de
 * herramienta en el medio. Más que eso es pagar tokens por una frase de hace
 * veinte minutos — y con 8.000 tokens por minuto de cuota, cada uno se nota.
 */
const MAX_MENSAJES = 12;

const MAX_SESIONES = 200;

const sesiones = new Map<string, Sesion>();

function limpiar(): void {
  const ahora = Date.now();
  for (const [id, s] of sesiones) if (s.expira <= ahora) sesiones.delete(id);
  if (sesiones.size > MAX_SESIONES) {
    const viejas = [...sesiones.entries()].sort((a, b) => a[1].expira - b[1].expira);
    for (const [id] of viejas.slice(0, sesiones.size - MAX_SESIONES)) sesiones.delete(id);
  }
}

/**
 * Lo que se venía hablando en esta sesión.
 *
 * El `tenantId` se compara SIEMPRE: un id de sesión es un `chatId` de Telegram,
 * y si un chat se desvinculara de un negocio y se vinculara a otro, la memoria
 * del primero no puede viajar con él.
 */
export function recordar(sesionId: string, tenantId: string): MensajeTurno[] {
  limpiar();
  const s = sesiones.get(sesionId);
  if (!s || s.tenantId !== tenantId) return [];
  return s.mensajes;
}

/** Guarda el turno completo, recortado a lo último que vale la pena. */
export function anotarTurno(sesionId: string, tenantId: string, mensajes: MensajeTurno[]): void {
  limpiar();
  /**
   * El recorte no puede empezar en un `tool`: un resultado de herramienta sin
   * la llamada que lo pidió deja al proveedor con un mensaje huérfano y la
   * conversación entera se rechaza con 400.
   */
  let recorte = mensajes.slice(-MAX_MENSAJES);
  while (recorte.length > 0 && recorte[0].role === "tool") recorte = recorte.slice(1);

  sesiones.set(sesionId, { tenantId, mensajes: recorte, expira: Date.now() + VIDA_MS });
}

/** Deja constancia de algo que YA pasó, para que el próximo turno lo sepa. */
export function anotarHecho(sesionId: string, tenantId: string, hecho: string): void {
  const previos = recordar(sesionId, tenantId);
  anotarTurno(sesionId, tenantId, [
    ...previos,
    { role: "assistant", content: `(quedó registrado: ${hecho})` },
  ]);
}

/** Corta el hilo. Lo usa el comando /olvidar del bot. */
export function olvidar(sesionId: string): void {
  sesiones.delete(sesionId);
  logger.info("[asistente] conversación reiniciada", { sesionId });
}

/** Sólo para tests y diagnóstico. */
export function _sesionesVivas(): number {
  limpiar();
  return sesiones.size;
}
