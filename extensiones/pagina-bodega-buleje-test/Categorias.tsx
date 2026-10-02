/**
 * Categorías en círculos: la foto es la de un producto real de esa categoría
 * (el favorito, si hay) y el número es cuántos hay hoy. Las vacías no salen.
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
    <section aria-labelledby="bb-categorias" className="py-14 sm:py-20">
      <div className={ANCHO}>
        <TituloSeccion id="bb-categorias" kicker="Encuentra lo tuyo" titulo="Compra por categoría" centrado />
        <ul className="grid grid-cols-3 gap-x-3 gap-y-8 sm:grid-cols-4 lg:grid-cols-8 lg:gap-x-5">
          {items.map((c) => (
            <li key={c.nombre}>
              <a href={c.href} className="group flex flex-col items-center gap-3 text-center focus-visible:outline-none">
                <span className="relative block aspect-square w-full max-w-[9rem] overflow-hidden rounded-full bg-[var(--bb-rubor)] ring-1 ring-[var(--rule-base)] transition duration-300 group-hover:-translate-y-1 group-hover:ring-2 group-hover:ring-[var(--bb-vino)] group-focus-visible:ring-4 group-focus-visible:ring-[var(--accent)]">
                  {c.foto && <Image src={c.foto} alt="" fill sizes="(min-width: 1024px) 9rem, 30vw" className="object-cover transition duration-500 group-hover:scale-110" />}
                </span>
                <span className="flex flex-col">
                  <span className="hyphens-auto text-[0.9375rem] font-semibold text-[var(--text-primary)] sm:text-base">{c.nombre}</span>
                  <span className="text-sm text-[var(--text-secondary)]">
                    {c.cuantos} {c.cuantos === 1 ? c.unidad : `${c.unidad}s`}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
