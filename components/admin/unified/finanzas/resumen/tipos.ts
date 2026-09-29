/**
 * Formas de los datos del Resumen de Mi Plata, compartidas entre el hook que
 * los carga (`hooks/use-resumen-plata.ts`) y los bloques que los dibujan.
 */
import { SERIES } from "@/components/admin/shared/chart-palette";
import type { IgvDelMes } from "./igv";

export type MesResumen = { mes: string; fullMonth: string; ingresos: number; gastos: number; utilidad: number };
export type Porcion = { name: string; value: number };
export type DiaFlujo = { dia: string; ingresos: number; gastos: number; balance: number };
export type Deudor = { name: string; monto: number; vencido: boolean };
export type Proyeccion = { ventasMes: number; gastosMes: number; diasTranscurridos: number; diasTotales: number };
/** `igv` null = no se pudo leer el IGV registrado. */
export type Fiscal = { ventas: number; compras: number; igv: IgvDelMes | null };

// Colores de serie desde la paleta única del admin (chart-palette.ts). Antes
// este archivo declaraba 101 hex sueltos y su propio mapa de medios de pago
// —duplicado del que arman otros módulos— y ninguno era theme-aware.
export const DASHBOARD_EXPENSE_COLORS = SERIES;
export const PM_FALLBACK_COLORS = SERIES;
