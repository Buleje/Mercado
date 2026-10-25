/**
 * Los autofiltros de Excel de las demás tablas de Adelantos (Brandon 25-10:
 * «todas las tablas… tipo en su encabezado filtros tipo Excel»). El modelo es
 * la Lista (`lista/filtros-columnas-adelantos.ts`): texto = buscar un pedazo,
 * multi = tildar de la lista, rango/fecha = de–a.
 *
 * Todas estas tablas se cargan enteras en el cliente (no hay paginado del
 * servidor), así que filtrar acá no miente.
 */
import type { ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import type { LineaDescuento } from "@/lib/adelantos/planilla-lote";
import type { MovimientoCuenta } from "@/lib/adelantos/estado-cuenta";
import { cumplimientoDe } from "@/lib/adelantos/saldo-persona";
import { cuentaDePersona, hayDeuda } from "@/lib/adelantos/modos-alta";
import type { BeneficiarioConSaldo } from "./crear-adelanto/tipos";

const ddmm = (v: number | string) => String(v).slice(0, 10).split("-").reverse().join("/");
const dia = (iso: string) => iso.slice(0, 10);
const soles = (m: Record<string, number> | undefined) => m?.PEN ?? 0;

/** La situación de una persona, en una palabra (la misma que dice su fila). */
export const situacionDePersona = (b: BeneficiarioConSaldo): string => {
  const cuenta = cuentaDePersona(b);
  if (hayDeuda(cuenta.teDebe)) return "Con saldo";
  if (hayDeuda(cuenta.leDebes)) return "Le debes";
  return "Al día";
};

export const COLUMNAS_FILTRO_PERSONAS: readonly ColumnaFiltro<BeneficiarioConSaldo>[] = [
  { id: "persona", label: "Persona", tipo: "texto", valor: (b) => [b.nombre, b.documento ?? "", b.telefono ?? ""].filter(Boolean) },
  { id: "adelantado", label: "Adelantado", tipo: "rango", numero: (b) => soles(b.totalAdelantado), paso: 1, unidad: "S/" },
  { id: "debe", label: "Te debe", tipo: "rango", numero: (b) => soles(cuentaDePersona(b).teDebe), paso: 1, unidad: "S/" },
  { id: "cumplimiento", label: "Cumplimiento", tipo: "rango", numero: (b) => cumplimientoDe(b), paso: 5, unidad: "%" },
  { id: "estado", label: "Estado", tipo: "multi", valor: situacionDePersona },
];

/** Cuenta corriente de la ficha de una persona. */
export const COLUMNAS_FILTRO_CUENTA_PERSONA: readonly ColumnaFiltro<MovimientoCuenta>[] = [
  { id: "fecha", label: "Fecha", tipo: "fecha", numero: (m) => dia(m.fecha), formatearValor: ddmm },
  { id: "concepto", label: "Concepto", tipo: "texto", valor: (m) => m.concepto },
  { id: "monto", label: "Monto", tipo: "rango", numero: (m) => m.monto, paso: 1 },
  { id: "saldo", label: "Saldo", tipo: "rango", numero: (m) => m.saldo, paso: 1 },
];

export const queDiceElDescuento = (l: LineaDescuento): string =>
  l.descuento <= 0 ? "Se saltea" : l.liquida ? "Liquidado" : "Queda saldo";

/* «Se descuenta» no lleva filtro: se escribe ahí mismo y la fila se iría mientras tipeas. */
export const COLUMNAS_FILTRO_DESCUENTO: readonly ColumnaFiltro<LineaDescuento>[] = [
  { id: "persona", label: "Persona", tipo: "texto", valor: (l) => [l.persona, l.codigo ?? ""].filter(Boolean) },
  { id: "debe", label: "Debe", tipo: "rango", numero: (l) => l.saldo, paso: 1 },
  { id: "queda", label: "Queda", tipo: "multi", valor: queDiceElDescuento },
];

/** Una fila de la vista previa de la liquidación. */
export interface FilaPrevia {
  libreta: string;
  concepto: string | null;
  referencia: string | null;
  monto: number;
}

export const COLUMNAS_FILTRO_PREVIA: readonly ColumnaFiltro<FilaPrevia>[] = [
  { id: "libreta", label: "Libreta", tipo: "multi", valor: (f) => f.libreta },
  { id: "concepto", label: "Qué se escribe", tipo: "texto", valor: (f) => f.concepto },
  { id: "referencia", label: "Referencia", tipo: "texto", valor: (f) => f.referencia },
  { id: "monto", label: "Monto", tipo: "rango", numero: (f) => f.monto, paso: 1 },
];

/** Movimientos de la cuenta forestal (con el saldo corrido). */
export interface FilaMovimientoForestal {
  id: string;
  moneda: string;
  fecha: string;
  concepto: string;
  referencia: string | null;
  /** Con signo: cargo +, abono −. */
  monto: number;
  acumulado: number;
}

export const COLUMNAS_FILTRO_MOV_FORESTAL: readonly ColumnaFiltro<FilaMovimientoForestal>[] = [
  { id: "fecha", label: "Fecha", tipo: "fecha", numero: (m) => dia(m.fecha), formatearValor: ddmm },
  { id: "concepto", label: "Concepto", tipo: "multi", valor: (m) => m.concepto },
  { id: "referencia", label: "Referencia", tipo: "texto", valor: (m) => m.referencia },
  { id: "monto", label: "Monto", tipo: "rango", numero: (m) => m.monto, paso: 1 },
  { id: "saldo", label: "Saldo", tipo: "rango", numero: (m) => m.acumulado, paso: 1 },
];
