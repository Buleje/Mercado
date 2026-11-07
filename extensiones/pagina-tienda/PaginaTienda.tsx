/**
 * La portada de la tienda de cualquier negocio (ADR-511; el formato de Musa,
 * `pagina-musa/PaginaSalon.tsx`, sin nada de Musa).
 *
 * Arriba la franja, la barra pegajosa y el menú de categorías; en el medio los
 * bloques de `contenido.bloques` EN SU ORDEN (héroe, círculos, por precio,
 * destacados, compra tranquila, políticas); abajo el pie. Cada bloque sin
 * datos no se dibuja (sin fotos, sin WhatsApp, sin políticas: nada roto ni
 * vacío). `VistaTienda` es pura (la prueban los tests con un fixture);
 * `PaginaTienda` lee los datos (`cargarTienda`, en caché) y precarga la letra.
 *
 * La portada vive fuera del layout de la tienda: trae su propio carrito (el
 * mismo `CartProvider` de siempre, con el slug del negocio); el resto de la
 * tienda usa el del layout (`Marco.tsx`).
 */
import "server-only";
import type { ReactNode } from "react";
import { preload } from "react-dom";
import TenantPageTracker from "@/app/t/[slug]/_components/TenantPageTracker";
import { CartProvider } from "@/contexts/cart-context";
import { safeJsonLdStringify } from "@/lib/seo/json-ld";
import { Circulos } from "./Circulos";
import { Confianza } from "./Confianza";
import type { BloqueId, DatosTienda } from "./contenido";
import { cargarTienda } from "./datos";
import { Destacados } from "./Destacados";
import { BarraSuperior, MenuCategorias } from "./Encabezado";
import { FranjaAnuncio } from "./FranjaAnuncio";
import { precargasDe } from "./letras";
import type { CategoriaEnlace } from "./Pie";
import { Pie } from "./Pie";
import { Politicas, tienePoliticas } from "./Politicas";
import { PorPrecio } from "./PorPrecio";
import { Portada } from "./Portada";
import { cssTema, ID_PAGINA_TIENDA } from "./tema";
import { ANCHO, BOTON, CSS_PIEZAS, CUERPO, TITULO_BLOQUE, rutasTienda } from "./ui";

/** El envoltorio con la paleta y la letra: lo comparten la portada y su esqueleto. */
export function Lienzo({ css, children }: { css: string; children: ReactNode }) {
  return (
    // `overflow-x-clip` (no `hidden`): recorta lo que asoma de los carriles sin
    // volverse contenedor de scroll, así la barra pegajosa sigue pegando.
    <div data-pagina={ID_PAGINA_TIENDA} className="min-h-screen overflow-x-clip">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {children}
    </div>
  );
}

/** Las categorías como se leen (el nombre que puso el dueño) y su clave para el filtro. */
export const categoriasDe = (d: DatosTienda): CategoriaEnlace[] => d.contenido.circulos.map(({ nombre, categoria }) => ({ nombre, categoria }));

function datosEstructurados(d: DatosTienda) {
  const n = d.negocio;
  const precios = d.productos.map((p) => p.precio);
  return {
    "@context": "https://schema.org",
    "@type": "Store",
    name: n.nombre,
    ...(n.lema ? { slogan: n.lema } : {}),
    ...(n.descripcion ? { description: n.descripcion } : {}),
    ...(n.logo ? { logo: n.logo } : {}),
    currenciesAccepted: "PEN",
    ...(n.whatsapp ? { telephone: `+${n.whatsapp}` } : {}),
    ...(n.direccion ? { address: n.direccion } : {}),
    ...(precios.length ? { priceRange: `S/ ${Math.min(...precios)} – S/ ${Math.max(...precios)}` } : {}),
  };
}

