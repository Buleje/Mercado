/**
 * lib/contabilidad/reglas.ts — regla por hecho → líneas de debe y haber (ADR-529).
 *
 * Una regla = dos cuentas (debe / haber) y, si toca, el IGV separado a 40111:
 * - Ventas: el precio YA trae el IGV; se separa solo si `ventasConIgv`
 *   (base = monto / 1,18, redondeo a 2; el IGV es el resto, así cuadra exacto).
 * - Gastos: solo si el gasto trae su `igvAmount` (o `afectoIgv` sin monto: se calcula igual).
 * La cuenta «cambiable» (ingreso o gasto de la regla) la puede cambiar el
 * negocio en `ContabilidadAjustes.mapeo`. Un monto negativo (una corrección)
 * da el mismo asiento con debe y haber al revés.
 *
 * PURO y client-safe.
 */

import { esGastoDePersonal } from "@/lib/finance/resultado-del-negocio";
import type { ReglaVista } from "./tipos";

export const r2 = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;

interface ReglaDef {
  etiqueta: string;
  debe: string;
  haber: string;
  cambiable: "debe" | "haber" | null;
  igv: "venta" | "compra" | null;
}

export const REGLAS = {
  venta_mostrador: { etiqueta: "Venta del mostrador", debe: "1212", haber: "70111", cambiable: "haber", igv: "venta" },
  venta_pedido: { etiqueta: "Venta de un pedido", debe: "1212", haber: "70111", cambiable: "haber", igv: "venta" },
  aserrio_cobrado: { etiqueta: "Aserrío que cobraste", debe: "1212", haber: "70411", cambiable: "haber", igv: "venta" },
  madera_vendida: { etiqueta: "Madera vendida", debe: "1212", haber: "70211", cambiable: "haber", igv: "venta" },
  flete_cobrado: { etiqueta: "Flete que cobraste", debe: "1212", haber: "70412", cambiable: "haber", igv: "venta" },
  costo_mercaderia: { etiqueta: "Costo de la mercadería vendida", debe: "69111", haber: "20111", cambiable: "debe", igv: null },
  costo_madera: { etiqueta: "Costo de la madera vendida", debe: "69211", haber: "24111", cambiable: "debe", igv: null },
  aserrio_recibido: { etiqueta: "Aserrío que te hicieron", debe: "63991", haber: "4212", cambiable: "debe", igv: null },
  flete_pagado: { etiqueta: "Flete que pagas", debe: "63111", haber: "4212", cambiable: "debe", igv: null },
  gasto_alquiler: { etiqueta: "Gasto de alquiler", debe: "63522", haber: "4212", cambiable: "debe", igv: "compra" },
  gasto_servicios: { etiqueta: "Gasto de servicios (luz, agua, internet)", debe: "63691", haber: "4212", cambiable: "debe", igv: "compra" },
  gasto_transporte: { etiqueta: "Gasto de transporte", debe: "63111", haber: "4212", cambiable: "debe", igv: "compra" },
  gasto_marketing: { etiqueta: "Gasto de publicidad", debe: "63711", haber: "4212", cambiable: "debe", igv: "compra" },
  gasto_limpieza: { etiqueta: "Gasto de limpieza", debe: "65991", haber: "4212", cambiable: "debe", igv: "compra" },
  gasto_otros: { etiqueta: "Otros gastos", debe: "65991", haber: "4212", cambiable: "debe", igv: "compra" },
  gasto_personal: { etiqueta: "Gasto de personal (sin planilla)", debe: "62111", haber: "4111", cambiable: "debe", igv: null },
  planilla: { etiqueta: "Lo ganado del personal (planilla)", debe: "62111", haber: "4111", cambiable: "debe", igv: null },
  cobro_mostrador: { etiqueta: "Cobro en el mostrador", debe: "1011", haber: "1212", cambiable: null, igv: null },
  cobro_pedido: { etiqueta: "Cobro de un pedido", debe: "1011", haber: "1212", cambiable: null, igv: null },
  cobro_forestal: { etiqueta: "Cobro de la cuenta forestal", debe: "1011", haber: "1212", cambiable: null, igv: null },
  liquidacion_recibida: { etiqueta: "Te pagaron una liquidación", debe: "1011", haber: "1212", cambiable: null, igv: null },
  adelanto_recibido: { etiqueta: "Te adelantaron plata", debe: "1011", haber: "1221", cambiable: null, igv: null },
  adelanto_devuelto: { etiqueta: "Te devolvieron un adelanto en plata", debe: "1011", haber: "1412", cambiable: null, igv: null },
  adelanto_dado: { etiqueta: "Adelanto que diste", debe: "1412", haber: "1011", cambiable: null, igv: null },
  pago_forestal: { etiqueta: "Pago de la cuenta forestal", debe: "4212", haber: "1011", cambiable: null, igv: null },
  liquidacion_pagada: { etiqueta: "Pagaste una liquidación", debe: "4212", haber: "1011", cambiable: null, igv: null },
  gasto_pagado: { etiqueta: "Pago de un gasto", debe: "4212", haber: "1011", cambiable: null, igv: null },
  flete_pagado_caja: { etiqueta: "Pago de un flete", debe: "4212", haber: "1011", cambiable: null, igv: null },
  recibido_devuelto: { etiqueta: "Devolviste en plata lo que te adelantaron", debe: "1221", haber: "1011", cambiable: null, igv: null },
  caja_por_aclarar: { etiqueta: "Movimiento manual de caja", debe: "1011", haber: "4699", cambiable: null, igv: null },
  pago_proveedor: { etiqueta: "Pago a un proveedor (retiro de caja)", debe: "4212", haber: "1011", cambiable: null, igv: null },
  cruce_adelanto: { etiqueta: "Adelanto descontado (trabajo, producto o pago de la semana)", debe: "4111", haber: "1412", cambiable: null, igv: null },
  cruce_recibido: { etiqueta: "Lo que te adelantaron, pagado con producto", debe: "1221", haber: "1212", cambiable: null, igv: null },
  compensacion: { etiqueta: "Compensación (lo que debías contra lo que te debían)", debe: "4212", haber: "1212", cambiable: null, igv: null },
} as const satisfies Record<string, ReglaDef>;

