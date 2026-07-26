"use client";

/**
 * CtpHealthChip — el score de cumplimiento del período, siempre visible en la
 * barra de sub-tabs del Libro CTP. El operador no debería enterarse de un
 * período en rojo recién al abrir la pestaña Cumplimiento: el semáforo vive en
 * el shell y clickearlo lleva al detalle.
 *
 * Single source: usa el MISMO hook que el panel (`useCtpCompliance`), así el
 * chip y la pestaña nunca dicen números distintos. Si falla el fetch, no
 * renderiza nada (es una señal secundaria — no rompe el módulo).
 */

import { Gauge } from "@buleje/design-system/icons";
import { useCtpCompliance } from "@/hooks/use-ctp-compliance";
import { ctpComplianceTone } from "@/lib/forestal/ctp-compliance";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";

// Los tints `-50` son claros en AMBOS temas: sin variante dark el chip queda
// como una mancha blanca en una cabina oscura. En dark se usa el -500 al 12%.
const TONE_CLS: Record<ReturnType<typeof ctpComplianceTone>, string> = {
  success:
    "border-[var(--data-success-500)] bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]",
  warning:
    "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]",
  error:
    "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]",
};

export default function CtpHealthChip({
  period,
  onNavigate,
}: {
  period: CtpPeriod;
  onNavigate: () => void;
}) {
  const { data, loading } = useCtpCompliance(period);

  if (loading && !data) {
    return <span className="h-9 w-28 animate-pulse rounded-full bg-[var(--surface-sunken)]" aria-hidden="true" />;
  }
  if (!data) return null;

  const tone = ctpComplianceTone(data.score);
  return (
    <button
      type="button"
      onClick={onNavigate}
      title="Score de cumplimiento del período — clic para ver el detalle"
      className={`inline-flex h-9 items-center gap-1.5 rounded-full border-2 px-3.5 text-sm font-bold transition hover:brightness-105 ${TONE_CLS[tone]}`}
    >
      <Gauge className="h-4 w-4" aria-hidden="true" />
      <span className="font-mono tabular-nums">{data.score}</span>
      <span className="text-xs font-normal opacity-70">/100</span>
    </button>
  );
}
