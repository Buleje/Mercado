/**
 * Reparto del cobro masivo de fiados: un monto se reparte entre los fiados
 * elegidos del MÁS VIEJO al más nuevo, en céntimos enteros.
 *
 * Por qué en céntimos: en float, 50 − 33,30 deja 16,700000000000003 y la
 * resta en cadena dejaba restos de 3,5e-15 que el servidor aceptaba como un
 * pago «positivo» y anotaba una cuota de S/ 0,00 en el fiado siguiente.
 *
 * Una sola regla para la ventana (vista previa) y para el servidor (lo que se
 * cobra de verdad, con los saldos leídos dentro de la transacción): el monto
 * que ves repartido es el que se cobra.
 */

export type FiadoARepartir = { id: string; saldo: number; createdAt: string | Date };

export type PagoRepartido = {
  fiadoId: string;
  /** Lo que se le abona a este fiado (S/, a céntimos). */
  pago: number;
  /** Lo que debía antes del cobro (S/, a céntimos). */
  saldo: number;
  /** true = queda pagado del todo. */
  completo: boolean;
};

export type RepartoCobroMasivo = {
  pagos: PagoRepartido[];
  /** Suma de los pagos: lo que entra de verdad (y a la caja). */
  cobrado: number;
  /** Lo que sobra del monto porque los fiados elegidos deben menos. No se cobra. */
  sobrante: number;
};

/** Pedido del cobro masivo: el detalle por fiado (contrato viejo) o el monto a repartir. */
export type PedidoCobroMasivo =
  | Array<{ fiadoId: string; monto: number }>
  | { fiadoIds: string[]; monto: number };

/** El fiado no existe en el negocio o ya no se puede cobrar (pagado o anulado). */
export class FiadoNoCobrableError extends Error {
  readonly code = "FIADO_NO_COBRABLE";
  constructor(message: string) {
    super(message);
    this.name = "FiadoNoCobrableError";
  }
}

/** S/ → céntimos enteros (los saldos vienen de un Decimal de 2 decimales). */
export function aCentimos(soles: number): number {
  return Number.isFinite(soles) ? Math.round(soles * 100) : 0;
}

function tiempo(f: FiadoARepartir): number {
  const t = new Date(f.createdAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function repartirCobroMasivo(fiados: readonly FiadoARepartir[], monto: number): RepartoCobroMasivo {
  const pedido = Math.max(0, aCentimos(monto));
  let restante = pedido;
  // Más viejo primero; a igual fecha, por id, para que la vista previa y el
  // servidor elijan el mismo orden siempre.
  const orden = [...fiados].sort((a, b) => tiempo(a) - tiempo(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const pagos: PagoRepartido[] = [];
  for (const f of orden) {
    if (restante <= 0) break;
    const saldo = Math.max(0, aCentimos(f.saldo));
    if (saldo === 0) continue;
    const pago = Math.min(restante, saldo);
    pagos.push({ fiadoId: f.id, pago: pago / 100, saldo: saldo / 100, completo: pago === saldo });
    restante -= pago;
  }
  return { pagos, cobrado: (pedido - restante) / 100, sobrante: restante / 100 };
}
