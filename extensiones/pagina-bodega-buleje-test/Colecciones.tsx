/**
 * Las secciones de producto: novedades, favoritos de las estilistas y las
 * líneas propias (foto de ambiente + sus productos). Todo sale de la base:
 * «novedades» = lo último que se cargó; «favoritos» = lo que el dueño marcó
 * con el badge «Favorito» en Productos; una línea = sus productos por marca.
 * Una sección sin productos no se dibuja.
 *
 * En el celular todo va en carriles (la grilla de 8 favoritos medía 4 filas)
 * y la foto de cada línea es la primera tarjeta de su carril; en escritorio,
 * la foto va al lado, en un arco (el espejo del salón).
 */
import { ArrowRight } from "@buleje/design-system/icons";
import { LINEAS } from "./anuncios";
import { Carril } from "./Carril";
import { fotoResponsiva } from "./imagenes";
import type { ProductoSalon } from "./datos";
import { rutas } from "./destinos";
import { TarjetaProducto } from "./TarjetaProducto";
import { ANCHO, TituloSeccion } from "./ui";

export function Novedades({ productos, slug }: { productos: ProductoSalon[]; slug: string }) {
  const nuevos = [...productos].sort((a, b) => b.id - a.id).slice(0, 10);
  if (nuevos.length === 0) return null;
  return (
    <section aria-labelledby="bb-novedades" className="pb-2 pt-9 sm:pb-8 sm:pt-20">
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
    <section aria-labelledby="bb-favoritos" className="noise-texture-bg bg-[var(--bb-papel)] py-9 sm:py-20">
      <div className={`${ANCHO} relative z-[1]`}>
        <TituloSeccion
          id="bb-favoritos"
          kicker="Elegidos en el salón"
          titulo="Favoritos de nuestras estilistas"
          texto="Lo que usamos todos los días en el salón, para que lo lleves a casa."
          centrado
        />
        {/* Celular y tablet: carril que se desliza (enfocable para el teclado); desde 768 px, grilla de 4. */}
        <div
          role="region"
          aria-label="Favoritos de nuestras estilistas"
          tabIndex={0}
          className="bb-sin-barra -mx-4 snap-x snap-mandatory scroll-px-4 overflow-x-auto px-4 pb-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)] sm:-mx-6 sm:scroll-px-6 sm:px-6 md:mx-0 md:overflow-visible md:px-0 md:pb-0"
        >
          <ol className="flex gap-3 sm:gap-5 md:grid md:grid-cols-4">
            {favoritos.map((p, i) => (
              <li key={p.id} className="flex w-[58%] shrink-0 snap-start flex-col sm:w-[31%] md:w-auto">
                <span aria-hidden="true" className="bb-num mb-2 flex items-center gap-3 text-[2.25rem] leading-none text-[var(--bb-vino)] sm:text-5xl">
                  {String(i + 1).padStart(2, "0")}
                  <span className="h-px flex-1 bg-[var(--rule-base)]" />
                </span>
                <div className="flex-1">
                  <TarjetaProducto p={p} />
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/** La foto de una línea con su nombre. `arco`: la versión de escritorio (arco alto al lado del carril). */
function FotoLinea({ l, href, arco }: { l: (typeof LINEAS)[number] & { items: ProductoSalon[] }; href: string; arco: boolean }) {
  return (
    <a
      href={href}
      className={`group relative h-full overflow-hidden bg-[var(--bb-rubor)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)] ${
        arco ? "hidden min-h-[30rem] rounded-b-3xl rounded-t-[11rem] lg:flex" : "flex min-h-[20rem] rounded-2xl rounded-t-[6.5rem]"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- ancho justo desde Unsplash (imagenes.ts); en dev next/image ignora el loader */}
      <img
        {...fotoResponsiva(l.foto, arco ? "22rem" : "(min-width: 640px) 31vw, 58vw")}
        alt={l.alt}
        className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
      />
      <span className="absolute inset-0 bg-linear-to-t from-[var(--bb-tinta)]/95 via-[var(--bb-tinta)]/45 to-transparent" aria-hidden="true" />
      <span className={`relative mt-auto flex flex-col gap-2 text-[var(--bb-sobre-tinta)] ${arco ? "p-7" : "p-4"}`}>
        <span className="text-sm font-semibold uppercase tracking-[var(--ls-wider)] text-[var(--bb-sobre-tinta-2)]">{l.kicker}</span>
        <span className={`bb-display leading-[0.95] ${arco ? "text-5xl" : "text-[2.1rem]"}`}>{l.titulo}</span>
        {arco && <span className="text-base leading-relaxed text-[var(--bb-sobre-tinta-2)]">{l.texto}</span>}
        <span className="mt-1 inline-flex items-center gap-2 self-start border-b-2 border-current pb-0.5 text-base font-semibold">
          Ver la línea <span className="bb-num text-lg">({l.items.length})</span>
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </span>
      </span>
    </a>
  );
}

export function Lineas({ productos, slug, nombre }: { productos: ProductoSalon[]; slug: string; nombre: string }) {
  const r = rutas(slug);
  const conProductos = LINEAS.map((l) => ({ ...l, items: productos.filter((p) => p.marca === l.marca) })).filter((l) => l.items.length > 0);
  if (conProductos.length === 0) return null;
  return (
    <section aria-labelledby="bb-lineas" className="py-9 sm:py-20">
      <div className={ANCHO}>
        <TituloSeccion id="bb-lineas" kicker={`Hechas por ${nombre}`} titulo="Nuestras líneas" />
        <div className="flex flex-col gap-8 sm:gap-16">
          {conProductos.map((l, i) => (
            <div
              key={l.marca}
              className={`grid gap-5 lg:gap-10 ${i % 2 ? "lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]" : "lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[22rem_minmax(0,1fr)]"}`}
            >
              <div className={`hidden lg:block ${i % 2 ? "lg:order-2" : ""}`}>
                <FotoLinea l={l} href={r.buscar(l.marca)} arco />
              </div>
              <div className={`min-w-0 lg:self-center ${i % 2 ? "lg:order-1" : ""}`}>
                <Carril etiqueta={`Productos de ${l.titulo}`} ancho="angosto" inicio={<FotoLinea l={l} href={r.buscar(l.marca)} arco={false} />}>
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
