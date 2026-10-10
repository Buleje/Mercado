/**
 * «Musa» — la página entera de la tienda (enchufe `tienda.pagina`).
 *
 * En dos tandas (velocidad, 08-10): la franja, la barra, el menú, la portada y
 * el pie salen con la lectura liviana (`cargarMarco`: ajustes, contacto y
 * categorías, sin precios), así la foto de la portada y el primer texto llegan
 * sin esperar la vitrina; las secciones con precios (`cargarVitrina`: visibilidad
 * e historial de precios) llegan después, bajo su propio <Suspense> con
 * `EsqueletoVitrina`. La franja sale primero sin «hasta X %» y se completa con
 * la vitrina; el menú muestra «Ofertas» como en el marco (sin esperar precios).
 * La bolsa de acá trae su propio carrito (la portada vive fuera del layout de
 * la tienda) y su pie es «Pedir por WhatsApp» (sin checkout); el resto de la
 * tienda la monta con el marco (`Marco.tsx`).
 * `servidor.tsx` la envuelve en <Suspense> con `EsqueletoSalon`: `Pagina()`
 * devuelve al instante (el tope de 2 s del enchufe nunca corre por datos) y
 * mientras llega `cargarMarco` se ve el esqueleto con los colores de la marca.
 */
import "server-only";
import { Suspense, type ReactNode } from "react";
import TenantPageTracker from "@/app/t/[slug]/_components/TenantPageTracker";
import { sinDato } from "@/lib/errores/sin-dato";
import { safeJsonLdStringify } from "@/lib/seo/json-ld";
import { FRANJA, PORTADA } from "./anuncios";
import { ProveedorBolsa } from "./Bolsa";
import { Categorias } from "./Categorias";
import { Favoritos, Lineas, Novedades } from "./Colecciones";
import { cargarMarco, cargarVitrina, type DatosMarco, type DatosSalon } from "./datos";
import { hrefDestino, rellenar, rutas } from "./destinos";
import { BarraSuperior, MenuCategorias } from "./Encabezado";
import { FranjaAnuncio } from "./FranjaAnuncio";
import { Beneficios, Pie } from "./Pie";
import { Portada, type DiapositivaVista } from "./Portada";
import { Promos } from "./Promos";
import { BannerOscuro, Mejorar, Protegida } from "./Salon";
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
  const precios = d.productos.map((p) => p.precio);
  return {
    "@context": "https://schema.org",
    "@type": "HealthAndBeautyBusiness",
    name: d.nombre,
    slogan: "Belleza profesional, cerca de ti",
    description: d.descripcion ?? "Belleza profesional en Ciudad Constitución: cabello, rostro y cuerpo, con asesoría gratis por WhatsApp.",
    currenciesAccepted: "PEN",
    areaServed: ["Ciudad Constitución", "Villa Rica", "Oxapampa", "Puerto Bermúdez"],
    ...(d.whatsapp ? { telephone: `+${d.whatsapp}` } : {}),
    ...(d.direccion ? { address: d.direccion } : {}),
    ...(precios.length ? { priceRange: `S/ ${Math.min(...precios)} – S/ ${Math.max(...precios)}` } : {}),
  };
}

/** Los textos de la franja; `{descuento}` sólo con la vitrina (sin ella, esos textos no salen). */
function mensajesFranja(pagos: string | null, mayorDescuento: number | null): string[] {
  const valores = { descuento: mayorDescuento ? String(mayorDescuento) : null, pagos };
  return FRANJA.map((m) => rellenar(m, valores)).filter((m): m is string => m !== null);
}

/** La franja completa («hasta X % de descuento»): espera la vitrina, que ya está en camino. */
async function FranjaConDescuento({ tenantId, slug, pagos }: { tenantId: string; slug: string; pagos: string | null }) {
  const v = await cargarVitrina(tenantId, slug);
  return <FranjaAnuncio mensajes={mensajesFranja(pagos, v.mayorDescuento)} />;
}

