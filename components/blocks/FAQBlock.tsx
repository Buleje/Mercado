// ═══════════════════════════════════════════════════════
// FAQ BLOCK - Editable FAQ Accordion
// ═══════════════════════════════════════════════════════

"use client";

import { z } from "zod";
import { useState } from "react";
import { ChevronDown, HelpCircle } from "@buleje/design-system/icons";

// ─── Schema & Types ─────────────────────────────────────
export const FAQBlockSchema = z.object({
  badge: z.string().default("Ayuda"),
  title: z.string().default("Preguntas frecuentes"),
  titleAccent: z.string().default("frecuentes"),
  subtitle: z.string().default("Todo lo que necesitas saber sobre nuestra tienda y delivery."),
  faqs: z.array(z.object({
    question: z.string(),
    answer: z.string(),
  })).default([
    {
      question: "¿Hacen delivery de abarrotes en toda la zona?",
      answer: "Sí, realizamos delivery de abarrotes en toda la zona urbana. Nuestro servicio de entrega a domicilio cubre la mayoría de barrios y urbanizaciones.",
    },
    {
      question: "¿Se puede pagar con Yape?",
      answer: "¡Por supuesto! Aceptamos pagos con Yape para tu comodidad. También puedes pagar en efectivo contra entrega.",
    },
    {
      question: "¿También aceptan efectivo contra entrega?",
      answer: "Sí, aceptamos pago en efectivo al momento de la entrega. Nuestro repartidor llevará tu pedido y podrás pagarlo en el momento.",
    },
    {
      question: "¿Qué productos venden?",
      answer: "Vendemos una amplia variedad de productos: abarrotes, bebidas, golosinas, carne, pollo, productos de limpieza, artículos para el hogar, snacks y más.",
    },
  ]),
  showNumbering: z.boolean().default(true),
  accentColor: z.string().default("#3b82f6"),
});

export type FAQBlockProps = z.infer<typeof FAQBlockSchema>;

// ─── Component ──────────────────────────────────────────
export default function FAQBlock(props: Partial<FAQBlockProps>) {
  const {
    badge = "Ayuda",
    title = "Preguntas frecuentes",
    titleAccent = "frecuentes",
    subtitle,
    faqs = [],
    showNumbering = true,
    accentColor = "#3b82f6",
  } = props;

  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const titleParts = title.split(titleAccent);

  return (
    <section id="preguntas" className="py-20 sm:py-28 bg-surface">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-1.5 bg-primary/8 text-[var(--accent-ink)] dark:text-[var(--accent)] text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full mb-4">
            <HelpCircle className="w-3.5 h-3.5" />
            {badge}
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[var(--text-primary)]">
            {titleParts[0]}
            {titleAccent && (
              <span className="relative inline-block text-primary">
                {titleAccent}
                <svg
                  className="absolute -bottom-1.5 left-0 w-full h-2.5"
                  viewBox="0 0 100 10"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M2 8 Q30 2 60 6 Q90 10 98 3"
                    stroke="currentColor"
                    strokeWidth="3"
                    fill="none"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            )}
            {titleParts[1]}
          </h2>
          {subtitle && (
            <p className="mt-5 text-base text-muted max-w-xl mx-auto">
              {subtitle}
            </p>
          )}
        </div>

        <div className="space-y-2.5">
          {faqs.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <div
                key={i}
                className={`rounded-2xl bg-[var(--surface-raised)] overflow-hidden shadow-sm hover:shadow-md transition-all duration-[var(--dur-fast)] ${
                  isOpen ? "shadow-md ring-1 ring-primary/15" : ""
                }`}
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left group"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-center gap-3">
                    {showNumbering && (
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shrink-0 transition-colors duration-[var(--dur-fast)]`}
                        style={{
                          backgroundColor: isOpen ? accentColor : `${accentColor}14`,
                          color: isOpen ? "#ffffff" : accentColor,
                        }}
                      >
                        {i + 1}
                      </span>
                    )}
                    <span
                      className={`text-sm sm:text-base font-semibold transition-colors duration-[var(--dur-fast)] ${
                        isOpen ? "text-primary" : "text-[var(--text-primary)] group-hover:text-primary"
                      }`}
                    >
                      {faq.question}
                    </span>
                  </div>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 transition-all duration-[var(--dur-fast)] ${
                      isOpen ? "rotate-180 text-primary" : "text-muted"
                    }`}
                  />
                </button>
                <div
                  className={`grid transition-[grid-template-rows] duration-[var(--dur-base)] ${
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className={`px-5 pb-5 ${showNumbering ? "pl-15" : ""}`}>
                      <p className="text-sm text-muted leading-relaxed">
                        {faq.answer}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── CMS Metadata ───────────────────────────────────────
export const FAQBlockMetadata = {
  type: "faq",
  name: "Preguntas Frecuentes",
  description: "Acordeón de preguntas y respuestas",
  category: "informativo" as const,
  icon: "HelpCircle",
  defaultProps: (() => { const parsed = FAQBlockSchema.safeParse({}); return parsed.success ? parsed.data : { badge: "Ayuda", title: "Preguntas frecuentes", titleAccent: "frecuentes", subtitle: "", faqs: [], showNumbering: true, accentColor: "#3b82f6" }; })(),
  propsSchema: FAQBlockSchema,
};
