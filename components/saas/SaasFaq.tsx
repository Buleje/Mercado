"use client";

import { useState } from "react";
import { m as motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "@buleje/design-system/icons";

// ─── Data ─────────────────────────────────────────────────────────────────────
interface FAQItem {
  q: string;
  a: string;
}

const FAQ_ITEMS: FAQItem[] = [
  {
    q: "¿Es realmente gratis?",
    a: "Sí. El plan Free es gratis para siempre. Incluye hasta 50 productos, 2 usuarios y 200 pedidos al mes. Sin tarjeta de crédito.",
  },
  {
    q: "¿Funciona sin internet?",
    a: "Sí. Puedes seguir vendiendo offline. Cuando vuelve la señal, todo se sincroniza automáticamente.",
  },
  {
    q: "¿Necesito una computadora?",
    a: "No. Funciona desde tu celular, tablet o computadora. Es una app web que se instala como aplicación.",
  },
  {
    q: "¿Mis datos están seguros?",
    a: "Sí. Usamos servidores en la nube con encriptación. Tus datos se respaldan automáticamente cada día.",
  },
  {
    q: "¿Puedo manejar fiados?",
    a: "Sí. Tenemos un sistema completo de fiados con semáforo de crédito, cuotas, recordatorios automáticos por WhatsApp y cobranza inteligente.",
  },
  {
    q: "¿Tiene WhatsApp integrado?",
    a: "Sí. El sistema envía pedidos, confirmaciones, recordatorios de cobro y hasta un bot que toma pedidos automáticamente.",
  },
  {
    q: "¿Puedo usar comandos de voz?",
    a: "Sí. Dile 'muéstrame ventas de hoy' o 'registra gasto de 50 soles' y el sistema lo ejecuta.",
  },
  {
    q: "¿Sirve para más de una tienda?",
    a: "Sí. Desde el plan Business puedes gestionar hasta 5 tiendas desde una sola cuenta.",
  },
  {
    q: "¿Cuánto demora configurarlo?",
    a: "Menos de 10 minutos. Regístrate, carga tus productos (manual o con foto de factura) y empieza a vender.",
  },
  {
    q: "¿Puedo cancelar cuando quiera?",
    a: "Sí. Sin contratos ni penalidades. Cancela desde tu cuenta en cualquier momento.",
  },
];

// ─── Accordion item — extracted to avoid defining components inside components ─
interface AccordionItemProps {
  item: FAQItem;
  index: number;
  isOpen: boolean;
  onToggle: (index: number) => void;
}

function AccordionItem({ item, index, isOpen, onToggle }: AccordionItemProps) {
  return (
    <div className="border-b border-gray-200 dark:border-[rgba(45,106,79,0.18)] last:border-b-0">
      <button
        type="button"
        onClick={() => onToggle(index)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-4 py-5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6] min-h-[44px]"
      >
        <span className="font-semibold text-gray-900 dark:text-[#f0f4f1] text-sm sm:text-base">
          {item.q}
        </span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="shrink-0"
          aria-hidden="true"
        >
          <ChevronDown className="w-5 h-5 text-gray-400 dark:text-[rgba(240,244,241,0.4)]" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: "hidden" }}
          >
            <p className="pb-5 text-sm text-gray-600 dark:text-[rgba(240,244,241,0.7)] leading-relaxed">
              {item.a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SaasFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const handleToggle = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <section
      id="faq"
      className="py-20 md:py-28 bg-white dark:bg-[#0a0f0d] relative overflow-hidden"
    >
      {/* Fondo decorativo */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 40% 30% at 80% 50%, rgba(244,162,97,0.05) 0%, transparent 70%)",
        }}
      />

      <div className="max-w-3xl mx-auto px-5 sm:px-8 lg:px-12 relative">
        {/* Encabezado */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2
            className="font-extrabold text-gray-900 dark:text-[#f0f4f1]"
            style={{ fontSize: "clamp(1.5rem, 3vw, 2.2rem)", letterSpacing: "-0.02em" }}
          >
            Preguntas frecuentes
          </h2>
          <p className="text-gray-500 dark:text-[rgba(240,244,241,0.6)] mt-3 text-base sm:text-lg">
            Todo lo que necesitas saber antes de empezar.
          </p>
        </motion.div>

        {/* Acordeón */}
        <motion.div
          className="rounded-2xl border border-gray-200 dark:border-[rgba(45,106,79,0.18)] bg-white dark:bg-[#121f17] overflow-hidden px-5 sm:px-8"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          {FAQ_ITEMS.map((item, i) => (
            <AccordionItem
              key={item.q}
              item={item}
              index={i}
              isOpen={openIndex === i}
              onToggle={handleToggle}
            />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
