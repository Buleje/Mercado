/**
 * Lo que el formulario ya podría saber sin que nadie lo escriba.
 *
 * Todo esto sale de datos que YA están en pantalla —los adelantos de la
 * persona— y hasta ahora había que recordarlo de memoria o abrir otra pestaña:
 * cuánto se le suele dar, si ya se le dio algo hoy, y para cuándo se acostumbra
 * pedirle la devolución.
 */

import type { DbAdelanto } from "@/lib/db/adelantos.db";

const DIA = 86_400_000;

/** Los adelantos vivos de una persona, del más nuevo al más viejo. */
export function adelantosDe(adelantos: readonly DbAdelanto[], beneficiarioId: string): DbAdelanto[] {
  return adelantos
    .filter((a) => a.beneficiarioId === beneficiarioId && a.status !== "CANCELADO")
    .sort((x, y) => new Date(y.fechaAdelanto).getTime() - new Date(x.fechaAdelanto).getTime());
}

/**
 * ¿Ya se le dio plata hoy?
 *
 * El caso real no es el fraude: son dos personas atendiendo el mismo mostrador,
 * o el mismo botón apretado dos veces porque la primera pareció no responder.
 * El adelanto duplicado se descubre al cuadrar la caja, cuando ya salió.
 */
export function yaTuvoAdelantoHoy(
  adelantos: readonly DbAdelanto[],
  beneficiarioId: string,
  ahora: number = Date.now(),
): DbAdelanto | null {
  const hoy = new Date(ahora);
  const mismoDia = (iso: string) => {
    const d = new Date(iso);
    return (
      d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth() && d.getDate() === hoy.getDate()
    );
  };
  return adelantosDe(adelantos, beneficiarioId).find((a) => mismoDia(a.fechaAdelanto)) ?? null;
}

export type SugerenciaRepetir = {
  monto: number;
  moneda: string;
  modalidad: string;
  notas: string | null;
  /** Hace cuántos días fue, para poder decirlo. */
  hace: number;
};

/**
 * El último adelanto de esta persona, listo para repetir.
 *
 * A un mismo proveedor se le adelanta casi siempre lo mismo y por lo mismo.
 * Volver a tipear monto, modalidad y motivo cada quincena es trabajo que la
 * pantalla ya tenía cómo evitar.
 */
export function sugerirRepetir(
  adelantos: readonly DbAdelanto[],
  beneficiarioId: string,
  ahora: number = Date.now(),
): SugerenciaRepetir | null {
  const ultimo = adelantosDe(adelantos, beneficiarioId)[0];
  if (!ultimo || !(ultimo.montoAdelantado > 0)) return null;
  return {
    monto: ultimo.montoAdelantado,
    moneda: ultimo.moneda,
    modalidad: ultimo.modalidad,
    notas: ultimo.notas ?? null,
    hace: Math.max(0, Math.floor((ahora - new Date(ultimo.fechaAdelanto).getTime()) / DIA)),
  };
}

/**
 * Cuántos días suele pasar entre que se le adelanta y termina de devolver.
 *
 * Se calcula sobre los LIQUIDADOS: es su ritmo real de devolución, no una
 * promesa. Con menos de dos casos no hay ritmo que estimar — un solo dato es
 * una anécdota, y sugerir una fecha en base a eso es inventar.
 */
export function plazoHabitualDe(adelantos: readonly DbAdelanto[], beneficiarioId: string): number | null {
  const plazos = adelantosDe(adelantos, beneficiarioId)
    .filter((a) => a.status === "LIQUIDADO" && a.entregas.length > 0)
    .map((a) => {
      const dado = new Date(a.fechaAdelanto).getTime();
      const ultimaEntrega = Math.max(...a.entregas.map((e) => new Date(e.fecha).getTime()));
      return Math.round((ultimaEntrega - dado) / DIA);
    })
    .filter((d) => d >= 0);

  if (plazos.length < 2) return null;
  return Math.round(plazos.reduce((s, d) => s + d, 0) / plazos.length);
}