export async function PaginaSalon({ tenantId, slug }: { tenantId: string; slug: string }) {
  // La vitrina arranca YA, en paralelo (la comparten la franja y las secciones: `cache`).
  void cargarVitrina(tenantId, slug).catch(sinDato("página salón · vitrina por adelantado"));
  const m = await cargarMarco(tenantId);
  const diapositivas: DiapositivaVista[] = PORTADA.map(({ cta, cta2, ...p }) => ({
    ...p,
    cta: { texto: cta.texto, ...hrefDestino(cta.destino, slug, m.whatsapp) },
    ...(cta2 ? { cta2: { texto: cta2.texto, ...hrefDestino(cta2.destino, slug, m.whatsapp) } } : {}),
  }));

  return (
    <Lienzo>
      <TenantPageTracker tenantSlug={slug} />
      <ProveedorBolsa slug={slug} codigos={m.codigos}>
        <Suspense fallback={<FranjaAnuncio mensajes={mensajesFranja(m.pagos, null)} />}>
          <FranjaConDescuento tenantId={tenantId} slug={slug} pagos={m.pagos} />
        </Suspense>
        <BarraSuperior nombre={m.nombre} slug={slug} />
        <MenuCategorias slug={slug} categorias={m.categorias} hayOfertas />
        <main id="main-content">
          <Portada diapositivas={diapositivas} />
          <Suspense fallback={<EsqueletoVitrina />}>
            <Vitrina tenantId={tenantId} slug={slug} marco={m} />
          </Suspense>
        </main>
        <Pie nombre={m.nombre} descripcion={m.descripcion} slug={slug} whatsapp={m.whatsapp} redes={m.redes} pagos={m.pagos} />
      </ProveedorBolsa>
    </Lienzo>
  );
}

/** Las secciones con precios (y el JSON-LD con los servicios): llegan con `cargarVitrina`. */
async function Vitrina({ tenantId, slug, marco: m }: { tenantId: string; slug: string; marco: DatosMarco }) {
  const v = await cargarVitrina(tenantId, slug);
  const d: DatosSalon = { ...m, ...v };
  const r = rutas(slug);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(datosEstructurados(d)) }} />
      {d.productos.length === 0 ? (
        <section className={`${ANCHO} py-20 text-center`}>
          <p className="mu-serif text-4xl text-[var(--text-primary)]">Estamos preparando la vitrina</p>
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
      <Mejorar slug={slug} />
      <BannerOscuro whatsapp={d.whatsapp} />
      <Categorias productos={d.productos} servicios={d.servicios} slug={slug} />
      <Protegida whatsapp={d.whatsapp} />
      <Beneficios pagos={d.pagos} nombre={d.nombre} />
    </>
  );
}

const BLOQUE = "animate-pulse rounded-2xl bg-[var(--mu-nude-claro)]";

/** Lo que ocupa la vitrina mientras llegan los precios: un título y una fila de tarjetas. */
function EsqueletoVitrina() {
  return (
    <div className={`${ANCHO} py-14`} aria-busy="true" aria-label="Cargando los productos">
      <div className="h-10 w-56 animate-pulse rounded bg-[var(--mu-nude-claro)]" />
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={`${BLOQUE} aspect-[3/4] ${i < 2 ? "" : i === 2 ? "hidden sm:block" : "hidden lg:block"}`} />
        ))}
      </div>
    </div>
  );
}

/** Lo que se ve mientras llegan los datos: franja, barra, portada y una fila de tarjetas. */
export function EsqueletoSalon() {
  const bloque = "animate-pulse rounded-2xl bg-[var(--mu-nude-claro)]";
  return (
    <Lienzo>
      <div className="h-10 bg-[var(--mu-cacao)]" />
      <div className={`${ANCHO} flex h-16 items-center gap-6 border-b border-[var(--rule-soft)] sm:h-20`}>
        <div className={`${bloque} h-10 w-32`} />
        <div className={`${bloque} mx-auto hidden h-12 w-full max-w-[34rem] rounded-full md:block`} />
      </div>
      <div className="grid min-h-[34rem] bg-[var(--mu-nude-claro)] lg:grid-cols-2" aria-busy="true" aria-label="Cargando la tienda">
        <div className="flex flex-col justify-center gap-4 px-5 py-10 sm:px-10 lg:px-16">
          <div className="h-4 w-48 animate-pulse rounded bg-[var(--mu-nude)]" />
          <div className="h-14 w-4/5 animate-pulse rounded bg-[var(--mu-nude)]" />
          <div className="h-14 w-3/5 animate-pulse rounded bg-[var(--mu-nude)]" />
        </div>
        <div className="hidden animate-pulse bg-[var(--mu-nude)] lg:block" />
      </div>
      <div className={`${ANCHO} grid grid-cols-2 gap-4 py-14 sm:grid-cols-3 lg:grid-cols-5`}>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={`${bloque} aspect-[3/4] ${i < 2 ? "" : i === 2 ? "hidden sm:block" : "hidden lg:block"}`} />
        ))}
      </div>
    </Lienzo>
  );
}
