"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import {
  GIFT_CARD_DENOMINATIONS,
  GIFT_CARD_DESIGNS,
  type GiftCardDesign,
} from "@/lib/mocks/gift-cards.mock";
import GiftCardArtwork from "../shared/GiftCardArtwork";

type Props = {
  amount: number;
  design: GiftCardDesign;
  onChange: (next: { amount: number; design: GiftCardDesign }) => void;
  onNext: () => void;
};

export default function StepMontoDiseno({ amount, design, onChange, onNext }: Props) {
  const [customAmount, setCustomAmount] = useState<string>(
    amount && !GIFT_CARD_DENOMINATIONS.some((d) => d.amount === amount)
      ? String(amount)
      : "",
  );

  const canContinue = amount >= 10 && amount <= 1000;

  function handleAmount(next: number) {
    setCustomAmount("");
    onChange({ amount: next, design });
  }

  function handleCustom(raw: string) {
    setCustomAmount(raw);
    const n = Number(raw);
    if (Number.isFinite(n)) onChange({ amount: n, design });
  }

  return (
    <div className="grid gap-10 md:grid-cols-[1.3fr_1fr]">
      <div className="space-y-10">
        {/* Monto */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">1. Monto</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Desde S/ 10 hasta S/ 1000.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {GIFT_CARD_DENOMINATIONS.filter((d) => d.amount > 0).map((d) => {
              const isActive = amount === d.amount && customAmount === "";
              return (
                <button
                  key={d.amount}
                  type="button"
                  onClick={() => handleAmount(d.amount)}
                  className={[
                    "rounded-xl border p-3 text-center transition-colors",
                    isActive
                      ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                      : "border-gray-200 bg-white text-gray-900 hover:border-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-white dark:hover:border-gray-600",
                  ].join(" ")}
                  aria-pressed={isActive}
                >
                  <div className="text-xl font-bold">S/ {d.amount}</div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <label htmlFor="custom-amount" className="shrink-0 text-sm font-semibold text-gray-700 dark:text-gray-300">
              Personalizado
            </label>
            <div className="flex flex-1 items-center gap-1">
              <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">S/</span>
              <input
                id="custom-amount"
                type="number"
                min={10}
                max={1000}
                value={customAmount}
                onChange={(e) => handleCustom(e.target.value)}
                placeholder="Monto"
                inputMode="numeric"
                className="flex-1 bg-transparent text-lg font-bold text-gray-900 outline-none placeholder:text-gray-300 dark:text-white dark:placeholder:text-gray-600"
              />
            </div>
          </div>
        </section>

        {/* Diseno */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">2. Disenio</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Elegi el estilo que se muestra al destinatario.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {GIFT_CARD_DESIGNS.map((d) => {
              const isActive = d.id === design;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onChange({ amount, design: d.id })}
                  aria-pressed={isActive}
                  className={[
                    "group relative overflow-hidden rounded-xl border bg-white text-left transition-all dark:bg-gray-900",
                    isActive
                      ? "border-gray-900 shadow-sm dark:border-white"
                      : "border-gray-200 hover:border-gray-400 dark:border-gray-800 dark:hover:border-gray-600",
                  ].join(" ")}
                >
                  <div className="aspect-[16/10]">
                    <GiftCardArtwork design={d.id} className="h-full w-full" />
                  </div>
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-xs font-semibold text-gray-900 dark:text-white">
                      {d.label}
                    </span>
                    {isActive && (
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-white dark:bg-white dark:text-gray-900">
                        <Check className="h-3 w-3" aria-hidden="true" />
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onNext}
            disabled={!canContinue}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 dark:disabled:bg-gray-700"
          >
            Continuar
          </button>
        </div>
      </div>

      {/* Sidebar preview sticky */}
      <aside className="space-y-3 md:sticky md:top-24 md:self-start">
        <div className="overflow-hidden rounded-2xl border border-gray-200 shadow-sm dark:border-gray-800">
          <div className="aspect-[16/10] bg-gray-50 dark:bg-gray-950">
            <GiftCardArtwork design={design} className="h-full w-full" />
          </div>
          <div className="border-t border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Vista previa
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Monto</span>
              <span className="text-2xl font-bold text-gray-900 dark:text-white">
                S/ {amount || 0}
              </span>
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Sin vencimiento. Se canjea en cualquier bodega del marketplace.
        </p>
      </aside>
    </div>
  );
}
