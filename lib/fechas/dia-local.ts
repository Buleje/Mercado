/**
 * El día del negocio, no el día de Greenwich.
 *
 * `new Date(iso).toISOString().slice(0, 10)` da el día en UTC. En Perú (UTC−5)
 * eso corre la frontera cinco horas: todo lo que pasa después de las 19:00
 * queda registrado «mañana». Para una bodega que cierra a las 22:00, es la
 * mitad de la caja de la noche cayendo en el día siguiente.
 *
 * Apareció dos veces el mismo día (2026-08-12): en el filtro «Hoy» del kardex
 * y en el Flujo de Caja Semanal. Por eso vive acá y no copiado en cada pantalla.
 */

/** `YYYY-MM-DD` del día LOCAL en que ocurrió ese instante. */
export function diaLocal(fecha: string | Date): string {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return "";
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Medianoche local de hoy, en milisegundos. El arranque real del día. */
export function inicioDeHoy(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Los últimos `n` días (incluido hoy), del más viejo al más nuevo. */
export function ultimosDiasLocales(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(diaLocal(d));
  }
  return out;
}
