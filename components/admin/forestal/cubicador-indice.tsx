/**
 * Lo que queda del índice pegajoso del cubicador de madera (23-10 a la mañana:
 * tres bloques apilados con una barra que llevaba a cada uno). Esa tarde
 * Brandon pidió «ir en sección y sección; que no estén todas las secciones
 * visibles en una pantalla»: la barra pasó a ser de secciones, una a la vez
 * (`cubicador-secciones`), y el índice se fue.
 *
 * Queda el número redondo que el panel de dictado (`cubicador-entrada-voz`)
 * todavía sabe dibujar si se lo pasan (`numero`); el cubicador ya no lo pasa.
 */

/** El número redondo al lado del título de un bloque. */
export function NumeroDeBloque({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-extrabold text-[var(--accent-ink)] dark:text-[var(--accent)]"
    >
      {n}
    </span>
  );
}
