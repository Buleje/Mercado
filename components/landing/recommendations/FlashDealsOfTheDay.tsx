"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Timer } from "@buleje/design-system/icons";
import { SectionHeader } from "@/components/ui-system";
import { ProductCard } from "@/components/ProductCard";
import { pickWithDiscount, type MockProduct } from "@/lib/recommendations/mock";
import { cn } from "@/lib/utils";

interface Props {
  initialProducts: MockProduct[];
  className?: string;
}

/** Calcula tiempo restante hasta medianoche */
function useCountdownToMidnight() {
  const [display, setDisplay] = useState({ h: "00", m: "00", s: "00", urgent: false });

  useEffect(() => {
    function calc() {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const diff = midnight.getTime() - now.getTime();

      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);

      setDisplay({
        h: String(h).padStart(2, "0"),
        m: String(m).padStart(2, "0"),
        s: String(s).padStart(2, "0"),
        urgent: diff < 3_600_000, // < 1 hora
      });
    }

    calc();
    const t = setInterval(calc, 1_000);
    return () => clearInterval(t);
  }, []);

  return display;
}

/** Unidad individual del countdown */
function CountdownUnit({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="tabular-nums text-xl sm:text-2xl font-extrabold tracking-tight text-[var(--text-primary)] leading-none">
        {value}
      </span>
      <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">
        {label}
      </span>
    </div>
  );
}

/** Separador ":" del countdown */
function Separator() {
  return (
    <span className="text-xl sm:text-2xl font-extrabold text-[var(--text-tertiary)] leading-none pb-3">
      :
    </span>
  );
}

/**
 * FlashDealsOfTheDay — "Oferta del dia"
 *
 * Countdown hasta medianoche + grid 6 productos con descuento.
 * Logica: pickWithDiscount prioriza products con comparePrice > price.
 */
export function FlashDealsOfTheDay({ initialProducts, className }: Props) {
  const countdown = useCountdownToMidnight();
  const picks = pickWithDiscount(initialProducts, 6);

  if (picks.length === 0) return null;

  // Agregar badge "Oferta" y comparePrice simulado a los que no tienen
  const enriched = picks.map((p) => ({
    ...p,
    badge: "Oferta" as const,
    comparePrice:
      p.comparePrice != null && p.comparePrice > p.price
        ? p.comparePrice
        : Math.round(p.price * 1.2 * 100) / 100,
    image: p.image ?? "",
  }));

  return (
    <section
      className={cn(
        "py-12 sm:py-16 border-t border-[var(--rule-soft)] bg-gray-50 dark:bg-gray-900/40",
        className
      )}
      aria-labelledby="flash-deals-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header + countdown en la misma fila */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 pb-4 border-b border-[var(--rule-base)] mb-8">
          <div className="flex-1">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
              Oferta del dia
            </p>
            <h2
              id="flash-deals-heading"
              className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight"
            >
              Aprovecha antes de que termine
            </h2>
          </div>

          {/* Countdown */}
          <div
            className={cn(
              "flex items-center gap-2 px-4 py-3 rounded-xl border",
              countdown.urgent
                ? "border-[var(--accent)] bg-primary/10"
                : "border-[var(--rule-base)] bg-white dark:bg-gray-900"
            )}
            aria-live="polite"
            aria-label={`Tiempo restante: ${countdown.h} horas ${countdown.m} minutos ${countdown.s} segundos`}
          >
            <Timer
              className={cn(
                "h-4 w-4 shrink-0",
                countdown.urgent ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]"
              )}
              strokeWidth={1.75}
            />
            <div className="flex items-end gap-1">
              <CountdownUnit value={countdown.h} label="hrs" />
              <Separator />
              <CountdownUnit value={countdown.m} label="min" />
              <Separator />
              <CountdownUnit value={countdown.s} label="seg" />
            </div>
          </div>
        </div>

        {/* Grid productos */}
        <div
          className={cn(
            // Mobile: horizontal scroll
            "flex gap-3 overflow-x-auto snap-x snap-mandatory pb-3 scrollbar-hide",
            // Tablet+: grid
            "sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0",
            // Desktop: 3-4 cols (6 items = 2 filas de 3)
            "lg:grid-cols-3"
          )}
          aria-label="Productos en oferta del dia"
        >
          {enriched.map((p) => (
            <div key={p.id} className="shrink-0 w-[160px] sm:w-auto snap-start">
              <ProductCard product={p} />
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-6 flex justify-center">
          <Link
            href="/marketplace?filtro=oferta"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-primary)] hover:opacity-80 transition-opacity"
            aria-label="Ver todas las ofertas del dia"
          >
            Ver todas las ofertas del dia{" "}
            <ChevronRight className="h-4 w-4" strokeWidth={2} />
          </Link>
        </div>
      </div>
    </section>
  );
}
