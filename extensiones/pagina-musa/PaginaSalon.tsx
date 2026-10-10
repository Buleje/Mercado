/**
 * «Musa» — la página entera de la tienda (enchufe `tienda.pagina`).
 *
 * En dos tandas (velocidad, 08-10): la franja, la barra, el menú, la portada y
 * el pie salen con la lectura liviana (`cargarMarco`: ajustes, contacto y
 * categorías, sin precios), así el héroe y el primer texto llegan
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
import { preload } from "react-dom";
import TenantPageTracker from "@/app/t/[slug]/_components/TenantPageTracker";
import { sinDato } from "@/lib/errores/sin-dato";
import { safeJsonLdStringify } from "@/lib/seo/json-ld";
import { FRANJA } from "./anuncios";
import { ProveedorBolsa } from "./Bolsa";
import { Categorias } from "./Categorias";
import { Favoritos, Lineas, Novedades } from "./Colecciones";
import { cargarMarco, cargarVitrina, type DatosMarco, type DatosSalon } from "./datos";
import { rellenar, rutas } from "./destinos";
import { BarraSuperior, MenuCategorias } from "./Encabezado";
import { FranjaAnuncio } from "./FranjaAnuncio";
import { Beneficios, Pie } from "./Pie";
import { Portada } from "./Portada";
import { Promos } from "./Promos";
import { BannerOscuro, Mejorar, Protegida } from "./Salon";
import { CSS_TEMA, FUENTE_SCRIPT, ID_PAGINA } from "./tema";
import { ANCHO, BOTON } from "./ui";

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
  // La script del héroe («esta Navidad») bloquea su texto hasta llegar: que salga junto con el HTML.
  preload(FUENTE_SCRIPT, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  const m = await cargarMarco(tenantId);

  return (
    <Lienzo>
      <TenantPageTracker tenantSlug={slug} />
      <ProveedorBolsa slug={slug} codigos={m.codigos}>
        <Suspense fallback={<FranjaAnuncio mensajes={mensajesFranja(m.pagos, null)} />}>
          <FranjaConDescuento tenantId={tenantId} slug={slug} pagos={m.pagos} />
        </Suspense>
        <BarraSuperior nombre={m.nombre} slug={slug} categorias={m.categorias} hayOfertas />
        <MenuCategorias slug={slug} categorias={m.categorias} hayOfertas />
        <main id="main-content">
          <Portada tenantId={tenantId} slug={slug} />
          <Suspense fallback={<EsqueletoVitrina />}>
            <Vitrina tenantId={tenantId} slug={slug} marco={m} />
          </Suspense>
        </main>
        <Pie nombre={m.nombre} descripcion={m.descripcion} slug={slug} whatsapp={m.whatsapp} redes={m.redes} pagos={m.pagos} />
      </ProveedorBolsa>
    </Lienzo>
  );
}

/**
 * Las secciones con precios (y el JSON-LD): llegan con `cargarVitrina`. El
 * orden es el del catálogo impreso (contrato §e): «Hola, linda» junto a
 * «¿Qué quieres mejorar?», los kits, lo nuevo y lo favorito, las categorías,
 * el diagnóstico de los sábados y la compra protegida.
 */
async function Vitrina({ tenantId, slug, marco: m }: { tenantId: string; slug: string; marco: DatosMarco }) {
  const v = await cargarVitrina(tenantId, slug);
  const d: DatosSalon = { ...m, ...v };
  const r = rutas(slug);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(datosEstructurados(d)) }} />
      <Mejorar slug={slug} productos={d.productos} whatsapp={d.whatsapp} />
      {d.productos.length === 0 ? (
        <section className={`${ANCHO} py-20 text-center`}>
          <p className="mu-serif text-[length:var(--mu-t-titulo)] text-[var(--text-primary)]">Estamos preparando la vitrina</p>
          <p className="mt-3 text-[length:var(--mu-t-cuerpo)] text-[var(--text-secondary)]">Vuelve en un rato o mira el catálogo completo.</p>
          <a href={r.catalogo} className={`${BOTON} mt-6`}>
            Ver el catálogo
          </a>
        </section>
      ) : (
        <>
          <Promos productos={d.productos} slug={slug} />
          <Novedades productos={d.productos} slug={slug} />
          <Favoritos productos={d.productos} />
          <Lineas productos={d.productos} slug={slug} nombre={d.nombre} />
        </>
      )}
      <Categorias productos={d.productos} servicios={d.servicios} slug={slug} />
      <BannerOscuro whatsapp={d.whatsapp} />
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

/** Lo que se ve mientras llegan los datos: franja, barra, el héroe en cacao y una fila de tarjetas (mismas alturas). */
export function EsqueletoSalon() {
  const bloque = "animate-pulse rounded-full bg-[var(--mu-nude-claro)]";
  const enCacao = "animate-pulse rounded bg-[var(--mu-sobre-cacao)]/10";
  return (
    <Lienzo>
      <div className="h-9 bg-[var(--mu-cacao)]" />
      <div className={`${ANCHO} flex h-14 items-center justify-center gap-6 md:h-[4.5rem] md:justify-start`}>
        <div className={`${bloque} h-10 w-28`} />
        <div className={`${bloque} mx-auto hidden h-11 w-full max-w-[36rem] md:block`} />
      </div>
      <div className="h-[3.625rem] md:hidden" />
      <div className="hidden h-[2.8125rem] border-b border-[var(--rule-soft)] md:block" />
      <div className="grid min-h-[36rem] bg-[var(--mu-cacao)] lg:grid-cols-[7fr_5fr]" aria-busy="true" aria-label="Cargando la tienda">
        <div className="order-2 flex flex-col justify-center gap-4 px-5 py-10 sm:px-10 lg:order-1 lg:px-16">
          <div className={`${enCacao} h-3 w-48`} />
          <div className={`${enCacao} h-14 w-4/5`} />
          <div className={`${enCacao} h-14 w-3/5`} />
          <div className={`${enCacao} h-14 w-4/5`} />
        </div>
        <div className="order-1 mx-auto mt-8 h-[300px] w-[240px] animate-pulse rounded-t-full bg-[var(--mu-nude)]/20 lg:order-2 lg:my-auto lg:h-[460px] lg:w-[360px]" />
      </div>
      <div className={`${ANCHO} grid grid-cols-2 gap-4 py-14 sm:grid-cols-3 lg:grid-cols-5`}>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={`${BLOQUE} aspect-[3/4] ${i < 2 ? "" : i === 2 ? "hidden sm:block" : "hidden lg:block"}`} />
        ))}
      </div>
    </Lienzo>
  );
}
