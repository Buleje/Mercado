"use client";

/**
 * ProductDescription — Sección "Sobre este producto".
 * Kicker + SectionTitle + párrafo de descripción larga.
 */

export interface ProductDescriptionProps {
  description: string | null | undefined;
  productName: string;
}

export function ProductDescription({ description, productName }: ProductDescriptionProps) {
  const text =
    description ||
    `${productName} es un producto de calidad seleccionado directamente por las bodegas locales de Ciudad Constitución. Fresco, de origen local y disponible para entrega rápida en tu zona.`;

  return (
    <section
      aria-label="Descripción del producto"
      className="space-y-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 sm:p-8"
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className="inline-flex h-1 w-12 rounded-full bg-[var(--accent)]" />
        <p className="text-sm font-bold uppercase tracking-wider text-[var(--accent)]">
          Sobre este producto
        </p>
      </div>
      <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--text-primary)]">
        Descripción
      </h2>
      <p className="text-base sm:text-lg leading-relaxed text-[var(--text-secondary)] whitespace-pre-line max-w-3xl">
        {text}
      </p>
    </section>
  );
}
