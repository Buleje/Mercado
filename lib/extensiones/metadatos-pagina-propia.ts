import "server-only";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { ENCHUFE_PAGINA, pideSinPiezas, type MetadatosPagina, type ParametrosDeBusqueda, type VistaCompartible } from "@/extensiones/_contrato";
import { origenDeLaPeticion } from "@/lib/seo/origen-de-la-peticion";
import { paginaPropiaDeLaTienda } from "./pagina-propia-tienda";
import { conTope, reportarFalloPieza } from "./tope";

/**
 * Los metadatos de la portada (`/t/<negocio>`) o del catálogo (`…/tienda`) de un
 * negocio con página propia que trae `metadatosPagina`:
 * · `undefined` — no hay página propia, no trae `metadatosPagina`, falló o
 *   `?sinPiezas=1`: la ruta usa los suyos de siempre (las demás tiendas no cambian);
 * · el objeto `Metadata` listo, con las URL ABSOLUTAS armadas con el dominio de
 *   la petición (`origenDeLaPeticion`), no con `NEXT_PUBLIC_BASE_URL`.
 *
 * `alternates` se declara entero (con `languages`): re-declararlo en una página
 * PISA el del layout, que apunta a buleje.pe.
 */
export async function metadatosDePaginaPropia(
  vista: VistaCompartible,
  searchParams: Promise<ParametrosDeBusqueda> | ParametrosDeBusqueda,
): Promise<Metadata | undefined> {
  const propia = await paginaPropiaDeLaTienda();
  const armar = propia?.pieza.metadatosPagina;
  if (!propia || !armar) return undefined;
  const busqueda = await searchParams;
  if (pideSinPiezas(busqueda)) return undefined;

  let m: MetadatosPagina;
  try {
    m = await conTope(
      Promise.resolve().then(() => armar({ ctx: propia.ctx, opciones: propia.opciones, searchParams: busqueda, vista })),
      undefined,
      `los metadatos de la página de ${propia.piezaId}`,
    );
  } catch (err) {
    unstable_rethrow(err);
    reportarFalloPieza(err, { piezaId: propia.piezaId, enchufe: ENCHUFE_PAGINA, tenantId: propia.ctx.tenantId, etapa: "pagina-metadatos" });
    return undefined;
  }

  const origen = await origenDeLaPeticion();
  // `/t/<negocio>/…` lo marca el middleware; por subdominio o dominio propio la tienda vive en la raíz.
  const porRuta = (await headers()).get("x-tenant-store-route") === "1";
  const base = porRuta ? `/t/${encodeURIComponent(propia.ctx.slug)}` : "";
  const consulta = m.consulta?.startsWith("?") ? m.consulta : "";
  const url = `${origen}${vista === "portada" ? base || "/" : `${base}/tienda`}${consulta}`;
  const imagen = m.imagen ? { url: `${origen}${m.imagen.ruta}`, width: m.imagen.ancho, height: m.imagen.alto, alt: m.imagen.alt } : null;

  return {
    metadataBase: new URL(origen),
    title: { absolute: m.titulo },
    description: m.descripcion,
    alternates: { canonical: url, languages: { "es-PE": url, "x-default": url } },
    openGraph: {
      title: m.titulo,
      description: m.descripcion,
      url,
      siteName: m.sitio,
      ...(imagen ? { images: [imagen] } : {}),
      type: "website",
      locale: "es_PE",
    },
    twitter: { card: "summary_large_image", title: m.titulo, description: m.descripcion, ...(imagen ? { images: [imagen.url] } : {}) },
  };
}
