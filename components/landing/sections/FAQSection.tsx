"use client";

/**
 * FAQSection — FAQ editorial con categorías + accordion nativo.
 *
 * Estilo: pregunta grande, respuesta secundaria, stream vertical minimalista.
 * Sin JS pesado — usa <details>/<summary> nativo para accesibilidad.
 * Inspiración: Stripe FAQ, Vercel docs.
 */

import { useState } from "react";
import Link from "next/link";
import { HelpCircle, MessageCircle, Plus } from "@buleje/design-system/icons";

type FAQ = {
  q: string;
  a: string;
};

type Category = {
  id: string;
  label: string;
  items: FAQ[];
};

const CATEGORIES: Category[] = [
  {
    id: "compradores",
    label: "Para compradores",
    items: [
      {
        q: "¿Cuánto demora el delivery?",
        a: "25-45 minutos en promedio en Pucallpa, dependiendo de la bodega y tu distrito. Ves el tiempo estimado antes de pagar.",
      },
      {
        q: "¿Qué formas de pago aceptan?",
        a: "Yape, Plin, tarjeta de débito/crédito y efectivo contra entrega. Elige la que te convenga en el checkout.",
      },
      {
        q: "¿Puedo pedir de varias bodegas a la vez?",
        a: "Sí — armás un carrito por tienda y pagás en uno solo. El delivery viene consolidado.",
      },
      {
        q: "¿Hay comisión por comprar?",
        a: "Ninguna. El precio que ves es el precio que pagás más el costo de delivery (si aplica).",
      },
    ],
  },
  {
    id: "bodegueros",
    label: "Para bodegueros",
    items: [
      {
        q: "¿Cuánto cuesta vender en Buleje?",
        a: "El plan Gratis tiene 0% de comisión. Plan Pro S/ 49/mes con herramientas avanzadas. Sin contratos, cancelás cuando quieras.",
      },
      {
        q: "¿Cuánto demora registrar mi bodega?",
        a: "5 minutos. Subes logo, productos y horario — y ya estás visible para los vecinos.",
      },
      {
        q: "¿Necesito tener sistema de inventario?",
        a: "No. Buleje incluye inventario, caja, reportes y cobros digitales. Si ya tienes uno, lo conectamos.",
      },
      {
        q: "¿Cómo cobro los pedidos?",
        a: "Buleje transfiere a tu cuenta cada semana. Yape/Plin/transferencia bancaria — lo que uses.",
      },
    ],
  },
  {
    id: "repartidores",
    label: "Para repartidores",
    items: [
      {
        q: "¿Qué necesito para ser repartidor?",
        a: "Moto/bici propia, DNI vigente, y ganas de trabajar. Registras y aprobamos en 24h.",
      },
      {
        q: "¿Cuánto puedo ganar?",
        a: "Depende de la zona y horario. Promedio S/ 40-70/día para medio turno. Vos eliges cuándo trabajás.",
      },
      {
        q: "¿Cómo me pagan?",
        a: "Cobros diarios o semanales por Yape/Plin/banco. Sin descuentos ocultos.",
      },
    ],
  },
];

export default function FAQSection() {
  const [activeCategory, setActiveCategory] = useState<string>(CATEGORIES[0].id);
  const currentCategory =
    CATEGORIES.find((c) => c.id === activeCategory) ?? CATEGORIES[0];

  return (
    <section
      id="faq"
      aria-label="Preguntas frecuentes"
      className="relative overflow-hidden bg-[var(--surface-canvas)] py-20 sm:py-28 lg:py-32 scroll-mt-20"
    >
      {/* Blob decorativo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-40 h-[500px] w-[500px] rounded-full bg-[var(--accent)]/[0.05] blur-3xl"
      />

      <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header + tabs de categoría */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-12 lg:gap-20">
          {/* Columna izquierda — header sticky */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[var(--accent)] mb-6">
              <span
                aria-hidden
                className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
              />
              Preguntas
            </p>
            <h2 className="text-[clamp(2.5rem,6vw,4.5rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
              Todo lo que
              <br />
              <span className="italic font-serif text-[var(--accent)]">
                quieres saber.
              </span>
            </h2>
            <p className="mt-6 text-lg text-[var(--text-secondary)] leading-relaxed">
              Si no encontrás tu respuesta, escríbenos — somos humanos, no bots.
            </p>

            {/* Tabs de categoría */}
            <div className="mt-8 flex flex-col gap-1">
              {CATEGORIES.map((cat) => {
                const active = cat.id === activeCategory;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCategory(cat.id)}
                    className={`group flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left transition-all ${
                      active
                        ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                        : "border-[var(--rule-soft)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/40"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <HelpCircle
                        className={`h-4 w-4 ${active ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]"}`}
                        strokeWidth={1.75}
                      />
                      <span
                        className={`text-sm font-bold ${active ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}
                      >
                        {cat.label}
                      </span>
                    </span>
                    <span
                      className={`text-xs font-bold tabular-nums ${active ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]"}`}
                    >
                      {String(cat.items.length).padStart(2, "0")}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* CTA WhatsApp */}
            <a
              href="https://wa.me/51999999999"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded-full border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-5 py-2.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            >
              <MessageCircle className="h-4 w-4" strokeWidth={1.75} />
              Escríbenos por WhatsApp
            </a>
          </div>

          {/* Columna derecha — accordion stream */}
          <div>
            <ul className="divide-y divide-[var(--rule-soft)] border-y border-[var(--rule-soft)]">
              {currentCategory.items.map((item, idx) => (
                <li key={`${currentCategory.id}-${idx}`}>
                  <details className="group">
                    <summary className="flex cursor-pointer items-start justify-between gap-6 py-6 list-none [&::-webkit-details-marker]:hidden">
                      <span className="flex items-start gap-5">
                        <span className="text-xs font-bold tabular-nums text-[var(--text-tertiary)] uppercase tracking-wider mt-1.5">
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        <span className="text-lg sm:text-xl font-bold tracking-[-0.01em] text-[var(--text-primary)] group-open:text-[var(--accent)] transition-colors">
                          {item.q}
                        </span>
                      </span>
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--rule-soft)] text-[var(--text-secondary)] group-open:rotate-45 group-open:border-[var(--accent)] group-open:text-[var(--accent)] transition-all duration-200">
                        <Plus className="h-4 w-4" strokeWidth={2} />
                      </span>
                    </summary>
                    <div className="pb-6 pl-12 pr-8">
                      <p className="text-base text-[var(--text-secondary)] leading-relaxed">
                        {item.a}
                      </p>
                    </div>
                  </details>
                </li>
              ))}
            </ul>

            {/* Ayuda adicional */}
            <div className="mt-10 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-6 sm:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-3">
                ¿Más preguntas?
              </p>
              <h3 className="text-xl font-black tracking-[-0.01em] text-[var(--text-primary)]">
                No te quedes con la duda.
              </h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">
                Nuestro equipo responde personalmente en menos de 2 horas.
                Sin bots, sin formularios largos.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <a
                  href="https://wa.me/51999999999"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 transition-opacity"
                >
                  <MessageCircle className="h-4 w-4" strokeWidth={1.75} />
                  WhatsApp directo
                </a>
                <Link
                  href="/abrir-tienda"
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-2.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors"
                >
                  Ver planes
                  <span aria-hidden>→</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
