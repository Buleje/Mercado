/**
 * Cuánto vive un documento en la papelera del drive.
 *
 * La papelera era para siempre: lo borrado seguía ocupando espacio (y contando
 * para la cuota) hasta que alguien entrara a eliminarlo definitivamente uno por
 * uno — o sea, nunca. Con una retención fija, el drive se limpia solo y el
 * usuario tiene un plazo claro para arrepentirse.
 *
 * Este módulo es PURO a propósito: el mismo número que usa el cron para borrar
 * es el que la pantalla muestra ("se borra solo en 5 días"). Si el cálculo
 * viviera en el servidor nada más, la papelera prometería un plazo y el cron
 * cumpliría otro.
 */

/** Días que un documento sobrevive en la papelera antes de borrarse solo. */
export const DIAS_RETENCION_PAPELERA = 30;

/** Cuando quedan estos días o menos, la pantalla lo dice en rojo. */
export const DIAS_AVISO_RETENCION = 3;

const DIA_MS = 86_400_000;

/** Fecha de corte: lo borrado ANTES de esto ya cumplió su plazo. */
export function corteRetencion(ahora: Date = new Date()): Date {
  return new Date(ahora.getTime() - DIAS_RETENCION_PAPELERA * DIA_MS);
}

/** Días completos que lleva en la papelera (0 = lo borraron hoy). */
export function diasEnPapelera(deletedAt: string | Date, ahora: Date = new Date()): number {
  const t = deletedAt instanceof Date ? deletedAt.getTime() : new Date(deletedAt).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((ahora.getTime() - t) / DIA_MS));
}

/** Días que le quedan antes del borrado automático (0 = se va en la próxima corrida). */
export function diasRestantes(deletedAt: string | Date, ahora: Date = new Date()): number {
  return Math.max(0, DIAS_RETENCION_PAPELERA - diasEnPapelera(deletedAt, ahora));
}

/**
 * Lo mismo dicho en castellano para la fila de la papelera. `null` cuando no hay
 * fecha de borrado: sin fecha no se promete ningún plazo.
 */
export function textoRetencion(
  deletedAt: string | Date | null,
  ahora: Date = new Date(),
): { texto: string; urgente: boolean } | null {
  if (!deletedAt) return null;
  const dias = diasRestantes(deletedAt, ahora);
  if (dias === 0) return { texto: "se borra solo hoy", urgente: true };
  if (dias === 1) return { texto: "se borra solo mañana", urgente: true };
  return { texto: `se borra solo en ${dias} días`, urgente: dias <= DIAS_AVISO_RETENCION };
}
