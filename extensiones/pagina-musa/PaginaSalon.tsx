/**
 * «Musa» — la página entera de la tienda (enchufe `tienda.pagina`).
 *
 * En dos tandas (velocidad, 08-10): la franja, la barra, el menú, la portada y
 * el pie salen con la lectura liviana (`cargarMarco`: ajustes, contacto y
 * categorías, sin precios), así el héroe y el primer texto llegan
 * sin esperar la vitrina; las secciones con precios (`cargarVitrina`: visibilidad
 * e historial de precios) llegan después, bajo su propio <Suspense> con
 * `EsqueletoVitrina`. La barra de bienvenida es fija (sin esperar precios); el
 * menú muestra «Regalos» como en el marco.
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
import { Circulos } from "./Circulos";
import { cargarMarco, cargarVitrina, type DatosMarco, type DatosSalon } from "./datos";
import { rellenar, rutas } from "./destinos";
import { BarraSuperior, MenuCategorias } from "./Encabezado";
import { FranjaAnuncio } from "./FranjaAnuncio";
import { Kits } from "./Kits";
import { precargasDe, type ParLetras } from "./letras";
import { Pie } from "./Pie";
import { PorPrecio } from "./PorPrecio";
import { Portada } from "./Portada";
import { valoresCampana } from "./preventa";
import { RutinaCoreana } from "./RutinaCoreana";
import { Confianza, Mejorar } from "./Salon";
import { cssTema, ID_PAGINA } from "./tema";
import { ANCHO, BOTON } from "./ui";

/** El envoltorio con la paleta y la fuente: lo comparten la página y su esqueleto. */
function Lienzo({ letras = "a", children }: { letras?: ParLetras; children: ReactNode }) {
  return (
    // `overflow-x-clip` (no `hidden`): recorta lo que asoma de los carriles sin
    // volverse contenedor de scroll, así la barra pegajosa sigue pegando.
    <div data-pagina={ID_PAGINA} className="min-h-screen overflow-x-clip">
      <style dangerouslySetInnerHTML={{ __html: cssTema(letras) }} />
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

/** Los textos de la barra de bienvenida que valen hoy (la de campaña se va sola al terminar). */
function mensajesFranja(pagos: string | null): string[] {
  const valores = { descuento: null, pagos, ...valoresCampana() };
  return FRANJA.map((m) => rellenar(m, valores)).filter((m): m is string => m !== null);
}

export async function PaginaSalon({ tenantId, slug, letras = "a" }: { tenantId: string; slug: string; letras?: ParLetras }) {
  // La vitrina arranca YA, en paralelo (la comparten el héroe y las secciones: `cache`).
  void cargarVitrina(tenantId, slug).catch(sinDato("página salón · vitrina por adelantado"));
  // El título del héroe es el LCP: sus dos caras (recta y cursiva) salen junto con el HTML.
  for (const url of precargasDe(letras)) preload(url, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  const m = await cargarMarco(tenantId);

  return (
    <Lienzo letras={letras}>
      <TenantPageTracker tenantSlug={slug} />
      <ProveedorBolsa slug={slug} codigos={m.codigos} pedidos={m.pedidos} negocio={m.nombre}>
        <FranjaAnuncio mensajes={mensajesFranja(m.pagos)} />
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
 * Las secciones con precios (y el JSON-LD): llegan con `cargarVitrina`. El orden
 * de las tiendas de belleza que más venden (Natura, Sephora, Ésika; 11-10):
 * héroe → categorías → rutina → kits → atajos → necesidades → confianza → pie
 * (con el boletín). La tienda entera de un vistazo en ~5 pantallas (antes ~10).
 */
async function Vitrina({ tenantId, slug, marco: m }: { tenantId: string; slug: string; marco: DatosMarco }) {
  const v = await cargarVitrina(tenantId, slug);
  const d: DatosSalon = { ...m, ...v };
  const r = rutas(slug);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(datosEstructurados(d)) }} />
      {d.productos.length === 0 ? (
        <section className={`${ANCHO} py-20 text-center`}>
          <p className="mu-titulo text-[length:var(--mu-t-bloque)] text-[var(--text-primary)]">Estamos preparando la vitrina</p>
          <p className="mt-3 text-[length:var(--mu-t-cuerpo)] text-[var(--text-secondary)]">Vuelve en un rato o mira el catálogo completo.</p>
          <a href={r.catalogo} className={`${BOTON} mt-6`}>
            Ver el catálogo
          </a>
        </section>
      ) : (
        <>
          <Circulos productos={d.productos} slug={slug} whatsapp={d.whatsapp} />
          <RutinaCoreana productos={d.productos} slug={slug} />
          <Kits productos={d.productos} slug={slug} whatsapp={d.whatsapp} />
          <PorPrecio productos={d.productos} slug={slug} />
        </>
      )}
      <Mejorar slug={slug} productos={d.productos} whatsapp={d.whatsapp} />
      <Confianza whatsapp={d.whatsapp} />
    </>
  );
}

/** Lo que ocupa la vitrina mientras llegan los precios: la fila de círculos (mismo alto que `Circulos`). */
function FilaCirculos() {
  return (
    <div className={`${ANCHO} grid grid-cols-5 gap-2 border-y border-[var(--rule-soft)] py-6 sm:gap-6 sm:py-10 lg:max-w-[64rem]`}>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="mx-auto h-16 w-16 animate-pulse rounded-full bg-[var(--mu-nude-claro)] sm:h-24 sm:w-24 lg:h-28 lg:w-28" />
      ))}
    </div>
  );
}

function EsqueletoVitrina() {
  return (
    <div aria-busy="true" aria-label="Cargando los productos">
      <FilaCirculos />
    </div>
  );
}

/** Lo que se ve mientras llegan los datos: franja, barra, el héroe (texto + vitrina nude) y la fila de círculos (mismas alturas). */
export function EsqueletoSalon() {
  const bloque = "animate-pulse rounded-full bg-[var(--mu-nude-claro)]";
  const linea = "animate-pulse rounded bg-[var(--mu-nude-claro)]";
  return (
    <Lienzo>
      <div className="h-9 bg-[var(--mu-cacao)]" />
      <div className={`${ANCHO} flex h-14 items-center justify-center gap-6 md:h-[4.5rem] md:justify-start`}>
        <div className={`${bloque} h-10 w-28`} />
        <div className={`${bloque} mx-auto hidden h-12 w-full max-w-[36rem] md:block`} />
      </div>
      <div className="h-[3.625rem] md:hidden" />
      <div className="hidden h-[2.8125rem] border-b border-[var(--rule-soft)] md:block" />
      <div className={`${ANCHO} grid items-center gap-6 pb-8 pt-6 md:grid-cols-2 md:gap-10 md:pb-14 md:pt-10 lg:gap-16`} aria-busy="true" aria-label="Cargando la tienda">
        <div className="flex flex-col gap-4">
          <div className={`${linea} h-3 w-56`} />
          <div className={`${linea} h-12 w-4/5`} />
          <div className={`${linea} h-12 w-3/5`} />
          <div className={`${linea} h-4 w-full max-w-md`} />
          <div className={`${bloque} mt-2 h-12 w-44`} />
        </div>
        <div className="mx-auto aspect-[16/10] w-full max-w-[34rem] animate-pulse rounded-t-[999px] bg-[var(--mu-nude)]/40 md:aspect-[6/5]" />
      </div>
      <FilaCirculos />
    </Lienzo>
  );
}
