"use client";

import { useState } from "react";
import { ChevronDown } from "@buleje/design-system/icons";

const FAQS = [
  {
    q: "Las tarjetas tienen vencimiento?",
    a: "No. Las tarjetas de regalo Buleje no expiran. El saldo se conserva hasta que se use completo.",
  },
  {
    q: "Se pueden reembolsar?",
    a: "No, pero son transferibles. Si la recibiste y no la vas a usar, la podes pasar a otra persona compartiendo el codigo.",
  },
  {
    q: "Funciona en todas las tiendas del marketplace?",
    a: "Si. La tarjeta se puede canjear en cualquier tienda que aparece en Buleje — bodegas, minimarkets y tiendas de barrio.",
  },
  {
    q: "Como recibe el destinatario la tarjeta?",
    a: "Elegis como enviarla: por WhatsApp (recibe un mensaje con el codigo y la dedicatoria) o por email. El envio es instantaneo.",
  },
  {
    q: "Se puede usar parcialmente el saldo?",
    a: "Si. El saldo se descuenta por compra hasta agotarse. Si tu compra es menor al saldo, el resto queda disponible para otra ocasion.",
  },
  {
    q: "Cual es el monto mínimo y máximo?",
    a: "El mínimo es S/ 10 y el máximo es S/ 1000. Si queres regalar mas, podes enviar varias tarjetas al mismo destinatario.",
  },
];

export default function GiftCardsFAQ() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section className="border-b border-gray-100 bg-white py-14 dark:border-gray-800 dark:bg-gray-900">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <header className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
            Preguntas frecuentes
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Todo lo que queres saber antes de regalar.
          </p>
        </header>

        <ul className="divide-y divide-gray-200 rounded-2xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
          {FAQS.map((item, idx) => {
            const isOpen = openIdx === idx;
            return (
              <li key={idx}>
                <button
                  type="button"
                  onClick={() => setOpenIdx(isOpen ? null : idx)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  aria-expanded={isOpen}
                >
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {item.q}
                  </span>
                  <ChevronDown
                    className={[
                      "h-4 w-4 shrink-0 text-gray-500 transition-transform dark:text-gray-400",
                      isOpen ? "rotate-180" : "",
                    ].join(" ")}
                    aria-hidden="true"
                  />
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 text-sm text-gray-600 dark:text-gray-300">
                    {item.a}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
