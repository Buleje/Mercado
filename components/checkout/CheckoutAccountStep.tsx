"use client";

import { m } from "framer-motion";
import { User, Phone, Loader2, ShieldCheck, Lock } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface PhoneValidation {
  valid: boolean;
  hint: string;
  color: string;
}

export interface CheckoutAccountStepProps {
  phoneQuery: string;
  onPhoneQueryChange: (v: string) => void;
  phoneQueryValidation: PhoneValidation;
  phoneSearching: boolean;
  phoneNotFound: boolean;
  onPhoneSearch: () => void;
  onSkipAccount: () => void;
}

export function CheckoutAccountStep({
  phoneQuery,
  onPhoneQueryChange,
  phoneQueryValidation,
  phoneSearching,
  phoneNotFound,
  onPhoneSearch,
  onSkipAccount,
}: CheckoutAccountStepProps) {
  return (
    <m.div
      key="cuenta"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
    >
      <div className="px-6 py-5 space-y-5">
        <div className="flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <User className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-extrabold text-gray-900 dark:text-foreground">
              ¿Ya tienes cuenta con nosotros?
            </h3>
            <p className="text-sm text-gray-500 dark:text-zinc-400">
              Ingresa tu celular para cargar tus datos automáticamente.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border-2 border-gray-200 dark:border-zinc-700 p-5 flex flex-col gap-3 bg-white dark:bg-zinc-900/40">
          <label className="text-xs font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">
            Número de celular
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="tel"
                value={phoneQuery}
                onChange={(e) => {
                  onPhoneQueryChange(e.target.value.replace(/[^\d]/g, ""));
                }}
                placeholder="987 654 321"
                maxLength={9}
                onKeyDown={(e) => e.key === "Enter" && onPhoneSearch()}
                className={cn(
                  "w-full pl-10 pr-3 h-12 rounded-xl border-2 text-base text-gray-900 dark:text-foreground placeholder:text-gray-300 focus:ring-2 outline-none transition-all",
                  phoneQuery.length === 0
                    ? "border-gray-200 dark:border-zinc-700 focus:border-primary focus:ring-primary/20"
                    : phoneQueryValidation.valid
                      ? "border-emerald-400 focus:border-emerald-500 focus:ring-emerald-200"
                      : "border-gray-200 dark:border-zinc-700 focus:border-primary focus:ring-primary/20"
                )}
              />
            </div>
            <m.button
              type="button"
              onClick={onPhoneSearch}
              disabled={!phoneQueryValidation.valid || phoneSearching}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="h-12 px-6 flex items-center justify-center gap-2 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary-dark transition-all shadow-md shadow-primary/20 disabled:opacity-50 sm:min-w-[140px]"
            >
              {phoneSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Phone className="h-4 w-4" />
              )}
              {phoneSearching ? "Buscando..." : "Buscar cuenta"}
            </m.button>
          </div>
          {phoneQuery.length > 0 && phoneQueryValidation.hint && (
            <p className={`text-xs font-semibold ${phoneQueryValidation.color}`}>
              {phoneQueryValidation.hint}
            </p>
          )}
          {phoneNotFound && (
            <p className="text-xs text-red-500 font-semibold">
              Número no encontrado en nuestra base.
            </p>
          )}
        </div>

        {/* Guest checkout — link discreto, no card brotante */}
        <div className="text-center">
          <button
            type="button"
            onClick={onSkipAccount}
            data-testid="checkout-skip-account"
            className="text-sm font-semibold text-gray-500 dark:text-zinc-400 hover:text-primary transition-colors underline-offset-4 hover:underline"
          >
            ¿Es tu primera vez? Continuar sin cuenta
          </button>
        </div>

        {/* Trust signals */}
        <div className="flex items-center justify-center gap-6 pt-2 border-t border-gray-100 dark:border-zinc-800">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-zinc-400">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            <span>Compra protegida</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-zinc-400">
            <Lock className="h-4 w-4 text-emerald-500" />
            <span>SSL encriptado</span>
          </div>
        </div>
      </div>
    </m.div>
  );
}
