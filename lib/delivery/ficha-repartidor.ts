/**
 * Ficha del repartidor (17-10, P24/P41/P42): sus entregas, incidencias, lo
 * ganado y lo pagado en un período. Puro (sin base): lo usa
 * `DeliveryPartnersDB.fichaForAdmin` y lo prueba `__tests__/lib/delivery/ficha-repartidor.test.ts`.
 *
 * Dos cifras que NO se mezclan (P41): «ganado» = tarifas + propinas de las
 * entregas hechas en el período (lo que devengó); «pagado» = retiros pagados en
 * el período (la plata que salió). Un retiro pagado no cambia el número de
 * entregas ni lo ganado, y una entrega no cambia lo pagado.
 */

/** Lo que agrupa la base por estado de la asignación. */
export interface GrupoAsignaciones {
  status: string;
  cantidad: number;
  tarifas: number;
  propinas: number;
}

export interface ResumenFicha {
  asignadas: number;
  entregadas: number;
  /** Canceladas o fallidas: las incidencias. */
  noEntregadas: number;
  enCurso: number;
  ganadoTarifas: number;
  propinas: number;
  /** Tarifas + propinas de lo entregado. */
  ganado: number;
}

export const ESTADOS_NO_ENTREGADA = ["cancelled", "failed"] as const;
export const ESTADOS_CERRADOS = ["delivered", ...ESTADOS_NO_ENTREGADA] as const;

const redondear = (n: number) => Math.round(n * 100) / 100;

export function resumenDeFicha(grupos: readonly GrupoAsignaciones[]): ResumenFicha {
  const r: ResumenFicha = { asignadas: 0, entregadas: 0, noEntregadas: 0, enCurso: 0, ganadoTarifas: 0, propinas: 0, ganado: 0 };
  for (const g of grupos) {
    r.asignadas += g.cantidad;
    if (g.status === "delivered") {
      r.entregadas += g.cantidad;
      r.ganadoTarifas += g.tarifas;
      r.propinas += g.propinas;
    } else if ((ESTADOS_NO_ENTREGADA as readonly string[]).includes(g.status)) {
      r.noEntregadas += g.cantidad;
    } else {
      r.enCurso += g.cantidad;
    }
  }
  r.ganadoTarifas = redondear(r.ganadoTarifas);
  r.propinas = redondear(r.propinas);
  r.ganado = redondear(r.ganadoTarifas + r.propinas);
  return r;
}

/** Minutos entre que recogió y entregó; `null` si falta alguna de las dos. */
export function minutosDeEntrega(pickedUpAt: Date | string | null | undefined, deliveredAt: Date | string | null | undefined): number | null {
  if (!pickedUpAt || !deliveredAt) return null;
  const min = (new Date(deliveredAt).getTime() - new Date(pickedUpAt).getTime()) / 60_000;
  return Number.isFinite(min) && min >= 0 ? Math.round(min) : null;
}

/** Con más de esto entre recoger y entregar, la fila se marca «tardó». */
export const MINUTOS_ENTREGA_LENTA = 45;
