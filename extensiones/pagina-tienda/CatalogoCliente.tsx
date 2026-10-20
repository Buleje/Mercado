"use client";

/**
 * El catálogo de la tienda en el navegador (ADR-511; el de Musa sin sus
 * categorías, su asesora ni sus códigos). Llegan TODOS los productos del
 * negocio y los filtros que el servidor ya leyó de la URL: buscar, filtrar,
 * ordenar y contar es al instante, y cada cambio se escribe en la URL
 * (`replaceState`, sin sumar pasos al «atrás») para compartirla o recargar y
 * ver lo mismo. Sólo se tocan los parámetros de filtro: `carrito=abrir`,
 * `bolsa=1` y los demás quedan para quien los atiende.
 *
 * Arriba: migas, el título (Todo <negocio> · la categoría · Ofertas ·
 * Resultados para «…») y cuántos hay; el buscador con «Filtrar y ordenar»;
 * las píldoras de categoría; la grilla 2 / 3 / 4. Las categorías se leen con
 * el nombre que puso el dueño (`nombres`), y la búsqueda también las encuentra
 * por ese nombre («pollo» encuentra la clave `pollo-brasa`).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { MessageCircle, Search } from "@buleje/design-system/icons";
import type { ProductoTienda } from "./contenido";
import { Buscador, Controles } from "./CatalogoControles";
import { FiltrosPuestos, Pildoras } from "./CatalogoPildoras";
import { aParametros, aplicar, CLAVES_DE_FILTRO, contar, SIN_FILTROS, type Filtros } from "./filtros";
import { TarjetaProducto } from "./TarjetaProducto";
import { ANCHO, BOTON, BOTON_BORDE, enlaceWhatsapp, EXTERNO, rutasTienda, unidades } from "./ui";

export interface PropsCatalogo {
  productos: ProductoTienda[];
  /** Las claves de categoría con productos, en el orden del negocio. */
  categorias: string[];
  /** Clave → nombre para leer («pollo-brasa» → «Pollo a la brasa»). */
  nombres: Record<string, string>;
  marcas: string[];
  inicial: Filtros;
  slug: string;
  nombre: string;
  /** El lema del negocio, bajo el título de «Todo …». */
  lema: string | null;
  whatsapp: string | null;
}

/** Cuántas tarjetas entran escalonadas (las demás aparecen juntas). */
const ESCALON = 8;

function urlCon(f: Filtros, base: string, actual?: string): string {
  const p = new URLSearchParams(actual);
  CLAVES_DE_FILTRO.forEach((k) => p.delete(k));
  aParametros(f).forEach(([k, v]) => p.set(k, v));
  const q = p.toString();
  return `${base}${q ? `?${q}` : ""}`;
}

function encabezadoDe(f: Filtros, nombres: Record<string, string>, nombre: string, lema: string | null): { titulo: string; texto: string | null } {
  if (f.q) return { titulo: `Resultados para “${f.q}”`, texto: null };
  if (f.categoria) return { titulo: nombres[f.categoria] ?? f.categoria, texto: null };
  if (f.oferta) return { titulo: "Ofertas", texto: "Los precios rebajados, con el precio de antes a la vista." };
  return { titulo: `Todo ${nombre}`, texto: lema };
}

const MIGA = "ti-foco rounded-sm underline-offset-4 hover:text-[var(--ti-texto)] hover:underline";

