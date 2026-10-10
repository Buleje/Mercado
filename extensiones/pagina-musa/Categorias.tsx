/**
 * Categorías en círculos: la foto es la de un producto real de esa categoría
 * (el favorito, si hay) y el número es cuántos hay hoy. Las vacías no salen.
 * Van en arcos (el espejo del salón). En el celular, una fila que se desliza
 * con imán y el borde derecho desvanecido; desde 1024 px, las 8 en una fila.
 */
import Image from "next/image";
import { CATEGORIAS } from "./anuncios";
import type { ProductoSalon } from "./datos";
import { rutas } from "./destinos";
import { ANCHO, TituloSeccion } from "./ui";

export function Categorias({ productos, servicios, slug }: { productos: ProductoSalon[]; servicios: ProductoSalon[]; slug: string }) {
  const r = rutas(slug);
  const items: { nombre: string; href: string; cuantos: number; foto: string | undefined; unidad: string }[] = CATEGORIAS.map((c) => {
    const de = productos.filter((p) => p.categoria === c.nombre);
    const foto = (de.find((p) => p.etiqueta?.toLowerCase() === "favorito") ?? de[0])?.imagen;
    return { nombre: c.corto, href: r.categoria(c.nombre), cuantos: de.length, foto, unidad: "producto" };
  }).filter((c) => c.cuantos > 0);
  if (servicios.length > 0) {
    items.push({ nombre: "Servicios", href: "#servicios", cuantos: servicios.length, foto: servicios[0].imagen, unidad: "servicio" });
  }
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="mu-categorias" className="py-9 sm:py-20">
      <div className={ANCHO}>
        <TituloSeccion id="mu-categorias" kicker="Encuentra lo tuyo" titulo="Compra por categoría" centrado />
        <ul className="mu-sin-barra mu-desvanecer -mx-4 flex snap-x snap-proximity scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-8 lg:gap-5 lg:overflow-visible lg:px-0 mu-desvanecer-movil">
          {items.map((c, i) => (
            <li key={c.nombre} className={`w-32 shrink-0 snap-start lg:w-auto ${i === items.length - 1 ? "pr-8 sm:pr-10 lg:pr-0" : ""}`}>
              <a href={c.href} className="group flex flex-col items-center gap-2.5 text-center focus-visible:outline-none">
                <span className="relative block aspect-[4/5] w-full overflow-hidden rounded-b-2xl rounded-t-full bg-[var(--mu-nude-claro)] ring-1 ring-[var(--rule-base)] transition duration-300 group-hover:-translate-y-1 group-hover:ring-2 group-hover:ring-[var(--mu-acento-tinta)] group-focus-visible:ring-4 group-focus-visible:ring-[var(--accent)]">
                  {c.foto && <Image src={c.foto} alt="" fill sizes="(min-width: 1024px) 9rem, 7rem" className="object-cover transition duration-500 group-hover:scale-110" />}
                  <span className="absolute bottom-1.5 right-1.5 inline-flex h-8 items-center justify-center rounded-full bg-[var(--surface-raised)] px-2.5 text-sm font-bold tabular-nums leading-none text-[var(--mu-acento-tinta)] shadow-sm">
                    {c.cuantos}
                    <span className="sr-only"> {c.cuantos === 1 ? c.unidad : `${c.unidad}s`}</span>
                  </span>
                </span>
                <span className="hyphens-auto text-base font-semibold leading-tight text-[var(--text-primary)]">{c.nombre}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
