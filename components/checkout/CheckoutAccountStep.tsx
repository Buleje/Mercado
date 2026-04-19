"use client";

import { m } from "framer-motion";
import { User, Phone, Loader2, ChevronRight } from "@buleje/design-system/icons";
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
      <div className="px-6 py-5 space-y-4">
        <div className="flex items-center gap-4 mb-1">
          <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <User className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-gray-900 dark:text-foreground">
              Ya tienes cuenta?
            </h3>
            <p className="text-sm text-gray-400">
              Ingresa tu celular para cargar tus datos guardados.
            </p>
          </div>
        </div>

        {/* 2 columnas: buscar numero | cliente nuevo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Col 1: Buscar numero */}
          <div className="rounded-2xl border-2 border-gray-200 dark:border-zinc-700 p-5 flex flex-col gap-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Buscar cuenta
            </p>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="tel"
                value={phoneQuery}
                onChange={(e) => {
                  onPhoneQueryChange(e.target.value.replace(/[^\d]/g, ""));
                }}
                placeholder="987654321"
                maxLength={9}
                onKeyDown={(e) => e.key === "Enter" && onPhoneSearch()}
                className={cn(
                  "w-full pl-9 pr-3 py-2.5 rounded-xl border text-gray-900 dark:text-foreground placeholder:text-gray-300 focus:ring-2 outline-none transition-all text-sm",
                  phoneQuery.length === 0
                    ? "border-gray-200 dark:border-zinc-700 focus:border-primary focus:ring-primary/20"
                    : phoneQueryValidation.valid
                      ? "border-emerald-400 focus:border-emerald-500 focus:ring-emerald-200"
                      : "border-gray-200 dark:border-zinc-700 focus:border-primary focus:ring-primary/20"
                )}
              />
            </div>
            {phoneQuery.length > 0 && phoneQueryValidation.hint && (
              <p className={`text-xs font-semibold ${phoneQueryValidation.color}`}>
                {phoneQueryValidation.hint}
              </p>
            )}
            {phoneNotFound && (
              <p className="text-xs text-red-500 font-semibold">Numero no encontrado</p>
            )}
            <m.button
              type="button"
              onClick={onPhoneSearch}
              disabled={!phoneQueryValidation.valid || phoneSearching}
              whileHover={{ scale: 1.03, y: -1 }}
              whileTap={{ scale: 0.96 }}
              className="mt-auto w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary-dark transition-all shadow-md shadow-primary/20 disabled:opacity-50"
            >
              {phoneSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Phone className="h-4 w-4" />
              )}
              {phoneSearching ? "Buscando..." : "Buscar"}
            </m.button>
          </div>

          {/* Col 2: Cliente nuevo */}
          <m.div
            className="rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 p-5 flex flex-col gap-4 items-center justify-center"
            whileHover={{ scale: 1.02, borderColor: "rgba(0,180,166,0.5)" }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-sm font-extrabold text-primary">Soy nuevo</p>
              <p className="text-xs text-gray-400 mt-1">Registro rapido sin cuenta</p>
            </div>
            <m.button
              type="button"
              onClick={onSkipAccount}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              data-testid="checkout-skip-account"
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-primary/40 text-sm font-bold text-primary hover:bg-primary/10 hover:border-primary/60 transition-all"
            >
              Continuar <ChevronRight className="h-4 w-4" />
            </m.button>
          </m.div>
        </div>
      </div>
    </m.div>
  );
}
