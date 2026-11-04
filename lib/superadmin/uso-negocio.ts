/**
 * lib/superadmin/uso-negocio.ts — mapeo PURO de las señales de uso a los campos de la pantalla
 * «Uso vs límites» (04-11, noche autónoma). Sin DB.
 *
 * La ruta `/api/superadmin/tenants/usage` sólo contaba pedidos del mes, productos y usuarios, así
 * que un aserradero (Blas: 0 pedidos y 0 productos, pero libro CTP, trozas e ingresos todos los
 * días) salía con uso casi cero. Las señales reales salen de `SaludNegocioDB.senalesDeUso` (la misma
 * fuente del puntaje de salud); acá sólo se las convierte a campos ADITIVOS de la fila.
 *
 * El límite del plan sigue midiéndose en pedidos (`USAGE_TIERS["order.created"]`): las operaciones
 * forestales se muestran, pero no disparan «cerca del límite» ni el upsell.
 */

import type { SenalesDeUso } from "@/lib/db/salud-negocio.db";

export interface CamposDeOperaciones {
  /** Pedidos + ventas POS + líneas del libro CTP + ingresos de trozas, últimos 30 días. */
  operations30d: number | null;
  /** Desglose de esas operaciones. */
  operationsBreakdown: { pedidos: number; ventas: number; libroCtp: number; trozas: number } | null;
  /** Ingresos (login) de personas, 30 días. */
  logins30d: number | null;
  /** Acciones de personas en el panel, 30 días. */
  actions30d: number | null;
  /** ISO de la última vez que una persona entró / se registró una operación; null = nunca. */
  lastLoginAt: string | null;
  lastOperationAt: string | null;
}

/** Fila sin señales (no se pudieron leer): todo null, para que la pantalla muestre «—» y no un 0 falso. */
export const SIN_SENALES: CamposDeOperaciones = {
  operations30d: null,
  operationsBreakdown: null,
  logins30d: null,
  actions30d: null,
  lastLoginAt: null,
  lastOperationAt: null,
};

/** Convierte las señales de un negocio en los campos aditivos de su fila; `null` = no se pudo medir. */
export function camposDeOperaciones(senales: SenalesDeUso | null | undefined): CamposDeOperaciones {
  if (!senales) return SIN_SENALES;
  return {
    operations30d: senales.operaciones30d,
    operationsBreakdown: { ...senales.desglose30d },
    logins30d: senales.ingresos30d,
    actions30d: senales.acciones30d,
    lastLoginAt: senales.ultimoIngreso ? senales.ultimoIngreso.toISOString() : null,
    lastOperationAt: senales.ultimaOperacion ? senales.ultimaOperacion.toISOString() : null,
  };
}

interface FilaOrdenable {
  nearLimit: boolean;
  orderPct: number;
  operations30d: number | null;
}

/**
 * Orden de la lista: candidatas a upsell primero, luego más uso de pedidos, y a igual porcentaje
 * (casi todos en 0 %) el que más opera: un aserradero activo ya no se pierde entre los vacíos.
 */
export function compararPorUso(a: FilaOrdenable, b: FilaOrdenable): number {
  return (
    Number(b.nearLimit) - Number(a.nearLimit) ||
    b.orderPct - a.orderPct ||
    (b.operations30d ?? 0) - (a.operations30d ?? 0)
  );
}
