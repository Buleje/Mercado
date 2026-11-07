/**
 * motivo-correccion — por qué se cambió una marca de asistencia YA guardada
 * (ADR-417).
 *
 * MEDIDO el 2026-09-15 contra la base real: 10 marcas corregidas, 0 motivos.
 * El camino del servidor SIEMPRE estuvo entero —`guardarMarcasSchema.motivo`
 * → `PUT /api/rrhh/asistencia` → `AsistenciaDB.guardar` → `motivoCorreccion`
 * de la fila que se da de baja → `reemplazada.motivo` del historial—; lo que
 * faltaba era la PREGUNTA: la pantalla mandaba `{ marcas }` y nunca un motivo.
 * Para una fiscalización, «se corrigió» sin motivo es lo mismo que nada.
 *
 * Acá viven las dos mitades que no son ni React ni Prisma:
 *
 *  1. `revisarMotivoCorreccion` — qué cuenta como motivo. La usan el modal
 *     (antes de guardar) y el schema de Zod (antes de escribir): una sola
 *     definición, dos puertas.
 *
 *  2. El buzón (`pedirMotivoCorreccion` / `suscribirPedidoDeMotivo`), que deja
 *     a `use-rrhh-asistencia` PREGUNTAR sin conocer al modal que responde. El
 *     hook corre en tres hojas distintas (día, semana, mes) y el modal se
 *     monta UNA vez por encima de las tres, en `AsistenciaView`. Mismo patrón
 *     que `toast` de sonner: quien pregunta no monta nada. Es estado de
 *     navegador: en el servidor nadie lo llama.
 */

import type { EstadoAsistencia, FechaKey } from "./tipos";

/**
 * Mínimo de LETRAS (no de caracteres): «ok» son 2, «...» y «1234» son 0. Un
 * motivo de 4 letras ya dice algo («tarde», «error», «feriado»); menos que eso
 * es una casilla llenada para salir del paso, que es justo lo que no sirve
 * ante SUNAFIL.
 */
export const MOTIVO_CORRECCION_MIN_LETRAS = 4;
/** El mismo tope que `motivoCese` y el motivo de una tarifa: la columna es `text`, pero el formulario no es un diario. */
export const MOTIVO_CORRECCION_MAX = 300;

/**
 * Lo que de verdad pasa en el patio. Un toque y listo: marcar 20 personas no
 * puede frenarse a tipear (lente «lo que entra sin tipear»).
 */
export const MOTIVOS_FRECUENTES = [
  "Me equivoqué al marcar",
  "Avisó su falta después",
  "Llegó tarde, no faltó",
  "Trajo descanso médico",
  "Se corrigió la hora de entrada o salida",
] as const;

export type RevisionMotivo = { ok: true; motivo: string } | { ok: false; message: string };

/** Cuenta letras de verdad (incluye tildes y ñ). */
function letrasDe(texto: string): number {
  return (texto.match(/\p{L}/gu) ?? []).length;
}

/**
 * «ok», «.», «..», «1234» → no. Devuelve el motivo ya normalizado (sin
 * espacios de más) para que lo que se guarda sea lo que se lee.
 */
export function revisarMotivoCorreccion(texto: string): RevisionMotivo {
  const motivo = texto.trim().replace(/\s+/g, " ");
  if (motivo.length === 0) return { ok: false, message: "Escribe por qué se corrige esta marca." };
  if (motivo.length > MOTIVO_CORRECCION_MAX) {
    return { ok: false, message: `El motivo no puede pasar de ${MOTIVO_CORRECCION_MAX} caracteres.` };
  }
  if (letrasDe(motivo) < MOTIVO_CORRECCION_MIN_LETRAS) {
    return { ok: false, message: `Eso no explica nada: escribe al menos ${MOTIVO_CORRECCION_MIN_LETRAS} letras.` };
  }
  return { ok: true, motivo };
}

// ── El buzón: quien corrige pregunta, el modal responde ──────────────────────

/** Una marca que se está por pisar: la fila del modal, sin formato. */
export interface CambioACorregir {
  colaboradorId: string;
  nombre: string;
  fecha: FechaKey;
  /** Lo que ya estaba guardado (por eso es una corrección). */
  antes: EstadoAsistencia | null;
  /** `null` = se está quitando la marca del día. */
  despues: EstadoAsistencia | null;
}

export type RespuestaMotivo =
  /** El usuario escribió (o tocó) un motivo válido. */
  | { tipo: "motivo"; motivo: string }
  /** Cerró el modal: la corrección NO se guarda y la celda vuelve a lo que el servidor tiene. */
  | { tipo: "cancelado" }
  /**
   * Nadie montó el modal (una pantalla nueva que usa el hook sin
   * `MotivoCorreccionModal` arriba). Se guarda igual, sin motivo: perder la
   * corrección del usuario sería peor que perder el motivo.
   */
  | { tipo: "sin-host" };

type Escucha = (cambios: CambioACorregir[] | null) => void;

let escucha: Escucha | null = null;
let resolverPendiente: ((r: RespuestaMotivo) => void) | null = null;

/**
 * Monta el buzón. Devuelve la baja — que además cancela lo que haya quedado
 * abierto: si el hub se cierra con el modal en pantalla, el `await` del flush
 * tiene que terminar (si no, la corrección queda colgada y nadie avisa nada).
 */
export function suscribirPedidoDeMotivo(fn: Escucha): () => void {
  escucha = fn;
  return () => {
    if (escucha === fn) escucha = null;
    responderMotivo({ tipo: "cancelado" });
  };
}

/**
 * Pregunta por el motivo de una tanda de correcciones. Un pedido a la vez: si
 * ya hay uno abierto, el anterior se cancela (no se apilan dos modales).
 */
export function pedirMotivoCorreccion(cambios: CambioACorregir[]): Promise<RespuestaMotivo> {
  if (!escucha) return Promise.resolve({ tipo: "sin-host" });
  responderMotivo({ tipo: "cancelado" }); // cierra el pedido anterior, si lo había
  const destinatario = escucha;
  return new Promise<RespuestaMotivo>((resolve) => {
    resolverPendiente = resolve;
    destinatario(cambios);
  });
}

/** La respuesta del modal (o la cancelación de quien lo desmonta). */
export function responderMotivo(respuesta: RespuestaMotivo): void {
  const resolver = resolverPendiente;
  resolverPendiente = null;
  resolver?.(respuesta);
}

/** Sólo para tests: deja el buzón como recién cargado. */
export function _resetBuzonDeMotivo(): void {
  escucha = null;
  resolverPendiente = null;
}
