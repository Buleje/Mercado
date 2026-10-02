/**
 * Encabezado del salón: barra pegajosa (logo, buscador, reservar, cuenta y
 * bolsa) + menú de categorías. El buscador es un formulario GET al catálogo
 * (`?q=`): funciona aunque el JavaScript no haya cargado.
 *
 * Van como DOS hermanos (no dentro de un <header> bajito) porque `sticky`
 * sólo pega dentro de su padre: el padre es la página entera.
 *
 * También es el encabezado del resto de la tienda (marco, ADR-460): por eso
 * «Reservar cita» y «Ofertas» llevan la ruta completa de la portada
 * (`/t/<negocio>#servicios`), que en la portada misma sólo baja hasta ahí.
 * Fuera de la portada el logo NO es el <h1> (`logoEsTitulo={false}`): el
 * título de la página es el suyo (p. ej. la categoría del catálogo).
 */
import { Scissors, Search, User } from "@buleje/design-system/icons";
import { BotonBolsa } from "./Bolsa";
import { CampoBuscar } from "./CampoBuscar";
import { rutas } from "./destinos";

function Buscador({ id, catalogo }: { id: string; catalogo: string }) {
  return (
    <form action={catalogo} method="get" role="search" className="relative w-full">
      <label htmlFor={id} className="sr-only">
        Buscar productos
      </label>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden="true" />
      <CampoBuscar
        id={id}
        className="h-12 w-full rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] pl-12 pr-28 text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--text-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--bb-rubor-2)]"
      />
      <button
        type="submit"
        className="absolute right-1.5 top-1/2 h-9 -translate-y-1/2 rounded-full bg-[var(--text-primary)] px-4 text-sm font-semibold text-[var(--surface-canvas)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        Buscar
      </button>
    </form>
  );
}

const ICONO =
  "inline-flex h-11 w-11 items-center justify-center gap-2 rounded-full text-[var(--text-primary)] transition hover:bg-[var(--bb-rubor)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

export function BarraSuperior({ nombre, slug, logoEsTitulo = true }: { nombre: string; slug: string; logoEsTitulo?: boolean }) {
  const r = rutas(slug);
  const [primera, ...resto] = nombre.trim().split(/\s+/);
  const Logo = logoEsTitulo ? "h1" : "p";
  return (
    <div className="sticky top-0 z-40 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)]/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-3 px-4 sm:h-20 sm:gap-6 sm:px-6 lg:px-8">
        <Logo className="m-0 shrink-0">
          <a href={r.base} className="flex flex-col leading-none text-[var(--text-primary)]">
            <span className="bb-serif text-[1.85rem] tracking-tight sm:text-[2.15rem]">{primera}</span>
            {/* El espacio no se ve (contenedor flex) pero separa las palabras para el lector de pantalla. */}{" "}
            {resto.length > 0 && (
              <span className="mt-0.5 pl-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.46em] text-[var(--bb-vino)]">{resto.join(" ")}</span>
            )}
            <span className="sr-only"> — salón y cosmética capilar</span>
          </a>
        </Logo>
        <div className="mx-auto hidden w-full max-w-[34rem] md:block">
          <Buscador id="bb-buscar" catalogo={r.catalogo} />
        </div>
        <nav aria-label="Tu cuenta y tu bolsa" className="ml-auto flex items-center gap-0.5 md:ml-0">
          <a href={r.servicios} className={`${ICONO} lg:w-auto lg:px-3`}>
            <Scissors className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
            <span className="hidden text-base font-semibold lg:inline">Reservar cita</span>
            <span className="sr-only lg:hidden">Reservar cita</span>
          </a>
          <a href={`${r.base}/cuenta`} className={ICONO} aria-label="Mi cuenta">
            <User className="h-6 w-6" strokeWidth={1.6} aria-hidden="true" />
          </a>
          <BotonBolsa />
        </nav>
      </div>
    </div>
  );
}

export function MenuCategorias({ slug, categorias, hayOfertas }: { slug: string; categorias: string[]; hayOfertas: boolean }) {
  const r = rutas(slug);
  // (`min-w-*` está muerto en este repo por `* { min-width: 0 }`: anchos con `w-*`.)
  // El color va aparte: dos `text-[…]` en la misma clase los decide el orden del CSS, no el del string.
  const forma =
    "inline-flex h-11 items-center whitespace-nowrap rounded-full px-4 text-base font-semibold transition hover:bg-[var(--bb-rubor)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] md:px-3 md:text-sm md:uppercase md:tracking-[0.12em] xl:px-4 xl:tracking-[0.14em]";
  const enlace = `${forma} text-[var(--text-secondary)] hover:text-[var(--text-primary)]`;
  return (
    <div className="border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)]">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
        <div className="pt-3 md:hidden">
          <Buscador id="bb-buscar-movil" catalogo={r.catalogo} />
        </div>
        <nav aria-label="Categorías">
          <ul className="bb-sin-barra -mx-4 flex gap-1 overflow-x-auto px-4 py-2 md:mx-0 md:justify-center-safe md:px-0">
            {categorias.map((c) => (
              <li key={c} className="shrink-0">
                <a href={r.categoria(c)} className={enlace}>
                  {c}
                </a>
              </li>
            ))}
            <li className="shrink-0">
              <a href={r.servicios} className={enlace}>
                Servicios
              </a>
            </li>
            {hayOfertas && (
              <li className="shrink-0">
                <a href={r.promociones} className={`${forma} text-[var(--bb-vino)]`}>
                  Ofertas
                </a>
              </li>
            )}
          </ul>
        </nav>
      </div>
    </div>
  );
}
