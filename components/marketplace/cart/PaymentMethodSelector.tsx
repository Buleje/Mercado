"use client";

import React from "react";
import { PaymentMethodIcon } from "@/components/marketplace/PaymentIcons";

interface PaymentMethodSelectorProps {
  paymentMethod: "efectivo" | "yape";
  onSelect: (method: "efectivo" | "yape") => void;
}

export function PaymentMethodSelector({ paymentMethod, onSelect }: PaymentMethodSelectorProps) {
  return (
    <div className="space-y-3">
      {/* Efectivo */}
      <button
        onClick={() => onSelect("efectivo")}
        className={`w-full flex items-center gap-4 rounded-2xl border-2 p-4 transition-all ${
          paymentMethod === "efectivo"
            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
            : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
        }`}
      >
        <PaymentMethodIcon method="efectivo" size={48} className="h-12 w-12 shrink-0" />
        <div className="flex-1 text-left">
          <p className="text-sm font-bold text-gray-900 dark:text-white">Efectivo</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Pagas cuando recibas tu pedido</p>
        </div>
        <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
          paymentMethod === "efectivo" ? "border-primary" : "border-gray-300 dark:border-gray-600"
        }`}>
          {paymentMethod === "efectivo" && <div className="h-3 w-3 rounded-full bg-primary" />}
        </div>
      </button>

      {/* Yape */}
      <button
        onClick={() => onSelect("yape")}
        className={`w-full flex items-center gap-4 rounded-2xl border-2 p-4 transition-all ${
          paymentMethod === "yape"
            ? "border-[var(--brand-yape)] bg-[var(--brand-yape)]/5 ring-1 ring-[var(--brand-yape)]/20"
            : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
        }`}
      >
        <PaymentMethodIcon method="yape" size={48} className="h-12 w-12 shrink-0" />
        <div className="flex-1 text-left">
          <p className="text-sm font-bold text-gray-900 dark:text-white">Yape</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Transfiere al número del vendedor</p>
        </div>
        <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
          paymentMethod === "yape" ? "border-[var(--brand-yape)]" : "border-gray-300 dark:border-gray-600"
        }`}>
          {paymentMethod === "yape" && <div className="h-3 w-3 rounded-full bg-[var(--brand-yape)]" />}
        </div>
      </button>
    </div>
  );
}
