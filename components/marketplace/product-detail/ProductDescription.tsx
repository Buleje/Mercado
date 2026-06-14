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
      className="border border-[var(--rule-base)] bg-[var(--surface-raised)]"
    >
      <h2 className="border-b border-[var(--rule-soft)] px-4 py-3 text-base sm:text-lg font-semibold text-[var(--text-primary)]">
        Descripción
      </h2>
      <p className="px-4 py-4 text-base leading-relaxed text-[var(--text-secondary)] whitespace-pre-line max-w-3xl">
        {text}
      </p>
    </section>
  );
}
