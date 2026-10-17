/**
 * Encabezado de Musa (contrato §e): barra pegajosa sobre hueso —sello +
 * «Musa», buscador en píldora, asesoría, cuenta y la bolsa con su sello
 * contador— y, desde 768 px, el menú de categorías en kicker con el filete
 * rosa que crece desde el centro. En el celular la barra mide 56 px
 * (menú · sello + Musa · bolsa) y el buscador baja a su propia fila, que se
 * esconde al bajar y vuelve al subir (`EncabezadoVivo`).
 *
 * El buscador es un formulario GET al catálogo (`?q=`): funciona aunque el
 * JavaScript no haya cargado.
 *
 * También es el encabezado del resto de la tienda (marco, ADR-460): por eso
 * los enlaces llevan la ruta completa de la portada (`/t/<negocio>#mejorar`).
 * Fuera de la portada el logo NO es el <h1> (`logoEsTitulo={false}`): el
 * título de la página es el suyo (p. ej. la categoría del catálogo).
 */
import { ArrowRight, MessageCircle, Search } from "@buleje/design-system/icons";
import { MenuCuenta } from "@/components/store/cuenta/MenuCuenta";
import { CampoBuscar } from "./CampoBuscar";
import { enlaceWhatsapp, rutas } from "./destinos";
import { CONTACTO } from "./anuncios";
import { BolsaEncabezado, EncabezadoVivo } from "./EncabezadoVivo";
import { MenuMovil, type EnlaceMenu } from "./MenuMovil";
import { WHATSAPP_MUSA } from "./pedido-whatsapp";
import { Sello } from "./Sello";

const ASESORIA = "Hola Drucila, quiero asesoría para elegir mis productos.";

function Buscador({ id, catalogo, corto = false }: { id: string; catalogo: string; corto?: boolean }) {
  return (
    <form action={catalogo} method="get" role="search" className="relative w-full">
      <label htmlFor={id} className="sr-only">
        Buscar productos
      </label>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-[1.125rem] w-[1.125rem] -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden="true" />
      <CampoBuscar
        id={id}
        corto={corto}
        className="h-12 w-full rounded-full border border-transparent bg-[var(--surface-sunken)] pl-11 pr-12 text-base text-[var(--text-primary)] transition-colors duration-[var(--mu-dur-corto)] placeholder:text-[var(--text-tertiary)] hover:border-[var(--rule-base)] focus:border-[var(--rule-strong)] focus:bg-[var(--surface-raised)] focus:outline-2 focus:outline-offset-2 focus:outline-[var(--mu-foco)]"
      />
      {/* 44 px tocables; el círculo visible es de 32. El nombre va en `aria-label` (`.sr-only` de globals.css le gana a las variantes). */}
      <button type="submit" aria-label="Buscar" className="group absolute right-0 top-0 inline-flex h-12 w-12 items-center justify-center rounded-full mu-foco">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--mu-boton-fondo)] text-[var(--mu-boton-texto)] transition-colors duration-[var(--mu-dur-corto)] group-hover:bg-[var(--mu-boton-fondo-hover)]">
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </button>
    </form>
  );
}

/** Sin `display`: cada uso dice el suyo (`inline-flex` y `hidden` juntos los decide el orden del CSS, no el del string). */
const ICONO =
  "mu-foco h-12 w-12 items-center justify-center gap-2 rounded-full text-[var(--text-primary)] transition-colors duration-[var(--mu-dur-corto)] hover:bg-[var(--mu-nude-claro)]";

/**
 * Lo que va en el menú del celular: la tienda, tu cuenta y la asesoría (la
 * cuenta y la asesoría no entran en la barra de 56 px). «Regalos» (los kits de
 * la portada, `#ofertas`) va resaltado: antes decía «Ofertas» justo debajo de
 * «Kits y ofertas» y parecía repetido.
 */
function menuMovil(slug: string, categorias: string[], hayOfertas: boolean) {
  const r = rutas(slug);
  const tienda: EnlaceMenu[] = [
    ...(hayOfertas ? [{ texto: "Regalos", href: r.promociones, resaltado: true }] : []),
    { texto: "Todo Musa", href: r.catalogo },
    ...categorias.map((c) => ({ texto: c, href: r.categoria(c) })),
    { texto: "¿Qué quieres mejorar?", href: r.mejorar },
  ];
  const cuenta = [
    { texto: "Mi cuenta", href: `${r.base}/cuenta`, icono: "cuenta" as const },
    { texto: "Mis pedidos", href: `${r.base}/mis-pedidos`, icono: "pedidos" as const },
  ];
  return { tienda, cuenta, asesoria: { href: enlaceWhatsapp(WHATSAPP_MUSA, ASESORIA), horario: CONTACTO.horario } };
}

