/**
 * La ficha de un producto de Musa (`/t/<negocio>/tienda/<producto>`, ADR-460;
 * contrato visual §e «Ficha»), 6/6: a la izquierda el arco alto con el envase
 * ilustrado y sus miniaturas; a la derecha migas, kicker, nombre, el chip negro
 * «Cód. MU001» (como el catálogo), el precio (en un kit, «por separado» y lo que
 * ahorras, del servidor), preventa o encargo, «Te ayuda a» (o «Qué trae»), la
 * cantidad + «Agregar» (`Comprar`) y la tira de confianza. Debajo: «Tu rutina
 * en 3 pasos», «Llévalo en kit» y más de la categoría. En el celular, cuando el
 * botón sale de la vista, una barra fija con precio y contador (`BarraCompra`).
 * · Un SERVICIO no va a la bolsa: «Reservar por WhatsApp» y los otros servicios.
 * · Un producto que no es del salón, oculto o que no existe → «no lo
 *   encontramos» dentro del marco (sin indexar, por `metadatosFicha`).
 *
 * `Ficha` devuelve AL INSTANTE (el tope de 2 s nunca salta por la base): los
 * datos se leen adentro, bajo <Suspense> con el esqueleto de la marca. Son las
 * mismas lecturas del catálogo (`cargarMarco` + `cargarVitrina`, una vez por pedido).
 */
import "server-only";
import { Suspense } from "react";
import { Clock, MessageCircle, RefreshCw, ShieldCheck, Truck } from "@buleje/design-system/icons";
import type { MetadatosFicha, PropsFicha } from "../_contrato";
import { safeJsonLdStringify } from "@/lib/seo/json-ld";
import { MODO_DE_USO, PASOS_RESERVA } from "./anuncios-ficha";
import { BarraCompra } from "./BotonAgregar";
import { Comprar } from "./Comprar";
import { cargarMarco, cargarVitrina, type DatosMarco, type ProductoSalon } from "./datos";
import { enlaceWhatsapp, mensajeReserva, rutas, soles, solesCortos } from "./destinos";
import { KitsQueLoTraen, NoEncontrado, OtrosServicios, Pasos, QueTrae, Rutina, RutinaTresPasos } from "./FichaExtras";
import { EsqueletoFicha, EstadoPedido, Existencias, Galeria, Migas, Precio, type Miga } from "./FichaPartes";
import { tarjetaDe } from "./compartir";
import { CompartirProducto } from "./CompartirProducto";
import { CARPETA_ILUSTRACIONES, imagenDe } from "./imagenes";
import type { Opciones } from "./manifest";
import { ENVIO_GRATIS_DESDE } from "./pedido-whatsapp";
import { esServicio, productoDeLaUrl, rutinaDe, rutinaEnTresPasos, sugeridos } from "./rutina";
import { Insignia } from "./TarjetaProducto";
import { CSS_TEMA, ID_PAGINA } from "./tema";
import { ANCHO, BOTON, KICKER } from "./ui";

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
        sku: p.codigo ?? `${p.id}`,
        category: p.categoria,
        brand: { "@type": "Brand", name: p.marca ?? m.nombre },
        offers: {
          ...oferta,
          availability:
            p.stock !== null && p.stock <= 0
              ? "https://schema.org/OutOfStock"
              : p.etiqueta === "Por encargo" || p.etiqueta === "Preventa"
                ? "https://schema.org/PreOrder"
                : "https://schema.org/InStock",
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

/** «Ayuda a limpiar sin resecar y a alargar el efecto…» → dos viñetas; lo demás (formato, consejo) va aparte. */
function beneficiosDe(descripcion: string | null): { puntos: string[]; resto: string | null } | null {
  const frases = (descripcion ?? "").split(/(?<=\.)\s+/).map((f) => f.trim()).filter(Boolean);
  const m = frases[0] ? /^Ayuda a (.+?)\.?$/i.exec(frases[0]) : null;
  if (!m?.[1]) return null;
  const puntos = m[1].split(/\s+y a\s+/).map((x) => x.charAt(0).toUpperCase() + x.slice(1));
  const resto = frases.slice(1).filter((f) => !/se pide al confirmar/i.test(f)).join(" ");
  return { puntos, resto: resto || null };
}

function TeAyuda({ p }: { p: ProductoSalon }) {
  const b = beneficiosDe(p.descripcion);
  if (!b) return p.descripcion ? <p className="mt-6 max-w-xl text-[length:var(--mu-t-cuerpo)] leading-relaxed text-[var(--text-secondary)]">{p.descripcion}</p> : null;
  return (
    <div className="mt-6">
      <p className="mu-kicker text-[var(--mu-acento-tinta)]">Te ayuda a</p>
      <ul className="mt-3 flex flex-col gap-2.5">
        {b.puntos.map((x) => (
          <li key={x} className="flex items-start gap-3 text-[length:var(--mu-t-cuerpo)] leading-snug text-[var(--text-primary)]">
            <span aria-hidden="true" className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--mu-selva-claro)] text-[var(--mu-selva-tinta)]">
              <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 6.2 5 8.5l4.5-5" />
              </svg>
            </span>
            {x}
          </li>
        ))}
      </ul>
      {b.resto && <p className="mt-3 text-[length:var(--mu-t-chico)] text-[var(--text-secondary)]">{b.resto}</p>}
    </div>
  );
}

