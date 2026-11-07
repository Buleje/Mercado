/**
 * El encabezado de la tienda (como el de Musa, `pagina-musa/Encabezado.tsx`):
 * barra pegajosa —sello + nombre del negocio, buscador en píldora, WhatsApp
 * (sólo si hay número), cuenta y la bolsa con su contador— y, desde 768 px,
 * el menú de categorías con el filete que crece desde el centro. En el celular
 * la barra mide 56 px (menú · sello + nombre · bolsa) y el buscador baja a su
 * propia fila, que se esconde al bajar y vuelve al subir (`EncabezadoVivo`).
 *
 * El buscador es un formulario GET al catálogo (`?q=`): anda sin JavaScript.
 * También es el encabezado del resto de la tienda (marco): fuera de la portada
 * el nombre NO es el <h1> (`logoEsTitulo={false}`).
 */
import { ArrowRight, MessageCircle, Search } from "@buleje/design-system/icons";
import { MenuCuenta } from "@/components/store/cuenta/MenuCuenta";
import type { NegocioTienda } from "./contenido";
import { EncabezadoMenu, type EnlaceMenu } from "./EncabezadoMenu";
import { BolsaEncabezado, CampoBuscar, EncabezadoVivo } from "./EncabezadoVivo";
import type { CategoriaEnlace } from "./Pie";
import { Sello } from "./Sello";
import { EXTERNO, ICONO, enlaceWhatsapp, rutasTienda } from "./ui";

type NegocioEncabezado = Pick<NegocioTienda, "slug" | "nombre" | "lema" | "logo" | "whatsapp" | "horario">;

function Buscador({ id, catalogo }: { id: string; catalogo: string }) {
  return (
    <form action={catalogo} method="get" role="search" className="relative w-full">
      <label htmlFor={id} className="sr-only">
        Buscar productos
      </label>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-[1.125rem] w-[1.125rem] -translate-y-1/2 text-[var(--ti-texto-3)]" aria-hidden="true" />
      <CampoBuscar
        id={id}
        className="h-12 w-full rounded-full border border-transparent bg-[var(--ti-suave)] pl-11 pr-12 text-base text-[var(--ti-texto)] transition-colors duration-[var(--ti-dur-corto)] placeholder:text-[var(--ti-texto-3)] hover:border-[var(--ti-linea)] focus:border-[var(--ti-texto)] focus:bg-[var(--ti-fondo)] focus:outline-2 focus:outline-offset-2 focus:outline-[var(--ti-texto)]"
      />
      {/* 48 px tocables; el círculo visible es de 32. */}
      <button type="submit" aria-label="Buscar" className="ti-foco group absolute right-0 top-0 inline-flex h-12 w-12 items-center justify-center rounded-full">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ti-acento)] text-[var(--ti-sobre-acento)] transition-colors duration-[var(--ti-dur-corto)] group-hover:bg-[color-mix(in_srgb,var(--ti-acento)_72%,var(--ti-texto-2))]">
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </button>
    </form>
  );
}

const mensajeWhatsapp = (nombre: string) => `Hola ${nombre}, tengo una consulta.`;

