/**
 * Lo que va debajo de la ficha del salón (ADR-460): los pasos («Cómo usarlo» o
 * «Así reservas»), «Completa tu rutina» (o los otros servicios), el «no lo
 * encontramos» dentro del marco y el esqueleto de carga.
 */
import { Clock, Sparkles } from "@buleje/design-system/icons";
import { Carril } from "./Carril";
import type { ProductoSalon } from "./datos";
import { rutas, soles } from "./destinos";
import { TarjetaProducto } from "./TarjetaProducto";
import { ANCHO, BOTON, BOTON_BORDE, KICKER, TituloSeccion } from "./ui";

export function Pasos({ kicker, titulo, pasos }: { kicker: string; titulo: string; pasos: readonly string[] }) {
  if (pasos.length === 0) return null;
  return (
    <section aria-labelledby="mu-pasos" className="bg-[var(--mu-hueso)] py-14 sm:py-20">
      <div className={ANCHO}>
        <TituloSeccion id="mu-pasos" kicker={kicker} titulo={titulo} />
        <ol className="grid gap-4 sm:grid-cols-3 sm:gap-5">
          {pasos.map((t, i) => (
            <li key={t} className="flex gap-4 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-6 sm:flex-col sm:gap-3">
              <span aria-hidden="true" className="mu-serif text-5xl leading-none text-[var(--mu-acento-tinta)]">
                {i + 1}
              </span>
              <p className="text-base leading-relaxed text-[var(--text-secondary)]">{t}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Una fila de tarjetas del salón (las mismas del catálogo, con «Agregar»). */
export function Rutina({ productos, kicker, titulo, verTodo }: { productos: ProductoSalon[]; kicker: string; titulo: string; verTodo?: { href: string; texto: string } }) {
  if (productos.length === 0) return null;
  return (
    <section aria-labelledby="mu-rutina" className="py-14 sm:py-20">
      <div className={ANCHO}>
        <TituloSeccion id="mu-rutina" kicker={kicker} titulo={titulo} {...(verTodo ? { verTodo } : {})} />
        <Carril etiqueta={titulo}>
          {productos.map((x) => (
            <TarjetaProducto key={x.id} p={x} />
          ))}
        </Carril>
      </div>
    </section>
  );
}

/** En la ficha de un servicio: los demás, cada uno a su ficha. */
export function OtrosServicios({ servicios, slug }: { servicios: ProductoSalon[]; slug: string }) {
  if (servicios.length === 0) return null;
  return (
    <section aria-labelledby="mu-otros" className="py-14 sm:py-20">
      <div className={ANCHO}>
        <TituloSeccion id="mu-otros" kicker="Salón" titulo="Otros servicios" verTodo={{ href: rutas(slug).servicios, texto: "Ver todos los servicios" }} />
        <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          {servicios.map((s) => (
            <li key={s.id}>
              <a
                href={s.href}
                className="flex h-full flex-col gap-2 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <span className="text-lg font-semibold leading-snug text-[var(--text-primary)]">{s.nombre}</span>
                <span className="mt-auto flex flex-wrap items-center gap-x-3 text-base text-[var(--text-secondary)]">
                  {s.duracion && (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-4 w-4" aria-hidden="true" /> {s.duracion}
                    </span>
                  )}
                  <span className="font-bold tabular-nums text-[var(--text-primary)]">{soles(s.precio)}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * Un producto que no es del salón (la bodega de prueba de `main`), está oculto
 * o no existe: «no lo encontramos» DENTRO del marco — nunca la ficha general.
 */
export function NoEncontrado({ nombre, slug, sugeridos }: { nombre: string; slug: string; sugeridos: ProductoSalon[] }) {
  const r = rutas(slug);
  return (
    <main id="main-content">
      <div className={`${ANCHO} py-8 sm:py-12`}>
        <div className="flex flex-col items-center rounded-3xl bg-[var(--mu-nude-claro)] px-6 py-14 text-center sm:py-20">
          <Sparkles className="h-10 w-10 text-[var(--mu-acento-tinta)]" strokeWidth={1.4} aria-hidden="true" />
          <p className={`${KICKER} mt-4`}>Error 404</p>
          <h1 className="mu-serif mt-2 max-w-2xl text-4xl leading-tight text-[var(--text-primary)] sm:text-5xl">No encontramos este producto</h1>
          <p className="mt-3 max-w-lg text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
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
      <Rutina productos={sugeridos} kicker={`Tienda ${nombre}`} titulo="Te puede gustar" verTodo={{ href: r.ofertas, texto: "Ver ofertas" }} />
    </main>
  );
}

/** Mientras llegan los datos: las migas, la foto y la columna de compra. */
export function EsqueletoFicha() {
  const linea = "animate-pulse rounded bg-[var(--mu-nude)]";
  return (
    <div aria-busy="true" aria-label="Cargando el producto" role="status" className={`${ANCHO} pb-14 pt-6 sm:pt-8`}>
      <div className={`${linea} h-5 w-64`} />
      <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-14">
        <div className="aspect-square animate-pulse rounded-3xl bg-[var(--mu-nude-claro)]" />
        <div className="flex flex-col gap-4 pt-2">
          <div className={`${linea} h-5 w-32`} />
          <div className={`${linea} h-14 w-4/5`} />
          <div className={`${linea} h-10 w-44`} />
          <div className={`${linea} h-20 w-full`} />
          <div className="h-12 w-full animate-pulse rounded-full bg-[var(--mu-nude-claro)]" />
          <div className="h-12 w-full animate-pulse rounded-full bg-[var(--mu-nude-claro)]" />
        </div>
      </div>
    </div>
  );
}