export function BarraSuperior({
  nombre,
  slug,
  logoEsTitulo = true,
  categorias = [],
  hayOfertas = true,
}: {
  nombre: string;
  slug: string;
  logoEsTitulo?: boolean;
  categorias?: string[];
  hayOfertas?: boolean;
}) {
  const r = rutas(slug);
  const Logo = logoEsTitulo ? "h1" : "p";
  const barra = (
    <div className="mx-auto grid h-14 max-w-[1280px] grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 sm:px-4 md:flex md:h-[4.5rem] md:gap-6 md:px-6 lg:px-8">
      <div className="justify-self-start md:hidden">
        <MenuMovil nombre={nombre} {...menuMovil(slug, categorias, hayOfertas)} />
      </div>
      <Logo className="m-0 shrink-0">
        <a href={r.base} className="mu-foco flex items-center gap-2.5 rounded-full leading-none text-[var(--text-primary)]">
          <Sello id={logoEsTitulo ? "barra" : "barra-marco"} simple className="h-10 w-10 shrink-0 md:h-12 md:w-12" />
          <span className="flex flex-col">
            <span className="mu-serif text-[1.375rem] leading-none md:text-[1.5rem]">{nombre}</span>
            {/* El espacio no se ve (contenedor flex) pero separa las palabras para el lector de pantalla. */}{" "}
            <span className="mt-1 hidden text-sm leading-tight text-[var(--text-tertiary)] lg:block">Belleza profesional, cerca de ti</span>
            <span className="sr-only lg:hidden"> — belleza profesional, cerca de ti</span>
          </span>
        </a>
      </Logo>
      <div className="mx-auto hidden w-full max-w-[36rem] md:block">
        <Buscador id="mu-buscar" catalogo={r.catalogo} />
      </div>
      <nav aria-label="Tu cuenta y tu bolsa" className="flex items-center gap-0.5 justify-self-end">
        <a
          href={enlaceWhatsapp(WHATSAPP_MUSA, ASESORIA)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Asesoría gratis por WhatsApp"
          className={`${ICONO} hidden md:inline-flex lg:w-auto lg:px-3.5`}
        >
          <MessageCircle className="h-5 w-5 text-[var(--mu-selva-tinta)]" strokeWidth={1.8} aria-hidden="true" />
          <span className="hidden text-base font-semibold lg:inline">Asesoría</span>
        </a>
        {/* Cuenta: abre el menú de cuenta de las tiendas (pedidos, puntos, datos, ayuda por WhatsApp). */}
        <MenuCuenta variante="icono" className="hidden md:block" claseBoton={`${ICONO} inline-flex`} whatsapp={WHATSAPP_MUSA} />
        <BolsaEncabezado />
      </nav>
    </div>
  );
  const buscador = (
    <div className="px-4 pb-2.5 pt-1">
      <Buscador id={logoEsTitulo ? "mu-buscar-movil" : "mu-buscar-movil-marco"} catalogo={r.catalogo} corto />
    </div>
  );
  return <EncabezadoVivo barra={barra} buscador={buscador} />;
}

/**
 * Desde 768 px: las categorías en tipo oración (15 px, peso 500), centradas, con el filete de tinta que
 * crece desde el centro al pasar. Al final, «Regalos» (los kits de la portada), igual que las demás.
 */
export function MenuCategorias({ slug, categorias, hayOfertas }: { slug: string; categorias: string[]; hayOfertas: boolean }) {
  const r = rutas(slug);
  // (`min-w-*` está muerto en este repo por `* { min-width: 0 }`: anchos con `w-*`.)
  const enlace =
    "mu-subrayado mu-foco inline-flex h-12 items-center whitespace-nowrap px-3 text-[0.9375rem] font-medium text-[var(--text-secondary)] transition-colors duration-[var(--mu-dur-corto)] hover:text-[var(--text-primary)] [--mu-subrayado-abajo:.6rem] xl:px-4";
  return (
    <div className="hidden border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] md:block">
      <nav aria-label="Categorías" className="mx-auto max-w-[1280px] px-6 lg:px-8">
        <ul className="mu-sin-barra flex justify-center-safe gap-1 overflow-x-auto">
          <li className="shrink-0">
            <a href={r.catalogo} className={enlace}>
              Todo Musa
            </a>
          </li>
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
            <li className="shrink-0">
              <a href={r.promociones} className={enlace}>
                Regalos
              </a>
            </li>
          )}
        </ul>
      </nav>
    </div>
  );
}
