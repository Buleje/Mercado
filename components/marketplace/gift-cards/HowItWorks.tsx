"use client";

import { Coins, MessageSquare, Send } from "@buleje/design-system/icons";

const STEPS = [
  {
    num: 1,
    title: "Elegi el monto",
    description:
      "Desde S/ 20 hasta S/ 500. O escribi un monto personalizado entre S/ 10 y S/ 1000.",
    icon: Coins,
  },
  {
    num: 2,
    title: "Escribi la dedicatoria",
    description:
      "Hasta 200 caracteres. Mostrada al destinatario cuando abre la tarjeta.",
    icon: MessageSquare,
  },
  {
    num: 3,
    title: "Enviamos por ti",
    description:
      "La enviamos al celular (WhatsApp) o email del destinatario en segundos.",
    icon: Send,
  },
];

export default function HowItWorks() {
  return (
    <section className="border-b border-gray-100 bg-gray-50/50 py-14 dark:border-gray-800 dark:bg-gray-950">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="mb-10 max-w-2xl">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
            Como funciona
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Tres pasos, dos minutos. Listo para regalar.
          </p>
        </header>

        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((step) => (
            <li
              key={step.num}
              className="relative rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-sm font-bold text-white dark:bg-white dark:text-gray-900">
                  {step.num}
                </span>
                <step.icon
                  className="h-5 w-5 text-gray-400 dark:text-gray-600"
                  aria-hidden="true"
                />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
                {step.title}
              </h3>
              <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
