"use client";

import { Hash, User, Phone, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DniLookupState } from "../types";

/**
 * CustomerFormFields — los inputs DNI / Nombre / Teléfono.
 * El componente es controlado: padre maneja el state.
 */

export type PhoneValidation = {
  valid: boolean;
  hint: string;
  color: string;
};

export type CustomerFormFieldsProps = {
  dni: string;
  name: string;
  phone: string;
  dniLookup: DniLookupState;
  phoneValidation: PhoneValidation;
  onDniChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
};

export function CustomerFormFields({
  dni,
  name,
  phone,
  dniLookup,
  phoneValidation,
  onDniChange,
  onNameChange,
  onPhoneChange,
}: CustomerFormFieldsProps) {
  return (
    <div className="grid md:grid-cols-3 gap-4">
      {/* DNI */}
      <div>
        <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
          DNI
        </label>
        <div className="relative">
          <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={dni}
            onChange={(e) =>
              onDniChange(e.target.value.replace(/[^\d]/g, "").slice(0, 8))
            }
            placeholder="Ej: 12345678"
            inputMode="numeric"
            maxLength={8}
            data-testid="dni-input"
            className={cn(
              "w-full pl-10 pr-10 py-3 rounded-xl border-2 text-gray-900 dark:text-foreground dark:bg-transparent placeholder:text-gray-300 focus:ring-2 outline-none transition-all text-sm",
              dniLookup.status === "success"
                ? "border-emerald-400 focus:border-emerald-500 focus:ring-emerald-200"
                : dniLookup.status === "error"
                  ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                  : "border-gray-200 focus:border-primary focus:ring-primary/20"
            )}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
            {dniLookup.status === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : dniLookup.status === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : null}
          </div>
        </div>
        <p
          className={cn(
            "text-[11px] mt-1 font-semibold",
            dniLookup.status === "error"
              ? "text-red-500"
              : dniLookup.status === "success"
                ? "text-emerald-600"
                : "text-gray-400"
          )}
        >
          {dniLookup.message}
        </p>
      </div>

      {/* Nombre */}
      <div className="md:col-span-1">
        <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
          Nombre completo *
        </label>
        <div className="relative">
          <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            required
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Ej: María García"
            data-testid="name-input"
            className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-gray-200 text-gray-900 dark:text-foreground dark:bg-transparent placeholder:text-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
          />
        </div>
      </div>

      {/* Teléfono */}
      <div>
        <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
          Teléfono
        </label>
        <div className="relative">
          <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="tel"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="Ej: 987654321"
            maxLength={9}
            data-testid="phone-input"
            className={cn(
              "w-full pl-10 pr-4 py-3 rounded-xl border-2 text-gray-900 dark:text-foreground dark:bg-transparent placeholder:text-gray-300 focus:ring-2 outline-none transition-all text-sm",
              phone.length === 0
                ? "border-gray-200 focus:border-primary focus:ring-primary/20"
                : phoneValidation.valid
                  ? "border-emerald-400 focus:border-emerald-500 focus:ring-emerald-200"
                  : "border-gray-200 focus:border-primary focus:ring-primary/20"
            )}
          />
        </div>
        {phone.length > 0 && phoneValidation.hint && (
          <p className={`text-[11px] mt-1 font-semibold ${phoneValidation.color}`}>
            {phoneValidation.hint}
          </p>
        )}
      </div>
    </div>
  );
}
