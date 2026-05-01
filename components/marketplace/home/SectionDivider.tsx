/**
 * SectionDivider — separador editorial entre secciones del home.
 *
 * 3 dots accent staggered + líneas soft con gradient a ambos lados.
 * Ritmo visual refinado sin sobrecargar.
 */

export default function SectionDivider() {
  return (
    <div
      aria-hidden
      className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 my-5 sm:my-8"
    >
      <div className="relative flex items-center gap-4">
        <div className="flex-1 h-px bg-linear-to-r from-transparent to-[var(--rule-soft)]" />
        <div className="flex items-center gap-2">
          <span className="inline-flex h-1 w-1 rounded-full bg-[var(--accent)]/40" />
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
          <span className="inline-flex h-1 w-1 rounded-full bg-[var(--accent)]/40" />
        </div>
        <div className="flex-1 h-px bg-linear-to-l from-transparent to-[var(--rule-soft)]" />
      </div>
    </div>
  );
}
