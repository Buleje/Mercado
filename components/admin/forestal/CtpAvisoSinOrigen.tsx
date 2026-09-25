"use client";

/**
 * Las corridas que produjeron sin decir de qué guía salió la madera (Sección 2).
 *
 * Es DEUDA, no un indicador ([[deuda-no-es-indicador]]): vivía tres veces en la
 * misma pantalla —la línea de resumen, una tarjeta KPI y este cartel— y ahora
 * vive sólo acá. El libro admite una corrida sin origen declarado; el
 * certificado de trazabilidad no. Se mide contra el período entero.
 */

import { AlertTriangle } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";

export default function CtpAvisoSinOrigen({
  corridas,
  producidoSinOrigen,
  onIrAProduccion,
}: {
  /** Las corridas sin origen; el `label` y no el N° (varias comparten lineNo). */
  corridas: readonly { label: string }[];
  /** m³ producidos por esas corridas: lo que queda sin respaldo. */
  producidoSinOrigen: number;
  onIrAProduccion?: () => void;
}) {
  if (corridas.length === 0) return null;
  const n = corridas.length;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-4 py-3 text-sm dark:bg-transparent"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden />
      <span className="font-bold text-[var(--text-primary)]">
        {formatNumber(n)} corrida{n === 1 ? "" : "s"} produjeron sin declarar de qué guía salió la madera
        {producidoSinOrigen > 0 ? ` · ${fmtM3(producidoSinOrigen)} m³ sin respaldo` : ""}
      </span>
      <span className="text-[var(--text-secondary)]">
        {corridas.slice(0, 3).map((c) => c.label).join(" · ")}
        {n > 3 ? ` y ${formatNumber(n - 3)} más` : ""}
        {" — no tienen fila en el cuadro; se atribuyen desde Producción."}
      </span>
      {onIrAProduccion && (
        <button
          type="button"
          onClick={onIrAProduccion}
          className="inline-flex min-h-6 items-center font-bold text-[var(--text-primary)] underline underline-offset-2"
        >
          Ir a Producción
        </button>
      )}
    </div>
  );
}
