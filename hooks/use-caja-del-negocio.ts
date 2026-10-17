"use client";

/**
 * La caja del negocio (ADR-451): lo que entró y salió de verdad en el mes, lo
 * que viene, y la proyección de 13 semanas.
 *
 * Resultado y caja son dos preguntas distintas: el aserrío que cobraste en
 * setiembre es resultado de setiembre aunque WASACO te lo pague en octubre. Por
 * eso viven en dos pantallas y en dos endpoints.
 */

import { useCargaJson, type Carga } from "@/hooks/use-resultado-del-mes";
import type { RespuestaCaja } from "@/lib/finance/resultado-del-negocio";

/** `GET /api/finanzas/caja-del-negocio?mes=YYYY-MM`. `mes = null` = no pedir (el rol no la ve). */
export function useCajaDelNegocio(mes: string | null): Carga<RespuestaCaja> {
  return useCargaJson<RespuestaCaja>(mes ? `/api/finanzas/caja-del-negocio?mes=${encodeURIComponent(mes)}` : null);
}

// ── Proyección de 13 semanas (`GET /api/finance/cashflow-rolling`) ──────────
// Espejo del contrato de `lib/finance/cashflow-rolling.ts` (server-only: no se
// importa desde el navegador). Los campos de ADR-451 van opcionales: el
// servidor puede venir sin ellos mientras se despliega, y la tabla vieja tiene
// que seguir pintando igual.

export interface SemanaProyectada {
  weekNumber: number;
  weekStart: string;
  weekEnd: string;
  openingBalance: number;
  expectedCollections: number;
  creditCollections: number;
  supplierPayments: number;
  /** AUSENTE (no 0) para quien no ve lo ganado de RRHH: «—», nunca «S/ NaN». */
  payroll?: number;
  loans: number;
  otherExpenses: number;
  /** Adelantos dados que vencen en la semana. Informativo: NO entra en el cierre. */
  advanceCollections?: number;
  closingBalance: number;
  isNegative: boolean;
}

export interface ProyeccionDeCaja {
  tenantId: string;
  generatedAt: string;
  startingBalance: number;
  weeks: SemanaProyectada[];
  criticalWeek: number | null;
  saldoInicial?: { monto: number; fuente: "tesoreria" | "neto_30_dias"; estimado: boolean };
  payrollFuente?: "gastos_personal" | "sin_dato" | "sin_permiso";
  /** El cierre de cada semana NO resta la planilla (si el servidor lo avisa). */
  cierreSinNomina?: boolean;
  /** ≈ lo ganado por semana según la asistencia. `null`/ausente = sin dato (o el rol no ve RRHH). */
  payrollRrhhSemanal?: number | null;
  adelantosConVencimiento?: { monto: number; cuantos: number };
  sinFecha?: { porCobrar: number; cuantosPorCobrar: number; porPagar: number; cuantosPorPagar: number };
}

export function useProyeccionDeCaja(): Carga<ProyeccionDeCaja> {
  return useCargaJson<ProyeccionDeCaja>("/api/finance/cashflow-rolling");
}
