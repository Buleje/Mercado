/**
 * Trueque en el mostrador: el cliente paga su compra (o parte) con productos
 * — 3 kg de plátano, 2 gallinas.
 *
 * Regla (09-10): lo que vale lo recibido es un DESCUENTO de la venta, nunca
 * plata. `descuento = min(valor, total)` y lo que falta se cobra con un medio
 * real (efectivo, Yape o Plin). Antes el POS:
 *  - con diferencia, mandaba como pagado sólo la diferencia de una venta SIN
 *    descuento → el servidor respondía 400 siempre («Monto pagado menor que el
 *    total»);
 *  - sin diferencia, anotaba el total como EFECTIVO → el arqueo esperaba plata
 *    que nunca entró a la caja.
 *
 * El descuento pasa por el MISMO tope de rol que cualquier descuento global de
 * `POST /api/sales`: cajero hasta el 15 % del total; admin y dueño, hasta el
 * total. El trueque lo hereda: la cuenta es UNA, en `lib/pos/descuento-cajero.ts`,
 * y la ruta la importa (un guardián en `__tests__/pos-trueque.test.ts` lo vigila).
 *
 * Sin `"use client"`: lo usan el modal del POS y la ruta de ventas.
 */

import {
  excedeTopeCajero,
  rolDescuentaSinTope,
  topeDescuentoCajero,
} from "@/lib/pos/descuento-cajero";

export { rolDescuentaSinTope };

/** Medios con los que se cobra la diferencia. */
export const MEDIOS_TRUEQUE = ["efectivo", "yape", "plin"] as const;
export type MedioTrueque = (typeof MEDIOS_TRUEQUE)[number];

/** Máximo de caracteres de «qué recibió» (el mismo tope valida la ruta). */
export const MAX_RECIBIDO = 200;

function centimos(n: number): number {
  return Math.round(n * 100) / 100;
}

function positivo(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export interface CalculoTrueque {
  /** Total de la venta según el POS (vista previa: el servidor la recalcula con los precios de la base). */
  total: number;
  /** Lo que vale lo recibido. */
  valor: number;
  /** Lo que se descuenta de la venta: `min(valor, total)`. */
  descuento: number;
  /** Lo que falta cobrar con efectivo, Yape o Plin. */
  aCobrar: number;
  /** Lo recibido vale más que la venta: ese exceso no se devuelve en plata. */
  sobra: number;
  /** Descuento máximo que el servidor le acepta a un cajero en esta venta. */
  topeCajero: number;
  /** El descuento supera el tope de cajero (sólo frena si el rol no es admin ni dueño). */
  pasaTopeCajero: boolean;
}

export function calcularTrueque(totalVenta: number, valorRecibido: number): CalculoTrueque {
  const total = centimos(positivo(totalVenta));
  const valor = centimos(positivo(valorRecibido));
  const descuento = Math.min(valor, total);
  return {
    total,
    valor,
    descuento,
    aCobrar: centimos(total - descuento),
    sobra: centimos(valor - descuento),
    // La misma cuenta en céntimos que usa la ruta: el POS frena donde ella.
    topeCajero: topeDescuentoCajero(total),
    pasaTopeCajero: excedeTopeCajero(descuento, total),
  };
}

/**
 * El rol frena el trueque. Rol desconocido (todavía cargando) → no frena: la
 * ruta decide y el error llega a la barra del POS.
 */
export function frenaPorRol(calc: CalculoTrueque, rol: string | null | undefined): boolean {
  return rol != null && !rolDescuentaSinTope(rol) && calc.pasaTopeCajero;
}

/** La nota de la venta: «Trueque: 3 kg de plátano (S/ 12.00)». */
export function notaTrueque(recibido: string, valor: number): string {
  const que = recibido.trim().replace(/\s+/g, " ").slice(0, MAX_RECIBIDO);
  return `Trueque: ${que} (S/ ${centimos(positivo(valor)).toFixed(2)})`;
}

export interface CobroTrueque {
  /** Una sola línea de pago: la diferencia con el medio elegido (S/ 0 si el trueque cubre todo). */
  pago: { method: MedioTrueque; amount: number };
  /** Va como `descuentoMonto` de la venta. */
  descuento: number;
  /** Qué recibió y cuánto vale, para la nota de la venta. */
  trueque: { recibido: string; valor: number };
  nota: string;
}

export function armarCobroTrueque(
  calc: CalculoTrueque,
  medio: MedioTrueque,
  recibido: string,
): CobroTrueque {
  const que = recibido.trim().replace(/\s+/g, " ").slice(0, MAX_RECIBIDO);
  return {
    // Sin diferencia no entra plata: efectivo por S/ 0 → la caja no anota nada
    // (`anotarVentaEnCaja` salta las líneas de monto 0).
    pago: { method: calc.aCobrar > 0 ? medio : "efectivo", amount: calc.aCobrar },
    descuento: calc.descuento,
    trueque: { recibido: que, valor: calc.valor },
    nota: notaTrueque(que, calc.valor),
  };
}
