/**
 * M26 (17-10): cuando el efectivo esperado da negativo, qué egresos lo bajan.
 *
 * El esperado SÓLO cuenta efectivo (`lib/caja/saldo-esperado`), así que sólo
 * los egresos en efectivo lo mueven: un retiro por Yape no está acá. La vista
 * previa «si no salió en efectivo» es un DERIVADO para orientar (esperado del
 * servidor + ese egreso); el número real lo vuelve a calcular el servidor al
 * corregir el medio. No propone ningún ingreso: un saldo así no se tapa con
 * plata que no entró.
 */
import { medioDeMovimiento } from "@/lib/caja/saldo-esperado";
import type { CashMovement } from "./tipos";

export interface EgresoQuePesa {
  mov: CashMovement;
  monto: number;
  /** Cómo quedaría el esperado si ese egreso no hubiera salido del cajón. */
  esperadoSinEl: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function egresosQueBajanElEsperado(movimientos: ReadonlyArray<CashMovement>, esperado: number, tope = 3): EgresoQuePesa[] {
  return movimientos
    .filter((m) => m.type === "egreso" && medioDeMovimiento(m.method) === "efectivo")
    .map((m) => ({ mov: m, monto: Math.abs(Number(m.amount) || 0) }))
    .sort((a, b) => b.monto - a.monto)
    .slice(0, tope)
    .map((e) => ({ ...e, esperadoSinEl: r2(esperado + e.monto) }));
}
