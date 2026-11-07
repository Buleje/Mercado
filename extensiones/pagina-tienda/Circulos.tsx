/**
 * Los círculos de categorías (como los de Musa, `pagina-musa/Circulos.tsx`):
 * un disco por categoría del negocio con su foto (el banner que puso el dueño
 * o la de su primer producto) y el nombre debajo; cada uno lleva al catálogo
 * filtrado por esa categoría (`categoria` = la clave del filtro).
 *
 * Sin foto, el disco lleva la inicial sobre el gris: nunca una imagen rota.
 * Hasta 5 entran en una fila; con más, la fila se desliza en el celular.
 * Con una sola categoría no hay bloque (no ayuda a elegir).
 */
import type { ContenidoTienda } from "./contenido";
import { ANCHO, inicialDe, rutasTienda } from "./ui";

const DISCO =
  "relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-[var(--ti-suave)] ring-1 ring-[var(--ti-linea-suave)] transition-transform duration-[var(--ti-dur-medio)] ease-[var(--ti-ease)] group-hover:-translate-y-1 sm:h-24 sm:w-24 lg:h-28 lg:w-28";

/** En el celular, hasta 5 se reparten la fila (a 400 px cada uno mide ~67 px: entra el disco de 64). */
const COLUMNAS: Record<number, string> = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4", 5: "grid-cols-5" };

/** Tope: con más, el bloque deja de ser un atajo (el resto está en el menú y en el catálogo). */
const MAXIMO = 10;

export function Circulos({ circulos: todos, slug }: { circulos: ContenidoTienda["circulos"]; slug: string }) {
  const circulos = todos.slice(0, MAXIMO);
  if (circulos.length < 2) return null;
  const r = rutasTienda(slug);
  const muchos = circulos.length > 5;
  return (
    <section aria-labelledby="ti-circulos" className="border-y border-[var(--ti-linea-suave)] py-6 sm:py-10">
      <h2 id="ti-circulos" className="sr-only">
        Compra por categoría
      </h2>
      <ul
        className={`${ANCHO} items-start lg:max-w-[64rem] ${
          muchos
            ? "ti-sin-barra ti-desvanecer flex snap-x snap-proximity scroll-px-4 gap-3 overflow-x-auto sm:flex-wrap sm:justify-center sm:gap-6 sm:overflow-visible"
            : `grid gap-2 ${COLUMNAS[circulos.length] ?? ""} sm:flex sm:justify-center sm:gap-6`
        }`}
      >
        {circulos.map((c, i) => (
          <li key={c.categoria} className={`sm:w-28 lg:w-32 ${muchos ? `w-[4.5rem] shrink-0 snap-start ${i === circulos.length - 1 ? "mr-8 sm:mr-0" : ""}` : ""}`}>
            <a href={r.categoria(c.categoria)} className="ti-foco group flex w-full flex-col items-center rounded-2xl pb-1">
              <span className={DISCO}>
                {c.imagen ? (
                  // eslint-disable-next-line @next/next/no-img-element -- foto subida por el dueño: sin el paso de /_next/image
                  <img src={c.imagen} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <span aria-hidden="true" className="ti-nombre text-2xl text-[var(--ti-texto-2)] sm:text-3xl">
                    {inicialDe(c.nombre)}
                  </span>
                )}
              </span>
              <span className="mt-2 line-clamp-2 text-center text-sm font-medium leading-tight text-[var(--ti-texto)] sm:text-base">{c.nombre}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
