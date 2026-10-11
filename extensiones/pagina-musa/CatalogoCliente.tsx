"use client";

/**
 * El catálogo de Musa en el navegador (ADR-460; contrato visual §e «Catálogo»).
 * Llegan TODOS los productos de la tienda (unas decenas) y los filtros que ya
 * leyó el servidor de la URL: filtrar, ordenar y contar es al instante, sin ir
 * al servidor, y cada cambio se escribe en la URL (`replaceState`, sin sumar
 * pasos al «atrás») para poder compartirla o recargar y ver lo mismo.
 *
 * Arriba, el título en versalitas con su línea script y una vitrina de tres
 * envases; las píldoras de categoría a la izquierda y el orden a la derecha;
 * la grilla de 2 / 3 / 4 columnas, con una tarjeta de asesoría a lo ancho
 * después de la 8.ª. Las tarjetas entran escalonadas una sola vez (`mu-entrar`).
 *
 * Al escribir la URL sólo se tocan los parámetros de filtro: los demás
 * (`carrito=abrir`, `preview`…) quedan como estaban, para quien los atiende.
 */
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { MessageCircle } from "@buleje/design-system/icons";
import { BUSQUEDAS_SUGERIDAS } from "./anuncios";
import { Controles } from "./Controles";
import type { ProductoSalon } from "./datos";
import { enlaceWhatsapp, rutas, unidades } from "./destinos";
import { aParametros, aplicar, CLAVES_DE_FILTRO, coincide, contar, SIN_FILTROS, type Filtros } from "./filtros";
import { FranjaServicios } from "./FranjaServicios";
import { FiltrosPuestos, Pildoras } from "./Pildoras";
import { Sello } from "./Sello";
import { Escenario, Ilustracion, TarjetaProducto } from "./TarjetaProducto";
import { ANCHO, BOTON, BOTON_BORDE, BOTON_WHATSAPP, ConAcento, Destello, Kicker, Script } from "./ui";

export interface PropsCatalogo {
  productos: ProductoSalon[];
  servicios: ProductoSalon[];
  /** Las del salón con productos, en orden, con su bajada. */
  categorias: { nombre: string; texto: string }[];
  marcas: string[];
  inicial: Filtros;
  slug: string;
  nombre: string;
  whatsapp: string | null;
}

/** La tarjeta de asesoría va después de esta tarjeta (la 8.ª). */
const ASESORIA_TRAS = 8;

/** La línea script de cada vista (≤3 palabras): la mano de Drucila. */
const SCRIPT_DE: Readonly<Record<string, string>> = {
  Cabello: "para tu cabello",
  Rostro: "para tu piel",
  Cuerpo: "para tu cuerpo",
  "Kits y ofertas": "y ahorras",
};

/**
 * Los tres envases de la vitrina del título: productos sueltos de categorías
 * DISTINTAS (tres tintes, tres formas), en el orden de la lista; si no alcanzan
 * (una sola categoría, sólo kits), se completa con lo que sigue. Antes eran los
 * tres primeros de la lista: dos dúos con el mismo envase y un kit.
 */
function vitrinaDe(lista: ProductoSalon[]): ProductoSalon[] {
  const sueltos = lista.filter((x) => !x.kit);
  const elegidos: ProductoSalon[] = [];
  for (const x of sueltos) if (elegidos.length < 3 && !elegidos.some((y) => y.categoria === x.categoria)) elegidos.push(x);
  for (const x of [...sueltos, ...lista]) if (elegidos.length < 3 && !elegidos.includes(x)) elegidos.push(x);
  // El primero de la lista (el que manda en esta vista) va al medio, en el arco alto.
  return elegidos.length === 3 ? [elegidos[1]!, elegidos[0]!, elegidos[2]!] : elegidos;
}

function urlCon(f: Filtros, base: string, actual?: string): string {
  const p = new URLSearchParams(actual);
  CLAVES_DE_FILTRO.forEach((k) => p.delete(k));
  aParametros(f).forEach(([k, v]) => p.set(k, v));
  const q = p.toString();
  return `${base}${q ? `?${q}` : ""}`;
}

function encabezadoDe(f: Filtros, categorias: PropsCatalogo["categorias"], nombre: string): { titulo: string; script: string | null; texto: string | null } {
  if (f.q) return { titulo: `Resultados para “${f.q}”`, script: null, texto: null };
  if (f.categoria) return { titulo: f.categoria, script: SCRIPT_DE[f.categoria] ?? null, texto: categorias.find((c) => c.nombre === f.categoria)?.texto ?? null };
  if (f.oferta) return { titulo: "Ofertas", script: "de la semana", texto: "Los precios rebajados de esta semana, con el precio de antes a la vista." };
  return { titulo: `Todo ${nombre}`, script: "para ti", texto: "Belleza profesional para tu cabello, rostro y cuerpo, con asesoría gratis de Drucila por WhatsApp." };
}

