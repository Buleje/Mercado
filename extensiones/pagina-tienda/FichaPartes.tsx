/**
 * Las partes de la ficha de un producto que no tienen estado y sirven en el
 * servidor (ADR-511; las de Musa sin envases ilustrados ni preventa): migas,
 * la foto grande, el precio con lo que ahorras, las existencias, el esqueleto
 * y el «no lo encontramos».
 *
 * · Sin foto (`imagen: ""`): el ícono sobre el gris, nunca un `<img src="">`.
 * · Sin existencias cargadas (`stock: null`): no se dice nada (ni «agotado» ni «disponible»).
 */
import type { ProductoTienda } from "./contenido";
import { Descuento, FotoProducto, Insignia, POCAS, TarjetaProducto } from "./TarjetaProducto";
import { ANCHO, BOTON, BOTON_BORDE, ENLACE_VER, SECCION, TITULO_BLOQUE, rutasTienda, solesCortos } from "./ui";

export interface Miga {
  nombre: string;
  href?: string;
}

const MIGA = "ti-foco rounded-sm underline-offset-4 hover:text-[var(--ti-texto)] hover:underline";

/** Inicio / categoría / producto. El último no es enlace: es donde estás. */
export function Migas({ items }: { items: Miga[] }) {
  return (
    <nav aria-label="Estás en" className="text-[length:var(--ti-t-chico)] text-[var(--ti-texto-2)]">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((m, i) => (
          <li key={`${i}-${m.nombre}`} className="inline-flex min-w-0 items-center gap-x-2">
            {i > 0 && <span aria-hidden="true">/</span>}
            {m.href ? (
              <a href={m.href} className={MIGA}>
                {m.nombre}
              </a>
            ) : (
              <span aria-current="page" className="truncate font-medium text-[var(--ti-texto)]">
                {m.nombre}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * La foto grande en su panel gris (cuadrada; en el celular un poco más baja,
 * así el nombre y el precio asoman en la primera pantalla). Pegada al bajar
 * desde 1024 px, mientras la columna de compra sigue.
 */
export function Galeria({ p }: { p: ProductoTienda }) {
  return (
    <div className="lg:sticky lg:top-28 lg:self-start">
      <div data-ti-foto className="relative">
        <span className="relative block aspect-[6/5] overflow-hidden rounded-[var(--ti-radio-tarjeta)] bg-[var(--ti-suave)] sm:aspect-square">
          <FotoProducto src={p.imagen} alt={p.nombre} prioridad tamanos="(min-width:1024px) 600px, 100vw" icono="h-[22%] w-[22%]" />
        </span>
        {(p.descuento || p.etiqueta) && (
          <span className="absolute left-4 top-4 flex flex-col items-start gap-2">
            {p.descuento ? <Descuento n={p.descuento} grande /> : null}
            {p.etiqueta && <Insignia texto={p.etiqueta} grande />}
          </span>
        )}
      </div>
    </div>
  );
}

/** El precio grande, el de antes tachado y cuánto ahorras (resta de dos precios del servidor; el total lo pone el checkout). */
export function Precio({ p }: { p: ProductoTienda }) {
  return (
    <div className="mt-5">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="ti-nombre text-[2rem] leading-none tabular-nums text-[var(--ti-texto)] sm:text-[2.25rem]">{solesCortos(p.precio)}</span>
        {p.antes && (
          <span className="text-lg tabular-nums text-[var(--ti-texto-3)] line-through">
            <span className="sr-only">Antes </span>
            {solesCortos(p.antes)}
          </span>
        )}
      </p>
      {p.antes && p.antes > p.precio && (
        <p className="mt-2 text-[length:var(--ti-t-chico)] font-semibold text-[var(--ti-acento)]">Ahorras {solesCortos(Math.round((p.antes - p.precio) * 100) / 100)}</p>
      )}
      <p className="mt-1 text-sm text-[var(--ti-texto-3)]">
        Precio en soles{p.unidad && p.unidad !== "unidad" ? ` por ${p.unidad}` : ""}.
      </p>
    </div>
  );
}

export function Existencias({ stock }: { stock: number | null }) {
  if (stock === null) return null;
  const [texto, tono] =
    stock <= 0 ? ["Agotado por ahora", "text-[var(--ti-texto-2)]"] : stock <= POCAS ? [`¡Quedan ${stock}!`, "font-semibold text-[var(--ti-acento)]"] : ["Disponible", "text-[var(--ti-texto)]"];
  return (
    <p className={`mt-4 inline-flex items-center gap-2 text-[length:var(--ti-t-chico)] ${tono}`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${stock > 0 ? "bg-current" : "bg-[var(--ti-linea)]"}`} />
      {texto}
    </p>
  );
}

/** «Más de pizzas»: hasta 4 de la misma categoría (o, si no hay, los primeros del negocio). */
export function Relacionados({ productos, titulo, verTodo }: { productos: ProductoTienda[]; titulo: string; verTodo: { href: string; texto: string } }) {
  if (productos.length === 0) return null;
  return (
    <section aria-labelledby="ti-relacionados" className={`${ANCHO} ${SECCION}`}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <h2 id="ti-relacionados" className={`${TITULO_BLOQUE} break-words`}>
          {titulo}
        </h2>
        <a href={verTodo.href} className={ENLACE_VER}>
          {verTodo.texto}
        </a>
      </div>
      <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4 lg:gap-x-6">
        {productos.map((x) => (
          <li key={x.id} className="min-w-0">
            <TarjetaProducto p={x} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Mientras llegan los datos: las migas, la foto y la columna de compra. */
export function EsqueletoFicha() {
  const linea = "animate-pulse rounded bg-[var(--ti-suave)]";
  return (
    <div aria-busy="true" aria-label="Cargando el producto" role="status" className={`${ANCHO} pb-14 pt-6 sm:pt-8`}>
      <div className={`${linea} h-4 w-64 max-w-full`} />
      <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-14">
        <div className="aspect-[6/5] animate-pulse rounded-[var(--ti-radio-tarjeta)] bg-[var(--ti-suave)] sm:aspect-square" />
        <div className="flex flex-col gap-4 pt-2">
          <div className={`${linea} h-4 w-32`} />
          <div className={`${linea} h-10 w-4/5`} />
          <div className={`${linea} h-12 w-36`} />
          <div className={`${linea} h-24 w-full`} />
          <div className="h-12 w-full animate-pulse rounded-[var(--ti-radio-control)] bg-[var(--ti-suave)]" />
        </div>
      </div>
    </div>
  );
}

/** El enlace no lleva a un producto de la tienda: qué pasó, adónde ir y unos sugeridos. */
export function NoEncontrado({ nombre, slug, sugeridos }: { nombre: string; slug: string; sugeridos: ProductoTienda[] }) {
  const r = rutasTienda(slug);
  return (
    <main id="main-content">
      <div className={`${ANCHO} py-8 sm:py-12`}>
        <div className="flex flex-col items-center rounded-[var(--ti-radio-tarjeta)] bg-[var(--ti-suave)] px-6 py-14 text-center sm:py-20">
          <p className="ti-kicker text-[var(--ti-texto-3)]">Error 404</p>
          <h1 className="ti-titulo mt-2 max-w-2xl text-[length:var(--ti-t-bloque)] text-[var(--ti-texto)]">No encontramos este producto</h1>
          <p className="mt-3 max-w-lg text-[length:var(--ti-t-cuerpo)] leading-relaxed text-[var(--ti-texto-2)]">
            Puede que ya no esté a la venta o que el enlace esté incompleto. Mira lo que sí tenemos en {nombre}.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href={r.catalogo} className={BOTON}>
              Ver el catálogo
            </a>
            <a href={r.base} className={BOTON_BORDE}>
              Ir al inicio
            </a>
          </div>
        </div>
      </div>
      <Relacionados productos={sugeridos} titulo="Te puede gustar" verTodo={{ href: r.catalogo, texto: "Ver todo el catálogo" }} />
    </main>
  );
}
