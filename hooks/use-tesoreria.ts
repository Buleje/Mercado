"use client";

/**
 * La tesorería de Mi Plata: cuentas de banco, caja física y billeteras, con su
 * saldo, lo que entró y salió de cada una y las transferencias entre ellas.
 *
 * POR QUÉ EXISTE (medido 2026-09-29). `TreasuryDB` y sus cuatro rutas
 * `/api/treasury/*` estaban construidas y ninguna pantalla las pedía: en `main`
 * había BCP con S/ 15 000 y la caja chica con S/ 5 500 que no se veían en
 * ningún lado, y la sección «Tesorería» mostraba otra cosa (ventas, fiados y
 * cuentas por pagar, que ya viven en Resumen y en Por cobrar).
 *
 * SÓLO LECTURA. Las tres rutas de escritura (`POST/PATCH cuentas`,
 * `POST movimientos`, `POST transferencias`) llaman a `requireAdmin(req)` sin
 * lista de roles: cualquier sesión del panel —un cajero, un almacenero— podría
 * abrir cuentas o mover plata. Hasta que el backend les ponga roles, esta
 * pantalla no escribe.
 *
 * Los tipos son espejo de `lib/db/treasury.db.ts` (server-only: no se importa
 * desde el navegador). Las sumas las hace el servidor (`/api/treasury/resumen`);
 * acá no se re-suma nada.
 */

import { useCallback } from "react";
import { useCargaJson, type Carga } from "@/hooks/use-resultado-del-mes";

export type TipoCuenta = "BANCO_AHORRO" | "BANCO_CORRIENTE" | "CAJA_FISICA" | "MONEDERO_DIGITAL";
export type TipoMovimiento = "INGRESO" | "EGRESO" | "TRANSFERENCIA_IN" | "TRANSFERENCIA_OUT";
export type OrigenMovimiento =
  | "MANUAL" | "VENTA" | "GASTO" | "PRESTAMO_DADO" | "PRESTAMO_CUOTA"
  | "COMPRA_PROVEEDOR" | "CIERRE_CAJA" | "TRANSFERENCIA" | "OTRO";

/** `GET /api/treasury/cuentas` — una fila por cuenta. */
export interface CuentaTesoreria {
  id: string;
  nombre: string;
  tipo: TipoCuenta;
  banco: string | null;
  numeroCuenta: string | null;
  cci: string | null;
  moneda: string;
  saldo: number;
  saldoInicial: number;
  activa: boolean;
  color: string | null;
  notas: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `GET /api/treasury/movimientos` — lo que entró o salió de UNA cuenta. */
export interface MovimientoTesoreria {
  id: string;
  cuentaId: string;
  tipo: TipoMovimiento;
  origen: OrigenMovimiento;
  monto: number;
  saldoAnterior: number;
  saldoPosterior: number;
  descripcion: string;
  /** En una transferencia, el id de la transferencia (así se cruza con su nota). */
  referencia: string | null;
  categoria: string | null;
  createdAt: string;
  cuentaNombre?: string;
}

/** `GET /api/treasury/transferencias` — el paso de plata de una cuenta a otra. */
export interface TransferenciaTesoreria {
  id: string;
  origenId: string;
  destinoId: string;
  monto: number;
  /** La nota que escribió quien la hizo («reponer caja chica»). */
  descripcion: string;
  createdAt: string;
  origenNombre?: string;
  destinoNombre?: string;
}

/**
 * `GET /api/treasury/resumen`. Sólo cuentas ACTIVAS. `saldoTotal` suma todas las
 * monedas juntas: para mostrar se usa `saldoPorMoneda`, nunca «S/» delante de
 * dólares sumados a soles.
 */
export interface ResumenTesoreria {
  saldoTotal: number;
  saldoPorTipo: Record<string, number>;
  saldoPorMoneda: Record<string, number>;
  cuentasActivas: number;
  /** INGRESO/EGRESO del mes (las transferencias no cuentan: no es plata nueva). */
  ingresosMes: number;
  egresosMes: number;
  flujoNeto: number;
}

/** Cuántos movimientos se piden. Si vuelven justo estos, la pantalla avisa que hay más. */
export const TOPE_MOVIMIENTOS = 100;

/** Las transferencias se piden para leer su nota: 200 cubre de sobra el tope de arriba. */
const TOPE_TRANSFERENCIAS = 200;

export interface Tesoreria {
  cuentas: Carga<CuentaTesoreria[]>;
  resumen: Carga<ResumenTesoreria>;
  movimientos: Carga<MovimientoTesoreria[]>;
  transferencias: Carga<TransferenciaTesoreria[]>;
  /** Vuelve a pedir las cuatro. */
  recargar: () => void;
}

/**
 * `cuentaId = null` = los movimientos de todas las cuentas. Las cuentas se piden
 * con las dadas de baja incluidas: se muestran aparte, y así una cuenta cerrada
 * no hace desaparecer su historia.
 */
export function useTesoreria(cuentaId: string | null): Tesoreria {
  const cuentas = useCargaJson<CuentaTesoreria[]>("/api/treasury/cuentas?includeInactive=true");
  const resumen = useCargaJson<ResumenTesoreria>("/api/treasury/resumen");
  const movimientos = useCargaJson<MovimientoTesoreria[]>(
    `/api/treasury/movimientos?limit=${TOPE_MOVIMIENTOS}${cuentaId ? `&cuentaId=${encodeURIComponent(cuentaId)}` : ""}`,
  );
  const transferencias = useCargaJson<TransferenciaTesoreria[]>(`/api/treasury/transferencias?limit=${TOPE_TRANSFERENCIAS}`);

  const rc = cuentas.recargar, rr = resumen.recargar, rm = movimientos.recargar, rt = transferencias.recargar;
  const recargar = useCallback(() => {
    rc();
    rr();
    rm();
    rt();
  }, [rc, rr, rm, rt]);

  return { cuentas, resumen, movimientos, transferencias, recargar };
}
