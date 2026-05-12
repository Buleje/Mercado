"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle } from "@buleje/design-system/icons";
import { useInView } from "@/hooks/use-in-view";
import { safeJsonLdStringify } from "@/lib/seo/json-ld";

const faqs = [
  {
    question: "¿Hacen delivery de abarrotes en toda la zona?",
    answer:
      "Sí, realizamos delivery de abarrotes en toda nuestra zona de cobertura, incluyendo Callería, Yarinacocha, Manantay, Campo Verde y alrededores. Nuestro servicio de entrega a domicilio cubre la mayoría de barrios y urbanizaciones. Consulta por WhatsApp si tienes dudas sobre la cobertura en tu zona.",
  },
  {
    question: "¿Se puede pagar con Yape?",
    answer:
      "¡Por supuesto! Aceptamos pagos con Yape y Plin para tu comodidad. También puedes pagar en efectivo contra entrega. Compra de forma fácil y segura.",
  },
  {
    question: "¿También aceptan efectivo contra entrega?",
    answer:
      "Sí, aceptamos pago en efectivo al momento de la entrega. Nuestro repartidor llevará tu pedido y podrás pagarlo en el momento. Si necesitas vuelto, indícalo al hacer tu pedido.",
  },
  {
    question: "¿Qué productos venden?",
    answer:
      "Vendemos más de 500 productos: abarrotes, bebidas, golosinas, carne, pollo, productos de limpieza, artículos para el hogar, snacks, frutas, verduras y lácteos. Todo lo que necesitas para tu hogar o negocio lo encuentras en nuestra tienda virtual.",
  },
  {
    question: "¿Venden bebidas, golosinas, carne y pollo?",
    answer:
      "Sí, contamos con bebidas (gaseosas, aguas, jugos, energizantes), golosinas (chocolates, galletas, caramelos, snacks), carne y pollo frescos. Todos nuestros productos son seleccionados para garantizar la mejor calidad.",
  },
  {
    question: "¿Tienen productos de limpieza?",
    answer:
      "Sí, ofrecemos una variedad completa de productos de limpieza: detergente, lejía, jabón, limpiadores multiusos, desinfectantes y más. Todo con delivery.",
  },
  {
    question: "¿Cómo hago mi pedido online?",
    answer:
      "Es muy fácil: navega por nuestro catálogo de productos en buleje.pe, agrega lo que necesites al carrito y completa tu pedido. También puedes escribirnos directamente por WhatsApp al 916 409 675. Aceptamos pagos por Yape o efectivo contra entrega.",
  },
  {
    question: "¿Cuánto demora el delivery?",
    answer:
      "Nuestro delivery tiene un tiempo estimado de 30 minutos en zona urbana. Generalmente realizamos la entrega el mismo día. Para pedidos urgentes, contáctanos por WhatsApp y coordinamos la entrega más rápida posible.",
  },
  {
    question: "¿El delivery es gratis?",
    answer:
      "Sí, el delivery es totalmente gratis para pedidos mayores a S/50 en toda nuestra zona de cobertura. Para pedidos menores, consulta el costo de envío por WhatsApp.",
  },
  {
    question: "¿Puedo devolver un producto si no estoy satisfecho?",
    answer:
      "¡Claro! Si recibiste un producto en mal estado o diferente al pedido, te lo cambiamos o devolvemos tu dinero. Revisamos cada pedido antes de enviarlo para asegurar la mejor calidad. Avísanos dentro de las 24 horas de recibido tu pedido.",
  },
  {
    question: "¿Desde cuándo opera Buleje?",
    answer:
      "Buleje opera desde 2011. Somos un negocio familiar con más de 13 años de experiencia atendiendo a familias con productos de calidad y delivery rápido.",
  },
  {
    question: "¿Atienden los domingos?",
    answer:
      "Actualmente atendemos de lunes a sábado de 7:00 am a 9:00 pm. Los domingos puede haber horario reducido según disponibilidad. Consulta nuestro horario actualizado en la página o por WhatsApp.",
  },
];

export default function FAQ() {
  const [ref, inView] = useInView({ threshold: 0.1 });
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  /* Inline FAQPage schema — generated from the `faqs` array to stay in sync */
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };

  return (
    <section id="preguntas" className="py-20 sm:py-28 bg-surface" ref={ref}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(faqSchema) }}
      />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-1.5 bg-primary/8 text-primary text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full mb-4">
            <HelpCircle className="w-3.5 h-3.5" />
            Ayuda
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[var(--text-primary)]">
            Preguntas{" "}
            <span className="relative inline-block text-primary">
              frecuentes
              <svg className="absolute -bottom-1.5 left-0 w-full h-2.5" viewBox="0 0 100 10" preserveAspectRatio="none">
                <path d="M2 8 Q30 2 60 6 Q90 10 98 3" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
              </svg>
            </span>
          </h2>
          <p className="mt-5 text-base text-muted max-w-xl mx-auto">
            Todo lo que necesitas saber sobre nuestra tienda y delivery.
          </p>
        </div>

        <div className="space-y-2.5">
          {faqs.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <div
                key={i}
                style={inView ? { animationDelay: `${i * 55}ms` } : undefined}
                className={`rounded-2xl bg-[var(--surface-raised)] overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 ${
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
                      isOpen ? "text-primary" : "text-[var(--text-primary)] group-hover:text-primary"
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