export function CatalogoCliente(p: PropsCatalogo) {
  const [f, setF] = useState(p.inicial);
  const cambiar = (cambio: Partial<Filtros>) => setF((antes) => ({ ...antes, ...cambio }));
  const r = rutasTienda(p.slug);

  // A la URL sólo después de un cambio (la primera vez ya está como el servidor la leyó).
  const primera = useRef(true);
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    window.history.replaceState(window.history.state, "", `${urlCon(f, window.location.pathname, window.location.search)}${window.location.hash}`);
  }, [f]);

  const nombreDe = useMemo(() => (c: string) => p.nombres[c] ?? c, [p.nombres]);
  const lista = useMemo(() => aplicar(p.productos, f, undefined, nombreDe), [p.productos, f, nombreDe]);
  const cuentas = useMemo(() => contar(p.productos, f, nombreDe), [p.productos, f, nombreDe]);
  const opciones = useMemo(() => ({ existencias: p.productos.some((x) => x.stock !== null), descuentos: p.productos.some((x) => x.descuento) }), [p.productos]);
  const { titulo, texto } = encabezadoDe(f, p.nombres, p.nombre, p.lema);
  const href = (cambio: Partial<Filtros>) => urlCon({ ...f, ...cambio }, r.catalogo);
  const filtrando = Boolean(f.categoria || f.q || f.oferta);

  return (
    <>
      <section className="border-b border-[var(--ti-linea-suave)]">
        <div className={`${ANCHO} py-8 sm:py-12`}>
          <nav aria-label="Estás en" className="text-[length:var(--ti-t-chico)] text-[var(--ti-texto-2)]">
            <ol className="flex flex-wrap items-center gap-x-2">
              <li>
                <a href={r.base} className={MIGA}>
                  Inicio
                </a>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <a href={r.catalogo} aria-current={filtrando ? undefined : "page"} className={MIGA}>
                  Catálogo
                </a>
              </li>
            </ol>
          </nav>
          <p className="ti-kicker mt-6 text-[var(--ti-texto-3)]">Catálogo {p.nombre}</p>
          <h1 className="ti-titulo mt-3 break-words text-[length:var(--ti-t-heroe)] text-[var(--ti-texto)]">{titulo}</h1>
          {texto && <p className="mt-4 max-w-2xl text-[length:var(--ti-t-cuerpo)] leading-relaxed text-[var(--ti-texto-2)]">{texto}</p>}
          <p className="mt-4 text-[length:var(--ti-t-chico)] font-semibold text-[var(--ti-texto)]" role="status">
            {unidades(lista.length)}
          </p>
        </div>
      </section>

      <div className={`${ANCHO} flex flex-col gap-4 py-6 sm:py-8`}>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 md:max-w-[22rem]">
            <Buscador q={f.q} cambiar={cambiar} nombre={p.nombre} />
          </div>
          <div className="flex shrink-0 items-center gap-3 md:ml-auto">
            <Controles f={f} cambiar={cambiar} marcas={p.marcas} total={lista.length} opciones={opciones} />
          </div>
        </div>
        <Pildoras f={f} cambiar={cambiar} categorias={p.categorias} nombres={p.nombres} cuentas={cuentas} href={href} />
        <FiltrosPuestos f={f} cambiar={cambiar} nombres={p.nombres} />

        <h2 className="sr-only">Productos</h2>
        {lista.length > 0 ? (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-8 pt-2 md:grid-cols-3 lg:gap-x-6 xl:grid-cols-4">
            {lista.map((prod, i) => (
              <li key={prod.id} className="ti-entrar min-w-0" style={{ "--ti-i": Math.min(i, ESCALON) } as CSSProperties}>
                <TarjetaProducto p={prod} nombreCategoria={p.nombres[prod.categoria]} prioridad={i < 4} />
              </li>
            ))}
          </ul>
        ) : (
          <Vacio f={f} cambiar={cambiar} catalogo={r.catalogo} whatsapp={p.whatsapp} nombre={p.nombre} sugeridas={p.categorias.slice(0, 4).map((c) => ({ clave: c, nombre: p.nombres[c] ?? c }))} />
        )}
      </div>
    </>
  );
}

/** Sin resultados: qué pasó y qué hacer ahora (otra categoría, ver todo o preguntar). */
function Vacio({
  f,
  cambiar,
  catalogo,
  whatsapp,
  nombre,
  sugeridas,
}: {
  f: Filtros;
  cambiar: (c: Partial<Filtros>) => void;
  catalogo: string;
  whatsapp: string | null;
  nombre: string;
  sugeridas: { clave: string; nombre: string }[];
}) {
  const soloOfertas = f.oferta && !f.q && !f.marca && !f.disponibles;
  const [titulo, texto] = f.q
    ? [`No encontramos “${f.q}”`, `Revisa cómo se escribe o prueba con otra palabra.${whatsapp ? " Si no lo ves, escríbenos y te ayudamos." : ""}`]
    : soloOfertas
      ? ["Hoy no hay ofertas", "Las rebajas cambian seguido. Mientras tanto, mira todo el catálogo."]
      : ["Nada con esos filtros", "Quita alguno para ver más productos."];
  return (
    <div className="flex flex-col items-center rounded-[var(--ti-radio-tarjeta)] bg-[var(--ti-suave)] px-6 py-14 text-center sm:py-20">
      <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--ti-fondo)] text-[var(--ti-texto-2)]" aria-hidden="true">
        <Search className="h-7 w-7" strokeWidth={1.5} />
      </span>
      <h3 className="ti-titulo mt-5 max-w-xl break-words text-[length:var(--ti-t-bloque)] text-[var(--ti-texto)]">{titulo}</h3>
      <p className="mt-3 max-w-lg text-[length:var(--ti-t-cuerpo)] leading-relaxed text-[var(--ti-texto-2)]">{texto}</p>
      {f.q && sugeridas.length > 1 && (
        <ul className="mt-6 flex flex-wrap justify-center gap-2" aria-label="Mira estas categorías">
          {sugeridas.map((s) => (
            <li key={s.clave}>
              <button
                type="button"
                onClick={() => cambiar({ ...SIN_FILTROS, categoria: s.clave })}
                className="ti-foco inline-flex h-12 items-center rounded-[var(--ti-radio-pill)] border border-[var(--ti-linea)] bg-[var(--ti-fondo)] px-4 text-[length:var(--ti-t-boton)] font-semibold text-[var(--ti-texto)] transition-colors duration-[var(--ti-dur-corto)] hover:border-[var(--ti-texto)]"
              >
                {s.nombre}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <a
          href={catalogo}
          onClick={(e) => {
            e.preventDefault();
            cambiar(SIN_FILTROS);
          }}
          className={BOTON}
        >
          Ver todo el catálogo
        </a>
        {whatsapp && (
          <a href={enlaceWhatsapp(whatsapp, `Hola ${nombre}, no encuentro un producto en su tienda. ¿Me ayudan?`)} {...EXTERNO} className={BOTON_BORDE}>
            <MessageCircle className="h-5 w-5" aria-hidden="true" /> Pedir ayuda por WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}