function VitrinaVacia({ slug }: { slug: string }) {
  return (
    <section className={`${ANCHO} border-t border-[var(--ti-linea-suave)] py-16 text-center sm:py-20`}>
      <p className={TITULO_BLOQUE}>Estamos preparando la vitrina</p>
      <p className={`mx-auto mt-3 max-w-md ${CUERPO}`}>Vuelve en un rato o escríbenos: te contamos qué hay hoy.</p>
      <a href={rutasTienda(slug).catalogo} className={`${BOTON} mt-6`}>
        Ver el catálogo
      </a>
    </section>
  );
}

/** La portada ya con sus datos (pura: sin leer nada). */
export function VistaTienda({ datos, bolsa }: { datos: DatosTienda; bolsa?: ReactNode }) {
  const { negocio: n, contenido: c, productos, mayorDescuento } = datos;
  const categorias = categoriasDe(datos);
  const nombres = new Map(categorias.map((x) => [x.categoria, x.nombre]));
  const hayOfertas = mayorDescuento !== null;
  const conPoliticas = c.bloques.includes("politicas") && tienePoliticas(n);
  const sinProductos = productos.length === 0;

  const bloque: Record<BloqueId, () => ReactNode> = {
    franja: () => null, // va arriba de la barra (abajo)
    heroe: () => <Portada heroe={c.heroe} negocio={n} productos={productos} mayorDescuento={mayorDescuento} />,
    circulos: () => <Circulos circulos={c.circulos} slug={n.slug} />,
    porPrecio: () => <PorPrecio productos={productos} slug={n.slug} nombre={n.nombre} nombres={nombres} />,
    destacados: () => <Destacados productos={productos} slug={n.slug} nombres={nombres} />,
    confianza: () => <Confianza items={c.confianza} negocio={n} politicas={conPoliticas} />,
    politicas: () => <Politicas negocio={n} />,
  };
  const deProductos: ReadonlySet<BloqueId> = new Set(["circulos", "porPrecio", "destacados"]);
  const orden = c.bloques.filter((b) => b !== "franja" && !(sinProductos && deProductos.has(b)));
  const tras = orden.findIndex((b) => b !== "heroe");
  const vacia = sinProductos ? <VitrinaVacia key="vacia" slug={n.slug} /> : null;

  return (
    <>
      <TenantPageTracker tenantSlug={n.slug} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(datosEstructurados(datos)) }} />
      {c.bloques.includes("franja") && <FranjaAnuncio mensajes={c.franja} />}
      <BarraSuperior negocio={n} categorias={categorias} hayOfertas={hayOfertas} />
      <MenuCategorias slug={n.slug} categorias={categorias} hayOfertas={hayOfertas} />
      <main id="main-content">
        {orden.map((b, i) => (
          <BloqueEnSuLugar key={b} antes={i === tras ? vacia : null}>
            {bloque[b]()}
          </BloqueEnSuLugar>
        ))}
        {tras === -1 && vacia}
      </main>
      <Pie negocio={n} categorias={categorias} politicas={conPoliticas} />
      {bolsa}
    </>
  );
}

/** Un bloque (y, si toca, el «Estamos preparando la vitrina» justo antes: después del héroe). */
function BloqueEnSuLugar({ antes, children }: { antes: ReactNode; children: ReactNode }) {
  return (
    <>
      {antes}
      {children}
    </>
  );
}

/** La portada entera: lee los datos y la dibuja con su carrito. */
export async function PaginaTienda({ tenantId, slug, bolsa }: { tenantId: string; slug: string; bolsa?: ReactNode }) {
  const datos = await cargarTienda({ tenantId, slug });
  // El título del héroe es el LCP: la cara de la letra sale junto con el HTML.
  for (const url of precargasDe(datos.tema.letra)) preload(url, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  return (
    <Lienzo css={cssTema(datos.tema) + CSS_PIEZAS}>
      <CartProvider tenantSlug={slug}>
        <VistaTienda datos={datos} bolsa={bolsa} />
      </CartProvider>
    </Lienzo>
  );
}
