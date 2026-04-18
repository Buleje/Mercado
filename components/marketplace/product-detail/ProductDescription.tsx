"use client";

/**
 * ProductDescription — Sección "Sobre este producto".
 * Kicker + SectionTitle + párrafo de descripción larga.
 */

import { Kicker, SectionTitle, BodyText } from "@buleje/design-system";

export interface ProductDescriptionProps {
  description: string | null | undefined;
  productName: string;
}

export function ProductDescription({ description, productName }: ProductDescriptionProps) {
  const text =
    description ||
    `${productName} es un producto de calidad seleccionado directamente por las bodegas locales de Pucallpa. Fresco, de origen local y disponible para entrega rápida en tu zona.`;

  return (
    <section aria-label="Descripción del producto" className="space-y-3">
      <Kicker as="p">Sobre este producto</Kicker>
      <SectionTitle as="h2">Descripción</SectionTitle>
      <BodyText className="text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">
        {text}
      </BodyText>
    </section>
  );
}
