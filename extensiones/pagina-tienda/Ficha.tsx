/**
 * La ficha de un producto de la tienda de cualquier negocio
 * (`/t/<negocio>/tienda/<producto>`, ADR-511; la estructura de la de Musa):
 * a la izquierda la foto grande; a la derecha migas, marca o categoría, el
 * nombre, la presentación, el precio con el de antes tachado, las existencias
 * (sólo si el negocio las carga), «Agregar a tu bolsa», preguntar y compartir,
 * la descripción y la ficha técnica del panel. Debajo, más de la misma
 * categoría. En el celular, una barra fija con precio y contador cuando el
 * botón sale de la vista.
 *
 * · Un producto oculto o que no existe → «no lo encontramos» dentro del marco
 *   (sin indexar: `metadatosFicha` devuelve `null`).
 * · `Ficha` devuelve AL INSTANTE: los datos (los mismos del catálogo, en
 *   caché) se leen adentro, bajo <Suspense> con el esqueleto.
 */
import "server-only";
import { Suspense } from "react";
import { Truck } from "@buleje/design-system/icons";
import type { MetadatosFicha, PropsFicha } from "../_contrato";
import { slugify } from "@/data/products";
import { safeJsonLdStringify } from "@/lib/seo/json-ld";
import { listaY } from "./armado";
import type { DatosTienda, ProductoTienda } from "./contenido";
import { cargarTienda } from "./datos";
import { ChipPresentacion, Descripcion, FichaTecnica } from "./DetalleProducto";
import { BarraCompra, Comprar } from "./FichaComprar";
import { EsqueletoFicha, Existencias, Galeria, Migas, NoEncontrado, Precio, Relacionados, type Miga } from "./FichaPartes";
import { aProducto, nombresDeCategorias } from "./producto-carrito";
import { cssTema, ID_PAGINA_TIENDA } from "./tema";
import { ANCHO, CSS_PIEZAS, enlaceWhatsapp, rutasTienda, solesCortos } from "./ui";

/** El producto de la URL (por el slug de su nombre, como arma `datos.ts` el `href`). */
export function productoDeLaUrl(productos: readonly ProductoTienda[], producto: string): ProductoTienda | null {
  const buscado = producto.trim().toLowerCase();
  if (!buscado) return null;
  return productos.find((p) => slugify(p.nombre) === buscado) ?? null;
}

/** Hasta 4 de la misma categoría; si no alcanza, se completa con los primeros del negocio. */
export function relacionadosDe(productos: readonly ProductoTienda[], p: ProductoTienda, cuantos = 4): ProductoTienda[] {
  const otros = productos.filter((x) => x.id !== p.id);
  const mismos = otros.filter((x) => x.categoria === p.categoria);
  return [...mismos, ...otros.filter((x) => x.categoria !== p.categoria)].slice(0, cuantos);
}

/*
 * JSON-LD con rutas de la tienda (`/t/<negocio>/…`): Google las resuelve contra
 * la URL de la página. La disponibilidad sólo se declara si hay existencias cargadas.
 */
function JsonLd({ p, d, migas }: { p: ProductoTienda; d: DatosTienda; migas: Miga[] }) {
  const n = d.negocio;
  const producto = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.nombre,
    url: p.href,
    sku: p.codigo ?? `${p.id}`,
    category: p.categoria,
    brand: { "@type": "Brand", name: p.marca ?? n.nombre },
    ...(p.descripcion ? { description: p.descripcion } : {}),
    ...(p.imagen ? { image: p.imagen } : {}),
    offers: {
      "@type": "Offer",
      url: p.href,
      price: p.precio.toFixed(2),
      priceCurrency: "PEN",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: n.nombre },
      ...(p.stock !== null ? { availability: p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" } : {}),
      ...(p.antes
        ? { priceSpecification: { "@type": "UnitPriceSpecification", priceType: "https://schema.org/StrikethroughPrice", price: p.antes.toFixed(2), priceCurrency: "PEN" } }
        : {}),
    },
  };
  const ruta = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: migas.map((x, i) => ({ "@type": "ListItem", position: i + 1, name: x.nombre, item: x.href ?? p.href })),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(producto) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(ruta) }} />
    </>
  );
}

