"use client";

import { m } from "framer-motion";
import {
  Tag,
  Award,
  Banknote,
  Loader2,
  CheckCircle2,
  X,
  Gift,
  Truck,
  HandCoins,
  Sparkles,
  Wallet,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { YapePaymentPanel } from "./YapePaymentPanel";
import { CashChangeCalculator } from "./CashChangeCalculator";

type PaymentMethod = "yape" | "efectivo";

interface Promo {
  id: string;
  discountPercent: number;
}

export interface CheckoutPaymentSectionProps {
  tip: number;
  onTipChange: (v: number) => void;
  couponCode: string;
  onCouponCodeChange: (v: string) => void;
  couponApplied: boolean;
  couponDiscount: number;
  couponMsg: string;
  validatingCoupon: boolean;
  onValidateCoupon: () => void;
  onRemoveCoupon: () => void;
  total: number;
  finalTotal: number;
  discount: number;
  promo: Promo | null;
  tierDiscount: number;
  tierDiscountPct: number;
  loyaltyTier: string | null;
  loyaltyPoints: number | null;
  redemptionSoles: number;
  onRedemptionChange: (soles: number) => void;
  paymentMethod: PaymentMethod | null;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  yapeEnabled: boolean;
  cashEnabled: boolean;
  yape: { enabled: boolean; image?: string; name?: string; phone?: string };
  yapeOpNumber: string;
  onYapeOpNumberChange: (v: string) => void;
  showPaymentHint: boolean;
  submitting: boolean;
  submitError: string;
  onBack: () => void;
  deliveryEtaNode?: React.ReactNode;
}

/**
 * Header de sub-sección — icono brand + label brand-dark.
 * Reemplaza la numeración "1 2 3" por algo más elegante.
 */
function SectionHeader({
  icon: Icon,
  title,
  hint,
}: {
  icon: React.ComponentType<{
    className?: string;
    strokeWidth?: number;
    style?: React.CSSProperties;
  }>;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0"
        style={{
          background:
            "color-mix(in oklch, var(--color-primary, #00B4A6) 12%, transparent)",
        }}
      >
        <Icon
          className="h-4 w-4"
          strokeWidth={2.25}
          style={{ color: "var(--color-primary-dark, #009690)" }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-extrabold leading-tight"
          style={{ color: "var(--color-primary-dark, #009690)" }}
        >
          {title}
        </p>
        {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}

function BrandHair() {
  return (
    <div
      className="h-px"
      aria-hidden="true"
      style={{
        background:
          "color-mix(in oklch, var(--color-primary, #00B4A6) 18%, transparent)",
      }}
    />
  );
}

export function CheckoutPaymentSection({
  tip,
  onTipChange,
  couponCode,
  onCouponCodeChange,
  couponApplied,
  couponDiscount,
  couponMsg,
  validatingCoupon,
  onValidateCoupon,
  onRemoveCoupon,
  total,
  finalTotal,
  discount,
  promo,
  tierDiscount,
  tierDiscountPct,
  loyaltyTier,
  loyaltyPoints,
  redemptionSoles,
  onRedemptionChange,
  paymentMethod,
  onPaymentMethodChange,
  yapeEnabled,
  cashEnabled,
  yape,
  yapeOpNumber,
  onYapeOpNumberChange,
  showPaymentHint,
  submitting,
  submitError,
  onBack,
}: CheckoutPaymentSectionProps) {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Lima" }),
  );
  const h = now.getHours();
  const isOpen = h >= 8 && h < 21;
  const eta = isOpen ? "~30 minutos" : "Mañana 8 a 10 am";
  const etaDetail = isOpen
    ? "Empezamos a preparar al confirmar"
    : "Abrimos a las 8:00 AM";

  return (
    <div className="space-y-5 pl-0 sm:pl-6 pt-5 sm:pt-0">
      {/* ─── ETA — banner brand sólido ─── */}
      <m.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden flex items-center gap-3 rounded-2xl px-3.5 py-3 text-white"
        style={{
          background:
            "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
          boxShadow:
            "0 10px 24px -10px color-mix(in oklch, var(--color-primary, #00B4A6) 50%, transparent)",
        }}
      >
        <div
          className="absolute -top-6 -right-6 h-20 w-20 rounded-full pointer-events-none"
          style={{ background: "rgba(255,255,255,0.10)" }}
          aria-hidden="true"
        />
        <m.div
          animate={isOpen ? { x: [0, 3, 0] } : {}}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          className="relative h-10 w-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0"
        >
          <Truck className="h-5 w-5 text-white" strokeWidth={2.25} />
        </m.div>
        <div className="relative flex-1 min-w-0">
          <p className="text-base font-extrabold text-white leading-tight">
            {eta}
          </p>
          <p className="text-xs text-white/85 leading-tight mt-0.5">{etaDetail}</p>
        </div>
        <span
          className={cn(
            "relative h-2.5 w-2.5 rounded-full shrink-0",
            isOpen
              ? "bg-white animate-pulse"
              : "bg-[var(--data-warning-300)]",
          )}
          aria-hidden="true"
        />
      </m.div>

      {/* ═══ Método de pago ═══ */}
      <section className="space-y-3">
        <SectionHeader
          icon={Wallet}
          title="Método de pago"
          hint="Elegí cómo pagar"
        />

        <div
          className="grid grid-cols-2 gap-2.5"
          role="radiogroup"
          aria-label="Método de pago"
        >
          {yapeEnabled && (
            <m.button
              type="button"
              role="radio"
              aria-checked={paymentMethod === "yape"}
              data-testid="payment-yape"
              onClick={() => onPaymentMethodChange("yape")}
              whileTap={{ scale: 0.97 }}
              className={cn(
                "relative flex flex-col items-center justify-center gap-2 h-24 rounded-2xl border-2 transition-all",
              )}
              style={
                paymentMethod === "yape"
                  ? {
                      borderColor: "var(--color-primary, #00B4A6)",
                      background:
                        "color-mix(in oklch, var(--color-primary, #00B4A6) 8%, var(--color-card))",
                      boxShadow:
                        "0 4px 12px -4px color-mix(in oklch, var(--color-primary, #00B4A6) 35%, transparent)",
                    }
                  : {
                      borderColor:
                        "color-mix(in oklch, var(--color-primary, #00B4A6) 18%, transparent)",
                      background: "var(--color-card)",
                    }
              }
            >
              {paymentMethod === "yape" && (
                <span
                  className="absolute top-2 right-2 inline-flex h-5 w-5 items-center justify-center rounded-full text-white"
                  style={{ background: "var(--color-primary, #00B4A6)" }}
                  aria-hidden="true"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} />
                </span>
              )}
              <div className="h-10 w-10 rounded-lg bg-[#742C8D] flex items-center justify-center text-white font-extrabold text-xl">
                Y
              </div>
              <span
                className="text-sm font-extrabold"
                style={{
                  color:
                    paymentMethod === "yape"
                      ? "var(--color-primary-dark, #009690)"
                      : "var(--color-muted)",
                }}
              >
                Yape
              </span>
            </m.button>
          )}
          {cashEnabled && (
            <m.button
              type="button"
              role="radio"
              aria-checked={paymentMethod === "efectivo"}
              data-testid="payment-efectivo"
              onClick={() => onPaymentMethodChange("efectivo")}
              whileTap={{ scale: 0.97 }}
              className={cn(
                "relative flex flex-col items-center justify-center gap-2 h-24 rounded-2xl border-2 transition-all",
              )}
              style={
                paymentMethod === "efectivo"
                  ? {
                      borderColor: "var(--color-primary, #00B4A6)",
                      background:
                        "color-mix(in oklch, var(--color-primary, #00B4A6) 8%, var(--color-card))",
                      boxShadow:
                        "0 4px 12px -4px color-mix(in oklch, var(--color-primary, #00B4A6) 35%, transparent)",
                    }
                  : {
                      borderColor:
                        "color-mix(in oklch, var(--color-primary, #00B4A6) 18%, transparent)",
                      background: "var(--color-card)",
                    }
              }
            >
              {paymentMethod === "efectivo" && (
                <span
                  className="absolute top-2 right-2 inline-flex h-5 w-5 items-center justify-center rounded-full text-white"
                  style={{ background: "var(--color-primary, #00B4A6)" }}
                  aria-hidden="true"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} />
                </span>
              )}
              <div
                className="h-10 w-10 rounded-lg flex items-center justify-center"
                style={{
                  background:
                    "color-mix(in oklch, var(--color-primary, #00B4A6) 14%, transparent)",
                }}
              >
                <Banknote
                  className="h-6 w-6"
                  strokeWidth={2}
                  style={{ color: "var(--color-primary-dark, #009690)" }}
                />
              </div>
              <span
                className="text-sm font-extrabold"
                style={{
                  color:
                    paymentMethod === "efectivo"
                      ? "var(--color-primary-dark, #009690)"
                      : "var(--color-muted)",
                }}
              >
                Efectivo
              </span>
            </m.button>
          )}
        </div>

        {paymentMethod === "yape" && yapeEnabled && (
          <YapePaymentPanel
            yape={yape}
            finalTotal={finalTotal}
            yapeOpNumber={yapeOpNumber}
            onOpNumberChange={onYapeOpNumberChange}
          />
        )}
        {paymentMethod === "efectivo" && (
          <CashChangeCalculator finalTotal={finalTotal} />
        )}
        {showPaymentHint && (
          <p className="flex items-center gap-1.5 text-sm text-[var(--data-error-600)] font-semibold">
            <X className="h-4 w-4" strokeWidth={2.5} />
            {!paymentMethod
              ? "Elegí un método para continuar"
              : "Falta el número de operación de Yape"}
          </p>
        )}
      </section>

      <BrandHair />

      {/* ═══ Propina ═══ */}
      <section className="space-y-3">
        <SectionHeader
          icon={HandCoins}
          title="Propina"
          hint="Para tu repartidor (opcional)"
        />
        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2, 5].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onTipChange(v)}
              className={cn(
                "h-12 rounded-xl text-sm font-extrabold transition-all border-2 flex items-center justify-center gap-1",
              )}
              style={
                tip === v
                  ? {
                      borderColor: "transparent",
                      background:
                        "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
                      color: "white",
                      boxShadow:
                        "0 4px 10px -2px color-mix(in oklch, var(--color-primary, #00B4A6) 35%, transparent)",
                    }
                  : {
                      borderColor:
                        "color-mix(in oklch, var(--color-primary, #00B4A6) 18%, transparent)",
                      background: "var(--color-card)",
                      color: "var(--color-primary-dark, #009690)",
                    }
              }
            >
              {v === 0 ? "Sin" : `S/${v}`}
            </button>
          ))}
        </div>
      </section>

      <BrandHair />

      {/* ═══ Cupón ═══ */}
      <section className="space-y-3">
        <SectionHeader
          icon={Tag}
          title="¿Tienes un cupón?"
          hint="Ingresa el código"
        />
        {couponApplied ? (
          <div
            className="flex items-center gap-2.5 rounded-xl px-3 h-12 border-2"
            style={{
              background:
                "color-mix(in oklch, var(--data-success-500) 8%, transparent)",
              borderColor:
                "color-mix(in oklch, var(--data-success-500) 30%, transparent)",
            }}
          >
            <CheckCircle2
              className="h-5 w-5 shrink-0"
              strokeWidth={2.25}
              style={{ color: "var(--data-success-600)" }}
            />
            <span
              className="text-sm font-bold flex-1 truncate"
              style={{ color: "var(--data-success-700)" }}
            >
              {couponMsg}
            </span>
            <button
              type="button"
              onClick={onRemoveCoupon}
              className="text-xs font-bold text-muted hover:text-[var(--data-error-500)] transition-colors px-2"
            >
              Quitar
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Tag
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
                strokeWidth={2}
                style={{ color: "var(--color-primary, #00B4A6)" }}
              />
              <input
                type="text"
                value={couponCode}
                onChange={(e) =>
                  onCouponCodeChange(e.target.value.toUpperCase())
                }
                onKeyDown={(e) => e.key === "Enter" && onValidateCoupon()}
                placeholder="CÓDIGO"
                className="w-full h-12 rounded-xl border-2 pl-9 pr-3 text-sm font-mono uppercase placeholder:normal-case placeholder:font-sans placeholder:text-muted text-[var(--text-primary)] bg-[var(--surface-raised)] focus:outline-none transition-colors"
                style={{
                  borderColor:
                    "color-mix(in oklch, var(--color-primary, #00B4A6) 22%, transparent)",
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor =
                    "var(--color-primary, #00B4A6)")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor =
                    "color-mix(in oklch, var(--color-primary, #00B4A6) 22%, transparent)")
                }
              />
            </div>
            <button
              type="button"
              onClick={onValidateCoupon}
              disabled={validatingCoupon || !couponCode.trim()}
              className="px-4 h-12 rounded-xl text-sm font-extrabold text-white disabled:opacity-50 transition-all shrink-0"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
              }}
            >
              {validatingCoupon ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Aplicar"
              )}
            </button>
          </div>
        )}
        {couponMsg && !couponApplied && (
          <p className="text-sm text-[var(--data-error-600)] font-medium">
            {couponMsg}
          </p>
        )}
      </section>

      {/* Loyalty redemption */}
      {loyaltyPoints !== null && loyaltyPoints >= 50 && (() => {
        const PTS_PER_SOL = 50;
        const maxSoles = Math.floor(loyaltyPoints / PTS_PER_SOL);
        return (
          <>
            <BrandHair />
            <section className="space-y-3">
              <SectionHeader
                icon={Gift}
                title="Canjear puntos"
                hint={`Tienes ${loyaltyPoints} pts · 50 pts = S/1`}
              />
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={maxSoles}
                  step={1}
                  value={redemptionSoles}
                  onChange={(e) => onRedemptionChange(Number(e.target.value))}
                  className="flex-1 h-2 cursor-pointer accent-[var(--color-primary,#00B4A6)]"
                  aria-label="Soles a canjear con puntos"
                />
                <div className="text-right shrink-0">
                  <p
                    className="text-base font-extrabold tabular-nums leading-tight"
                    style={{ color: "var(--color-primary-dark, #009690)" }}
                  >
                    −S/{redemptionSoles.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted tabular-nums">
                    {redemptionSoles * PTS_PER_SOL} pts
                  </p>
                </div>
              </div>
            </section>
          </>
        );
      })()}

      {/* ═══ Resumen del pago — bloque brand-tinted ═══ */}
      <div
        className="rounded-2xl px-4 py-4 space-y-1.5"
        style={{
          background:
            "color-mix(in oklch, var(--color-primary, #00B4A6) 6%, var(--color-card))",
          border:
            "1px solid color-mix(in oklch, var(--color-primary, #00B4A6) 22%, transparent)",
        }}
      >
        <p
          className="text-xs font-extrabold uppercase tracking-wider mb-1"
          style={{ color: "var(--color-primary-dark, #009690)" }}
        >
          Resumen del pago
        </p>
        <div className="space-y-1 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted">Subtotal</span>
            <span
              className="tabular-nums font-semibold"
              style={{ color: "var(--color-primary-dark, #009690)" }}
            >
              S/{total.toFixed(2)}
            </span>
          </div>
          {discount > 0 && promo && (
            <div className="flex items-center justify-between text-[var(--data-success-700)] dark:text-emerald-400">
              <span className="truncate pr-2">
                Promo {promo.discountPercent}% off
              </span>
              <span className="tabular-nums font-bold shrink-0">
                −S/{discount.toFixed(2)}
              </span>
            </div>
          )}
          {couponApplied && couponDiscount > 0 && (
            <div className="flex items-center justify-between text-[var(--data-success-700)] dark:text-emerald-400">
              <span className="truncate pr-2">Cupón {couponCode}</span>
              <span className="tabular-nums font-bold shrink-0">
                −S/{couponDiscount.toFixed(2)}
              </span>
            </div>
          )}
          {tierDiscount > 0 && loyaltyTier && (
            <div
              className="flex items-center justify-between"
              style={{ color: "var(--color-primary-dark, #009690)" }}
            >
              <span className="flex items-center gap-1.5 truncate pr-2">
                <Award className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                <span className="truncate">
                  Tier {loyaltyTier} ({tierDiscountPct}%)
                </span>
              </span>
              <span className="tabular-nums font-bold shrink-0">
                −S/{tierDiscount.toFixed(2)}
              </span>
            </div>
          )}
          {redemptionSoles > 0 && (
            <div
              className="flex items-center justify-between"
              style={{ color: "var(--color-primary-dark, #009690)" }}
            >
              <span className="flex items-center gap-1.5 truncate pr-2">
                <Gift className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                <span className="truncate">Puntos canjeados</span>
              </span>
              <span className="tabular-nums font-bold shrink-0">
                −S/{redemptionSoles.toFixed(2)}
              </span>
            </div>
          )}
          {tip > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-muted">Propina</span>
              <span
                className="tabular-nums font-semibold"
                style={{ color: "var(--color-primary-dark, #009690)" }}
              >
                +S/{tip.toFixed(2)}
              </span>
            </div>
          )}
        </div>
        <div
          className="pt-3 mt-2 flex items-baseline justify-between"
          style={{
            borderTop:
              "1px dashed color-mix(in oklch, var(--color-primary, #00B4A6) 35%, transparent)",
          }}
        >
          <span
            className="text-sm font-extrabold uppercase tracking-wider"
            style={{ color: "var(--color-primary-dark, #009690)" }}
          >
            Total
          </span>
          <m.span
            key={finalTotal}
            initial={{ scale: 1.1 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.2 }}
            className="tabular-nums text-3xl font-extrabold"
            style={{ color: "var(--color-primary-dark, #009690)" }}
          >
            S/{finalTotal.toFixed(2)}
          </m.span>
        </div>
        {loyaltyPoints !== null && finalTotal >= 5 && (
          <div className="flex items-center justify-between pt-1.5 text-xs">
            <span className="text-muted flex items-center gap-1.5">
              <Sparkles
                className="h-3.5 w-3.5"
                strokeWidth={2}
                style={{ color: "var(--color-primary, #00B4A6)" }}
              />
              Ganarás
            </span>
            <span
              className="font-extrabold tabular-nums"
              style={{ color: "var(--color-primary-dark, #009690)" }}
            >
              +{Math.floor(finalTotal)} pts
            </span>
          </div>
        )}
      </div>

      {submitError && (
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-red-50 dark:bg-red-950/20 border-2 border-red-200/60 dark:border-red-800/30">
          <div className="h-9 w-9 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
            <X
              className="h-4 w-4 text-[var(--data-error-600)]"
              strokeWidth={2.5}
            />
          </div>
          <p className="text-sm font-medium text-[var(--data-error-700)] dark:text-red-300">
            {submitError}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2.5 pt-1">
        <button
          type="button"
          onClick={onBack}
          data-testid="pago-back"
          disabled={submitting}
          className="flex h-14 w-14 items-center justify-center rounded-2xl transition-all shrink-0 disabled:opacity-50"
          style={{
            border:
              "2px solid color-mix(in oklch, var(--color-primary, #00B4A6) 25%, transparent)",
            color: "var(--color-primary-dark, #009690)",
          }}
          aria-label="Volver al paso de datos"
        >
          <span className="text-xl leading-none">←</span>
        </button>
        <button
          type="submit"
          data-testid="pago-submit"
          disabled={submitting}
          className="flex-1 flex items-center justify-center gap-2 h-14 rounded-2xl font-extrabold text-base text-white transition-all active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none"
          style={{
            background:
              "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
            boxShadow:
              "0 12px 28px color-mix(in oklch, var(--color-primary, #00B4A6) 40%, transparent), 0 2px 6px rgba(0,0,0,0.06)",
          }}
        >
          {submitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Enviando…
            </>
          ) : (
            <>
              <CheckCircle2 className="h-5 w-5" strokeWidth={2.25} />
              <span className="tracking-wide">Continuar</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
