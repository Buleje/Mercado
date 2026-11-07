/**
 * Lo que se ve mientras llegan los datos de la tienda (sin saltos al llegar):
 * el encabezado con las MISMAS alturas que el real —barra 57 / 73 px (con su
 * filete; sin franja: la mayoría de los negocios no tiene avisos), buscador del celular 62 px o menú de categorías 49 px desde 768— y
 * el héroe de la portada (texto + panel gris). Con la paleta neutra: todavía
 * no se sabe el acento del negocio.
 */
import { ACENTO_NEUTRO, cssTema } from "./tema";
import { ANCHO, CSS_PIEZAS } from "./ui";

/** Paleta de respaldo (sin datos): casi negro, la letra de fábrica y el radio suave. */
export const CSS_NEUTRO = cssTema({ acento: ACENTO_NEUTRO, letra: "jakarta", radio: "suave" }) + CSS_PIEZAS;

const BLOQUE = "animate-pulse rounded-full bg-[var(--ti-suave)]";
const LINEA = "animate-pulse rounded bg-[var(--ti-suave)]";

export function EsqueletoEncabezado() {
  return (
    <div aria-hidden="true">
      <div className="border-b border-transparent bg-[var(--ti-fondo)]">
        <div className={`${ANCHO} flex h-14 items-center justify-center gap-6 md:h-[4.5rem] md:justify-start`}>
          <div className={`${BLOQUE} h-10 w-32`} />
          <div className={`${BLOQUE} mx-auto hidden h-12 w-full max-w-[36rem] md:block`} />
        </div>
      </div>
      <div className="h-[3.875rem] bg-[var(--ti-fondo)] md:hidden" />
      <div className="hidden h-[3.0625rem] border-b border-[var(--ti-linea-suave)] bg-[var(--ti-fondo)] md:block" />
    </div>
  );
}

export function EsqueletoHeroe() {
  return (
    <div className={`${ANCHO} grid items-center gap-6 pb-8 pt-6 md:grid-cols-2 md:gap-10 md:pb-14 md:pt-10 lg:gap-16`} aria-busy="true" aria-label="Cargando la tienda">
      <div className="flex flex-col gap-4">
        <div className={`${LINEA} h-12 w-4/5`} />
        <div className={`${LINEA} h-12 w-3/5`} />
        <div className={`${LINEA} h-4 w-full max-w-md`} />
        <div className={`${BLOQUE} mt-2 h-12 w-44`} />
      </div>
      <div className="mx-auto aspect-[16/10] w-full max-w-[36rem] animate-pulse rounded-[var(--ti-radio-tarjeta)] bg-[var(--ti-suave)] md:aspect-[4/3]" />
    </div>
  );
}