/** Envío gratis y medios de pago del negocio, en una línea cada uno (lo que no cargó, no sale). */
function Condiciones({ d }: { d: DatosTienda }) {
  const { envio, pagos } = d.negocio;
  const filas = [
    ...(envio.gratisDesde ? [`Envío gratis desde ${solesCortos(envio.gratisDesde)}`] : []),
    ...(pagos.length ? [`Pagas con ${listaY(pagos)}`] : []),
  ];
  if (filas.length === 0) return null;
  return (
    <ul className="mt-7 flex flex-col gap-2 border-t border-[var(--ti-linea-suave)] pt-5">
      {filas.map((t, i) => (
        <li key={t} className="flex items-center gap-3 text-[length:var(--ti-t-chico)] text-[var(--ti-texto-2)]">
          {i === 0 && envio.gratisDesde ? (
            <Truck className="h-5 w-5 shrink-0 text-[var(--ti-texto)]" strokeWidth={1.7} aria-hidden="true" />
          ) : (
            <span className="h-5 w-5 shrink-0" aria-hidden="true" />
          )}
          {t}
        </li>
      ))}
    </ul>
  );
}

async function FichaDelNegocio({ tenantId, slug, producto }: { tenantId: string; slug: string; producto: string }) {
  const d = await cargarTienda({ tenantId, slug });
  const css = <style dangerouslySetInnerHTML={{ __html: cssTema(d.tema) + CSS_PIEZAS }} />;
  const p = productoDeLaUrl(d.productos, producto);
  if (!p)
    return (
      <>
        {css}
        <NoEncontrado nombre={d.negocio.nombre} slug={d.negocio.slug} sugeridos={d.productos.slice(0, 4)} />
      </>
    );

  const n = d.negocio;
  const r = rutasTienda(n.slug);
  const nombres = nombresDeCategorias(d);
  const categoria = nombres[p.categoria] ?? p.categoria;
  const migas: Miga[] = [{ nombre: "Inicio", href: r.base }, { nombre: categoria, href: r.categoria(p.categoria) }, { nombre: p.nombre }];
  const carrito = aProducto(p);
  const consulta = n.whatsapp ? enlaceWhatsapp(n.whatsapp, `Hola ${n.nombre}, tengo una consulta sobre ${p.nombre} (${solesCortos(p.precio)}).`) : null;

  return (
    <main id="main-content">
      {css}
      <JsonLd p={p} d={d} migas={migas} />
      <div className={`${ANCHO} pb-14 pt-6 sm:pb-20 sm:pt-8`}>
        <Migas items={migas} />
        <div data-ti-ficha className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-14">
          <Galeria p={p} />
          <div className="flex min-w-0 flex-col">
            <p className="ti-kicker text-[var(--ti-texto-3)]">{p.marca?.trim() || categoria}</p>
            <h1 className="ti-titulo mt-3 break-words text-[length:var(--ti-t-bloque)] leading-[1.15] text-[var(--ti-texto)]">{p.nombre}</h1>
            {p.presentacion && (
              <p className="mt-3 flex flex-wrap gap-2">
                <ChipPresentacion texto={p.presentacion} />
              </p>
            )}
            <Precio p={p} />
            <Existencias stock={p.stock} />
            <Comprar producto={carrito} consulta={consulta} compartir={`Mira esto de ${n.nombre}: ${p.nombre}, ${solesCortos(p.precio)}.`} />
            <Descripcion texto={p.descripcion} />
            <FichaTecnica filas={p.ficha} />
            <Condiciones d={d} />
          </div>
        </div>
      </div>
      <Relacionados productos={relacionadosDe(d.productos, p)} titulo={`Más de ${categoria.toLocaleLowerCase("es-PE")}`} verTodo={{ href: r.categoria(p.categoria), texto: "Ver todo" }} />
      <BarraCompra producto={carrito} />
    </main>
  );
}

export function Ficha({ ctx, producto }: PropsFicha) {
  return (
    <div data-pagina={ID_PAGINA_TIENDA} className="overflow-x-clip">
      <Suspense fallback={<EsqueletoFicha />}>
        <FichaDelNegocio tenantId={ctx.tenantId} slug={ctx.slug} producto={producto} />
      </Suspense>
    </div>
  );
}

/** El título de la pestaña y lo que se ve al compartir; `null` = no es de la tienda (no se indexa). */
export async function metadatosFicha({ ctx, producto }: PropsFicha): Promise<MetadatosFicha | null> {
  const d = await cargarTienda(ctx);
  const p = productoDeLaUrl(d.productos, producto);
  if (!p) return null;
  const rebaja = p.antes && p.descuento ? ` Antes ${solesCortos(p.antes)}, hoy ${solesCortos(p.precio)} (-${p.descuento} %).` : "";
  const base = (p.descripcion?.trim() || p.nombre).replace(/\s+/g, " ");
  return {
    titulo: `${p.nombre} — ${solesCortos(p.precio)} · ${d.negocio.nombre}`,
    descripcion: `${base.length > 150 ? `${base.slice(0, 147)}…` : base}${rebaja} Pídelo en ${d.negocio.nombre}.`,
    ruta: p.href,
    imagen: p.imagen || null,
  };
}
