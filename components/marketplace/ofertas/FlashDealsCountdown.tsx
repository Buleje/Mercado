"use client";

/**
 * FlashDealsCountdown — Banner editorial con countdown global + carrusel de
 * productos flash deals (24h max).
 *
 * Estilo Buleje: gradient surface sunken con accent blob, header inline
 * (Flame icon + h2 + countdown HH:MM:SS tabular-nums), carrusel horizontal
 * con cards Holded.
 *
 * Tokens estrictos. Sin colores hardcoded. Iconos del DS Buleje.
 */

import Link from "next/link";
import Image from "next/image";
import { Flame, Package, Clock } from "@buleje/design-system/icons";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";
import { cn } from "@/lib/utils";
import type { Deal } from "@/lib/mock-deals";
import { useDealsCountdown } from "./useDealsCountdown";

const pen = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

function formatHMS(days: number, hours: number, minutes: number, seconds: number): string {
  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function CardTimer({ endsAt }: { endsAt: string }) {
  const { hours, minutes, seconds, expired } = useDealsCountdown(endsAt);
  if (expired) {
    return (
      <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
        Vencida
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--accent)]">
      <Clock className="h-3 w-3" strokeWidth={2} aria-hidden />
      {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
    </span>
  );
}

interface FlashDealsCountdownProps {
  deals: Deal[];
}

export default function FlashDealsCountdown({ deals }: FlashDealsCountdownProps) {
  const flash = deals.filter((d) => d.isFlash).slice(0, 8);
  const firstEndsAt = flash[0]?.endsAt ?? deals[0]?.endsAt ?? "";
  const { days, hours, minutes, seconds, expired } = useDealsCountdown(firstEndsAt);

  if (!firstEndsAt || flash.length === 0) return null;

  return (
    <section
      aria-labelledby="flash-deals-heading"
      className={cn(
        "relative w-full py-10 sm:py-14 overflow-hidden",
        "bg-gradient-to-r from-[var(--surface-sunken)] via-[var(--surface-canvas)] to-[var(--surface-sunken)]",
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-0 h-[400px] w-[400px] rounded-full bg-[var(--accent)]/[0.06] blur-3xl"
      />

      <div className="relative max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header inline: kicker + h2 + countdown grande */}
        <header className="mb-8 pb-6 border-b border-[var(--rule-soft)] flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.2em] text-[var(--accent)] mb-2">
              <span aria-hidden className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              <Flame className="h-4 w-4" strokeWidth={2} aria-hidden />
              Ofertas relampago
            </p>
            <h2
              id="flash-deals-heading"
              className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-[-0.02em] text-[var(--text-primary)] leading-[1.05]"
            >
              Termina hoy
            </h2>
            <p className="mt-2 text-[length:var(--ts-sm)] sm:text-base text-[var(--text-tertiary)] leading-relaxed max-w-2xl">
              {flash.length} productos con descuento real. Solo por las proximas horas.
            </p>
          </div>

          {/* Countdown grande tabular-nums */}
          <div
            aria-live="polite"
            aria-label={`Tiempo restante: ${days}d ${hours}h ${minutes}m ${seconds}s`}
            className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-2.5"
          >
            <Clock className="h-4 w-4 text-[var(--accent)]" strokeWidth={2} aria-hidden />
            <span className="tabular-nums text-2xl sm:text-3xl font-black text-[var(--text-primary)] leading-none tracking-tight">
              {expired ? "00:00:00" : formatHMS(days, hours, minutes, seconds)}
            </span>
          </div>
        </header>

        {/* Carrusel horizontal con cards Holded */}
        <HorizontalCarousel ariaLabel="Productos en oferta relampago">
          {flash.map((deal) => {
            const ahorro = deal.previousPrice - deal.price;
            return (
              <Link
                key={deal.id}
                href={`/marketplace/${deal.storeSlug}`}
                className="group relative block rounded-xl overflow-hidden border border-[var(--rule-soft)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/40 hover:-translate-y-0.5 transition-all duration-300 motion-reduce:hover:translate-y-0"
              >
                {/* Badge -X% top-left */}
                <span className="absolute top-2 left-2 z-10 inline-flex items-center justify-center rounded-md px-2 py-1 text-[length:var(--ts-xs)] font-black tabular-nums uppercase tracking-wider bg-[var(--accent)] text-[var(--surface-canvas)] shadow-md">
                  -{deal.discountPct}%
                </span>

                {/* Imagen / placeholder */}
                <div className="relative aspect-square bg-[var(--surface-sunken)]">
                  <span className="absolute inset-0 flex items-center justify-center text-[var(--text-tertiary)]">
                    <Package className="h-10 w-10" strokeWidth={1.25} aria-hidden />
                  </span>
                </div>

                {/* Info */}
                <div className="p-3">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">
                    {deal.category}
                  </p>
                  <p className="text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)] line-clamp-2 min-h-[2.5rem]">
                    {deal.name}
                  </p>
                  <div className="mt-1.5 flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] line-through tabular-nums">
                      {pen.format(deal.previousPrice)}
                    </span>
                    <span className="text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--accent)]">
                      Ahorra {pen.format(ahorro)}
                    </span>
                  </div>
                  <p className="text-xl font-black tabular-nums tracking-[-0.02em] text-[var(--accent)] leading-none mt-0.5">
                    {pen.format(deal.price)}
                  </p>
                  <div className="mt-2 pt-2 border-t border-[var(--rule-soft)]">
                    <CardTimer endsAt={deal.endsAt} />
                  </div>
                </div>
              </Link>
            );
          })}
        </HorizontalCarousel>
      </div>
    </section>
  );
}
