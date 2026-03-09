"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import { useInView } from "@/hooks/use-in-view";

const faqs = [
  {
    question: "¿Hacen delivery de abarrotes en todo Pucallpa?",
    answer:
      "Sí, realizamos delivery de abarrotes en toda la zona urbana de Pucallpa. Nuestro servicio de entrega a domicilio cubre la mayoría de barrios y urbanizaciones. Consulta por WhatsApp si tienes dudas sobre la cobertura en tu zona.",
  },
  {
    question: "¿Se puede pagar con Yape?",
    answer:
      "¡Por supuesto! Aceptamos pagos con Yape para tu comodidad. También puedes pagar en efectivo contra entrega. Somos una tienda con Yape en Pucallpa para que compres de forma fácil y segura.",
  },
  {
    question: "¿También aceptan efectivo contra entrega?",
    answer:
      "Sí, aceptamos pago en efectivo al momento de la entrega. Nuestro repartidor llevará tu pedido y podrás pagarlo en el momento. Es una opción ideal si prefieres no usar medios digitales.",
  },
  {
    question: "¿Qué productos venden?",
    answer:
      "Vendemos una amplia variedad de productos: abarrotes, bebidas, golosinas, carne, pollo, productos de limpieza, artículos para el hogar, snacks y más. Todo lo que necesitas para tu hogar o negocio lo encuentras en nuestra tienda virtual.",
  },
  {
    question: "¿Venden bebidas, golosinas, carne y pollo?",
    answer:
      "Sí, contamos con bebidas (gaseosas, aguas, jugos, energizantes), golosinas (chocolates, galletas, caramelos, snacks), carne y pollo frescos. Todos nuestros productos son seleccionados para garantizar la mejor calidad.",
  },
  {
    question: "¿Tienen productos de limpieza?",
    answer:
      "Sí, ofrecemos una variedad completa de productos de limpieza: detergente, lejía, jabón, limpiadores multiusos, desinfectantes y más. Todo con delivery en Pucallpa.",
  },
  {
    question: "¿Cómo hago mi pedido online?",
    answer:
      "Es muy fácil: navega por nuestro catálogo de productos, agrega lo que necesites al carrito y completa tu pedido. También puedes escribirnos directamente por WhatsApp. Aceptamos pagos por Yape o efectivo contra entrega.",
  },
  {
    question: "¿Cuánto demora el delivery en Pucallpa?",
    answer:
      "Nuestro delivery en Pucallpa es rápido. El tiempo de entrega depende de la zona, pero generalmente realizamos la entrega el mismo día. Para pedidos urgentes, contáctanos por WhatsApp y coordinamos la entrega más rápida posible.",
  },
];

export default function FAQ() {
  const [ref, inView] = useInView({ threshold: 0.1 });
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="preguntas" className="py-20 sm:py-28 bg-surface" ref={ref}>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-1.5 bg-primary/8 text-primary text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full mb-4">
            <HelpCircle className="w-3.5 h-3.5" />
            Ayuda
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-foreground">
            Preguntas{" "}
            <span className="relative inline-block text-primary">
              frecuentes
              <svg className="absolute -bottom-1.5 left-0 w-full h-2.5" viewBox="0 0 100 10" preserveAspectRatio="none">
                <path d="M2 8 Q30 2 60 6 Q90 10 98 3" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
              </svg>
            </span>
          </h2>
          <p className="mt-5 text-base text-muted max-w-xl mx-auto">
            Todo lo que necesitas saber sobre nuestra tienda y delivery en Pucallpa.
          </p>
        </div>

        <div className="space-y-2.5">
          {faqs.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <div
                key={i}
                style={inView ? { animationDelay: `${i * 55}ms` } : undefined}
                className={`rounded-2xl bg-white dark:bg-card overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 ${
                  isOpen ? "shadow-md ring-1 ring-primary/15" : ""
                } ${
                  inView ? "animate-[fadeUp_0.5s_ease-out_both]" : "opacity-0"
                }`}
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left group"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-center gap-3">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shrink-0 transition-colors duration-200 ${
                      isOpen ? "bg-primary text-white" : "bg-primary/8 text-primary"
                    }`}>
                      {i + 1}
                    </span>
                    <span className={`text-sm sm:text-base font-semibold transition-colors duration-200 ${
                      isOpen ? "text-primary" : "text-foreground group-hover:text-primary"
                    }`}>
                      {faq.question}
                    </span>
                  </div>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 transition-all duration-200 ${
                      isOpen ? "rotate-180 text-primary" : "text-muted"
                    }`}
                  />
                </button>
                <div
                  className={`grid transition-[grid-template-rows] duration-300 ${
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="px-5 pb-5 pl-15">
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
