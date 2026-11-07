/**
 * Autofiltros de Excel de las tablas de Préstamos (25-10): la cartera y las
 * cuotas de un préstamo. Constantes de módulo: `useFiltrosTabla` las pide estables.
 */

import type { ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import { limaDateKey } from "@/lib/utils";
import type { Prestamo, PrestamoCuota, PrestamoStatus, SistemaAmortizacion } from "./tipos";

export const ETIQUETA_SISTEMA: Record<SistemaAmortizacion, string> = { FRANCES: "Francés", ALEMAN: "Alemán", AMERICANO: "Americano" };
export const ETIQUETA_ESTADO: Record<PrestamoStatus, string> = { ACTIVO: "Activo", PAGADO: "Pagado", VENCIDO: "Vencido", CANCELADO: "Cancelado" };

/** Lo que falta cobrar de un préstamo: la suma de sus cuotas sin pagar. */
export const saldoDe = (p: Prestamo) => p.cuotas.filter((c) => !c.pagadoEn).reduce((s, c) => s + c.monto, 0);

export const COLUMNAS_CARTERA: readonly ColumnaFiltro<Prestamo>[] = [
  { id: "cliente", label: "Cliente", tipo: "texto", valor: (p) => [p.entidadNombre ?? "", p.customerId ?? "", p.nroOperacion ?? ""].filter(Boolean) },
  { id: "sistema", label: "Sistema", tipo: "multi", valor: (p) => ETIQUETA_SISTEMA[p.sistemaAmortizacion] ?? p.sistemaAmortizacion },
  { id: "monto", label: "Monto", tipo: "rango", numero: (p) => p.monto, paso: 10, unidad: "S/" },
  { id: "tasa", label: "Tasa mensual", tipo: "rango", numero: (p) => p.tasaInteres, paso: 0.5, unidad: "%" },
  { id: "cuotas", label: "Cuotas", tipo: "rango", numero: (p) => p.numeroCuotas, paso: 1 },
  { id: "saldo", label: "Saldo", tipo: "rango", numero: saldoDe, paso: 10, unidad: "S/" },
  { id: "status", label: "Status", tipo: "multi", valor: (p) => ETIQUETA_ESTADO[p.status] ?? p.status },
];

export type CuotaConSaldo = PrestamoCuota & { saldo: number };

/** Pagada / vencida / pendiente, como se dibuja en la columna Estado. */
export const estadoDeCuota = (c: PrestamoCuota, ahora = new Date()) =>
  c.pagadoEn ? "Pagada" : new Date(c.fechaVence) < ahora ? "Vencida" : "Pendiente";

const ddmm = (v: number | string) => String(v).split("-").reverse().slice(0, 2).join("/");

export const COLUMNAS_CUOTAS: readonly ColumnaFiltro<CuotaConSaldo>[] = [
  { id: "num", label: "#", tipo: "rango", numero: (c) => c.numeroCuota, paso: 1 },
  { id: "fecha", label: "Fecha", tipo: "fecha", numero: (c) => limaDateKey(c.fechaVence) || null, formatearValor: ddmm },
  { id: "cuota", label: "Cuota", tipo: "rango", numero: (c) => c.monto, paso: 10, unidad: "S/" },
  { id: "estado", label: "Estado", tipo: "multi", valor: (c) => estadoDeCuota(c) },
];
