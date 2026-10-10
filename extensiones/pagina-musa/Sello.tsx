/**
 * El sello de Musa (manual del negocio): aro fino doble, «MUSA» arriba y
 * «BELLEZA PROFESIONAL» abajo en curva, y al centro un círculo nude con la
 * «M» serif negra. SVG propio (sin `"use client"`): el color sale de los
 * tokens de `tema.ts` (`--mu-negro` para los aros y las letras, que en oscuro
 * pasa a hueso; `--mu-sello-*` para el centro, igual en los dos temas).
 *
 * `id` hace únicos los trazos de las curvas cuando hay más de un sello en la
 * página (encabezado y pie). Decorativo por defecto; con `titulo`, lo lee el
 * lector de pantalla.
 */
export function Sello({ id, titulo, className = "", claro = false }: { id: string; titulo?: string; className?: string; claro?: boolean }) {
  const tinta = claro ? "fill-[var(--mu-sobre-cacao)]" : "fill-[var(--mu-negro)]";
  const aro = claro ? "stroke-[var(--mu-sobre-cacao)]" : "stroke-[var(--mu-negro)]";
  const arriba = `mu-sello-arriba-${id}`;
  const abajo = `mu-sello-abajo-${id}`;
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      {...(titulo ? { role: "img", "aria-label": titulo } : { "aria-hidden": true })}
      focusable="false"
    >
      <defs>
        {/* Arriba: de izquierda a derecha por encima (las letras miran afuera). */}
        <path id={arriba} d="M 30,100 A 70,70 0 0 1 170,100" fill="none" />
        {/* Abajo: de izquierda a derecha por debajo (las letras quedan derechas). */}
        <path id={abajo} d="M 20,100 A 80,80 0 0 0 180,100" fill="none" />
      </defs>
      <circle cx="100" cy="100" r="96" fill="none" strokeWidth="1.6" className={aro} />
      <circle cx="100" cy="100" r="90" fill="none" strokeWidth="0.8" className={aro} />
      <circle cx="100" cy="100" r="54" className="fill-[var(--mu-sello-nude)]" />
      <text className={tinta} fontFamily="'Musa Cormorant','Cormorant Garamond',Georgia,serif" fontWeight="600" fontSize="17" letterSpacing="7">
        <textPath href={`#${arriba}`} startOffset="50%" textAnchor="middle">
          MUSA
        </textPath>
      </text>
      <text className={tinta} fontFamily="'Musa Cormorant','Cormorant Garamond',Georgia,serif" fontWeight="600" fontSize="10.5" letterSpacing="2.6">
        <textPath href={`#${abajo}`} startOffset="50%" textAnchor="middle">
          BELLEZA PROFESIONAL
        </textPath>
      </text>
      <circle cx="27" cy="100" r="2.2" className={tinta} />
      <circle cx="173" cy="100" r="2.2" className={tinta} />
      <text
        x="100"
        y="101"
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-[var(--mu-sello-m)]"
        fontFamily="'Musa Cormorant','Cormorant Garamond',Georgia,serif"
        fontWeight="600"
        fontSize="70"
      >
        M
      </text>
    </svg>
  );
}
