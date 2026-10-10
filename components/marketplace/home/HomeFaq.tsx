import { Reveal } from "@/components/landing/Reveal";
import SectionHeading from "@/components/marketplace/home/SectionHeading";
import { HOME_FAQS } from "@/lib/marketplace/home-faqs";
import { BRAND_GEO } from "@/lib/geo";
import { ChevronDown, MessageCircle } from "@buleje/design-system/icons";

// app/(store)/layout.tsx — único punto compartido con /tiendas y /marketplace.
// ── FAQ visible — server component, accordeón nativo <details> (sin JS) ──────
// Audit SEO 2026-05-31: el FAQPage schema necesitaba contenido VISIBLE en la
// página (política de Google) — antes era schema-only. Esto también suma copy
// indexable con keywords long-tail locales ("delivery en {city}", "pagar con
// Yape"). Nativo <details>/<summary>: accesible por teclado, 0 JavaScript.
function HomeFaqSection() {
  return (
    <section
      id="preguntas-frecuentes"
      aria-labelledby="faq-heading"
      className="py-7 sm:py-9 bg-[var(--surface-sunken)]/40 border-y border-[var(--rule-soft)]"
    >
      <div className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          headingId="faq-heading"
          eyebrow="Preguntas frecuentes"
          title={`Todo sobre comprar y pedir en ${BRAND_GEO.city}`}
        />

        {/* 2 columnas masonry (Brandon 2026-06-01): llena el ancho y cada
            columna se expande independiente al abrir un acordeón (sin saltos de
            la otra). Reparto par/impar preservando el número original. Sigue
            siendo native <details> → 0 JS, indexable, accesible. */}
        <div className="grid gap-3 sm:gap-4 md:grid-cols-2 md:items-start">
          {[0, 1].map((colIdx) => (
            <div key={colIdx} className="space-y-3 sm:space-y-4">
              {HOME_FAQS.filter((_, i) => i % 2 === colIdx).map((f) => {
                const n = HOME_FAQS.indexOf(f) + 1;
                return (
                  /* Brandon 2026-06-13: rediseño editorial SIN bordes redondeados.
                     Tarjeta cuadrada con regla de acento a la IZQUIERDA (gris →
                     acento al abrir), tinte suave + número resaltado en open. */
                  <details
                    key={n}
                    className="group border border-[var(--rule-base)] border-l-[3px] border-l-[var(--rule-strong)] bg-[var(--surface-raised)] transition-colors open:border-l-[var(--accent)] open:bg-primary/10"
                  >
                    <summary className="flex items-center gap-3.5 cursor-pointer list-none px-4 sm:px-5 py-4 [&::-webkit-details-marker]:hidden">
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center bg-[var(--surface-sunken)] text-[length:var(--ts-sm)] font-black tabular-nums text-[var(--text-tertiary)] transition-colors group-open:bg-[var(--accent)] group-open:text-white">
                        {String(n).padStart(2, "0")}
                      </span>
                      <span className="flex-1 text-base font-bold leading-snug text-[var(--text-primary)] transition-colors group-open:text-[var(--accent)]">
                        {f.q}
                      </span>
                      <span className="grid h-7 w-7 shrink-0 place-items-center text-[var(--text-tertiary)] transition-colors group-open:text-[var(--accent)]">
                        <ChevronDown
                          className="h-5 w-5 transition-transform duration-200 group-open:rotate-180"
                          strokeWidth={2.5}
                          aria-hidden
                        />
                      </span>
                    </summary>
                    <div className="pl-[3.875rem] pr-5 pb-5 -mt-1">
                      <p className="text-base text-[var(--text-secondary)] leading-relaxed">
                        {f.a}
                      </p>
                    </div>
                  </details>
                );
              })}
            </div>
          ))}
        </div>

        {/* Cierre — duda no resuelta → WhatsApp directo. Bloque cuadrado con
            franja de acento a la izquierda (consistente con las tarjetas). */}
        <div className="mt-6 sm:mt-8 flex flex-col gap-4 border border-[var(--rule-base)] border-l-[3px] border-l-[var(--accent)] bg-[var(--surface-raised)] px-5 sm:px-7 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-base sm:text-lg font-extrabold text-[var(--text-primary)]">
              ¿Te quedó otra duda?
            </p>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
              Escríbenos por WhatsApp y te respondemos al toque.
            </p>
          </div>
          <a
            href={`https://wa.me/${BRAND_GEO.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
              `Hola Buleje, tengo una pregunta sobre pedir en ${BRAND_GEO.city}`,
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center gap-2 bg-[var(--accent)] px-6 h-12 text-sm font-extrabold text-white shadow-sm transition-all hover:gap-3 hover:shadow-md active:scale-95"
          >
            <MessageCircle className="h-5 w-5" strokeWidth={2.25} aria-hidden />
            Escribir por WhatsApp
          </a>
        </div>
      </div>
    </section>
  );
}

export default function HomeFaq() {
  return (
    <Reveal>
      <HomeFaqSection />
    </Reveal>
  );
}
