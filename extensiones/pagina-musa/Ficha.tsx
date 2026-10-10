/**
 * La ficha de un producto o servicio de «Buleje Beauty»
 * (`/t/<negocio>/tienda/<producto>`, ADR-460), coherente con la portada y el
 * catálogo: migas del salón, la foto sobre el rubor de las tarjetas, marca en
 * versalitas, nombre en serif, precio con el «antes» y el % del historial,
 * cantidad + «Agregar a la bolsa» (la bolsa del marco), «Pregunta por
 * WhatsApp», beneficios, «Cómo usarlo» y «Completa tu rutina».
 * · Un SERVICIO no va a la bolsa: «Reservar por WhatsApp» y los otros servicios.
 * · Un producto que no es del salón (la bodega de `main`), oculto o que no
 *   existe → «no lo encontramos» dentro del marco (título de no encontrado y
 *   sin indexar, por `metadatosFicha`). Nunca la ficha general.
 *
 * `Ficha` devuelve AL INSTANTE (el tope de 2 s nunca salta por la base): los
 * datos se leen adentro, bajo <Suspense> con el esqueleto de la marca. Son las
 * mismas lecturas del catálogo (`cargarMarco` + `cargarVitrina`, una vez por pedido).
 */
import "server-only";
import { Suspense } from "react";
import type { MetadatosFicha, PropsFicha } from "../_contrato";
import { safeJsonLdStringify } from "@/lib/seo/json-ld";
import { MODO_DE_USO, PASOS_RESERVA } from "./anuncios-ficha";
import { cargarMarco, cargarVitrina, type DatosMarco, type ProductoSalon } from "./datos";
import { rutas, soles } from "./destinos";
import { EsqueletoFicha, NoEncontrado, OtrosServicios, Pasos, Rutina } from "./FichaExtras";
import { Galeria, Migas, Resumen, type Miga } from "./FichaPartes";
import type { Opciones } from "./manifest";
import { esServicio, productoDeLaUrl, rutinaDe, sugeridos } from "./rutina";
import { CSS_TEMA, ID_PAGINA } from "./tema";
import { ANCHO } from "./ui";

async function buscar(tenantId: string, slug: string, producto: string) {
  const [m, v] = await Promise.all([cargarMarco(tenantId), cargarVitrina(tenantId, slug)]);
  return { m, v, p: productoDeLaUrl([...v.productos, ...v.servicios], producto) };
}

/*
 * JSON-LD con rutas de la tienda (`/t/<negocio>/…`), como el del catálogo: Google
 * las resuelve contra la URL de la página. Una pieza no lee `process.env`
 * (ADR-457); la canónica absoluta la arma el sistema con `metadatosFicha.ruta`.
 */

function migasDe(p: ProductoSalon, slug: string): Miga[] {
  const r = rutas(slug);
  const grupo = esServicio(p) ? { nombre: "Servicios", href: r.servicios } : { nombre: p.categoria, href: r.categoria(p.categoria) };
  return [{ nombre: "Inicio", href: r.base }, grupo, { nombre: p.nombre }];
}

/** Producto (o Servicio) + migas, para Google. Precio de hoy y, si hubo rebaja, el de antes tachado. */
function JsonLd({ p, m, migas }: { p: ProductoSalon; m: DatosMarco; migas: Miga[] }) {
  const url = p.href;
  const oferta = {
    "@type": "Offer",
    url,
    price: p.precio.toFixed(2),
    priceCurrency: "PEN",
    ...(p.antes
      ? { priceSpecification: { "@type": "UnitPriceSpecification", priceType: "https://schema.org/StrikethroughPrice", price: p.antes.toFixed(2), priceCurrency: "PEN" } }
      : {}),
  };
  const comun = { "@context": "https://schema.org", name: p.nombre, url, ...(p.descripcion ? { description: p.descripcion } : {}), ...(p.imagen ? { image: p.imagen } : {}) };
  const cosa = esServicio(p)
    ? { ...comun, "@type": "Service", provider: { "@type": "HairSalon", name: m.nombre }, offers: oferta }
    : {
        ...comun,
        "@type": "Product",
        sku: `${p.id}`,
        category: p.categoria,
        brand: { "@type": "Brand", name: p.marca ?? m.nombre },
        offers: {
          ...oferta,
          availability: p.stock !== null && p.stock <= 0 ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
          itemCondition: "https://schema.org/NewCondition",
          seller: { "@type": "Organization", name: m.nombre },
        },
      };
  const ruta = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: migas.map((x, i) => ({ "@type": "ListItem", position: i + 1, name: x.nombre, item: x.href ?? url })),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(cosa) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(ruta) }} />
    </>
  );
}

async function FichaSalon({ tenantId, slug, producto }: { tenantId: string; slug: string; producto: string }) {
  const { m, v, p } = await buscar(tenantId, slug, producto);
  if (!p) return <NoEncontrado nombre={m.nombre} slug={slug} sugeridos={sugeridos(v.productos)} />;

  const servicio = esServicio(p);
  const migas = migasDe(p, slug);
  const linea = p.marca ? `Línea ${p.marca}` : `Tienda ${m.nombre}`;
  return (
    <main id="main-content">
      <JsonLd p={p} m={m} migas={migas} />
      <div className={`${ANCHO} pb-14 pt-6 sm:pb-20 sm:pt-8`}>
        <Migas items={migas} />
        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-14">
          <Galeria p={p} />
          <Resumen p={p} whatsapp={m.whatsapp} pagos={m.pagos} />
        </div>
      </div>
      {servicio ? (
        <>
          <Pasos kicker="Tu cita" titulo="Así reservas" pasos={PASOS_RESERVA} />
          <OtrosServicios servicios={v.servicios.filter((s) => s.id !== p.id)} slug={slug} />
        </>
      ) : (
        <>
          <Pasos kicker="Modo de uso" titulo="Cómo usarlo" pasos={MODO_DE_USO[p.categoria] ?? []} />
          <Rutina productos={rutinaDe(v.productos, p)} kicker={linea} titulo="Completa tu rutina" />
        </>
      )}
    </main>
  );
}

export function Ficha({ ctx, producto }: PropsFicha<Opciones>) {
  return (
    <div data-pagina={ID_PAGINA} className="overflow-x-clip">
      <style dangerouslySetInnerHTML={{ __html: CSS_TEMA }} />
      <Suspense fallback={<EsqueletoFicha />}>
        <FichaSalon tenantId={ctx.tenantId} slug={ctx.slug} producto={producto} />
      </Suspense>
    </div>
  );
}

/** El título de la pestaña y lo que se ve al compartir; `null` = no es del salón. */
export async function metadatosFicha({ ctx, producto }: PropsFicha<Opciones>): Promise<MetadatosFicha | null> {
  const { m, p } = await buscar(ctx.tenantId, ctx.slug, producto);
  if (!p) return null;
  const rebaja = p.antes && p.descuento ? ` Antes ${soles(p.antes)}, hoy ${soles(p.precio)} (-${p.descuento} %).` : "";
  const cierre = esServicio(p) ? `Reserva tu cita en ${m.nombre} por WhatsApp.` : `Envío gratis en Ciudad Constitución con ${m.nombre}.`;
  return {
    titulo: `${p.nombre} — ${soles(p.precio)} · ${m.nombre}`,
    descripcion: `${p.descripcion ?? p.nombre}${rebaja} ${cierre}`,
    ruta: p.href,
    imagen: p.imagen || null,
  };
}
