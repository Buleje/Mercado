"use client";

/**
 * El catálogo del salón en el navegador (ADR-460). Llegan TODOS los productos
 * del salón (unas decenas) y los filtros que ya leyó el servidor de la URL:
 * filtrar, ordenar y contar es al instante, sin ir al servidor, y cada cambio
 * se escribe en la URL (`replaceState`, sin sumar pasos al «atrás») para
 * poder compartirla o recargar y ver lo mismo.
 *
 * Al escribir la URL sólo se tocan los parámetros de filtro: los demás
 * (`carrito=abrir`, `preview`…) quedan como estaban, para quien los atiende.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Sparkles } from "@buleje/design-system/icons";
import { BUSQUEDAS_SUGERIDAS } from "./anuncios";
import { Controles } from "./Controles";
import type { ProductoSalon } from "./datos";
import { enlaceWhatsapp, rutas, unidades } from "./destinos";
import { aParametros, aplicar, CLAVES_DE_FILTRO, coincide, contar, SIN_FILTROS, type Filtros } from "./filtros";
import { FranjaServicios } from "./FranjaServicios";
import { FiltrosPuestos, Pildoras } from "./Pildoras";
import { TarjetaProducto } from "./TarjetaProducto";
import { ANCHO, BOTON, BOTON_BORDE, KICKER } from "./ui";

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

function urlCon(f: Filtros, base: string, actual?: string): string {
  const p = new URLSearchParams(actual);
  CLAVES_DE_FILTRO.forEach((k) => p.delete(k));
  aParametros(f).forEach(([k, v]) => p.set(k, v));
  const q = p.toString();
  return `${base}${q ? `?${q}` : ""}`;
}

function encabezadoDe(f: Filtros, categorias: PropsCatalogo["categorias"], nombre: string) {
  if (f.q) return { titulo: `Resultados para “${f.q}”`, texto: null };
  if (f.categoria) return { titulo: f.categoria, texto: categorias.find((c) => c.nombre === f.categoria)?.texto ?? null };
  if (f.oferta) return { titulo: "Ofertas", texto: "Los precios rebajados de esta semana, con el precio de antes a la vista." };
  return { titulo: "Todo", texto: `Belleza profesional de ${nombre} para tu cabello, rostro y cuerpo, con asesoría gratis por WhatsApp.` };
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
  const { titulo, texto } = encabezadoDe(f, p.categorias, p.nombre);
  const href = (cambio: Partial<Filtros>) => urlCon({ ...f, ...cambio }, r.catalogo);
  const nombresCategorias = p.categorias.map((c) => c.nombre);

  return (
    <>
      <section className="border-b border-[var(--rule-soft)] bg-[var(--mu-hueso)]">
        <div className={`${ANCHO} py-8 sm:py-12`}>
          <nav aria-label="Estás en" className="text-base text-[var(--text-secondary)]">
            <ol className="flex flex-wrap items-center gap-x-2">
              <li>
                <a href={r.base} className="underline-offset-4 hover:text-[var(--text-primary)] hover:underline">
                  Inicio
                </a>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <a href={r.catalogo} className="underline-offset-4 hover:text-[var(--text-primary)] hover:underline">
                  Catálogo
                </a>
              </li>
            </ol>
          </nav>
          <p className={`${KICKER} mt-5`}>Tienda {p.nombre}</p>
          <h1 className="mu-serif mt-2 text-5xl leading-[1.02] tracking-tight text-[var(--text-primary)] sm:text-6xl">{titulo}</h1>
          {texto && <p className="mt-3 max-w-2xl text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">{texto}</p>}
          <p className="mt-4 text-base font-semibold text-[var(--text-primary)]" role="status">
            {unidades(lista.length)}
          </p>
        </div>
      </section>

      <div className={`${ANCHO} flex flex-col gap-5 py-6 sm:py-8`}>
        <Pildoras f={f} cambiar={cambiar} categorias={nombresCategorias} cuentas={cuentas} href={href} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Controles f={f} cambiar={cambiar} marcas={p.marcas} total={lista.length} />
        </div>
        <FiltrosPuestos f={f} cambiar={cambiar} />

        <h2 className="sr-only">Productos</h2>
        {lista.length > 0 ? (
          <ul className="grid grid-cols-2 gap-3 pt-1 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
            {lista.map((prod, i) => (
              <li key={prod.id}>
                <TarjetaProducto p={prod} prioridad={i < 4} />
              </li>
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

/** Sin resultados, con la voz del salón: qué pasó y qué hacer ahora. */
function Vacio({ f, cambiar, catalogo, whatsapp, hayServicio }: { f: Filtros; cambiar: (c: Partial<Filtros>) => void; catalogo: string; whatsapp: string | null; hayServicio: boolean }) {
  const soloOfertas = f.oferta && !f.q && !f.marca && !f.disponibles;
  const [titulo, texto] = f.q
    ? [
        `No encontramos “${f.q}” entre los productos`,
        hayServicio ? "Pero en el salón sí lo hacemos: mira los servicios aquí abajo y resérvalo por WhatsApp." : "Revisa cómo se escribe o prueba con otra palabra. Si no lo ves, escríbenos y te ayudamos a elegir.",
      ]
    : soloOfertas
      ? ["Hoy no tenemos ofertas aquí", "Las rebajas cambian cada semana. Mientras tanto, mira los kits de Musa."]
      : ["Nada con esos filtros", "Quita alguno para ver más productos."];
  return (
    <div className="flex flex-col items-center rounded-3xl bg-[var(--mu-nude-claro)] px-6 py-14 text-center sm:py-20">
      <Sparkles className="h-10 w-10 text-[var(--mu-acento-tinta)]" strokeWidth={1.4} aria-hidden="true" />
      <h3 className="mu-serif mt-4 max-w-xl text-4xl leading-tight text-[var(--text-primary)]">{titulo}</h3>
      <p className="mt-3 max-w-lg text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">{texto}</p>
      {f.q && (
        <ul className="mt-6 flex flex-wrap justify-center gap-2" aria-label="Búsquedas sugeridas">
          {BUSQUEDAS_SUGERIDAS.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => cambiar({ ...SIN_FILTROS, q: s })}
                className="inline-flex h-11 items-center rounded-full border-2 border-[var(--text-primary)]/20 bg-[var(--surface-raised)] px-4 text-base font-semibold text-[var(--text-primary)] hover:border-[var(--text-primary)]"
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
        <a href={enlaceWhatsapp(whatsapp, "Hola, no encuentro un producto en la tienda. ¿Me ayudan a elegir?")} target="_blank" rel="noopener noreferrer" className={BOTON_BORDE}>
          <MessageCircle className="h-5 w-5" aria-hidden="true" /> Pedir ayuda por WhatsApp
        </a>
      </div>
    </div>
  );
}
