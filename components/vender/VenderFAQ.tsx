"use client";

/**
 * VenderFAQ — Accordion de preguntas frecuentes seller-facing.
 * Implementación propia con <details>/<summary> nativos (0 deps) para
 * accessibility automática y funcionamiento sin JS.
 */

import { useState } from "react";
import { Plus, Minus } from "@buleje/design-system/icons";
import { cn } from "@buleje/design-system";
import { FAQ_ITEMS } from "./vender-faq-data";

export default function VenderFAQ() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section className="border-b border-[var(--rule-base)] bg-[var(--surface-raised)] py-16 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <header className="mb-10">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Preguntas frecuentes
          </p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-4xl">
            Lo que casi todos nos preguntan
          </h2>
          <p className="mt-3 text-[var(--text-secondary)]">
            Si no está aquí, escríbenos por WhatsApp y te respondemos en minutos.
          </p>
        </header>

        <ul className="space-y-2">
          {FAQ_ITEMS.map((item, idx) => {
            const open = openIdx === idx;
            return (
              <li
                key={item.q}
                className={cn(
                  "overflow-hidden rounded-xl border transition-colors",
                  open
                    ? "border-[var(--rule-strong)] bg-[var(--surface-canvas)]"
                    : "border-[var(--rule-base)] bg-[var(--surface-canvas)]",
                )}
              >
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenIdx(open ? null : idx)}
                  className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left"
                >
                  <span className="flex-1 text-sm font-semibold text-[var(--text-primary)] sm:text-base">
                    {item.q}
                  </span>
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--rule-base)] text-[var(--text-secondary)]"
                  >
                    {open ? (
                      <Minus className="h-3 w-3" strokeWidth={2} />
                    ) : (
                      <Plus className="h-3 w-3" strokeWidth={2} />
                    )}
                  </span>
                </button>
                {open && (
                  <div className="px-5 pb-5 text-sm leading-relaxed text-[var(--text-secondary)]">
                    {item.a}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
