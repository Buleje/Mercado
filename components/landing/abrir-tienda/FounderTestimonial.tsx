import { Star } from "@buleje/design-system/icons";

/**
 * FounderTestimonial — prueba social con cara y nombre (reemplaza el genérico
 * "Don Lucho y 3 bodegas más"). Sube confianza con una cita real.
 *
 * ⚠️ CONTENIDO EDITABLE: reemplazá TESTIMONIAL por el testimonio REAL de una
 * bodega fundadora (cita textual + nombre + negocio). Si tenés foto, pasá su
 * URL en `photo` y se usa en vez de las iniciales.
 */
const TESTIMONIAL = {
  quote:
    "Antes anotaba todo en un cuaderno y no sabía ni cuánto me quedaba. Con Buleje los vecinos me piden por la app y me llega directo a mi Yape. En la primera semana ya estaba vendiendo más.",
  name: "Don Lucho",
  business: "Bodega Don Lucho · Ciudad Constitución",
  photo: null as string | null,
  rating: 5,
};

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default function FounderTestimonial() {
  const t = TESTIMONIAL;
  return (
    <section className="bg-[var(--surface-canvas)] py-16 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <figure className="relative overflow-hidden rounded-[2rem] border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-8 text-center shadow-[0_16px_50px_rgba(2,6,23,0.08)] sm:p-12">
          {/* comilla decorativa */}
          <span
            aria-hidden
            className="pointer-events-none absolute left-6 top-2 select-none font-serif text-[7rem] leading-none text-[var(--accent)]/10"
          >
            &ldquo;
          </span>

          <div className="relative">
            <div className="mb-5 inline-flex items-center gap-0.5" aria-label={`${t.rating} de 5 estrellas`}>
              {Array.from({ length: t.rating }).map((_, i) => (
                <Star key={i} className="h-5 w-5 fill-[var(--data-warning-500)] text-[var(--data-warning-500)]" strokeWidth={1.5} aria-hidden />
              ))}
            </div>

            <blockquote className="text-xl font-semibold leading-snug tracking-[-0.01em] text-[var(--text-primary)] sm:text-2xl">
              {t.quote}
            </blockquote>

            <figcaption className="mt-7 flex items-center justify-center gap-3">
              {t.photo ? (
                // eslint-disable-next-line @next/next/no-img-element -- avatar simple, URL externa editable
                <img src={t.photo} alt={t.name} className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <span
                  aria-hidden
                  className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] text-base font-black text-white"
                >
                  {initials(t.name)}
                </span>
              )}
              <span className="text-left">
                <span className="block text-sm font-extrabold text-[var(--text-primary)]">{t.name}</span>
                <span className="block text-xs font-medium text-[var(--text-secondary)]">{t.business}</span>
              </span>
            </figcaption>
          </div>
        </figure>
      </div>
    </section>
  );
}
