"use client";

/**
 * DescubriFAQ — 8 preguntas genericas sobre Buleje (accordion nativo).
 *
 * Usa <details>/<summary> para minimal JS + accesibilidad out-of-the-box.
 */

import { useState } from "react";
import {
  BodyText,
  SectionTitle,
  cn,
} from "@buleje/design-system";
import { ChevronDown } from "@buleje/design-system/icons";

type QA = {
  q: string;
  a: string;
};

const FAQ: QA[] = [
  {
    q: "¿Son gratis todas estas features?",
    a: "Casi todas. Comparar, Asistente, Gift Cards, En Vivo, Seguimiento, 1-Click Buy y Vendé en Buleje son 100% gratis. Socio Buleje es la única membresía paga (desde S/ 19/mes con 30 días gratis).",
  },
  {
    q: "¿Cómo me hago Socio Buleje?",
    a: "Entrás a /socio-buleje, elegís plan mensual o anual, y te suscribís. No pedimos tarjeta para el trial de 30 días. Podés cancelar cuando quieras desde tu panel de cuenta.",
  },
  {
    q: "¿Qué pasa si mi barrio no está cubierto?",
    a: "Estamos en todo Pucallpa (Callería, Yarinacocha, Manantay y Centro) con 200+ bodegas activas. Si tu zona no aparece, escribinos por WhatsApp y priorizamos sumar una bodega del sector.",
  },
  {
    q: "¿El asistente responde en Shipibo?",
    a: "Todavía no — el modelo está en español peruano con expresiones del barrio. Estamos trabajando con la comunidad Shipibo-Conibo para incluir frases y términos del idioma nativo en próximas versiones.",
  },
  {
    q: "¿Puedo usar Buleje sin registrarme?",
    a: "Sí. Podés explorar el marketplace, comparar productos y preguntarle al asistente sin cuenta. Solo pedimos registro para comprar, guardar favoritos o suscribirte a Socio.",
  },
  {
    q: "¿Qué medios de pago aceptan?",
    a: "Yape, Plin, efectivo contra entrega y tarjeta (Visa/Mastercard). Cada bodega elige qué acepta, pero mínimo Yape y efectivo siempre están.",
  },
  {
    q: "¿Las gift cards tienen vencimiento?",
    a: "No. Las gift cards Buleje no vencen. El saldo queda disponible hasta que se use, y se canjea en cualquier bodega del marketplace sin letra chica.",
  },
  {
    q: "¿Cómo abro mi bodega en Buleje?",
    a: "Entrás a /vender, completás un registro de 5 minutos con foto del local y tu DNI, y en 24h tu tienda queda online. El primer mes es gratis, sin contrato.",
  },
];

export function DescubriFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] py-16 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <header className="space-y-3 mb-10">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
            Preguntas frecuentes
          </span>
          <SectionTitle className="text-[length:var(--ts-2xl)] sm:text-[length:var(--ts-3xl)] font-extrabold">
            Dudas comunes
          </SectionTitle>
        </header>

        <ul className="space-y-3">
          {FAQ.map((item, idx) => {
            const isOpen = openIndex === idx;
            return (
              <li key={item.q}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  className={cn(
                    "flex w-full items-start justify-between gap-4 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-5 text-left transition-all",
                    "hover:border-[var(--text-primary)]",
                    isOpen && "border-[var(--text-primary)]",
                  )}
                >
                  <span className="text-[length:var(--ts-base)] font-semibold text-[var(--text-primary)]">
                    {item.q}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-[var(--text-secondary)] transition-transform",
                      isOpen && "rotate-180",
                    )}
                    strokeWidth={2}
                    aria-hidden
                  />
                </button>
                {isOpen ? (
                  <div className="rounded-b-2xl border-x border-b border-[var(--rule-base)] bg-[var(--surface-canvas)] px-5 pb-5 pt-1 -mt-2">
                    <BodyText className="text-[length:var(--ts-sm)] text-[var(--text-secondary)] leading-relaxed">
                      {item.a}
                    </BodyText>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export default DescubriFAQ;
