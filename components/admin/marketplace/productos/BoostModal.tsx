"use client";

import { useId, useState } from "react";
import { Sparkles, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { MarketplaceProduct } from "@/components/admin/marketplace/hooks/use-marketplace-products";
import { KpiTile } from "@/components/admin/marketplace/shared";
import { formatCurrency, formatDateLong, formatNumber } from "@/lib/format";
import AdminModal from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";

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
  onCreate: (payload: {
    bidAmount: number;
    days: number;
    maxBudgetPen: number;
  }) => Promise<{ ok: boolean }>;
  onStop: () => Promise<{ ok: boolean }>;
}) {
  const existing = product.boost;
  const [bidAmount, setBidAmount] = useState<string>(existing ? String(existing.bidAmount) : "3");
  const [days, setDays] = useState<string>("7");
  const [maxBudget, setMaxBudget] = useState<string>(
    existing ? String(existing.maxBudgetPen) : "21",
  );
  const [submitting, setSubmitting] = useState(false);

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
    <AdminModal
      open
      onClose={onClose}
      title={existing ? "Boost activo" : "Destacar producto"}
      description={product.name}
      icon={Sparkles}
      size="md"
      claveVentana="marketplace-boost-producto"
      footer={
        <ModalFooter>
          {existing ? (
            <button
              type="button"
              onClick={async () => {
                setSubmitting(true);
                await onStop();
                setSubmitting(false);
              }}
              disabled={submitting}
              className={button({ variant: "danger" })}
            >
              <X className="h-4 w-4" />
              Detener boost
            </button>
          ) : (
            <>
              <button type="button" onClick={onClose} className={button({ variant: "secondary" })}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                className={button({ variant: "primary" })}
              >
                <Sparkles className="h-4 w-4" />
                {submitting ? "Creando…" : "Destacar"}
              </button>
            </>
          )}
        </ModalFooter>
      }
    >
      {existing ? (
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <KpiTile label="Puja diaria" value={`${formatCurrency(existing.bidAmount)}`} />
            <KpiTile
              label="Gastado"
              value={`${formatCurrency(existing.totalSpentPen)}`}
              sub={`de S/ ${existing.maxBudgetPen.toFixed(0)}`}
            />
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
            Destacar tu producto en el marketplace. Aparece arriba en los listados de su categoría y
            muestra el badge <strong className="text-[var(--brand-secondary)]">Destacado</strong>.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <NumberField
              label="Puja diaria"
              prefix="S/"
              value={bidAmount}
              onChange={setBidAmount}
              hint="Mínimo S/ 1"
            />
            <NumberField
              label="Duración"
              suffix="días"
              value={days}
              onChange={setDays}
              hint="Máx 90"
            />
            <NumberField
              label="Tope total"
              prefix="S/"
              value={maxBudget}
              onChange={setMaxBudget}
              hint="Corta al llegar"
            />
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
    </AdminModal>
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
      <label
        htmlFor={id}
        className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5 block"
      >
        {label}
      </label>
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
      {hint && (
        <p className="mt-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{hint}</p>
      )}
    </div>
  );
}
