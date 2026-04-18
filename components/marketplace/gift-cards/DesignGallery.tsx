"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { GIFT_CARD_DESIGNS, type GiftCardDesign } from "@/lib/mocks/gift-cards.mock";
import GiftCardArtwork from "./shared/GiftCardArtwork";

type Props = {
  initialDesign?: GiftCardDesign;
  onSelect?: (design: GiftCardDesign) => void;
};

export default function DesignGallery({ initialDesign = "general", onSelect }: Props) {
  const [selected, setSelected] = useState<GiftCardDesign>(initialDesign);

  function handleSelect(d: GiftCardDesign) {
    setSelected(d);
    onSelect?.(d);
  }

  return (
    <section className="border-b border-gray-100 bg-white py-14 dark:border-gray-800 dark:bg-gray-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
              Elegi el disenio
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
              8 estilos para cada ocasion. El que elijas se muestra al destinatario
              cuando abre la tarjeta.
            </p>
          </div>
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Seleccionado: <span className="text-gray-900 dark:text-white">
              {GIFT_CARD_DESIGNS.find((d) => d.id === selected)?.label}
            </span>
          </span>
        </header>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {GIFT_CARD_DESIGNS.map((d) => {
            const isActive = d.id === selected;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => handleSelect(d.id)}
                className={[
                  "group relative flex flex-col overflow-hidden rounded-2xl border bg-white text-left transition-all dark:bg-gray-900",
                  isActive
                    ? "border-gray-900 shadow-sm dark:border-white"
                    : "border-gray-200 hover:border-gray-400 dark:border-gray-800 dark:hover:border-gray-600",
                ].join(" ")}
                aria-pressed={isActive}
              >
                <div className="aspect-[16/10] w-full">
                  <GiftCardArtwork design={d.id} className="h-full w-full" />
                </div>
                <div className="flex items-center justify-between gap-2 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">
                      {d.label}
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400">
                      {d.description}
                    </div>
                  </div>
                  {isActive && (
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-white dark:bg-white dark:text-gray-900">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-8 flex justify-end">
          <Link
            href={`/marketplace/gift-cards/comprar?design=${selected}`}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
          >
            Usar este disenio
          </Link>
        </div>
      </div>
    </section>
  );
}
