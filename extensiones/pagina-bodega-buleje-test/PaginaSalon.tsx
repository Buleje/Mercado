/**
 * «Buleje Beauty» — la página entera del salón (enchufe `tienda.pagina`).
 *
 * Arma las secciones con los datos de `cargarSalon` (una lectura por pedido).
 * La bolsa de acá trae su propio carrito (la portada vive fuera del layout de
 * la tienda); el resto de la tienda la monta con el marco (`Marco.tsx`).
 * `servidor.tsx` la envuelve en <Suspense> con `EsqueletoSalon`: `Pagina()`
 * devuelve al instante (el tope de 2 s del enchufe nunca corre por datos) y
 * mientras llegan se ve el esqueleto con los colores de la marca.
 */
import "server-only";
import type { ReactNode } from "react";
import TenantPageTracker from "@/app/t/[slug]/_components/TenantPageTracker";
import { safeJsonLdStringify } from "@/lib/seo/json-ld";
import { CATEGORIAS, FRANJA, PORTADA } from "./anuncios";
import { ProveedorBolsa } from "./Bolsa";
import { Categorias } from "./Categorias";
import { Favoritos, Lineas, Novedades } from "./Colecciones";
import { cargarSalon, type DatosSalon } from "./datos";
import { hrefDestino, rellenar, rutas } from "./destinos";
import { BarraSuperior, MenuCategorias } from "./Encabezado";
import { FranjaAnuncio } from "./FranjaAnuncio";
import { Beneficios, Pie } from "./Pie";
import { Portada, type DiapositivaVista } from "./Portada";
import { Promos } from "./Promos";
import { BannerOscuro, Servicios } from "./Salon";
import { CSS_TEMA, ID_PAGINA } from "./tema";
import { ANCHO } from "./ui";

/** El envoltorio con la paleta y la fuente: lo comparten la página y su esqueleto. */
function Lienzo({ children }: { children: ReactNode }) {
  return (
    // `overflow-x-clip` (no `hidden`): recorta lo que asoma de los carriles sin
    // volverse contenedor de scroll, así la barra pegajosa sigue pegando.
    <div data-pagina={ID_PAGINA} className="min-h-screen overflow-x-clip">
      <style dangerouslySetInnerHTML={{ __html: CSS_TEMA }} />
      {children}
    </div>
  );
}

function datosEstructurados(d: DatosSalon) {
  const precios = d.servicios.map((s) => s.precio);
  return {
    "@context": "https://schema.org",
    "@type": "HairSalon",
    name: d.nombre,
    description: d.descripcion ?? "Salón y cosmética capilar",
    currenciesAccepted: "PEN",
    ...(d.whatsapp ? { telephone: `+${d.whatsapp}` } : {}),
    ...(d.direccion ? { address: d.direccion } : {}),
    ...(precios.length ? { priceRange: `S/ ${Math.min(...precios)} – S/ ${Math.max(...precios)}` } : {}),
    ...(d.servicios.length
      ? {
          hasOfferCatalog: {
            "@type": "OfferCatalog",
            name: "Servicios del salón",
            itemListElement: d.servicios.map((s) => ({
              "@type": "Offer",
              price: s.precio,
              priceCurrency: "PEN",
              itemOffered: { "@type": "Service", name: s.nombre, ...(s.descripcion ? { description: s.descripcion } : {}) },
            })),
          },
        }
      : {}),
  };
}