export type ReglaId = keyof typeof REGLAS;
export const REGLAS_IDS = Object.keys(REGLAS) as ReglaId[];
export const esRegla = (s: string): s is ReglaId => Object.prototype.hasOwnProperty.call(REGLAS, s);

export interface ContextoReglas {
  ventasConIgv: boolean;
  tasaIgv: number;
  /** Regla → cuenta (lo que el negocio cambió). */
  mapeo: Readonly<Record<string, string>>;
}

export interface LineaCruda {
  cuenta: string;
  debe: number;
  haber: number;
}

export interface OpcionesLinea {
  /** Cuenta del lado NO cambiable cuando depende del hecho (adelanto de un proveedor → 4221). */
  debe?: string;
  haber?: string;
  /** IGV del comprobante de compra (gastos). */
  igvCompra?: number | null;
  afectoIgv?: boolean;
}

export interface ResultadoRegla {
  lineas: LineaCruda[];
  igvVenta: number;
  igvCompra: number;
}

/** Separa el IGV de un precio que lo incluye: base + igv = monto exacto. */
export function separarIgv(monto: number, tasa: number): { base: number; igv: number } {
  const base = r2(monto / (1 + tasa));
  return { base, igv: r2(monto - base) };
}

/** Las cuentas efectivas de una regla (default → override del hecho → mapeo del negocio). */
export function cuentasDeRegla(regla: ReglaId, ctx: ContextoReglas, op: OpcionesLinea = {}): { debe: string; haber: string } {
  const def: ReglaDef = REGLAS[regla];
  let debe = op.debe ?? def.debe;
  let haber = op.haber ?? def.haber;
  const m = ctx.mapeo[regla];
  if (m && def.cambiable === "debe") debe = m;
  if (m && def.cambiable === "haber") haber = m;
  return { debe, haber };
}

