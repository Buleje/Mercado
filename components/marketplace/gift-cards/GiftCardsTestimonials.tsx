"use client";

import { Star } from "@buleje/design-system/icons";

const TESTIMONIALS = [
  {
    name: "Juana P.",
    zone: "Pucallpa",
    text: "Le mande S/ 50 a mi hijo que estudia en Lima. Le llego al toque por WhatsApp y lo uso en una bodega cerca de la universidad.",
    rating: 5,
  },
  {
    name: "Marta S.",
    zone: "Callería",
    text: "Regale una tarjeta por el cumple de mi vecina. El disenio quedo muy bonito y la dedicatoria se vio tal cual.",
    rating: 5,
  },
  {
    name: "Luis G.",
    zone: "Yarinacocha",
    text: "Sencillo, rapido y la acepte en mi bodega sin problemas. Mis clientes ahora compran tarjetas para regalar en cumples.",
    rating: 4,
  },
];

export default function GiftCardsTestimonials() {
  return (
    <section className="border-b border-gray-100 bg-gray-50/50 py-14 dark:border-gray-800 dark:bg-gray-950">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="mb-8 max-w-2xl">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
            Historias del barrio
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Testimonios reales de quienes ya regalaron y recibieron tarjetas Buleje.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          {TESTIMONIALS.map((t, idx) => (
            <article
              key={idx}
              className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={[
                      "h-3.5 w-3.5",
                      i < t.rating
                        ? "fill-amber-400 text-amber-400"
                        : "fill-gray-200 text-gray-200 dark:fill-gray-700 dark:text-gray-700",
                    ].join(" ")}
                    aria-hidden="true"
                  />
                ))}
              </div>
              <p className="mt-4 flex-1 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                &ldquo;{t.text}&rdquo;
              </p>
              <footer className="mt-4 text-xs font-semibold text-gray-600 dark:text-gray-400">
                {t.name} <span className="font-normal text-gray-400">— {t.zone}</span>
              </footer>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
