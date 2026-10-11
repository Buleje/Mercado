"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { SectionTitle } from "@buleje/design-system";
import { Sparkles, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { MarketplaceProduct } from "@/components/admin/marketplace/hooks/use-marketplace-products";
import { KpiTile } from "@/components/admin/marketplace/shared";
import { formatCurrency, formatDateLong, formatNumber } from "@/lib/format";

// ── Modal: destacar producto (SponsoredBoost) ───────────────────────────
export function BoostModal({
  product,
  storeId,
  onClose,
  onCreate,
  onStop,
}: {
  product: MarketplaceProduct;
  storeId: string;
  onClose: () => void;
  onCreate: (payload: { bidAmount: number; days: number; maxBudgetPen: number }) => Promise<{ ok: boolean }>;
  onStop: () => Promise<{ ok: boolean }>;
}) {
  /* Sin esto Tab se va a la pantalla de abajo y Escape no cierra. */
  const cajaRef = useRef<HTMLDivElement>(null);
  /* Escape ya lo maneja el atajo propio de esta pantalla: el hook pone
       el foco, la trampa de Tab y el scroll, no una segunda salida. */
  useModalAccesible(cajaRef, { onCerrar: onClose, cerrarConEscape: false });
  const ventana = useVentanaDeModal(true, { ref: cajaRef, aplicarTranslate: true, claveMemoria: "marketplace-boost-producto" });
  const existing = product.boost;
  const [bidAmount, setBidAmount] = useState<string>(existing ? String(existing.bidAmount) : "3");
  const [days, setDays] = useState<string>("7");
  const [maxBudget, setMaxBudget] = useState<string>(existing ? String(existing.maxBudgetPen) : "21");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const bidNum = Number(bidAmount);
  const daysNum = Number(days);
  const budgetNum = Number(maxBudget);
  const estimated = Number.isFinite(bidNum) && Number.isFinite(daysNum) ? bidNum * daysNum : 0;
  const canSubmit =
    !!storeId &&
    !!product.productId &&
    bidNum > 0 &&
    daysNum > 0 &&
    daysNum <= 90 &&
    budgetNum >= bidNum;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    await onCreate({ bidAmount: bidNum, days: daysNum, maxBudgetPen: budgetNum });
    setSubmitting(false);
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !ventana.fijado) onClose(); }}
      className="fixed inset-0 z-system flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-4"
    >
      <div
        ref={cajaRef} tabIndex={-1}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg rounded-3xl bg-[var(--surface-raised)] border border-[var(--rule-base)] shadow-[var(--shadow-xl)] overflow-hidden"
      >
        <header {...ventana.asaProps} className="flex items-start gap-3 border-b-2 border-[var(--rule-soft)] px-5 py-5 sm:px-6">
          <span aria-hidden className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-secondary)]/15 text-[var(--brand-secondary)] shrink-0">
            <Sparkles className="h-6 w-6" strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">
              Marketplace · Boost
            </p>
            <SectionTitle className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)] leading-tight">
              {existing ? "Boost activo" : "Destacar producto"}
            </SectionTitle>
            <p className="mt-1 text-sm text-[var(--text-secondary)] leading-relaxed truncate">
              {product.name}
            </p>
          </div>
          <span className="ml-auto flex items-center gap-1 shrink-0">
            <ControlesDeVentana ventana={ventana} />
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="h-10 w-10 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
            >
              <X className="h-5 w-5" />
            </button>
          </span>
        </header>

        {existing ? (
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <KpiTile label="Puja diaria" value={`${formatCurrency(existing.bidAmount)}`} />
              <KpiTile label="Gastado" value={`${formatCurrency(existing.totalSpentPen)}`} sub={`de S/ ${existing.maxBudgetPen.toFixed(0)}`} />
              <KpiTile label="Impresiones" value={formatNumber(existing.impressionsCount)} />
              <KpiTile label="Clicks" value={formatNumber(existing.clicksCount)} />
            </div>
            <div className="rounded-xl bg-[var(--surface-sunken)] border border-[var(--rule-soft)] p-3 text-xs text-[var(--text-secondary)]">
              Termina el{" "}
              <strong className="text-[var(--text-primary)]">
                {formatDateLong(existing.endDate)}
              </strong>
            </div>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              Destacar tu producto en el marketplace. Aparece arriba en los listados de su categoría y muestra el badge <strong className="text-[var(--brand-secondary)]">Destacado</strong>.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <NumberField label="Puja diaria" prefix="S/" value={bidAmount} onChange={setBidAmount} hint="Mínimo S/ 1" />
              <NumberField label="Duración" suffix="días" value={days} onChange={setDays} hint="Máx 90" />
              <NumberField label="Tope total" prefix="S/" value={maxBudget} onChange={setMaxBudget} hint="Corta al llegar" />
            </div>
            <div className="rounded-xl bg-primary/10 border-2 border-[var(--accent)]/30 p-3 flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                Gasto estimado
              </span>
              <span className="text-xl font-extrabold tabular-nums text-[var(--accent)]">
                {formatCurrency(estimated)}
              </span>
            </div>
          </div>
        )}

        <footer className="bg-[var(--surface-sunken)] border-t-2 border-[var(--rule-soft)] flex items-center justify-end gap-2 px-5 py-4 sm:px-6">
          {existing ? (
            <button
              type="button"
              onClick={async () => {
                setSubmitting(true);
                await onStop();
                setSubmitting(false);
              }}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 h-12 px-4 rounded-xl bg-[var(--data-error-500)]/10 text-[var(--data-error-500)] font-semibold text-sm hover:bg-[var(--data-error-500)]/20 transition-colors disabled:opacity-50"
            >
              <X className="h-4 w-4" />
              Detener boost
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="h-12 px-4 rounded-xl text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                className="inline-flex items-center gap-1.5 h-12 px-5 rounded-xl bg-[var(--brand-secondary)] text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {submitting ? "Creando…" : "Destacar"}
              </button>
            </>
          )}
        </footer>
        <TiradorDeVentana ventana={ventana} />
      </div>
    </div>
  );
}


function NumberField({
  label,
  prefix,
  suffix,
  value,
  onChange,
  hint,
}: {
  label: string;
  prefix?: string;
  suffix?: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5 block">{label}</label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text-tertiary)] pointer-events-none">
            {prefix}
          </span>
        )}
        <input
          id={id}
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "w-full h-11 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-base font-extrabold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]",
            prefix ? "pl-8 pr-3" : "px-3",
            suffix ? "pr-12" : "",
            "text-right tabular-nums",
          )}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text-tertiary)] pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{hint}</p>}
    </div>
  );
}

