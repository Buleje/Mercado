"use client";

/**
 * TrustBar — 4 chips de confianza debajo del hero.
 *
 * Copy psicologicamente estrategico para reducir friccion de compra:
 *   - "25 min promedio" (speed — expectativa clara)
 *   - "Pago en casa" (no risk — controla el cliente)
 *   - "Fresco diario" (quality — reposicion activa)
 *   - "WhatsApp" (human — canal directo)
 *
 * Diseno minimalista enterprise: sin emojis, iconos grises, chips rounded-lg,
 * tipografia sobria — respeta feedback Holded-style del dueno.
 */

import { Clock, HandCoins, Leaf, MessageCircle, type LucideIcon } from "lucide-react";

interface TrustItem {
  icon: LucideIcon;
  label: string;
  sub: string;
}

const TRUST_ITEMS: TrustItem[] = [
  { icon: Clock, label: "25 min", sub: "Delivery promedio" },
  { icon: HandCoins, label: "Pago en casa", sub: "Yape · Plin · Efectivo" },
  { icon: Leaf, label: "Fresco diario", sub: "Reposicion cada manana" },
  { icon: MessageCircle, label: "WhatsApp", sub: "Atencion directa" },
];

export default function TrustBar() {
  return (
    <section
      className="border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)]"
      aria-label="Garantias de la tienda"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-5 sm:py-6">
        <ul
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4"
          role="list"
        >
          {TRUST_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <li
                key={item.label}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors"
              >
                <span
                  className="flex items-center justify-center h-9 w-9 rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-base)] text-[var(--text-secondary)] shrink-0"
                  aria-hidden="true"
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--text-primary)] leading-tight truncate">
                    {item.label}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)] leading-tight mt-0.5 truncate">
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
