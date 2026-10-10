/**
 * Encabezado de Musa: barra pegajosa (sello, buscador, asesoría, cuenta y
 * bolsa) + menú de categorías. El buscador es un formulario GET al catálogo
 * (`?q=`): funciona aunque el JavaScript no haya cargado.
 *
 * Van como DOS hermanos (no dentro de un <header> bajito) porque `sticky`
 * sólo pega dentro de su padre: el padre es la página entera.
 *
 * También es el encabezado del resto de la tienda (marco, ADR-460): por eso
 * «Ofertas» lleva la ruta completa de la portada
 * (`/t/<negocio>#servicios`), que en la portada misma sólo baja hasta ahí.
 * Fuera de la portada el logo NO es el <h1> (`logoEsTitulo={false}`): el
 * título de la página es el suyo (p. ej. la categoría del catálogo).
 */
import { ArrowRight, MessageCircle, Search, User } from "@buleje/design-system/icons";
import { BotonBolsa } from "./Bolsa";
import { CampoBuscar } from "./CampoBuscar";
import { enlaceWhatsapp, rutas } from "./destinos";
import { WHATSAPP_MUSA } from "./pedido-whatsapp";
import { Sello } from "./Sello";

function Buscador({ id, catalogo }: { id: string; catalogo: string }) {
  return (
    <form action={catalogo} method="get" role="search" className="relative w-full">
      <label htmlFor={id} className="sr-only">
        Buscar productos
      </label>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden="true" />
      {/* En el celular el botón es sólo la flecha (el texto del campo necesita el ancho); desde 640 px dice «Buscar». */}
      <CampoBuscar
        id={id}
        className="h-12 w-full rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] pl-12 pr-14 text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--text-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--mu-nude)] sm:pr-28"
      />
      {/* (`sr-only sm:not-sr-only` NO sirve acá: globals.css define `.sr-only` fuera de las capas y
          le gana a cualquier variante; medido 08-10. Por eso el nombre va en `aria-label`.) */}
      <button
        type="submit"
        aria-label="Buscar"
        className="absolute right-1.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--text-primary)] text-sm font-semibold text-[var(--surface-canvas)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:w-auto sm:px-4"
      >
        <ArrowRight className="h-4 w-4 sm:hidden" aria-hidden="true" />
        <span className="hidden sm:inline">Buscar</span>
      </button>
    </form>
  );
}

const ICONO =
  "inline-flex h-11 w-11 items-center justify-center gap-2 rounded-full text-[var(--text-primary)] transition hover:bg-[var(--mu-nude-claro)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

export function BarraSuperior({ nombre, slug, logoEsTitulo = true }: { nombre: string; slug: string; logoEsTitulo?: boolean }) {
  const r = rutas(slug);
  const Logo = logoEsTitulo ? "h1" : "p";
  return (
    <div className="sticky top-0 z-40 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)]/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-3 px-4 sm:h-20 sm:gap-6 sm:px-6 lg:px-8">
        <Logo className="m-0 shrink-0">
          <a href={r.base} className="flex items-center gap-2.5 leading-none text-[var(--text-primary)]">
            <Sello id={logoEsTitulo ? "barra" : "barra-marco"} className="h-11 w-11 shrink-0 sm:h-14 sm:w-14" />
            <span className="flex flex-col">
              <span className="mu-display text-[1.6rem] tracking-[0.18em] sm:text-[2rem]">{nombre}</span>
              {/* El espacio no se ve (contenedor flex) pero separa las palabras para el lector de pantalla. */}{" "}
              <span className="mt-0.5 hidden text-[0.6875rem] font-medium tracking-[0.08em] text-[var(--mu-acento-tinta)] sm:block">
                Belleza profesional, cerca de ti
              </span>
              <span className="sr-only sm:hidden"> — belleza profesional, cerca de ti</span>
            </span>
          </a>
        </Logo>
        <div className="mx-auto hidden w-full max-w-[34rem] md:block">
          <Buscador id="mu-buscar" catalogo={r.catalogo} />
        </div>
        <nav aria-label="Tu cuenta y tu bolsa" className="ml-auto flex items-center gap-0.5 md:ml-0">
          <a
            href={enlaceWhatsapp(WHATSAPP_MUSA, "Hola Drucila, quiero asesoría para elegir mis productos.")}
            target="_blank"
            rel="noopener noreferrer"
            className={`${ICONO} lg:w-auto lg:px-3`}
          >
            <MessageCircle className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
            <span className="hidden text-base font-semibold lg:inline">Asesoría gratis</span>
            <span className="sr-only lg:hidden">Asesoría gratis por WhatsApp</span>
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
  // En el celular son píldoras con borde que se deslizan (con imán y el borde derecho desvanecido:
  // se ve que sigue, sin cortar una palabra en seco); desde 768 px, versalitas centradas sin borde.
  const forma =
    "inline-flex h-11 snap-start items-center whitespace-nowrap rounded-full border px-4 text-base font-semibold transition hover:bg-[var(--mu-nude-claro)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)] md:border-transparent md:px-3 md:text-sm md:uppercase md:tracking-[0.12em] xl:px-4 xl:tracking-[0.14em]";
  const enlace = `${forma} border-[var(--rule-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]`;
  return (
    <div className="border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)]">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
        <div className="pt-2 md:hidden">
          <Buscador id="mu-buscar-movil" catalogo={r.catalogo} />
        </div>
        <nav aria-label="Categorías">
          <ul className="mu-sin-barra mu-desvanecer mu-desvanecer-movil -mx-4 flex snap-x snap-proximity scroll-px-4 gap-2 overflow-x-auto px-4 py-2 md:mx-0 md:justify-center-safe md:gap-1 md:px-0">
            {categorias.map((c) => (
              <li key={c} className="shrink-0">
                <a href={r.categoria(c)} className={enlace}>
                  {c}
                </a>
              </li>
            ))}
            <li className="shrink-0">
              <a href={r.mejorar} className={enlace}>
                ¿Qué quieres mejorar?
              </a>
            </li>
            {hayOfertas && (
              <li className="shrink-0 pr-8 md:pr-0">
                <a href={r.promociones} className={`${forma} border-[var(--mu-acento-tinta)]/40 text-[var(--mu-acento-tinta)]`}>
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