export function CatalogoCliente(p: PropsCatalogo) {
  const [f, setF] = useState(p.inicial);
  const cambiar = (cambio: Partial<Filtros>) => setF((antes) => ({ ...antes, ...cambio }));
  const r = rutas(p.slug);

  // A la URL sólo después de un cambio (la primera vez ya está como el servidor la leyó).
  const primera = useRef(true);
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    window.history.replaceState(window.history.state, "", `${urlCon(f, window.location.pathname, window.location.search)}${window.location.hash}`);
  }, [f]);

  const lista = useMemo(() => aplicar(p.productos, f), [p.productos, f]);
  const cuentas = useMemo(() => contar(p.productos, f), [p.productos, f]);
  const opciones = useMemo(() => ({ existencias: p.productos.some((x) => x.stock !== null), descuentos: p.productos.some((x) => x.descuento) }), [p.productos]);
  const { titulo, script, texto } = encabezadoDe(f, p.categorias, p.nombre);
  const href = (cambio: Partial<Filtros>) => urlCon({ ...f, ...cambio }, r.catalogo);
  const vitrina = useMemo(() => vitrinaDe(lista), [lista]);
  const asesoriaTras = lista.length > ASESORIA_TRAS ? ASESORIA_TRAS : lista.length >= 4 ? lista.length : 0;

  return (
    <>
      <section className="mu-grano relative overflow-hidden border-b border-[var(--rule-soft)] bg-[var(--mu-hueso)]">
        <div className={`${ANCHO} grid items-end gap-8 py-8 sm:py-12 lg:grid-cols-[minmax(0,1fr)_auto]`}>
          <div className="min-w-0">
            <nav aria-label="Estás en" className="text-[length:var(--mu-t-chico)] text-[var(--text-secondary)]">
              <ol className="flex flex-wrap items-center gap-x-2">
                <li>
                  <a href={r.base} className="mu-foco rounded-sm underline-offset-4 hover:text-[var(--text-primary)] hover:underline">
                    Inicio
                  </a>
                </li>
                <li aria-hidden="true">/</li>
                <li>
                  <a href={r.catalogo} aria-current={f.categoria || f.q || f.oferta ? undefined : "page"} className="mu-foco rounded-sm underline-offset-4 hover:text-[var(--text-primary)] hover:underline">
                    Catálogo
                  </a>
                </li>
              </ol>
            </nav>
            <Kicker className="mt-6 flex items-center gap-2">
              <Destello className="h-3 w-3 text-[var(--mu-oro)]" /> Catálogo {p.nombre}
            </Kicker>
            <h1 className="mu-display mt-3 text-[length:var(--mu-t-seccion)] leading-[1] text-[var(--text-primary)]">
              <ConAcento texto={titulo} />
              {script && (
                <>
                  {" "}
                  <Script className="relative mt-[-0.1em] pl-[0.6em] sm:pl-[1.4em]">{script}</Script>
                </>
              )}
            </h1>
            {texto && <p className="mt-4 max-w-2xl text-[length:var(--mu-t-cuerpo)] leading-relaxed text-[var(--text-secondary)]">{texto}</p>}
            <p className="mt-4 inline-flex items-center gap-2 text-[length:var(--mu-t-chico)] font-semibold text-[var(--text-primary)]" role="status">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--mu-rosa)]" />
              {unidades(lista.length)}
            </p>
          </div>
          {vitrina.length === 3 && (
            <div aria-hidden="true" className="hidden items-end gap-3 lg:flex">
              {vitrina.map((x, i) => (
                <Escenario key={x.id} categoria={x.categoria} className={`mu-arco w-[9.5rem] ${i === 1 ? "h-[14rem]" : "h-[11.5rem]"}`}>
                  <Ilustracion p={x} cerca sello="h-[52%] w-[52%]" />
                </Escenario>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className={`${ANCHO} flex flex-col gap-4 py-6 sm:py-8`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Pildoras f={f} cambiar={cambiar} categorias={p.categorias.map((c) => c.nombre)} cuentas={cuentas} href={href} />
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <Controles f={f} cambiar={cambiar} marcas={p.marcas} total={lista.length} opciones={opciones} />
          </div>
        </div>
        <FiltrosPuestos f={f} cambiar={cambiar} />

        <h2 className="sr-only">Productos</h2>
        {lista.length > 0 ? (
          <ul className="grid grid-cols-2 gap-4 pt-2 md:grid-cols-3 lg:gap-6 xl:grid-cols-4">
            {lista.map((prod, i) => (
              <Fragment key={prod.id}>
                <li className="mu-entrar min-w-0" style={{ "--mu-i": i % ASESORIA_TRAS } as CSSProperties}>
                  <TarjetaProducto p={prod} prioridad={i < 4} />
                </li>
                {i + 1 === asesoriaTras && (
                  <li className="col-span-full">
                    <Asesoria whatsapp={p.whatsapp} />
                  </li>
                )}
              </Fragment>
            ))}
          </ul>
        ) : (
          <Vacio f={f} cambiar={cambiar} catalogo={r.catalogo} whatsapp={p.whatsapp} hayServicio={Boolean(f.q) && p.servicios.some((s) => coincide(s, f.q))} />
        )}
      </div>

      <FranjaServicios servicios={p.servicios} q={f.q} whatsapp={p.whatsapp} slug={p.slug} />
    </>
  );
}

/** La tarjeta de asesoría a lo ancho (rosa): «¿dudas?» y el WhatsApp de Drucila. */
function Asesoria({ whatsapp }: { whatsapp: string | null }) {
  return (
    <aside aria-label="Asesoría gratis" className="relative flex flex-col gap-5 overflow-hidden rounded-[var(--mu-radio-tarjeta)] bg-[var(--mu-rosa-claro)] px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-10 sm:py-8">
      <Destello className="absolute -right-3 -top-3 h-20 w-20 text-[var(--mu-rosa)] opacity-40" />
      <div className="relative flex items-center gap-4 sm:gap-6">
        <Sello id="asesoria-catalogo" className="h-16 w-16 shrink-0 sm:h-20 sm:w-20" />
        <div>
          <Script>¿dudas?</Script>
          <p className="mt-1 max-w-md text-[length:var(--mu-t-cuerpo)] leading-relaxed text-[var(--text-primary)]">
            Cuéntale a Drucila qué quieres mejorar y te dice qué te sirve. La asesoría es gratis.
          </p>
        </div>
      </div>
      <a
        href={enlaceWhatsapp(whatsapp, "Hola Drucila, estoy viendo el catálogo de Musa y quiero que me ayudes a elegir.")}
        target="_blank"
        rel="noopener noreferrer"
        className={`${BOTON_WHATSAPP} relative shrink-0`}
      >
        <MessageCircle className="h-5 w-5" aria-hidden="true" /> Escríbele por WhatsApp
      </a>
    </aside>
  );
}

/** Sin resultados, con la voz de Musa: qué pasó y qué hacer ahora. */
function Vacio({ f, cambiar, catalogo, whatsapp, hayServicio }: { f: Filtros; cambiar: (c: Partial<Filtros>) => void; catalogo: string; whatsapp: string | null; hayServicio: boolean }) {
  const soloOfertas = f.oferta && !f.q && !f.marca && !f.disponibles;
  const [titulo, texto] = f.q
    ? [
        `No encontramos “${f.q}”`,
        hayServicio ? "Pero en el salón sí lo hacemos: mira los servicios aquí abajo y resérvalo por WhatsApp." : "Revisa cómo se escribe, prueba con otra palabra o con el código (MU001, KT04…). Si no lo ves, escríbenos y te ayudamos a elegir.",
      ]
    : soloOfertas
      ? ["Hoy no tenemos ofertas aquí", "Las rebajas cambian cada semana. Mientras tanto, mira los kits: ahí ahorras de verdad."]
      : ["Nada con esos filtros", "Quita alguno para ver más productos."];
  return (
    <div className="flex flex-col items-center rounded-[var(--mu-radio-tarjeta)] bg-[var(--mu-nude-claro)] px-6 py-14 text-center sm:py-20">
      <Sello id="catalogo-vacio" className="h-20 w-20" />
      <h3 className="mu-serif mt-5 max-w-xl text-[length:var(--mu-t-titulo)] leading-tight text-[var(--text-primary)]">{titulo}</h3>
      <p className="mt-3 max-w-lg text-[length:var(--mu-t-cuerpo)] leading-relaxed text-[var(--text-secondary)]">{texto}</p>
      {f.q && (
        <ul className="mt-6 flex flex-wrap justify-center gap-2" aria-label="Búsquedas sugeridas">
          {BUSQUEDAS_SUGERIDAS.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => cambiar({ ...SIN_FILTROS, q: s })}
                className="mu-foco inline-flex h-12 items-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-[length:var(--mu-t-boton)] font-semibold text-[var(--text-primary)] transition-colors duration-200 hover:border-[var(--text-primary)]"
              >
                {s}
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
        <a href={enlaceWhatsapp(whatsapp, "Hola Drucila, no encuentro un producto en la tienda. ¿Me ayudas a elegir?")} target="_blank" rel="noopener noreferrer" className={BOTON_BORDE}>
          <MessageCircle className="h-5 w-5" aria-hidden="true" /> Pedir ayuda por WhatsApp
        </a>
      </div>
    </div>
  );
}