export async function PaginaSalon({ tenantId, slug }: { tenantId: string; slug: string }) {
  const d = await cargarSalon(tenantId, slug);
  const r = rutas(slug);
  const valores = { descuento: d.mayorDescuento ? String(d.mayorDescuento) : null, pagos: d.pagos };
  const mensajes = FRANJA.map((m) => rellenar(m, valores)).filter((m): m is string => m !== null);
  const diapositivas: DiapositivaVista[] = PORTADA.map(({ cta, cta2, ...p }) => ({
    ...p,
    cta: { texto: cta.texto, ...hrefDestino(cta.destino, slug, d.whatsapp) },
    ...(cta2 ? { cta2: { texto: cta2.texto, ...hrefDestino(cta2.destino, slug, d.whatsapp) } } : {}),
  }));
  const categorias = CATEGORIAS.filter((c) => d.productos.some((p) => p.categoria === c.nombre)).map((c) => c.nombre);

  return (
    <Lienzo>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(datosEstructurados(d)) }} />
      <TenantPageTracker tenantSlug={slug} />
      <ProveedorBolsa slug={slug} pagar={r.pagar}>
        <FranjaAnuncio mensajes={mensajes} />
        <BarraSuperior nombre={d.nombre} slug={slug} />
        <MenuCategorias slug={slug} categorias={categorias} hayOfertas={d.productos.some((p) => p.descuento)} />
        <main id="main-content">
          <Portada diapositivas={diapositivas} />
          {d.productos.length === 0 ? (
            <section className={`${ANCHO} py-20 text-center`}>
              <p className="bb-serif text-4xl text-[var(--text-primary)]">Estamos preparando la vitrina</p>
              <p className="mt-3 text-lg text-[var(--text-secondary)]">Vuelve en un rato o mira el catálogo completo.</p>
              <a href={r.catalogo} className="mt-6 inline-flex h-12 items-center rounded-full bg-[var(--text-primary)] px-7 text-base font-semibold text-[var(--surface-canvas)]">
                Ver el catálogo
              </a>
            </section>
          ) : (
            <>
              <Novedades productos={d.productos} slug={slug} />
              <Promos productos={d.productos} slug={slug} />
              <Favoritos productos={d.productos} />
              <Lineas productos={d.productos} slug={slug} nombre={d.nombre} />
            </>
          )}
          <BannerOscuro servicios={d.servicios} whatsapp={d.whatsapp} />
          <Categorias productos={d.productos} servicios={d.servicios} slug={slug} />
          <Servicios servicios={d.servicios} whatsapp={d.whatsapp} horario={d.horario} direccion={d.direccion} nombre={d.nombre} />
          <Beneficios pagos={d.pagos} nombre={d.nombre} />
        </main>
        <Pie nombre={d.nombre} descripcion={d.descripcion} slug={slug} whatsapp={d.whatsapp} redes={d.redes} pagos={d.pagos} />
      </ProveedorBolsa>
    </Lienzo>
  );
}

/** Lo que se ve mientras llegan los datos: franja, barra, portada y una fila de tarjetas. */
export function EsqueletoSalon() {
  const bloque = "animate-pulse rounded-2xl bg-[var(--bb-rubor)]";
  return (
    <Lienzo>
      <div className="h-10 bg-[var(--bb-tinta)]" />
      <div className={`${ANCHO} flex h-16 items-center gap-6 border-b border-[var(--rule-soft)] sm:h-20`}>
        <div className={`${bloque} h-10 w-32`} />
        <div className={`${bloque} mx-auto hidden h-12 w-full max-w-[34rem] rounded-full md:block`} />
      </div>
      <div className="grid min-h-[34rem] bg-[var(--bb-rubor)] lg:grid-cols-2" aria-busy="true" aria-label="Cargando la tienda">
        <div className="flex flex-col justify-center gap-4 px-5 py-10 sm:px-10 lg:px-16">
          <div className="h-4 w-48 animate-pulse rounded bg-[var(--bb-rubor-2)]" />
          <div className="h-14 w-4/5 animate-pulse rounded bg-[var(--bb-rubor-2)]" />
          <div className="h-14 w-3/5 animate-pulse rounded bg-[var(--bb-rubor-2)]" />
        </div>
        <div className="hidden animate-pulse bg-[var(--bb-rubor-2)] lg:block" />
      </div>
      <div className={`${ANCHO} grid grid-cols-2 gap-4 py-14 sm:grid-cols-3 lg:grid-cols-5`}>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={`${bloque} aspect-[3/4] ${i < 2 ? "" : i === 2 ? "hidden sm:block" : "hidden lg:block"}`} />
        ))}
      </div>
    </Lienzo>
  );
}
