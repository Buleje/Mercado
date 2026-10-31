import Image from "next/image";

/**
 * ProductRichContent — contenido enriquecido "A+" del producto (estilo Amazon):
 * bloques de imagen + texto que el vendedor arma en admin. Presentational puro
 * (server-compatible). Alterna la imagen izquierda/derecha para dar ritmo.
 */

export interface RichBlock {
  heading?: string;
  body?: string;
  imageUrl?: string;
}

export function ProductRichContent({ blocks }: { blocks: RichBlock[] }) {
  const valid = blocks.filter(
    (b) => (b.heading && b.heading.trim()) || (b.body && b.body.trim()) || b.imageUrl,
  );
  if (valid.length === 0) return null;

  return (
    <section
      aria-label="Más sobre este producto"
      className="border border-[var(--rule-base)] bg-[var(--surface-raised)]"
    >
      <h2 className="border-b border-[var(--rule-soft)] px-4 py-3 text-base sm:text-lg font-semibold text-[var(--text-primary)]">
        Más sobre este producto
      </h2>

      <div className="divide-y divide-[var(--rule-soft)]">
        {valid.map((b, i) => (
          <div
            key={i}
            className={`grid gap-4 p-4 sm:p-6 md:grid-cols-2 md:items-center ${
              i % 2 === 1 ? "md:[&>*:first-child]:order-2" : ""
            }`}
          >
            {b.imageUrl ? (
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-[var(--surface-sunken)]">
                <Image
                  src={b.imageUrl}
                  alt={b.heading || "Detalle del producto"}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="hidden md:block" aria-hidden />
            )}

            <div className={b.imageUrl ? "" : "md:col-span-2"}>
              {b.heading && b.heading.trim() && (
                <h3 className="text-lg font-bold text-[var(--text-primary)]">
                  {b.heading.trim()}
                </h3>
              )}
              {b.body && b.body.trim() && (
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[var(--text-secondary)]">
                  {b.body.trim()}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="border-t border-[var(--rule-soft)] px-4 py-2.5 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
        Contenido publicado por el vendedor.
      </p>
    </section>
  );
}