export function BarraSuperior({
  negocio,
  categorias,
  hayOfertas,
  logoEsTitulo = true,
}: {
  negocio: NegocioEncabezado;
  categorias: readonly CategoriaEnlace[];
  hayOfertas: boolean;
  logoEsTitulo?: boolean;
}) {
  const r = rutasTienda(negocio.slug);
  const Logo = logoEsTitulo ? "h1" : "p";
  const wa = negocio.whatsapp ? enlaceWhatsapp(negocio.whatsapp, mensajeWhatsapp(negocio.nombre)) : null;
  const tienda: EnlaceMenu[] = [
    { texto: "Todo", href: r.catalogo },
    ...(hayOfertas ? [{ texto: "Ofertas", href: r.ofertas }] : []),
    ...categorias.slice(0, 12).map((c) => ({ texto: c.nombre, href: r.categoria(c.categoria) })),
  ];
  const sufijo = logoEsTitulo ? "" : "-marco";

  const barra = (
    <div className="mx-auto grid h-14 max-w-[1280px] grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 sm:px-4 md:flex md:h-[4.5rem] md:gap-6 md:px-6 lg:px-8">
      <div className="justify-self-start md:hidden">
        <EncabezadoMenu
          nombre={negocio.nombre}
          logo={negocio.logo}
          tienda={tienda}
          cuenta={{ mi: `${r.base}/cuenta`, pedidos: `${r.base}/mis-pedidos` }}
          whatsapp={wa}
          horario={negocio.horario}
        />
      </div>
      <Logo className="m-0 max-w-full md:shrink-0">
        <a href={r.base} className="ti-foco flex max-w-full items-center gap-2.5 overflow-hidden rounded-full leading-none text-[var(--ti-texto)] md:max-w-[22rem]">
          <Sello nombre={negocio.nombre} logo={negocio.logo} className="h-10 w-10 md:h-12 md:w-12" />
          <span className="flex flex-col overflow-hidden">
            <span className="ti-nombre truncate text-xl leading-tight md:text-2xl">{negocio.nombre}</span>
            {negocio.lema && (
              <>
                {/* El espacio no se ve (flex) pero separa las palabras para el lector de pantalla. */}{" "}
                <span className="mt-0.5 hidden truncate text-sm leading-tight text-[var(--ti-texto-3)] lg:block">{negocio.lema}</span>
              </>
            )}
          </span>
        </a>
      </Logo>
      <div className="mx-auto hidden w-full max-w-[36rem] md:block">
        <Buscador id={`ti-buscar${sufijo}`} catalogo={r.catalogo} />
      </div>
      <nav aria-label="Tu cuenta y tu bolsa" className="flex items-center gap-0.5 justify-self-end">
        {wa && (
          <a href={wa} {...EXTERNO} aria-label="Escríbenos por WhatsApp" className={`${ICONO} hidden md:inline-flex lg:w-auto lg:px-3.5`}>
            <MessageCircle className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
            <span className="hidden text-base font-semibold lg:inline">WhatsApp</span>
          </a>
        )}
        <MenuCuenta variante="icono" className="hidden md:block" claseBoton={`${ICONO} inline-flex`} whatsapp={negocio.whatsapp} />
        <BolsaEncabezado />
      </nav>
    </div>
  );
  const buscador = (
    <div className="px-4 pb-2.5 pt-1">
      <Buscador id={`ti-buscar-movil${sufijo}`} catalogo={r.catalogo} />
    </div>
  );
  return <EncabezadoVivo barra={barra} buscador={buscador} />;
}

/** Desde 768 px: «Todo», «Ofertas» (si hay descuentos) y las categorías del negocio, centradas; con muchas, se deslizan. */
export function MenuCategorias({ slug, categorias, hayOfertas }: { slug: string; categorias: readonly CategoriaEnlace[]; hayOfertas: boolean }) {
  const r = rutasTienda(slug);
  // (`min-w-*` está muerto en este repo por `* { min-width: 0 }`: anchos con `w-*`.)
  const enlace =
    "ti-subrayado ti-foco inline-flex h-12 items-center whitespace-nowrap px-3 text-[0.9375rem] font-medium text-[var(--ti-texto-2)] transition-colors duration-[var(--ti-dur-corto)] hover:text-[var(--ti-texto)] [--ti-subrayado-abajo:.6rem] xl:px-4";
  const enlaces = [
    { texto: "Todo", href: r.catalogo },
    ...(hayOfertas ? [{ texto: "Ofertas", href: r.ofertas }] : []),
    ...categorias.map((c) => ({ texto: c.nombre, href: r.categoria(c.categoria) })),
  ];
  return (
    <div className="hidden border-b border-[var(--ti-linea-suave)] bg-[var(--ti-fondo)] md:block">
      <nav aria-label="Categorías" className="mx-auto max-w-[1280px] px-6 lg:px-8">
        <ul className="ti-sin-barra flex justify-center-safe gap-1 overflow-x-auto">
          {enlaces.map((e) => (
            <li key={e.href} className="shrink-0">
              <a href={e.href} className={enlace}>
                {e.texto}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
