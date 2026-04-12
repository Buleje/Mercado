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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { YapePaymentPanel } from "./YapePaymentPanel";
import { CashChangeCalculator } from "./CashChangeCalculator";

type PaymentMethod = "yape" | "efectivo";

interface Promo {
  id: string;
  discountPercent: number;
}

export interface CheckoutPaymentSectionProps {
  // Tip
  tip: number;
  onTipChange: (v: number) => void;
  // Coupon
  couponCode: string;
  onCouponCodeChange: (v: string) => void;
  couponApplied: boolean;
  couponDiscount: number;
  couponMsg: string;
  validatingCoupon: boolean;
  onValidateCoupon: () => void;
  onRemoveCoupon: () => void;
  // Totals
  total: number;
  finalTotal: number;
  discount: number;
  promo: Promo | null;
  tierDiscount: number;
  tierDiscountPct: number;
  loyaltyTier: string | null;
  // Loyalty redemption
  loyaltyPoints: number | null;
  redemptionSoles: number;
  onRedemptionChange: (soles: number) => void;
  // Payment method
  paymentMethod: PaymentMethod | null;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  yapeEnabled: boolean;
  cashEnabled: boolean;
  yape: { enabled: boolean; image?: string; name?: string; phone?: string };
  yapeOpNumber: string;
  onYapeOpNumberChange: (v: string) => void;
  showPaymentHint: boolean;
  // Submit
  submitting: boolean;
  submitError: string;
  onBack: () => void;
  // Delivery ETA (render in this column)
  deliveryEtaNode?: React.ReactNode;
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
  return (
    <div className="space-y-4 pl-0 sm:pl-6 pt-5 sm:pt-0">
      {/* Delivery time estimate */}
      {(() => {
        const now = new Date(
          new Date().toLocaleString("en-US", { timeZone: "America/Lima" })
        );
        const h = now.getHours();
        const isOpen = h >= 8 && h < 21;
        const eta = isOpen ? "~30 minutos" : "Manana de 8:00 a 10:00 am";
        const etaDetail = isOpen
          ? "Tu pedido esta siendo preparado"
          : "Abrimos a las 8:00 AM";
        return (
          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-primary/20 bg-linear-to-br from-primary/5 via-primary/8 to-emerald-50/50 dark:from-primary/10 dark:via-primary/15 dark:to-emerald-900/10 p-4 relative overflow-hidden"
          >
            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-20 h-20 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="flex items-center gap-3.5 relative z-10">
              <m.div
                animate={{ x: [0, 4, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"
              >
                <span className="text-2xl">🚚</span>
              </m.div>
              <div className="flex-1">
                <p className="text-[10px] font-bold text-primary uppercase tracking-wider">
                  Entrega estimada
                </p>
                <p className="text-lg font-extrabold text-gray-900 dark:text-foreground">
                  {eta}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{etaDetail}</p>
              </div>
              <div
                className={`h-3 w-3 rounded-full shrink-0 ${
                  isOpen ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                }`}
              />
            </div>
            {/* Progress bar */}
            {isOpen && (
              <div className="mt-3 relative z-10">
                <div className="h-1.5 bg-gray-200/60 dark:bg-gray-700/40 rounded-full overflow-hidden">
                  <m.div
                    className="h-full bg-linear-to-r from-primary to-emerald-400 rounded-full"
                    initial={{ width: "0%" }}
                    animate={{ width: "15%" }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                  />
                </div>
                <div className="flex justify-between mt-1.5 text-[9px] font-semibold text-gray-400">
                  <span>Confirmado</span>
                  <span>Preparando</span>
                  <span>En camino</span>
                  <span>Entregado</span>
                </div>
              </div>
            )}
          </m.div>
        );
      })()}

      {/* Tip */}
      <div className="rounded-2xl border border-gray-100 dark:border-card-border p-3.5 bg-gray-50/50 dark:bg-surface/30">
        <p className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
          <span className="text-base">🛵</span> Propina para el repartidor
        </p>
        <div className="flex gap-2">
          {[0, 1, 2, 5].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onTipChange(v)}
              className={cn(
                "flex-1 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 border-2",
                tip === v
                  ? "border-primary bg-primary text-white shadow-md shadow-primary/25"
                  : "border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-muted hover:border-primary/50 hover:text-primary bg-white dark:bg-card"
              )}
            >
              {v === 0 ? "Sin\npropina" : `S/${v}`}
            </button>
          ))}
        </div>
      </div>

      {/* Coupon */}
      <div className="rounded-2xl border border-gray-100 dark:border-card-border p-3.5 bg-gray-50/50 dark:bg-surface/30">
        <p className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
          <Tag className="h-4 w-4" /> Cupon de descuento
        </p>
        {couponApplied ? (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 px-3 py-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 flex-1">
              {couponMsg}
            </span>
            <button
              type="button"
              onClick={onRemoveCoupon}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Quitar
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={couponCode}
              onChange={(e) => onCouponCodeChange(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && onValidateCoupon()}
              placeholder="CODIGO"
              className="flex-1 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-card px-3 py-2 text-sm font-mono uppercase placeholder:normal-case placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            <button
              type="button"
              onClick={onValidateCoupon}
              disabled={validatingCoupon || !couponCode.trim()}
              className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-50 hover:bg-primary/90 transition-colors"
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
          <p className="text-xs text-red-500 mt-1.5">{couponMsg}</p>
        )}
      </div>

      {/* Totals */}
      <div className="rounded-2xl border border-gray-100 dark:border-card-border overflow-hidden shadow-sm">
        <div className="px-4 py-2 bg-gray-50 dark:bg-surface border-b border-gray-100 dark:border-card-border">
          <p className="text-[10px] font-bold text-gray-400 dark:text-muted uppercase tracking-wider">
            Resumen del pago
          </p>
        </div>
        <div className="flex justify-between px-4 py-2.5 text-sm bg-white dark:bg-card">
          <span className="text-gray-500">Subtotal</span>
          <span className="font-semibold text-gray-800 dark:text-foreground">
            S/{total.toFixed(2)}
          </span>
        </div>
        {discount > 0 && promo && (
          <div className="flex justify-between px-4 py-2.5 text-sm bg-emerald-50/50 dark:bg-emerald-900/10">
            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
              Promo {promo.discountPercent}% off
            </span>
            <span className="font-bold text-emerald-600">
              &minus;S/{discount.toFixed(2)}
            </span>
          </div>
        )}
        {couponApplied && couponDiscount > 0 && (
          <div className="flex justify-between px-4 py-2.5 text-sm bg-emerald-50/50 dark:bg-emerald-900/10">
            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
              Cupon {couponCode}
            </span>
            <span className="font-bold text-emerald-600">
              &minus;S/{couponDiscount.toFixed(2)}
            </span>
          </div>
        )}
        {tierDiscount > 0 && loyaltyTier && (
          <div className="flex justify-between px-4 py-2.5 text-sm bg-purple-50/50 dark:bg-purple-900/10">
            <span className="text-purple-700 dark:text-purple-400 font-semibold flex items-center gap-1">
              <Award className="h-3.5 w-3.5" /> Tier {loyaltyTier} (
              {tierDiscountPct}%)
            </span>
            <span className="font-bold text-purple-600">
              &minus;S/{tierDiscount.toFixed(2)}
            </span>
          </div>
        )}
        {/* Loyalty points redemption */}
        {loyaltyPoints !== null && loyaltyPoints >= 50 && (() => {
          const PTS_PER_SOL = 50;
          const maxSoles = Math.floor(loyaltyPoints / PTS_PER_SOL);
          return (
            <div className="px-4 py-3 bg-sky-50/50 dark:bg-sky-900/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sky-700 dark:text-sky-400 font-semibold text-sm flex items-center gap-1">
                  <Gift className="h-3.5 w-3.5" /> Canjear puntos
                  <span className="text-xs font-normal opacity-70">({loyaltyPoints} pts)</span>
                </span>
                {redemptionSoles > 0 && (
                  <span className="font-bold text-sky-600 text-sm">
                    &minus;S/{redemptionSoles.toFixed(2)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={maxSoles}
                  step={1}
                  value={redemptionSoles}
                  onChange={(e) => onRedemptionChange(Number(e.target.value))}
                  className="flex-1 h-1.5 accent-sky-500 cursor-pointer"
                  aria-label="Soles a canjear con puntos"
                />
                <span className="text-xs text-sky-600 font-bold w-16 text-right">
                  S/{redemptionSoles} ({redemptionSoles * PTS_PER_SOL} pts)
                </span>
              </div>
              <p className="text-[10px] text-sky-500 dark:text-sky-400/70">
                50 puntos = S/ 1 · Máximo S/{maxSoles} con tus puntos
              </p>
            </div>
          );
        })()}
        {tip > 0 && (
          <div className="flex justify-between px-4 py-2.5 text-sm bg-amber-50/50 dark:bg-amber-900/10">
            <span className="text-amber-700 dark:text-amber-400 font-semibold">
              Propina
            </span>
            <span className="font-bold text-amber-600">
              +S/{tip.toFixed(2)}
            </span>
          </div>
        )}
        <div className="flex justify-between items-center px-4 py-4 bg-linear-to-r from-primary/8 to-emerald-400/8 dark:from-primary/15 dark:to-emerald-500/15 border-t-2 border-primary/30">
          <span className="font-extrabold text-gray-900 dark:text-foreground text-base">
            Total a pagar
          </span>
          <m.span
            key={finalTotal}
            initial={{ scale: 1.2, color: "#00B4A6" }}
            animate={{ scale: 1, color: "#00B4A6" }}
            className="text-2xl font-extrabold text-primary"
          >
            S/{finalTotal.toFixed(2)}
          </m.span>
        </div>
        {/* Points you'll earn with this purchase */}
        {loyaltyPoints !== null && finalTotal >= 5 && (
          <div className="flex justify-between items-center px-4 py-2 bg-primary/5 dark:bg-primary/10">
            <span className="text-xs text-primary font-medium flex items-center gap-1">
              ⭐ Ganarás con esta compra
            </span>
            <span className="text-xs font-bold text-primary">
              +{Math.floor(finalTotal)} puntos
            </span>
          </div>
        )}
      </div>

      {/* Payment method */}
      <div className="space-y-3">
        <p className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wider flex items-center gap-1.5">
          <span className="text-base">💳</span> Metodo de pago
        </p>
        <div
          className="grid grid-cols-2 gap-3"
          role="radiogroup"
          aria-label="Metodo de pago"
        >
          {yapeEnabled && (
            <m.button
              type="button"
              role="radio"
              aria-checked={paymentMethod === "yape"}
              data-testid="payment-yape"
              onClick={() => onPaymentMethodChange("yape")}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                type: "spring",
                damping: 15,
                stiffness: 300,
                delay: 0.1,
              }}
              whileHover={{ scale: 1.04, y: -2 }}
              whileTap={{ scale: 0.97 }}
              className={cn(
                "flex flex-col items-center gap-2 py-5 px-3 rounded-2xl border-2 transition-colors relative overflow-hidden",
                paymentMethod === "yape"
                  ? "border-purple-400 bg-purple-50 shadow-lg shadow-purple-200/50 dark:shadow-purple-900/30"
                  : "border-gray-200 hover:border-purple-300 hover:shadow-md"
              )}
            >
              {paymentMethod === "yape" && (
                <m.div
                  layoutId="payment-glow"
                  className="absolute inset-0 bg-linear-to-br from-purple-100/80 to-purple-50/40 dark:from-purple-900/20 dark:to-purple-800/10"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                />
              )}
              <m.div
                animate={
                  paymentMethod === "yape"
                    ? { scale: [1, 1.15, 1], rotate: [0, -5, 5, 0] }
                    : {}
                }
                transition={{ duration: 0.5 }}
                className="relative z-10 h-12 w-12 rounded-xl bg-purple-600 flex items-center justify-center text-white font-extrabold text-xl shadow-lg"
              >
                Y
              </m.div>
              <span
                className={cn(
                  "relative z-10 text-sm font-bold",
                  paymentMethod === "yape" ? "text-purple-700" : "text-gray-500"
                )}
              >
                Yape
              </span>
              {paymentMethod !== "yape" && (
                <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-purple-400 animate-pulse" />
              )}
            </m.button>
          )}
          {cashEnabled && (
            <m.button
              type="button"
              role="radio"
              aria-checked={paymentMethod === "efectivo"}
              data-testid="payment-efectivo"
              onClick={() => onPaymentMethodChange("efectivo")}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                type: "spring",
                damping: 15,
                stiffness: 300,
                delay: 0.2,
              }}
              whileHover={{ scale: 1.04, y: -2 }}
              whileTap={{ scale: 0.97 }}
              className={cn(
                "flex flex-col items-center gap-2 py-5 px-3 rounded-2xl border-2 transition-colors relative overflow-hidden",
                paymentMethod === "efectivo"
                  ? "border-emerald-400 bg-emerald-50 shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30"
                  : "border-gray-200 hover:border-emerald-300 hover:shadow-md"
              )}
            >
              {paymentMethod === "efectivo" && (
                <m.div
                  layoutId="payment-glow"
                  className="absolute inset-0 bg-linear-to-br from-emerald-100/80 to-emerald-50/40 dark:from-emerald-900/20 dark:to-emerald-800/10"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                />
              )}
              <m.div
                animate={
                  paymentMethod === "efectivo"
                    ? { scale: [1, 1.15, 1], rotate: [0, 5, -5, 0] }
                    : {}
                }
                transition={{ duration: 0.5 }}
                className="relative z-10"
              >
                <Banknote
                  className={cn(
                    "h-12 w-12 drop-shadow-md",
                    paymentMethod === "efectivo"
                      ? "text-emerald-600"
                      : "text-gray-400"
                  )}
                />
              </m.div>
              <span
                className={cn(
                  "relative z-10 text-sm font-bold",
                  paymentMethod === "efectivo"
                    ? "text-emerald-700"
                    : "text-gray-500"
                )}
              >
                Efectivo
              </span>
              {paymentMethod !== "efectivo" && (
                <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
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
          <p className="text-xs text-red-500 font-semibold">
            {!paymentMethod
              ? "Selecciona un metodo de pago para continuar"
              : "Ingresa el numero de operacion de Yape para continuar"}
          </p>
        )}
      </div>

      {submitError && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30 animate-[fadeUp_0.2s_ease-out]">
          <div className="h-9 w-9 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
            <X className="h-4 w-4 text-red-500" />
          </div>
          <p className="text-red-700 dark:text-red-300 text-sm font-medium">
            {submitError}
          </p>
        </div>
      )}

      {/* Points preview */}
      {finalTotal > 0 && (
        <div className="flex items-center gap-3 bg-linear-to-r from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20 rounded-2xl border border-violet-100 dark:border-violet-800/30 px-4 py-3">
          <div className="h-10 w-10 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0">
            <span className="text-xl leading-none">⭐</span>
          </div>
          <div>
            <p className="text-sm font-extrabold text-violet-800 dark:text-violet-300">
              +{Math.floor(finalTotal / 10) * 5} puntos
            </p>
            <p className="text-[11px] text-violet-500 dark:text-violet-400">
              Ganaras puntos por este pedido!
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <m.button
          type="button"
          onClick={onBack}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.96 }}
          className="flex items-center justify-center gap-1.5 shrink-0 px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-zinc-700 text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors"
        >
          &larr; Volver
        </m.button>
        <m.button
          type="submit"
          data-testid="pago-submit"
          disabled={submitting}
          whileHover={submitting ? {} : { scale: 1.03, y: -2 }}
          whileTap={submitting ? {} : { scale: 0.96 }}
          className="flex-1 py-4 rounded-xl bg-linear-to-r from-primary via-emerald-500 to-primary text-white font-extrabold text-base transition-all shadow-lg shadow-primary/30 disabled:opacity-50 flex items-center justify-center gap-2.5 relative overflow-hidden"
        >
          {!submitting && (
            <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-[shimmer_3s_ease-in-out_infinite]" />
          )}
          <span className="relative z-10 flex items-center gap-2">
            {submitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-5 w-5" />
            )}
            {submitting ? "Enviando..." : "🛒 Finalizar pedido"}
          </span>
        </m.button>
      </div>
    </div>
  );
}
