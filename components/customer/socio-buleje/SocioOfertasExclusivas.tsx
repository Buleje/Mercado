"use client";

/**
 * SocioOfertasExclusivas — Grid horizontal scroll con productos a precio Socio.
 */

import {
  SectionTitle,
  CardTitle,
  Caption,
  Kicker,
} from "@buleje/design-system";
import { Tag } from "@buleje/design-system/icons";
import { MOCK_EXCLUSIVE_OFFERS } from "@/lib/mocks/socio-buleje.mock";

function fmt(n: number): string {
  return `S/ ${n.toFixed(2)}`;
}

export function SocioOfertasExclusivas() {
  return (
    <section aria-labelledby="ofertas-heading">
      <header className="mb-4 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <Kicker className="inline-flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5" aria-hidden />
            Solo para Socios
          </Kicker>
          <SectionTitle id="ofertas-heading" className="mt-1">
            Ofertas exclusivas esta semana
          </SectionTitle>
        </div>
      </header>

      <div className="relative -mx-4 px-4 sm:mx-0 sm:px-0">
        <ul className="grid grid-flow-col auto-cols-[minmax(210px,1fr)] sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-2 lg:grid-cols-3 gap-3 overflow-x-auto sm:overflow-visible pb-2 snap-x snap-mandatory sm:snap-none">
          {MOCK_EXCLUSIVE_OFFERS.map((offer) => {
            const savings = offer.regularPrice - offer.socioPrice;
            const pct = Math.round((savings / offer.regularPrice) * 100);
            return (
              <li
                key={offer.productId}
                className="snap-start rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 flex flex-col gap-3"
              >
                <div className="h-24 rounded-lg bg-[var(--surface-sunken)] flex items-center justify-center">
                  <Tag
                    className="h-8 w-8 text-[var(--text-tertiary)]"
                    aria-hidden
                  />
                </div>
                <div className="flex-1">
                  <Caption className="text-[var(--text-tertiary)] uppercase tracking-[var(--ls-wider)] font-semibold">
                    {offer.category}
                  </Caption>
                  <CardTitle className="mt-1 line-clamp-2">
                    {offer.name}
                  </CardTitle>
                  <Caption className="mt-1 text-[var(--text-tertiary)]">
                    {offer.storeName}
                  </Caption>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[length:var(--ts-lg)] font-extrabold tabular-nums text-[var(--text-primary)]">
                      {fmt(offer.socioPrice)}
                    </p>
                    <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] line-through tabular-nums">
                      {fmt(offer.regularPrice)}
                    </p>
                  </div>
                  <span
                    className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-md font-bold text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)]"
                    style={{
                      backgroundColor:
                        "color-mix(in oklch, var(--data-success) 14%, transparent)",
                      color: "var(--data-success)",
                    }}
                  >
                    −{pct}% Socio
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
