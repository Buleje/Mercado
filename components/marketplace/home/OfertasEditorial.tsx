"use client";

/**
 * OfertasEditorial — banner hero de ofertas con countdown grande + 4 productos.
 *
 * Estilo editorial Amazon Bazaar "Today's Deal":
 *   - Banner full-width con título magazine grande + countdown urgencia
 *   - 4 productos featured con badge -X% prominente
 *   - Border-top accent rojo para urgencia
 *
 * Mantiene identidad Buleje: surface-raised, tokens, sin saturación.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Clock, ArrowRight, Flame, Package } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useMarketplaceDeals } from "@/hooks/use-marketplace-deals";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

function getEndOfDay(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function useCountdown(target: Date) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const ms = Math.max(0, target.getTime() - now);
  const totalSec = Math.floor(ms / 1000);
  return {
    h: Math.floor(totalSec / 3600),
    m: Math.floor((totalSec % 3600) / 60),
    s: totalSec % 60,
  };
}

export default function OfertasEditorial() {
  const target = getEndOfDay();
  const { h, m, s } = useCountdown(target);
  // Datos REALES desde /api/marketplace/deals
  const { deals: allDeals } = useMarketplaceDeals({ limit: 12 });
  const deals = allDeals.slice(0, 4);

  // Si no hay deals reales, ocultamos toda la sección — mejor que mostrar
  // un editorial sin productos.
  if (deals.length === 0) return null;

  return (
    <section
      aria-label="Ofertas del día editorial"
      className="w-full py-8 sm:py-12"
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-[var(--rule-soft)] overflow-hidden bg-[var(--surface-raised)]">
          {/* Banner editorial top */}
          <div className="relative grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6 px-6 sm:px-10 py-8 sm:py-10 bg-linear-to-br from-[#fee2e2] via-[#fff1ef] to-[#fff1ef] border-b border-[var(--rule-soft)]">
            <div>
              <p className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-error-500)] mb-3">
                <Flame className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                Solo hoy
              </p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-[var(--ls-tight)] leading-[1.05] text-[var(--text-primary)]">
                Ofertas del día
              </h2>
              <p className="mt-3 text-[length:var(--ts-sm)] sm:text-base text-[var(--text-secondary)] max-w-md leading-relaxed">
                Hasta -40% en productos de esta semana. Compra antes que vuelvan al precio normal.
              </p>
              <Link
                href="/marketplace/ofertas"
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] px-6 py-3 text-[length:var(--ts-sm)] font-bold text-[var(--surface-canvas)] hover:bg-[var(--text-primary)]/90 transition-colors"
              >
                Ver todas las ofertas
                <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
              </Link>
            </div>
            {/* Countdown editorial */}
            <div className="flex flex-col justify-center items-end">
              <p className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-3">
                <Clock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                Termina en
              </p>
              <div className="flex items-center gap-2 tabular-nums">
                {[
                  { v: h, l: "Hrs" },
                  { v: m, l: "Min" },
                  { v: s, l: "Seg" },
                ].map((seg, i, arr) => (
                  <div key={seg.l} className="flex items-center gap-2">
                    <div className="text-center">
                      <div className="bg-[var(--text-primary)] text-[var(--surface-canvas)] font-black text-2xl sm:text-3xl px-3 py-2 rounded-lg min-w-[3rem]">
                        {pad(seg.v)}
                      </div>
                      <p className="mt-1.5 text-[length:var(--ts-2xs)] uppercase tracking-wider text-[var(--text-secondary)] font-bold">
                        {seg.l}
                      </p>
                    </div>
                    {i < arr.length - 1 && (
                      <span className="text-[var(--text-secondary)] text-2xl font-black -mt-5">:</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 4 products featured */}
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[var(--rule-soft)]">
            {deals.map((d) => {
              const numId = parseInt(d.id.split("_")[1] ?? "0", 10);
              return (
                <Link
                  key={d.id}
                  href={`/marketplace/${d.storeSlug}/producto/${numId}`}
                  className="group relative p-4 sm:p-5 hover:bg-[var(--surface-sunken)] transition-colors"
                >
                  <span className="absolute top-3 left-3 z-10 inline-flex items-center px-2 py-0.5 rounded-md bg-[var(--data-error-500)] text-white text-[length:var(--ts-2xs)] font-black tabular-nums">
                    -{d.discountPct}%
                  </span>
                  <div className="relative aspect-square rounded-lg overflow-hidden bg-[var(--surface-sunken)] mb-3">
                    <div className="h-full w-full flex items-center justify-center text-[var(--text-tertiary)]">
                      <Package className="h-10 w-10" strokeWidth={1.25} aria-hidden />
                    </div>
                  </div>
                  <p className="text-[length:var(--ts-sm)] font-bold text-[var(--text-primary)] line-clamp-2 min-h-[2.5rem] mb-2">
                    {d.name}
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-black tabular-nums text-[var(--text-primary)]">
                      {fmt(d.price)}
                    </span>
                    <span className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] line-through tabular-nums">
                      {fmt(d.previousPrice)}
                    </span>
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
