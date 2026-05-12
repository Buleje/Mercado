"use client";

/**
 * TrustBar — 4 cards de confianza debajo del hero, con presencia bold.
 *
 * Brandon (2026-05-05): pidió "mayor presencia y tamaño" — pasamos de chips
 * pequeños a cards grandes con icono primary, número/dato en h3 extrabold,
 * descripción de soporte y hover lift sutil. Mantiene la psicología de copy:
 *   - "25 min" (speed)
 *   - "Pago en casa" (no risk)
 *   - "Fresco diario" (quality)
 *   - "WhatsApp" (human)
 */

import { Clock, HandCoins, Leaf, MessageCircle, type LucideIcon } from "lucide-react";

interface TrustItem {
  icon: LucideIcon;
  label: string;
  sub: string;
}

const TRUST_ITEMS: TrustItem[] = [
  { icon: Clock, label: "25 min", sub: "Delivery promedio en Pucallpa" },
  { icon: HandCoins, label: "Pago en casa", sub: "Yape · Plin · Efectivo al recibir" },
  { icon: Leaf, label: "Fresco diario", sub: "Reposición cada mañana" },
  { icon: MessageCircle, label: "WhatsApp", sub: "Atención directa al instante" },
];

export default function TrustBar() {
  return (
    <section
      className="relative border-b border-[var(--rule-soft)] bg-gradient-to-b from-[var(--surface-canvas)] to-[var(--surface-sunken)]"
      aria-label="Garantías de la tienda"
    >
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        {/* Heading subtle */}
        <div className="text-center mb-8 sm:mb-10">
          <p className="text-[length:var(--ts-2xs)] sm:text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
            ¿Por qué comprarme?
          </p>
          <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
            La confianza primero, siempre.
          </h2>
        </div>

        <ul
          className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5"
          role="list"
        >
          {TRUST_ITEMS.map((item, idx) => {
            const Icon = item.icon;
            return (
              <li
                key={item.label}
                className="group relative flex flex-col items-start gap-4 p-5 sm:p-6 rounded-3xl bg-[var(--surface-raised)] border-2 border-[var(--rule-soft)] dark:border-[var(--rule-base)] hover:border-[var(--color-primary)]/40 hover:shadow-[0_12px_30px_-8px_rgba(0,0,0,0.12)] transition-all duration-[var(--dur-base)]"
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                {/* Número de orden, decorativo */}
                <span
                  className="absolute right-5 top-5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] tabular-nums"
                  aria-hidden="true"
                >
                  0{idx + 1}
                </span>

                {/* Icono grande con bg primary tinted */}
                <span
                  className="flex items-center justify-center h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-[var(--color-primary)]/10 text-[var(--color-primary)] group-hover:bg-[var(--color-primary)] group-hover:text-white transition-all duration-[var(--dur-base)] shrink-0"
                  aria-hidden="true"
                >
                  <Icon className="h-7 w-7 sm:h-8 sm:w-8" strokeWidth={1.75} />
                </span>

                {/* Label grande + sub */}
                <div className="min-w-0">
                  <p className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] leading-tight tracking-tight">
                    {item.label}
                  </p>
                  <p className="text-sm text-[var(--text-secondary)] leading-snug mt-1.5">
                    {item.sub}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
