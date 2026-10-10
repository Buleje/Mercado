/**
 * El sello de Musa, con la geometría EXACTA del logo vectorial de los empaques
 * (`PROYECTO MUSA/Empaque/fuente/build.mjs`, lienzo de 1000): aro de 486
 * (trazo 9) y de 463 (4,5), disco nude de 290, «MUSA» arriba en 54° y
 * «BELLEZA PROFESIONAL» abajo en 148°, dos puntos a ±85° y la «M» de
 * Cormorant 600 de 300 de alto.
 *
 * La «M» va como trazo (es la marca: no puede esperar a la fuente). Las
 * palabras del aro van como texto vivo en Cormorant (`textLength` las estira
 * al mismo arco del logo): pesan 2 KB en vez de los 24 KB de las curvas.
 *
 * SVG propio (sin `"use client"`): el color sale de `tema.ts` (`--mu-negro`
 * para aros y letras, que en oscuro pasa a hueso; `--mu-sello-*` para el
 * centro, igual en los dos temas). `claro` = sobre cacao (aros en hueso).
 * `id` hace únicos los trazos de las curvas cuando hay más de un sello en la
 * página. Decorativo por defecto; con `titulo`, lo lee el lector de pantalla.
 *
 * `simple` = el sello para tamaños chicos (encabezado de 40-48 px, menú de 36):
 * a ese tamaño las palabras del aro miden 4 px y se ven como una mancha gris,
 * y los aros de 9 y 4,5 (0,4 px) casi no se pintan. Queda lo que se reconoce
 * —el aro doble, el disco nude y la «M», más grande— como el ícono de una app.
 * El sello completo, desde 72 px (pie).
 */
import type { CSSProperties } from "react";

const M =
  "M351 592L356 361L369 362L364 592Q363 617 374 631Q384 644 404 644Q406 644 406 647Q406 650 404 650Q394 650 383 650Q372 649 358 649Q344 649 332 650Q320 650 309 650Q308 650 308 647Q308 644 309 644Q329 644 340 631Q351 617 351 592M691 644Q692 644 692 647Q692 650 691 650Q679 650 663 650Q648 649 631 649Q614 649 600 650Q585 650 573 650Q572 650 572 647Q572 644 573 644Q596 644 603 638Q609 632 608 611L598 392L619 359L496 647Q496 649 492 649Q489 649 488 647L358 390Q341 356 313 356Q311 356 311 353Q311 350 313 350Q322 350 332 350Q343 351 350 351Q360 351 369 350Q377 350 382 350Q389 350 392 355Q396 359 404 375L512 587L491 623L605 362Q608 356 611 353Q615 350 620 350Q624 350 629 350Q634 351 641 351Q656 351 666 350Q676 350 685 350Q687 350 687 353Q687 356 685 356Q663 356 653 364Q642 372 643 392L654 611Q655 625 657 632Q660 639 668 642Q676 644 691 644";

const CORMORANT = "'Musa Cormorant','Cormorant Garamond',Georgia,serif";
/** Largo de cada arco del logo: grados × radio de la línea de base. */
const ARCO_ARRIBA = Math.round(((54 * Math.PI) / 180) * 346.63);
const ARCO_ABAJO = Math.round(((148 * Math.PI) / 180) * 395.38);

export function Sello({
  id,
  titulo,
  className = "",
  claro = false,
  simple = false,
}: {
  id: string;
  titulo?: string;
  className?: string;
  claro?: boolean;
  simple?: boolean;
}) {
  const tinta = claro ? "fill-[var(--mu-sobre-cacao)]" : "fill-[var(--mu-negro)]";
  const aro = claro ? "stroke-[var(--mu-sobre-cacao)]" : "stroke-[var(--mu-negro)]";
  const arriba = `mu-sello-arriba-${id}`;
  const abajo = `mu-sello-abajo-${id}`;
  const lector = titulo ? { role: "img", "aria-label": titulo } : { "aria-hidden": true };
  if (simple) {
    return (
      <svg viewBox="0 0 1000 1000" className={className} {...lector} focusable="false">
        <circle cx="500" cy="500" r="478" fill="none" strokeWidth="30" className={aro} />
        <circle cx="500" cy="500" r="432" fill="none" strokeWidth="16" className={aro} />
        <circle cx="500" cy="500" r="388" className="fill-[var(--mu-sello-nude)]" />
        <path d={M} transform="translate(500 500) scale(1.32) translate(-500 -500)" className="fill-[var(--mu-sello-m)]" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 1000 1000" className={className} {...lector} focusable="false">
      <defs>
        {/* Arriba: por encima, de izquierda a derecha (las letras miran afuera). */}
        <path id={arriba} d="M153.37 500A346.63 346.63 0 0 1 846.63 500" fill="none" />
        {/* Abajo: por debajo, de izquierda a derecha (las letras quedan derechas). */}
        <path id={abajo} d="M104.62 500A395.38 395.38 0 0 0 895.38 500" fill="none" />
      </defs>
      <circle cx="500" cy="500" r="486" fill="none" strokeWidth="9" className={aro} />
      <circle cx="500" cy="500" r="463" fill="none" strokeWidth="4.5" className={aro} />
      <circle cx="500" cy="500" r="290" className="fill-[var(--mu-sello-nude)]" />
      <text className={tinta} fontFamily={CORMORANT} fontWeight="600" fontSize="92">
        <textPath href={`#${arriba}`} startOffset="50%" textAnchor="middle" textLength={ARCO_ARRIBA} lengthAdjust="spacing">
          MUSA
        </textPath>
      </text>
      <text className={tinta} fontFamily={CORMORANT} fontWeight="600" fontSize="64">
        <textPath href={`#${abajo}`} startOffset="50%" textAnchor="middle" textLength={ARCO_ABAJO} lengthAdjust="spacing">
          BELLEZA PROFESIONAL
        </textPath>
      </text>
      <circle cx="126.05" cy="467.28" r="10" className={tinta} />
      <circle cx="873.95" cy="467.28" r="10" className={tinta} />
      <path d={M} className="fill-[var(--mu-sello-m)]" />
    </svg>
  );
}

/**
 * El «sello contador» (contrato §f): el sello en miniatura con el número en
 * lugar de la «M». Círculo `--mu-contador-fondo`, número Poppins 600 tabular
 * y el aro doble del logo (1,5 px de `--mu-contador-aro`, separado 2 px).
 * Desde 10 dice «9+». Tamaños: 22 en el encabezado, 28 en la tarjeta, 20 en
 * la línea de la bolsa.
 *
 * Cada número nuevo entra desde abajo (`key`); con `previo`, el anterior sale
 * hacia arriba. Con «reducir movimiento» cambia en seco (lo resuelve `tema.ts`).
 * Es decorativo: el texto para el lector lo pone quien lo usa (botón o `<output>`).
 */
export function SelloContador({ n, previo, tamano = 22, className = "" }: { n: number; previo?: number | null; tamano?: 20 | 22 | 28; className?: string }) {
  const texto = n > 9 ? "9+" : String(n);
  const antes = previo == null ? null : previo > 9 ? "9+" : String(previo);
  return (
    <span data-mu-contador aria-hidden="true" className={`mu-sello-contador ${className}`} style={{ "--mu-lado": `${tamano}px` } as CSSProperties}>
      {antes !== null && antes !== texto && (
        <span key={`sale-${antes}-${texto}`} className="mu-contador-num-sale">
          {antes}
        </span>
      )}
      <span key={texto} className="mu-contador-num">
        {texto}
      </span>
    </span>
  );
}
