"use client";

/**
 * FlashDealsCountdown — Banner claro con timer + grid 6 productos flash.
 *
 * Fix 2026-04-18: antes era dark-forzado (bg-gray-900 hardcoded, text-white).
 * Ahora usa tokens del design system → sigue el tema del resto del sitio
 * (claro por default, dark solo en dark mode via dark:). Timer + badges
 * mantienen el teal/amber como acento, pero sobre surface claro.
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
      <span className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)] mt-0.5">
        Oferta vencida
      </span>
    );
  }

  return (
    <span className="text-[length:var(--ts-2xs)] font-semibold text-[var(--data-warning)] tabular-nums mt-0.5">
      {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
    </span>
  );
}

interface FlashDealsCountdownProps {
  deals: Deal[];
}

export default function FlashDealsCountdown({ deals }: FlashDealsCountdownProps) {
  const flash = deals.filter((d) => d.isFlash).slice(0, 6);
  const firstEndsAt = flash[0]?.endsAt ?? deals[0]?.endsAt ?? "";
  const { days, hours, minutes, seconds } = useDealsCountdown(firstEndsAt);

  // Si no hay deals, no tiene sentido mostrar el countdown — devolvemos null.
  if (!firstEndsAt) return null;

  return (
    <section
      aria-labelledby="flash-deals-heading"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
    >
      {/* Banner header — superficie raised sobre canvas */}
      <div className="rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-base)] overflow-hidden">
        <div className="px-6 py-5 sm:px-8 sm:py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-[var(--data-warning)]" strokeWidth={2} aria-hidden="true" />
              <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)]">
                Oferta flash de hoy
              </span>
            </div>
            <h2
              id="flash-deals-heading"
              className="text-xl sm:text-2xl font-extrabold tracking-tight text-[var(--text-primary)]"
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
                  <span className="text-xl font-bold text-[var(--text-tertiary)] select-none" aria-hidden="true">:</span>
                )}
                <div className="flex flex-col items-center">
                  <span className="tabular-nums text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight leading-none">
                    {String(v).padStart(2, "0")}
                  </span>
                  <span className="text-[length:var(--ts-2xs)] font-bold uppercase text-[var(--text-tertiary)] tracking-widest mt-0.5">
                    {label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Grid productos flash — superficie sunken para contraste sutil */}
        <div className="border-t border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 sm:px-6 py-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {flash.map((deal) => {
              const Ill = CATEGORY_ILLUSTRATION[deal.category] ?? LacteosRefresh;
              return (
                <Link
                  key={deal.id}
                  href={`/marketplace/${deal.storeSlug}`}
                  className="group relative bg-[var(--surface-canvas)] border border-[var(--rule-base)] rounded-xl overflow-hidden hover:border-[var(--rule-strong)] transition-all duration-200"
                >
                  {/* Badge descuento — acento sobre claro */}
                  <span className="absolute top-2 left-2 z-10 inline-flex items-center px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold bg-[var(--accent)] text-white">
                    -{deal.discountPct}%
                  </span>

                  {/* Ilustración — fondo neutral claro */}
                  <div className="aspect-square bg-[var(--surface-sunken)] flex items-center justify-center text-[var(--text-tertiary)] group-hover:text-[var(--accent)] transition-colors">
                    <Ill size={72} strokeWidth={1.5} />
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <h3 className="text-xs font-semibold text-[var(--text-primary)] leading-tight line-clamp-2">
                      {deal.name}
                    </h3>
                    <div className="mt-1.5 flex items-baseline gap-1.5">
                      <span className="text-sm font-extrabold text-[var(--text-primary)]">
                        S/{deal.price.toFixed(2)}
                      </span>
                      <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] line-through">
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
