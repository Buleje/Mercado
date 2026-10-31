import { Reveal } from "@/components/landing/Reveal";
import HomeSeccionTitulo from "@/components/marketplace/home/HomeSeccionTitulo";
import { HOME_FAQS } from "@/lib/marketplace/home-faqs";
import { BRAND_GEO } from "@/lib/geo";
import { ChevronDown, MessageCircle } from "@buleje/design-system/icons";

// ── Preguntas frecuentes — server component, <details> nativo (0 JS) ─────────
// Audit SEO 2026-05-31: el FAQPage JSON-LD necesita el contenido VISIBLE en la
// página; la lista es la misma (lib/marketplace/home-faqs.ts). Rediseño «Dosel»
// (2026-10-10): un solo panel compacto, 2 columnas en md+ y 1 a 400, sin
// cuadros numerados; al abrir, una regla teal a la izquierda. La última fila
// lleva a WhatsApp (botón en --accent-dark: el texto blanco exige 4,86:1).

const WHATSAPP = `https://wa.me/${BRAND_GEO.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
  `Hola Buleje, tengo una pregunta sobre pedir en ${BRAND_GEO.city}`,
)}`;

function Pregunta({ q, a }: { q: string; a: string }) {
  return (
    <details className="group relative before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-full before:bg-[var(--accent)] before:opacity-0 before:transition-opacity before:duration-[var(--dur-base)] open:before:opacity-100">
      <summary className="flex min-h-[3.5rem] cursor-pointer list-none items-center gap-3 px-5 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] [&::-webkit-details-marker]:hidden">
        <span className="flex-1 text-base font-semibold leading-snug text-[var(--text-primary)]">{q}</span>
        <ChevronDown
          className="h-5 w-5 shrink-0 text-[var(--text-tertiary)] transition-transform duration-[var(--dur-base)] group-open:rotate-180 motion-reduce:transition-none"
          strokeWidth={2.25}
          aria-hidden
        />
      </summary>
      <p className="-mt-1 px-5 pb-4 text-base leading-relaxed text-[var(--text-secondary)]">{a}</p>
    </details>
  );
}

function HomeFaqSection() {
  // Reparto par/impar: cada columna se expande sola al abrir (sin saltos de la otra).
  const columnas = [0, 1].map((c) => HOME_FAQS.filter((_, i) => i % 2 === c));
  return (
    <section
      id="preguntas-frecuentes"
      aria-labelledby="faq-heading"
      className="mx-auto w-full max-w-[1760px] px-4 sm:px-6 lg:px-8"
    >
      <HomeSeccionTitulo
        id="faq-heading"
        titulo="Preguntas frecuentes"
        bajada={`Comprar y pedir en ${BRAND_GEO.city}`}
      />
      <div className="overflow-hidden rounded-[var(--radius-xl)] bg-[var(--surface-raised)] ring-1 ring-[var(--rule-base)]">
        <div className="divide-y divide-[var(--rule-soft)] md:grid md:grid-cols-2 md:items-start md:divide-x md:divide-y-0">
          {columnas.map((lista, c) => (
            <div key={c} className="divide-y divide-[var(--rule-soft)]">
              {lista.map((f) => (
                <Pregunta key={f.q} q={f.q} a={f.a} />
              ))}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3 border-t border-[var(--rule-base)] bg-[var(--surface-sunken)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-base font-semibold text-[var(--text-primary)]">
            ¿Otra duda? <span className="font-normal text-[var(--text-secondary)]">Escríbenos y te respondemos al toque.</span>
          </p>
          <a
            href={WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--accent-dark)] px-5 text-base font-bold text-white transition-colors duration-[var(--dur-fast)] hover:shadow-[var(--shadow-md)] active:scale-[0.98] motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-sunken)]"
          >
            <MessageCircle className="h-5 w-5" strokeWidth={2.25} aria-hidden />
            Escríbenos por WhatsApp
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
