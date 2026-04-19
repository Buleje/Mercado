"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Plus } from "@buleje/design-system/icons";
import { GIFT_CARD_DENOMINATIONS } from "@/lib/mocks/gift-cards.mock";

type Props = {
  selectedDesign?: string;
};

export default function DenominationGrid({ selectedDesign = "general" }: Props) {
  const [customAmount, setCustomAmount] = useState<string>("");

  const numericCustom = Number(customAmount);
  const isCustomValid =
    Number.isFinite(numericCustom) && numericCustom >= 10 && numericCustom <= 1000;

  return (
    <section
      id="denominaciones"
      className="border-b border-gray-100 bg-gray-50/50 py-14 dark:border-gray-800 dark:bg-gray-950"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="mb-8 max-w-2xl">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
            Elegi el monto
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Desde S/ 10 hasta S/ 1000. Todas las tarjetas se pueden usar en
            cualquier tienda del marketplace.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {GIFT_CARD_DENOMINATIONS.map((d) => {
            if (d.amount === 0) {
              return (
                <div
                  key="custom"
                  className="group relative flex flex-col items-stretch rounded-2xl border border-dashed border-gray-300 bg-white p-5 dark:border-gray-700 dark:bg-gray-900"
                >
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Personalizado
                  </span>
                  <div className="mt-2 flex items-baseline">
                    <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">S/</span>
                    <input
                      type="number"
                      min={10}
                      max={1000}
                      placeholder="0"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      inputMode="numeric"
                      className="ml-1 w-full bg-transparent text-2xl font-bold text-gray-900 outline-none placeholder:text-gray-300 dark:text-white dark:placeholder:text-gray-600"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{d.hint}</p>
                  <Link
                    href={
                      isCustomValid
                        ? `/marketplace/gift-cards/comprar?amount=${numericCustom}&design=${selectedDesign}`
                        : "#denominaciones"
                    }
                    aria-disabled={!isCustomValid}
                    className={[
                      "mt-4 inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
                      isCustomValid
                        ? "bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
                        : "cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600",
                    ].join(" ")}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Continuar
                  </Link>
                </div>
              );
            }

            const href = `/marketplace/gift-cards/comprar?amount=${d.amount}&design=${selectedDesign}`;
            return (
              <Link
                key={d.amount}
                href={href}
                className="group relative flex flex-col items-stretch rounded-2xl border border-gray-200 bg-white p-5 transition-all hover:border-gray-900 hover:shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:hover:border-white"
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {d.hint}
                </span>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">S/</span>
                  <span className="text-3xl font-bold text-gray-900 dark:text-white">
                    {d.amount}
                  </span>
                </div>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-gray-900 opacity-0 transition-opacity group-hover:opacity-100 dark:text-white">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" /> Elegir
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
