/**
 * Las secciones de producto: novedades, favoritos de las estilistas y las
 * líneas propias (foto de ambiente + sus productos). Todo sale de la base:
 * «novedades» = lo último que se cargó; «favoritos» = lo que el dueño marcó
 * con el badge «Favorito» en Productos; una línea = sus productos por marca.
 * Una sección sin productos no se dibuja.
 */
import Image from "next/image";
import { ArrowRight } from "@buleje/design-system/icons";
import { LINEAS } from "./anuncios";
import { Carril } from "./Carril";
import type { ProductoSalon } from "./datos";
import { rutas } from "./destinos";
import { TarjetaProducto } from "./TarjetaProducto";
import { ANCHO, TituloSeccion } from "./ui";

export function Novedades({ productos, slug }: { productos: ProductoSalon[]; slug: string }) {
  const nuevos = [...productos].sort((a, b) => b.id - a.id).slice(0, 10);
  if (nuevos.length === 0) return null;
  return (
    <section aria-labelledby="bb-novedades" className="pb-6 pt-14 sm:pb-8 sm:pt-20">
      <div className={ANCHO}>
        <TituloSeccion id="bb-novedades" kicker="Recién llegados" titulo="Novedades del salón" verTodo={{ href: rutas(slug).catalogo, texto: "Ver todo el catálogo" }} />
        <Carril etiqueta="Novedades del salón">
          {nuevos.map((p, i) => (
            <TarjetaProducto key={p.id} p={p} prioridad={i < 2} />
          ))}
        </Carril>
      </div>
    </section>
  );
}

export function Favoritos({ productos }: { productos: ProductoSalon[] }) {
  const favoritos = productos.filter((p) => p.etiqueta?.toLowerCase() === "favorito").slice(0, 8);
  if (favoritos.length === 0) return null;
  return (
    <section aria-labelledby="bb-favoritos" className="bg-[var(--bb-papel)] py-14 sm:py-20">
      <div className={ANCHO}>
        <TituloSeccion
          id="bb-favoritos"
          kicker="Elegidos en el salón"
          titulo="Favoritos de nuestras estilistas"
          texto="Lo que usamos todos los días en el salón, para que lo lleves a casa."
          centrado
        />
        <ul className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-4">
          {favoritos.map((p) => (
            <li key={p.id}>
              <TarjetaProducto p={p} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Lineas({ productos, slug, nombre }: { productos: ProductoSalon[]; slug: string; nombre: string }) {
  const r = rutas(slug);
  const conProductos = LINEAS.map((l) => ({ ...l, items: productos.filter((p) => p.marca === l.marca) })).filter((l) => l.items.length > 0);
  if (conProductos.length === 0) return null;
  return (
    <section aria-labelledby="bb-lineas" className="py-14 sm:py-20">
      <div className={ANCHO}>
        <TituloSeccion id="bb-lineas" kicker={`Hechas por ${nombre}`} titulo="Nuestras líneas" />
        <div className="flex flex-col gap-14 sm:gap-16">
          {conProductos.map((l, i) => (
            <div
              key={l.marca}
              className={`grid gap-5 lg:gap-8 ${i % 2 ? "lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]" : "lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[22rem_minmax(0,1fr)]"}`}
            >
              <a
                href={r.buscar(l.marca)}
                className={`group relative flex min-h-[20rem] overflow-hidden rounded-3xl bg-[var(--bb-rubor)] sm:min-h-[24rem] lg:min-h-0 ${i % 2 ? "lg:order-2" : ""} focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]`}
              >
                <Image src={l.foto} alt={l.alt} fill sizes="(min-width: 1024px) 22rem, 100vw" className="object-cover transition duration-700 group-hover:scale-[1.04]" />
                <span className="absolute inset-0 bg-gradient-to-t from-[var(--bb-tinta)]/95 via-[var(--bb-tinta)]/55 to-[var(--bb-tinta)]/5" aria-hidden="true" />
                <span className="relative mt-auto flex flex-col gap-2 p-6 text-[var(--bb-sobre-tinta)] sm:p-7">
                  <span className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--bb-sobre-tinta-2)]">{l.kicker}</span>
                  <span className="bb-serif text-4xl leading-none sm:text-5xl">{l.titulo}</span>
                  <span className="text-base leading-relaxed text-[var(--bb-sobre-tinta-2)]">{l.texto}</span>
                  <span className="mt-2 inline-flex items-center gap-2 self-start border-b-2 border-current pb-0.5 text-base font-semibold">
                    Ver la línea ({l.items.length})
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </span>
                </span>
              </a>
              <div className={`min-w-0 lg:self-center ${i % 2 ? "lg:order-1" : ""}`}>
                <Carril etiqueta={`Productos de ${l.titulo}`} ancho="angosto">
                  {l.items.map((p) => (
                    <TarjetaProducto key={p.id} p={p} />
                  ))}
                </Carril>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