/** Líneas de un hecho. Monto 0 → sin líneas. */
export function lineasDeRegla(regla: ReglaId, monto: number, ctx: ContextoReglas, op: OpcionesLinea = {}): ResultadoRegla {
  const abs = r2(Math.abs(monto));
  if (!(abs > 0)) return { lineas: [], igvVenta: 0, igvCompra: 0 };
  const def: ReglaDef = REGLAS[regla];
  const { debe, haber } = cuentasDeRegla(regla, ctx, op);
  let lineas: LineaCruda[];
  let igvVenta = 0;
  let igvCompra = 0;
  if (def.igv === "venta" && ctx.ventasConIgv) {
    const { base, igv } = separarIgv(abs, ctx.tasaIgv);
    igvVenta = igv;
    lineas = [{ cuenta: debe, debe: abs, haber: 0 }, { cuenta: haber, debe: 0, haber: base }];
    if (igv > 0) lineas.push({ cuenta: "40111", debe: 0, haber: igv });
  } else if (def.igv === "compra" && ((op.igvCompra ?? 0) > 0 || op.afectoIgv)) {
    const igv = (op.igvCompra ?? 0) > 0 ? Math.min(r2(op.igvCompra ?? 0), abs) : separarIgv(abs, ctx.tasaIgv).igv;
    igvCompra = igv;
    lineas = [{ cuenta: debe, debe: r2(abs - igv), haber: 0 }];
    if (igv > 0) lineas.push({ cuenta: "40111", debe: igv, haber: 0 });
    lineas.push({ cuenta: haber, debe: 0, haber: abs });
  } else {
    lineas = [{ cuenta: debe, debe: abs, haber: 0 }, { cuenta: haber, debe: 0, haber: abs }];
  }
  lineas = lineas.filter((l) => l.debe > 0 || l.haber > 0);
  if (monto < 0) {
    lineas = lineas.map((l) => ({ cuenta: l.cuenta, debe: l.haber, haber: l.debe }));
    return { lineas, igvVenta: -igvVenta, igvCompra: -igvCompra };
  }
  return { lineas, igvVenta, igvCompra };
}

/** La regla de un gasto según su categoría (`Expense.category`). */
export function reglaDeGasto(category: string | null | undefined): ReglaId {
  if (esGastoDePersonal(category)) return "gasto_personal";
  const c = (category ?? "").trim().toLowerCase();
  if (c === "alquiler") return "gasto_alquiler";
  if (c === "servicios") return "gasto_servicios";
  if (c === "transporte") return "gasto_transporte";
  if (c === "marketing") return "gasto_marketing";
  if (c === "limpieza") return "gasto_limpieza";
  return "gasto_otros";
}

/** Cuenta por cobrar del adelanto que diste, según qué es la persona para el negocio. */
export function cuentaDeAdelantoDado(tipoRelacion: string | null | undefined): string {
  const t = (tipoRelacion ?? "").trim().toLowerCase();
  if (t === "trabajador") return "1412";
  if (t === "proveedor" || t === "chofer") return "4221";
  return "1629";
}

/** Contra qué se descuenta un adelanto que se pagó sin plata (trabajo → sueldo; proveedor → su factura). */
export function cuentaDeDescuento(tipoRelacion: string | null | undefined): string {
  return (tipoRelacion ?? "").trim().toLowerCase() === "trabajador" ? "4111" : "4212";
}

/** Para la pantalla de ajustes. */
export function reglasVista(): ReglaVista[] {
  return REGLAS_IDS.map((regla) => {
    const d: ReglaDef = REGLAS[regla];
    const haber = d.igv === "venta" ? [d.haber, "40111"] : [d.haber];
    const debe = d.igv === "compra" ? [d.debe, "40111"] : [d.debe];
    return { regla, etiqueta: d.etiqueta, debe, haber, cambiable: d.cambiable };
  });
}
