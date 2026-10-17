"use client";

import { AlertTriangle, Check, Loader2, ShoppingCart } from "@buleje/design-system/icons";
import EnlacePanel from "@/components/admin/shared/EnlacePanel";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import type { ConfigUrgencia, Sugerencia } from "./tipos";

interface Props {
  s: Sugerencia;
  config: ConfigUrgencia;
  elegida: boolean;
  creando: boolean;
  onElegir: () => void;
  onCrearOC: () => void;
}

/**
 * Una sugerencia: se marca tocando la tarjeta (para la orden por proveedor) o
 * se pide sola con «Crear OC». Textos a 14 px desde el 10-10 (los chips y el
 * proveedor iban a 12 px).
 */
export default function SugerenciaTarjeta({ s, config, elegida, creando, onElegir, onCrearOC }: Props) {
  const lineTotal = s.lastPrice != null ? s.lastPrice * s.suggestedQty : null;
  return (
    <div className="flex flex-col gap-2">
      {/* Tarjeta elegible con enlaces adentro (producto, proveedor): un <a> no
          puede ir dentro de un <button>, por eso es un div con rol de botón.
          Las teclas sólo cuentan sobre la tarjeta, no sobre sus enlaces. */}
      <div
        role="button"
        tabIndex={0}
        onClick={onElegir}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
          e.preventDefault();
          onElegir();
        }}
        aria-pressed={elegida}
        className={cn(
          "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          elegida
            ? "border-primary bg-primary/5 ring-2 ring-primary/30 dark:bg-primary/10"
            : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--text-tertiary)]",
        )}
      >
        <div className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-colors", elegida ? "border-primary bg-primary" : "border-[var(--text-tertiary)]")}>
          {elegida && <Check className="h-4 w-4 text-white" strokeWidth={3} aria-hidden />}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start gap-2">
            <p className="line-clamp-2 flex-1 text-base font-extrabold leading-tight text-[var(--text-primary)]">
              <EnlacePanel cosa="producto" id={String(s.productId)} apariencia="heredada">{s.productName}</EnlacePanel>
            </p>
            <span className="shrink-0 whitespace-nowrap rounded-lg bg-[var(--surface-sunken)] px-2 py-1 text-sm font-semibold text-[var(--text-secondary)]">
              {s.category}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={cn("inline-flex h-7 items-center rounded-lg border px-2.5 font-bold", config.iconBg, config.text, config.border)}>
              {s.daysOfStock >= 9999 ? "Stock alto" : `${s.daysOfStock} ${s.daysOfStock === 1 ? "día" : "días"}`}
            </span>
            <span className="text-[var(--text-secondary)] tabular-nums">
              Stock {s.currentStock} · vende {s.dailyAvg}/día
            </span>
          </div>

          <div className="flex flex-wrap items-baseline gap-2 pt-1">
            <span className="text-lg font-extrabold leading-none tabular-nums text-[var(--text-primary)]">Pedir {s.suggestedQty}</span>
            <span className="text-sm font-semibold text-[var(--text-secondary)]">{s.suggestedQty === 1 ? "unidad" : "unidades"}</span>
            {lineTotal != null && (
              <span className="ml-auto text-sm font-bold tabular-nums text-[var(--text-primary)]">≈ {formatCurrency(lineTotal)}</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--rule-soft)] pt-2 text-sm">
            {s.suggestedSupplier ? (
              <span className="inline-flex min-w-0 items-center gap-1 truncate text-[var(--text-secondary)]">
                Proveedor
                <strong className="truncate text-[var(--text-primary)]">
                  <EnlacePanel cosa="proveedor" id={s.suggestedSupplier.id} apariencia="heredada">{s.suggestedSupplier.name}</EnlacePanel>
                </strong>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-bold text-[var(--data-warning-ink)]">
                <AlertTriangle className="h-4 w-4" aria-hidden />
                Sin proveedor anterior
              </span>
            )}
            {s.lastPrice != null && (
              <span className="ml-auto tabular-nums text-[var(--text-secondary)]">Último {formatCurrency(Number(s.lastPrice))}</span>
            )}
          </div>
        </div>
      </div>
      {/* Crear OC de esta sola sugerencia en 1 clic (reporte QA Compras:
          "pasar de sugerencia a OC con un clic"). */}
      <button
        type="button"
        onClick={onCrearOC}
        disabled={creando}
        className={button({ variant: "secondary", className: "w-full gap-1.5 rounded-xl" })}
      >
        {creando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShoppingCart className="h-4 w-4" strokeWidth={2} aria-hidden />}
        {creando ? "Creando…" : "Crear OC"}
      </button>
    </div>
  );
}
