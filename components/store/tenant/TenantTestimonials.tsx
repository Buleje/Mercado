import { Star, Quote } from "lucide-react";

/**
 * TenantTestimonials — sección de reseñas de clientes (Brandon 2026-06-26, Modo
 * Creativo). El dueño carga nombre/estrellas/comentario desde el editor.
 * Server component. Se rinde como sección del cuerpo del landing (data-pb).
 */
export interface Testimonial {
  name: string;
  stars: number;
  comment: string;
}

export default function TenantTestimonials({
  testimonials,
  primary,
}: {
  testimonials: Testimonial[];
  primary: string;
}) {
  const list = testimonials.filter((t) => t.name?.trim() || t.comment?.trim());
  if (list.length === 0) return null;

  return (
    <section data-pb="testimonials" className="max-w-5xl mx-auto px-4 py-10">
      <div className="mb-6">
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1.5">
          Lo que dicen
        </p>
        <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
          Reseñas de nuestros clientes
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.slice(0, 9).map((t, i) => {
          const stars = Math.max(0, Math.min(5, Math.round(t.stars || 5)));
          return (
            <div
              key={`${t.name}-${i}`}
              className="relative rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5"
            >
              <Quote className="absolute right-4 top-4 h-6 w-6 opacity-10" strokeWidth={2} aria-hidden style={{ color: primary }} />
              <div className="mb-3 flex items-center gap-0.5" aria-label={`${stars} de 5 estrellas`}>
                {Array.from({ length: 5 }).map((_, s) => (
                  <Star
                    key={s}
                    className="h-4 w-4"
                    strokeWidth={2}
                    aria-hidden
                    style={{ color: s < stars ? "#f59e0b" : "var(--rule-base)" }}
                    fill={s < stars ? "#f59e0b" : "none"}
                  />
                ))}
              </div>
              {t.comment?.trim() && (
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">“{t.comment.trim()}”</p>
              )}
              {t.name?.trim() && (
                <p className="text-sm font-extrabold text-[var(--text-primary)]">{t.name.trim()}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
