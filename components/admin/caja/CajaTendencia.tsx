"use client";

/**
 * La tendencia de las diferencias de los últimos 30 cierres (mejora 11). Salió
 * de `CajaHistorial` cuando esa tabla se fue (repetía la de los cuadres): lo
 * único que tenía y los cuadres no, junto con el parte de cada caja, que ahora
 * se abre desde el detalle del cuadre. Misma cuenta que antes.
 *
 * Sin los cierres sin conteo: guardan diferencia 0 porque nadie contó, y como
 * ceros aplanaban la línea y empujaban la tendencia a «Mejorando».
 */
import dynamic from "next/dynamic";
import { esCierreAutomatico } from "@/lib/caja/arqueo-veredicto";
import type { CashRegister } from "./tipos";

const CashRegisterChart = dynamic(() => import("../cash-register/CashRegisterChart"), {
  ssr: false,
  loading: () => <div className="h-32 animate-pulse rounded-2xl bg-[var(--surface-sunken)]" />,
});

type Tendencia = { label: string; color: string } | null;

function tendenciaDe(diffs: number[]): Tendencia {
  if (diffs.length >= 10) {
    const prom = (xs: number[]) => xs.reduce((s, v) => s + Math.abs(v), 0) / xs.length;
    const ultimos = prom(diffs.slice(-5));
    const previos = prom(diffs.slice(-10, -5));
    if (ultimos < previos * 0.8) return { label: "Mejorando", color: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" };
    if (ultimos > previos * 1.2) return { label: "Empeorando", color: "bg-[var(--data-error-100)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/30 dark:text-[var(--data-error-500)]" };
    return { label: "Estable", color: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" };
  }
  if (diffs.length >= 5) return { label: "Sin suficientes datos para tendencia", color: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" };
  return null;
}

export function CajaTendencia({ cerradas }: { cerradas: CashRegister[] }) {
  const contadas = cerradas.filter((r) => !esCierreAutomatico(r.notes));
  if (contadas.length <= 2) return null;
  const diffs = contadas.slice(0, 30).map((r) => r.difference ?? 0).reverse();
  return (
    <CashRegisterChart
      sparkData={diffs.map((d, i) => ({ idx: i, diff: d, pos: d >= 0 ? d : 0, neg: d < 0 ? d : 0 }))}
      diffsCount={diffs.length}
      tendencia={tendenciaDe(diffs)}
    />
  );
}
