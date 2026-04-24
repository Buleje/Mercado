"use client";

/**
 * OrderSummaryCard — Resumen de pedido con breakdown transparente.
 *
 * Muestra subtotal, delivery, propina, descuentos, total.
 * Usa tipografia tabular-nums y jerarquia visual (total bold + grande).
 * Cada linea con opcion de expandir detalle (ej. "Ver productos").
 *
 * Compact mode para mobile sticky. Full mode para desktop sidebar.
 *
 * Uso:
 *   <OrderSummaryCard
 *     lines={[
 *       { label: "Subtotal", value: 45.80 },
 *       { label: "Delivery", value: 5.00 },
 *       { label: "Cupón BIENVENIDO10", value: -4.58, muted: true, tone: "accent" },
 *     ]}
 *     total={46.22}
 *     itemCount={7}
 *   />
 */

import { formatSoles } from "@/lib/chart-helpers";
import { Info } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export interface OrderLine {
  label: string;
  value: number;
  /** Texto adicional despues del label (ej. "(IGV incluido)") */
  hint?: string;
  /** Color especial */
  tone?: "accent" | "error" | "muted";
  /** Fila secundaria (texto mas chico) */
  muted?: boolean;
}

interface Props {
  lines: OrderLine[];
  total: number;
  /** Numero de items para badge "7 productos" */
  itemCount?: number;
  /** Ahorro total (para mostrar "Ahorraste S/X") */
  savings?: number;
  /** Moneda. Default "S/" */
  currencySymbol?: string;
  /** Variante. Default "full" */
  variant?: "compact" | "full";
  /** ClassName */
  className?: string;
  /** Footer custom (ej. botones) */
  footer?: React.ReactNode;
  /** Info tooltip content */
  info?: string;
}

export default function OrderSummaryCard({
  lines,
  total,
  itemCount,
  savings,
  currencySymbol = "S/",
  variant = "full",
  className,
  footer,
  info,
}: Props) {
  if (variant === "compact") {
    return (
      <div
        className={cn(
          "rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 flex items-center gap-3",
          className,
        )}
      >
        <div className="flex-1 min-w-0">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Total {itemCount !== undefined && `(${itemCount} ${itemCount === 1 ? "producto" : "productos"})`}
          </p>
          <p className="text-xl font-extrabold text-[var(--text-primary)] tabular-nums leading-tight">
            {currencySymbol}
            {total.toFixed(2)}
          </p>
          {savings !== undefined && savings > 0 && (
            <p className="text-xs font-bold text-[var(--accent)] tabular-nums">
              Ahorraste {formatSoles(savings)}
            </p>
          )}
        </div>
        {footer}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden",
        className,
      )}
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-[var(--rule-base)]">
        <div>
          <h3 className="text-base font-extrabold text-[var(--text-primary)] tracking-tight">
            Resumen del pedido
          </h3>
          {itemCount !== undefined && (
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
              {itemCount} {itemCount === 1 ? "producto" : "productos"}
            </p>
          )}
        </div>
        {info && (
          <span
            title={info}
            className="text-[var(--text-tertiary)] cursor-help"
            aria-label={info}
          >
            <Info className="h-4 w-4" strokeWidth={2} aria-hidden />
          </span>
        )}
      </div>

      {/* Lines */}
      <dl className="px-5 py-3 space-y-2">
        {lines.map((line, i) => {
          const isDiscount = line.value < 0 || line.tone === "accent";
          const lineColor = isDiscount
            ? "text-[var(--accent)]"
            : line.tone === "error"
            ? "text-[var(--data-error,_#e11d48)]"
            : line.muted
            ? "text-[var(--text-tertiary)]"
            : "text-[var(--text-primary)]";
          return (
            <div
              key={i}
              className={cn(
                "flex items-center justify-between gap-4",
                line.muted ? "text-xs" : "text-sm",
              )}
            >
              <dt className={cn("flex-1 min-w-0", line.muted ? "text-[var(--text-tertiary)]" : "text-[var(--text-secondary)]")}>
                <span className="truncate">{line.label}</span>
                {line.hint && <span className="text-[length:var(--ts-2xs)] ml-1 text-[var(--text-tertiary)]">{line.hint}</span>}
              </dt>
              <dd className={cn("tabular-nums font-bold", lineColor)}>
                {line.value < 0 ? "-" : ""}
                {currencySymbol}
                {Math.abs(line.value).toFixed(2)}
              </dd>
            </div>
          );
        })}
      </dl>

      {/* Total */}
      <div className="px-5 py-4 bg-[var(--surface-sunken)] border-t border-[var(--rule-base)] flex items-baseline justify-between">
        <div>
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Total
          </p>
          {savings !== undefined && savings > 0 && (
            <p className="text-xs font-bold text-[var(--accent)] tabular-nums mt-0.5">
              Ahorraste {formatSoles(savings)}
            </p>
          )}
        </div>
        <p className="text-2xl font-extrabold text-[var(--text-primary)] tabular-nums tracking-tight">
          {currencySymbol}
          {total.toFixed(2)}
        </p>
      </div>

      {footer && <div className="px-5 py-4 border-t border-[var(--rule-base)]">{footer}</div>}
    </div>
  );
}
