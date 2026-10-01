/**
 * Lo que comparten las piezas de Tesorería: cómo se nombra y se dibuja cada
 * tipo de cuenta y de movimiento, y cómo se leen los montos. Sin React (sólo
 * referencias a íconos): lo importan la tarjeta, la tabla y el tablero.
 */

import {
  ArrowDownRight, ArrowRightLeft, ArrowUpRight, Banknote, Landmark, Smartphone,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { montoEnMoneda } from "@/lib/adelantos/cuenta-unificada";
import type { OrigenMovimiento, TipoCuenta, TipoMovimiento } from "@/hooks/use-tesoreria";

/** Cómo se llama cada tipo de cuenta en la pantalla, y su ícono. */
const TIPO_CUENTA: Record<TipoCuenta, { label: string; icon: LucideIcon }> = {
  BANCO_AHORRO: { label: "Banco · ahorros", icon: Landmark },
  BANCO_CORRIENTE: { label: "Banco · corriente", icon: Landmark },
  CAJA_FISICA: { label: "Efectivo", icon: Banknote },
  MONEDERO_DIGITAL: { label: "Billetera digital", icon: Smartphone },
};

/**
 * Un tipo que el servidor sume mañana no revienta la tarjeta: sale con su
 * nombre legible y el ícono de banco.
 */
export function tipoDeCuenta(tipo: string): { label: string; icon: LucideIcon } {
  return TIPO_CUENTA[tipo as TipoCuenta] ?? { label: legible(tipo), icon: Landmark };
}

/**
 * Cada tipo de movimiento: su rótulo, si suma o resta al saldo de SU cuenta, y
 * su color. La transferencia va en azul en las dos puntas: la plata no entró ni
 * salió del negocio, sólo cambió de cuenta.
 */
const TIPO_MOV: Record<TipoMovimiento, { label: string; signo: 1 | -1; icon: LucideIcon; chip: string; monto: string }> = {
  INGRESO: {
    label: "Ingreso", signo: 1, icon: ArrowDownRight,
    chip: "bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
    monto: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  },
  EGRESO: {
    label: "Egreso", signo: -1, icon: ArrowUpRight,
    chip: "bg-[var(--data-error-500)]/15 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
    monto: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
  },
  TRANSFERENCIA_IN: {
    label: "Transferencia", signo: 1, icon: ArrowRightLeft,
    chip: "bg-[var(--data-info-500)]/15 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]",
    monto: "text-[var(--text-primary)]",
  },
  TRANSFERENCIA_OUT: {
    label: "Transferencia", signo: -1, icon: ArrowRightLeft,
    chip: "bg-[var(--data-info-500)]/15 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]",
    monto: "text-[var(--text-primary)]",
  },
};

export function tipoDeMovimiento(tipo: string) {
  return (
    TIPO_MOV[tipo as TipoMovimiento] ?? {
      label: legible(tipo), signo: 1 as const, icon: ArrowRightLeft,
      chip: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
      monto: "text-[var(--text-primary)]",
    }
  );
}

/**
 * De dónde vino el movimiento. `MANUAL` y `TRANSFERENCIA` no se escriben: el
 * primero es el caso común y el segundo ya lo dice el rótulo.
 */
const ORIGEN: Partial<Record<OrigenMovimiento, string>> = {
  VENTA: "De una venta",
  GASTO: "De un gasto",
  PRESTAMO_DADO: "Préstamo que diste",
  PRESTAMO_CUOTA: "Cuota de un préstamo",
  COMPRA_PROVEEDOR: "Compra a un proveedor",
  CIERRE_CAJA: "Cierre de caja",
  OTRO: "Otro",
};

export function origenLegible(origen: string): string | null {
  if (origen === "MANUAL" || origen === "TRANSFERENCIA") return null;
  return ORIGEN[origen as OrigenMovimiento] ?? legible(origen);
}

/** «CIERRE_CAJA» → «Cierre caja»: respaldo para lo que el servidor sume sin avisar. */
function legible(clave: string): string {
  const s = clave.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Varias monedas en una línea, sin sumarlas entre sí («S/ 20,500.00 · USD 300.00»). */
export function enMonedas(porMoneda: Record<string, number>): string {
  return Object.entries(porMoneda)
    .map(([moneda, monto]) => montoEnMoneda(monto, moneda))
    .join(" · ");
}

/** El monto con su signo según el lado de la cuenta: «+ S/ 5,000.00» / «− S/ 5,000.00». */
export function montoConSigno(monto: number, signo: 1 | -1, moneda: string): string {
  return `${signo > 0 ? "+" : "−"} ${montoEnMoneda(Math.abs(monto), moneda)}`;
}

export const CHIP = "inline-flex h-11 items-center gap-2 rounded-2xl border px-4 text-sm font-bold transition-colors sm:h-9";
export const CHIP_OFF = "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50";
