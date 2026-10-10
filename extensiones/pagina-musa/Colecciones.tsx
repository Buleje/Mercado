/**
 * Las filas de producto de la portada. Todo sale de la base:
 * · `Novedades` — «Todo Musa, para ti»: los productos sueltos (los kits y dúos ya
 *   tienen su sección), en el orden del menú (cabello → rostro → cuerpo) y, dentro,
 *   por código (MU001, MU002…), como el catálogo impreso. Carril con imán.
 * · `Favoritos` — lo que el dueño marcó con el badge «Favorito» (sin marcas, no sale).
 * · `Lineas` — líneas propias por marca (Musa vende por necesidad: hoy no sale).
 * Las tarjetas son las del catálogo (`TarjetaProducto`: ilustración, contador).
 */
import { ArrowRight } from "@buleje/design-system/icons";
import { CATEGORIAS, LINEAS } from "./anuncios";
import { Carril } from "./Carril";
import type { ProductoSalon } from "./datos";
import { rutas } from "./destinos";
import { fotoResponsiva } from "./imagenes";
import { Cabecera, FOCO, KICKER } from "./Salon";
import { TarjetaProducto } from "./TarjetaProducto";
import { ANCHO } from "./ui";

const ORDEN_CATEGORIA: readonly string[] = CATEGORIAS.map((c) => c.nombre);

function VerTodo({ href, texto }: { href: string; texto: string }) {
  return (
    <a href={href} className={`group inline-flex h-11 items-center gap-2 self-start border-b border-[var(--text-primary)] text-[15px] font-semibold text-[var(--text-primary)] ${FOCO}`}>
      {texto}
      <ArrowRight className="h-4 w-4 transition-transform duration-[var(--mu-dur-corto)] group-hover:translate-x-1" aria-hidden="true" />
    </a>
  );
}

export function Novedades({ productos, slug }: { productos: readonly ProductoSalon[]; slug: string }) {
  const sueltos = productos
    .filter((p) => !p.kit && p.categoria !== "Kits y ofertas")
    .sort((a, b) => ORDEN_CATEGORIA.indexOf(a.categoria) - ORDEN_CATEGORIA.indexOf(b.categoria) || (a.codigo ?? "").localeCompare(b.codigo ?? "") || a.id - b.id);
  if (sueltos.length === 0) return null;
  return (
    <section aria-labelledby="mu-novedades" className="py-12 sm:py-24">
      <div className={ANCHO}>
        <Cabecera
          id="mu-novedades"
          kicker="Cabello · Rostro · Cuerpo"
          titulo="Todo Musa"
          cursiva="para ti"
          texto="Pide por código o agrégalo a tu bolsa: Drucila te confirma por WhatsApp."
          accion={<VerTodo href={rutas(slug).catalogo} texto={`Ver el catálogo (${productos.length})`} />}
        />
        <Carril etiqueta="Todo Musa">
          {sueltos.map((p, i) => (
            <TarjetaProducto key={p.id} p={p} prioridad={i < 2} />
          ))}
        </Carril>
      </div>
    </section>
  );
}

export function Favoritos({ productos }: { productos: readonly ProductoSalon[] }) {
  const favoritos = productos.filter((p) => p.etiqueta?.toLowerCase() === "favorito").slice(0, 8);
  if (favoritos.length === 0) return null;
  return (
    <section aria-labelledby="mu-favoritos" className="bg-[var(--mu-rosa-claro)] py-12 sm:py-24">
      <div className={ANCHO}>
        <Cabecera id="mu-favoritos" kicker="Elegidos por Drucila" titulo="Sus favoritos" script="para la selva" centrado />
        <div
          role="region"
          aria-label="Los favoritos de Drucila"
          tabIndex={0}
          className={`mu-sin-barra -mx-4 snap-x snap-mandatory scroll-px-4 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:scroll-px-6 sm:px-6 md:mx-0 md:overflow-visible md:px-0 md:pb-0 ${FOCO}`}
        >
          <ol className="flex gap-4 md:grid md:grid-cols-4 md:gap-6">
            {favoritos.map((p, i) => (
              <li key={p.id} className="flex w-[58%] shrink-0 snap-start flex-col sm:w-[31%] md:w-auto">
                <span aria-hidden="true" className="mu-num mb-2 flex items-center gap-3 text-[40px] leading-none text-[var(--mu-oro-tinta)]">
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

type Linea = (typeof LINEAS)[number] & { items: ProductoSalon[] };

/** La foto de una línea con su nombre, en arco (sólo escritorio: en el celular, el carril va solo). */
function FotoLinea({ l, href }: { l: Linea; href: string }) {
  return (
    <a href={href} className={`group relative hidden h-full min-h-[30rem] overflow-hidden rounded-b-2xl rounded-t-[999px] bg-[var(--mu-nude-claro)] focus-visible:rounded-b-2xl! focus-visible:rounded-t-[999px]! lg:flex ${FOCO}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- ancho justo desde Unsplash (imagenes.ts); en dev next/image ignora el loader */}
      <img {...fotoResponsiva(l.foto, "22rem")} alt={l.alt} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]" />
      <span className="absolute inset-0 bg-[var(--mu-cacao)]/55" aria-hidden="true" />
      <span className="relative mt-auto flex flex-col gap-2 p-7 text-[var(--mu-sobre-cacao)]">
        <span className={`${KICKER} text-[var(--mu-oro)]`}>{l.kicker}</span>
        <span className="mu-display text-5xl leading-[0.95]">{l.titulo}</span>
        <span className="text-[15px] leading-relaxed text-[var(--mu-sobre-cacao-2)]">{l.texto}</span>
      </span>
    </a>
  );
}

export function Lineas({ productos, slug, nombre }: { productos: readonly ProductoSalon[]; slug: string; nombre: string }) {
  const r = rutas(slug);
  const conProductos: Linea[] = LINEAS.map((l) => ({ ...l, items: productos.filter((p) => p.marca === l.marca) })).filter((l) => l.items.length > 0);
  if (conProductos.length === 0) return null;
  return (
    <section aria-labelledby="mu-lineas" className="py-12 sm:py-24">
      <div className={ANCHO}>
        <Cabecera id="mu-lineas" kicker={`Hechas por ${nombre}`} titulo="Nuestras líneas" />
        <div className="flex flex-col gap-10 sm:gap-16">
          {conProductos.map((l, i) => (
            <div key={l.marca} className={`grid gap-6 lg:gap-10 ${i % 2 ? "lg:grid-cols-[minmax(0,1fr)_20rem]" : "lg:grid-cols-[20rem_minmax(0,1fr)]"}`}>
              <div className={i % 2 ? "lg:order-2" : ""}>
                <FotoLinea l={l} href={r.buscar(l.marca)} />
              </div>
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
