/**
 * lib/finance/cuentas-tipos.ts — contrato de «Cuentas» (Mi Plata › Movimientos ›
 * Todo lo que entró y salió). Brandon 01-11-2026: «llevar Cuentas al panel para
 * que cualquier aserradero la tenga»; nació como el widget de su PC (tablero con
 * Excel + panel de Blas) y acá queda solo lo que el panel sabe.
 *
 * Una lista de TODO movimiento de plata del negocio en un periodo —adelantos
 * dados, gastos, ingresos— con persona, detalle y hora, más lo que le deben
 * (adelantos abiertos). El servidor arma todo (regla 6: totales en backend);
 * la pantalla solo dibuja y filtra lo que ya llegó.
 *
 * PURO y client-safe: solo tipos y constantes.
 */

export const PERIODOS_CUENTAS = ["semana", "mes", "todo"] as const;
/** semana = desde el lunes (Lima) · mes = desde el día 1 (Lima) · todo = sin límite de fecha. */
export type PeriodoCuentas = (typeof PERIODOS_CUENTAS)[number];

/** Para qué lado va la plata: adelantos y gastos SALEN, ingresos ENTRAN. */
export type GrupoCuenta = "adelantos" | "gastos" | "ingresos";

/** De qué tabla salió la fila (para el enlace al original y para no contar dos veces). */
export type FuenteCuenta = "adelanto" | "venta" | "caja" | "gasto" | "tesoreria" | "maquina" | "alquiler";

export interface MovimientoCuenta {
  /** `${fuente}:${id original}` — único en la lista. */
  id: string;
  fuente: FuenteCuenta;
  grupo: GrupoCuenta;
  /** Texto corto para mostrar: «Adelanto», «Venta», «Gasto», «Gasto de caja», «Alquiler cobrado»… */
  tipo: string;
  /** Instante real en ISO con zona (`2026-11-01T14:05:00.000Z`). */
  cuando: string;
  /** false = el dato se guardó solo con fecha (no inventar una hora en pantalla). */
  conHora: boolean;
  /** Con quién fue (persona del adelanto, proveedor, cliente, máquina). "" si no aplica. */
  persona: string;
  detalle: string;
  /** Siempre positivo; el lado lo da `grupo`. */
  monto: number;
  /** "PEN" casi siempre. Lo que no es PEN se lista pero NO entra en los totales. */
  moneda: string;
}

export interface DeudorCuenta {
  persona: string;
  /** Suma de `saldoPendiente` de sus adelantos dados que siguen ABIERTOS. */
  saldo: number;
  /** Cuántos adelantos abiertos tiene. */
  adelantos: number;
}

export interface CuentasDelPeriodo {
  periodo: PeriodoCuentas;
  /** Primer día del periodo en Lima (YYYY-MM-DD); null en «todo». */
  desde: string | null;
  /** Hoy en Lima (YYYY-MM-DD). */
  hasta: string;
  /** Solo PEN. */
  totales: Record<GrupoCuenta, { monto: number; n: number }>;
  /** entro = ingresos · salio = adelantos + gastos · queda = entro − salio (puede ser negativo). */
  entro: number;
  salio: number;
  queda: number;
  /** Saldo de HOY (no depende del periodo). */
  porCobrar: { total: number; deudores: DeudorCuenta[] };
  /** Lo más nuevo primero. Tope `TOPE_MOVIMIENTOS`; los totales se calculan con TODO el periodo. */
  movimientos: MovimientoCuenta[];
  truncado: boolean;
  /** Filas en otra moneda, fuera de los totales (para avisarlo en pantalla). */
  otrasMonedas: number;
}

export const TOPE_MOVIMIENTOS = 500;
