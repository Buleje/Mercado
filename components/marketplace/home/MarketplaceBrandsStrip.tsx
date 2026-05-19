"use client";

/**
 * MarketplaceBrandsStrip — Marcas conocidas que tu vecino reconoce.
 *
 * Strip horizontal de marcas que los clientes ya buscan por nombre
 * (Inca Kola, Gloria, Primor, etc.). Cards minimalistas: solo el
 * label de la marca + un mood color sutil. Click → catálogo filtrado.
 */

import Link from "next/link";
import { ChevronRight, Award } from "@buleje/design-system/icons";

interface Brand {
  q: string;
  label: string;
  tagline: string;
  initial: string;
}

const BRANDS: Brand[] = [
  { q: "inca kola", label: "Inca Kola", tagline: "Sabor nacional", initial: "I" },
  { q: "gloria", label: "Gloria", tagline: "Lácteos", initial: "G" },
  { q: "primor", label: "Primor", tagline: "Aceite y arroz", initial: "P" },
  { q: "coca cola", label: "Coca Cola", tagline: "Refrescos", initial: "C" },
  { q: "ajinomoto", label: "Ajinomoto", tagline: "Sazón y caldo", initial: "A" },
  { q: "san luis", label: "San Luis", tagline: "Agua mineral", initial: "S" },
  { q: "nestle", label: "Nestlé", tagline: "Almacén", initial: "N" },
  { q: "alicorp", label: "Alicorp", tagline: "Hogar", initial: "A" },
  { q: "molitalia", label: "Molitalia", tagline: "Fideos y avena", initial: "M" },
  { q: "field", label: "Field", tagline: "Galletas", initial: "F" },
];

export default function MarketplaceBrandsStrip() {
  return (
    <section>
      <header className="flex items-center justify-between gap-3 px-1 mb-4 sm:mb-5">
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
            <Award className="h-5 w-5" strokeWidth={2.25} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
              Marcas que ya conoces
            </h2>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] font-semibold mt-0.5">
              Las marcas que tu casa pide todos los días
            </p>
          </div>
        </div>
        <Link
          href="/marketplace?vista=catalogo"
          className="group inline-flex items-center gap-1 text-xs sm:text-sm font-extrabold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors shrink-0"
        >
          Ver todo
          <ChevronRight
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
            strokeWidth={2.75}
          />
        </Link>
      </header>

      {/* Horizontal scroll */}
      <div className="-mx-1 overflow-x-auto scrollbar-hide">
        <div className="inline-flex gap-2.5 px-1 pb-1">
          {BRANDS.map((b) => (
            <Link
              key={b.q}
              href={`/marketplace?vista=catalogo&q=${encodeURIComponent(b.q)}`}
              className="group shrink-0 inline-flex items-center gap-3 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 py-3 transition-all hover:-translate-y-0.5 hover:border-[var(--accent)]/40 hover:shadow-md min-w-[180px]"
            >
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-sunken)] font-display text-xl font-extrabold text-[var(--text-primary)] transition-all group-hover:bg-[var(--accent)] group-hover:text-white">
                {b.initial}
              </span>
              <div className="min-w-0">
                <p className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)] truncate">
                  {b.label}
                </p>
                <p className="text-[length:var(--ts-2xs)] font-extrabold text-[var(--text-tertiary)] truncate uppercase tracking-wider">
                  {b.tagline}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
