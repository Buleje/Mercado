"use client";

/**
 * FlashDealsCountdown — Banner oscuro con timer + grid 6 productos flash.
 * Cada card muestra badge teal "-X%" + micro-timer debajo del precio.
 */

import Link from "next/link";
import { Zap } from "lucide-react";
import type { Deal } from "@/lib/mock-deals";
import { useDealsCountdown } from "./useDealsCountdown";
import {
  VerduraFresca,
  CarniceriaFresca,
  LacteosRefresh,
  BebidasVarias,
  LimpiezaDomicilio,
  PaicheEnOlla,
} from "@/components/ui-system/illustrations";
import type { ComponentType, SVGAttributes } from "react";

type IllustrationComponent = ComponentType<{
  size?: number;
  strokeWidth?: number;
  className?: string;
} & SVGAttributes<SVGSVGElement>>;

const CATEGORY_ILLUSTRATION: Record<string, IllustrationComponent> = {
  abarrotes: LacteosRefresh,
  frescos: VerduraFresca,
  bebidas: BebidasVarias,
  limpieza: LimpiezaDomicilio,
  lacteos: LacteosRefresh,
  farmacia: PaicheEnOlla,
  carnes: CarniceriaFresca,
};

function CardTimer({ endsAt }: { endsAt: string }) {
  const { hours, minutes, seconds, expired } = useDealsCountdown(endsAt);

  if (expired) {
    return (
      <span className="text-[10px] font-semibold text-gray-400 mt-0.5">
        Oferta vencida
      </span>
    );
  }

  return (
    <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">
      {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
    </span>
  );
}

interface FlashDealsCountdownProps {
  deals: Deal[];
}

export default function FlashDealsCountdown({ deals }: FlashDealsCountdownProps) {
  const { days, hours, minutes, seconds } = useDealsCountdown(
    deals[0]?.endsAt ?? new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
  );

  const flash = deals.filter((d) => d.isFlash).slice(0, 6);

  return (
    <section
      aria-labelledby="flash-deals-heading"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
    >
      {/* Banner header */}
      <div className="rounded-2xl bg-gray-900 dark:bg-gray-800 border border-gray-700 overflow-hidden">
        <div className="px-6 py-5 sm:px-8 sm:py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-amber-400" strokeWidth={2} aria-hidden="true" />
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-gray-400">
                Oferta flash de hoy
              </span>
            </div>
            <h2
              id="flash-deals-heading"
              className="text-xl sm:text-2xl font-extrabold tracking-tight text-white"
            >
              Solo 24 horas
            </h2>
          </div>

          {/* Countdown grande */}
          <div
            className="flex items-center gap-1 sm:gap-2"
            aria-label={`Tiempo restante: ${days} dias, ${hours} horas, ${minutes} minutos, ${seconds} segundos`}
          >
            {[
              { v: days, label: "d" },
              { v: hours, label: "h" },
              { v: minutes, label: "m" },
              { v: seconds, label: "s" },
            ].map(({ v, label }, i) => (
              <div key={label} className="flex items-center gap-1 sm:gap-2">
                {i > 0 && (
                  <span className="text-xl font-bold text-gray-500 select-none" aria-hidden="true">:</span>
                )}
                <div className="flex flex-col items-center">
                  <span className="tabular-nums text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-none">
                    {String(v).padStart(2, "0")}
                  </span>
                  <span className="text-[9px] font-bold uppercase text-gray-500 tracking-widest mt-0.5">
                    {label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Grid productos flash */}
        <div className="border-t border-gray-700 bg-gray-950 dark:bg-gray-900 px-4 sm:px-6 py-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {flash.map((deal) => {
              const Ill = CATEGORY_ILLUSTRATION[deal.category] ?? LacteosRefresh;
              return (
                <Link
                  key={deal.id}
                  href={`/marketplace/${deal.storeSlug}`}
                  className="group relative bg-gray-900 dark:bg-gray-800 border border-gray-800 dark:border-gray-700 rounded-xl overflow-hidden hover:border-gray-600 transition-all duration-200"
                >
                  {/* Badge descuento */}
                  <span className="absolute top-2 left-2 z-10 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/20 text-primary border border-primary/30">
                    -{deal.discountPct}%
                  </span>

                  {/* Ilustracion */}
                  <div className="aspect-square bg-gray-800 dark:bg-gray-900 flex items-center justify-center text-gray-400 group-hover:text-primary transition-colors">
                    <Ill size={72} strokeWidth={1.5} />
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <h3 className="text-xs font-semibold text-gray-100 leading-tight line-clamp-2">
                      {deal.name}
                    </h3>
                    <div className="mt-1.5 flex items-baseline gap-1.5">
                      <span className="text-sm font-extrabold text-white">
                        S/{deal.price.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-gray-500 line-through">
                        S/{deal.previousPrice.toFixed(2)}
                      </span>
                    </div>
                    <CardTimer endsAt={deal.endsAt} />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