/** Envío, cambio y NSO: lo que da confianza, en una tira debajo del botón. */
function Confianza() {
  const items = [
    { Icono: Truck, titulo: "Envío gratis en Constitución", texto: `Fuera, gratis desde ${solesCortos(ENVIO_GRATIS_DESDE)}` },
    { Icono: RefreshCw, titulo: "Cambio sin costo", texto: "Si llega dañado: avísanos en 7 días" },
    { Icono: ShieldCheck, titulo: "Originales con NSO", texto: "Registro sanitario a la vista" },
  ];
  return (
    <ul className="mt-7 grid gap-3 border-t border-[var(--rule-soft)] pt-6 sm:grid-cols-3">
      {items.map(({ Icono, titulo, texto }) => (
        <li key={titulo} className="flex items-start gap-3 sm:flex-col sm:gap-2">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--mu-selva-claro)] text-[var(--mu-selva-tinta)]">
            <Icono className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
          </span>
          <span className="leading-snug">
            <span className="block text-[length:var(--mu-t-chico)] font-semibold text-[var(--text-primary)]">{titulo}</span>
            <span className="block text-sm text-[var(--text-tertiary)]">{texto}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** La columna de al lado del arco: quién es, cuánto cuesta, qué hace y cómo se pide. */
function Resumen({ p, whatsapp }: { p: ProductoSalon; whatsapp: string | null }) {
  const servicio = esServicio(p);
  const { src } = imagenDe(p);
  return (
    // `data-mu-despejar`: la píldora «Ver bolsa» del celular no tapa el precio, el aviso de preventa ni «Qué trae».
    <div data-mu-despejar className="flex flex-col">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className={KICKER}>{servicio ? "Servicio del salón" : p.kit ? (p.kit.componentes.length === 1 ? "Dúo" : "Kit") : p.categoria}</span>
        {p.etiqueta && <Insignia texto={p.etiqueta} />}
      </p>
      <h1 className="mu-serif mt-3 text-[length:var(--mu-t-titulo)] leading-[1.1] text-[var(--text-primary)]">{p.nombre}</h1>
      {p.codigo && (
        <p className="mt-3">
          <span className="inline-flex items-center rounded-full bg-[var(--surface-sunken)] px-3 py-1 text-sm font-medium tabular-nums text-[var(--text-secondary)]">Cód. {p.codigo}</span>
        </p>
      )}
      <Precio p={p} />
      {servicio ? (
        p.duracion && (
          <p className="mt-4 inline-flex items-center gap-2 text-base text-[var(--text-secondary)]">
            <Clock className="h-5 w-5" aria-hidden="true" /> {p.duracion}
          </p>
        )
      ) : (
        <>
          <EstadoPedido etiqueta={p.etiqueta} />
          <Existencias stock={p.stock} />
        </>
      )}
      {p.kit ? <QueTrae kit={p.kit} /> : <TeAyuda p={p} />}
      {servicio ? (
        <a href={enlaceWhatsapp(whatsapp, mensajeReserva(p))} target="_blank" rel="noopener noreferrer" className={`${BOTON} mt-7 w-full`}>
          <MessageCircle className="h-5 w-5" aria-hidden="true" /> Reservar por WhatsApp
        </a>
      ) : (
        <div id="mu-comprar">
          <Comprar
            producto={{ id: p.id, name: p.nombre, category: p.categoria, price: p.precio, image: src ?? "", unit: p.unidad, ...(p.stock !== null ? { stock: p.stock } : {}) }}
            consulta={enlaceWhatsapp(whatsapp, `Hola Drucila, tengo una consulta sobre ${p.nombre}${p.codigo ? ` (${p.codigo})` : ""}, de ${solesCortos(p.precio)}.`)}
          />
          <CompartirProducto nombre={p.nombre} texto={`Mira esto de Musa: ${p.nombre}${p.codigo ? ` (${p.codigo})` : ""}, ${solesCortos(p.precio)}.`} />
        </div>
      )}
      {!servicio && <Confianza />}
    </div>
  );
}

async function FichaSalon({ tenantId, slug, producto }: { tenantId: string; slug: string; producto: string }) {
  const { m, v, p } = await buscar(tenantId, slug, producto);
  if (!p) return <NoEncontrado nombre={m.nombre} slug={slug} sugeridos={sugeridos(v.productos)} />;

  const servicio = esServicio(p);
  const migas = migasDe(p, slug);
  const pasos = servicio ? [] : rutinaEnTresPasos(v.productos, p);
  const kits = p.kit ? [] : v.productos.filter((k) => k.kit && k.kit.ahorro > 0 && k.kit.componentes.some((c) => c.codigo === p.codigo));
  const parecidos = p.kit ? v.productos.filter((x) => x.kit && x.id !== p.id) : rutinaDe(v.productos, p).filter((x) => !x.kit);
  const { src } = imagenDe(p);
  return (
    <main id="main-content">
      <JsonLd p={p} m={m} migas={migas} />
      <div className={`${ANCHO} pb-14 pt-6 sm:pb-20 sm:pt-8`}>
        <Migas items={migas} />
        <div data-mu-producto className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-14">
          <Galeria p={p} paso={pasos.find((x) => x.esEste) ?? null} />
          <Resumen p={p} whatsapp={m.whatsapp} />
        </div>
      </div>
      {servicio ? (
        <>
          <Pasos kicker="Tu cita" titulo="Así reservas" pasos={PASOS_RESERVA} />
          <OtrosServicios servicios={v.servicios.filter((s) => s.id !== p.id)} slug={slug} />
        </>
      ) : (
        <>
          {pasos.length > 0 ? <RutinaTresPasos pasos={pasos} categoria={p.categoria} /> : <Pasos kicker="Modo de uso" titulo="Cómo usarlo" pasos={MODO_DE_USO[p.categoria] ?? []} />}
          <KitsQueLoTraen kits={kits} nombre={p.nombre} />
          <Rutina productos={parecidos} kicker={p.kit ? "Kits y dúos" : p.categoria} titulo={p.kit ? "Otros kits" : `Más de ${p.categoria.toLowerCase()}`} />
          <BarraCompra
            ancla="mu-comprar"
            producto={{ id: p.id, name: p.nombre, category: p.categoria, price: p.precio, image: src ?? "", unit: p.unidad, ...(p.stock !== null ? { stock: p.stock } : {}) }}
          />
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
  const ahorro = p.kit && p.kit.ahorro > 0 ? ` Por separado ${solesCortos(p.kit.porSeparado)}: ahorras ${solesCortos(p.kit.ahorro)}.` : "";
  const cierre = esServicio(p) ? `Reserva tu cita en ${m.nombre} por WhatsApp.` : `Envío gratis en Ciudad Constitución con ${m.nombre}.`;
  return {
    titulo: `${p.nombre} — ${solesCortos(p.precio)} · ${m.nombre}`,
    descripcion: `${p.descripcion ?? p.nombre}${rebaja}${ahorro} ${cierre}`,
    ruta: p.href,
    // La tarjeta de 1200 × 630 del producto (`compartir.ts`): el envase solo es un webp
    // con fondo transparente, que WhatsApp pinta sobre negro. Una foto real subida gana.
    imagen: p.imagen && !p.imagen.startsWith(CARPETA_ILUSTRACIONES) ? p.imagen : tarjetaDe(p.codigo),
  };
}
