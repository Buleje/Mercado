"use client";

/**
 * ProductFaq — Preguntas frecuentes del producto con expand/collapse.
 * Mock data. Futuro: puede venir del backend por categoría.
 */

import { useState } from "react";
import { ChevronDown } from "@buleje/design-system/icons";
import { Kicker, SectionTitle, BodyText } from "@buleje/design-system";
import { cn } from "@buleje/design-system";

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

const MOCK_FAQ: FaqItem[] = [
  {
    id: "f1",
    question: "¿Cuánto demora la entrega?",
    answer:
      "Generalmente entre 20 y 35 minutos dependiendo de tu ubicación en Ciudad Constitución. El repartidor te confirmará el tiempo estimado al aceptar el pedido.",
  },
  {
    id: "f2",
    question: "¿Puedo combinar productos de varias tiendas?",
    answer:
      "Sí. Buleje permite agregar productos de distintas bodegas en un mismo carrito. Se coordina una entrega por tienda o puedes coordinar recojo.",
  },
  {
    id: "f3",
    question: "¿Qué métodos de pago acepta esta bodega?",
    answer:
      "Yape, Plin y efectivo al recibir. La bodega confirma disponibilidad de cada método al momento de procesar el pedido.",
  },
  {
    id: "f4",
    question: "¿Puedo devolver el producto si llegó en mal estado?",
    answer:
      "Sí. Toma una foto del producto al recibir. Reporta dentro de las 2 horas de entrega a través del chat con la tienda o el soporte de Buleje.",
  },
];

function FaqRow({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-[var(--rule-muted)] last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 py-3.5 px-4 text-left hover:bg-[var(--surface-sunken)] transition-colors"
        aria-expanded={open}
        aria-controls={`faq-${item.id}`}
      >
        <span className="text-[length:var(--ts-sm)] font-medium text-[var(--text-primary)]">
          {item.question}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform duration-200",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div id={`faq-${item.id}`} className="px-4 pb-4">
          <BodyText className="text-[var(--text-secondary)]">{item.answer}</BodyText>
        </div>
      )}
    </div>
  );
}

export function ProductFaq() {
  return (
    <section aria-label="Preguntas frecuentes" className="space-y-3">
      <Kicker as="p">Ayuda</Kicker>
      <SectionTitle as="h2">Preguntas frecuentes</SectionTitle>

      <div className="rounded-xl border border-[var(--rule-muted)] bg-[var(--surface-raised)] overflow-hidden">
        {MOCK_FAQ.map((item) => (
          <FaqRow key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
