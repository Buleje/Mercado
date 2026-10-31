import "server-only";
import type { ContextoPieza, MetadatosPagina, VistaCompartible } from "@/extensiones/_contrato";
import { SettingsDB } from "@/lib/db/settings.db";
import { StorePageDB } from "@/lib/db/store-page.db";
import { sinDato } from "@/lib/errores/sin-dato";

/**
 * ADR-511 · lo que se ve al compartir la portada y el catálogo de un negocio
 * con la plantilla `pagina-tienda`, si la plantilla no trae `metadatosPagina`
 * propios. Con los datos DE ESE negocio, nada escrito a mano:
 * · nombre: `storeTheme.storeName` → `businessName` → slug (la cadena de la general);
 * · título: el de Google que puso el dueño (`metaTitle`) → el nombre; el catálogo, «<nombre> — Catálogo»;
 * · imagen: `ogImageUrl` → `heroImageUrl` → `/api/og` con el nombre del negocio;
 * · ícono de la pestaña y del celular: el logo del negocio, si tiene.
 *
 * Rutas relativas o URL completas: el dominio y la canónica los pone
 * `metadatosDePaginaPropia`. Una imagen pegada como `data:` no sirve para
 * compartir (WhatsApp no la lee) ni para el ícono: se salta a la siguiente.
 */
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** URL que un navegador o WhatsApp pueden pedir: `https://…`, `http://…` o una ruta del sitio (`/…`, no `//…`). */
export function urlUsable(v: unknown): string | null {
  const t = texto(v);
  if (!t) return null;
  return /^https?:\/\//i.test(t) || (t.startsWith("/") && !t.startsWith("//")) ? t : null;
}

export async function metadatosDeLaPlantilla({ ctx, vista }: { ctx: ContextoPieza; vista: VistaCompartible }): Promise<MetadatosPagina> {
  const [ajustes, pagina] = await Promise.all([
    SettingsDB.get(ctx.tenantId).catch(sinDato("plantilla · metadatos: ajustes")),
    StorePageDB.getCustomization(ctx.tenantId).catch(sinDato("plantilla · metadatos: portada")),
  ]);
  const st = (ajustes?.storeTheme ?? {}) as Record<string, unknown>;
  const nombre = texto(st.storeName) ?? texto(ajustes?.businessName) ?? ctx.slug;
  const lema = texto(ajustes?.slogan);

  const titulo = vista === "portada" ? (texto(pagina?.metaTitle) ?? nombre) : `${nombre} — Catálogo`;
  const descripcion =
    texto(pagina?.metaDescription) ??
    texto(pagina?.heroSubtitle) ??
    texto(st.description) ??
    `Compra en ${nombre} con delivery rápido. Paga con Yape o efectivo.`;

  const subtitulo = vista === "portada" ? (lema ?? "Pide online con delivery") : "Catálogo";
  const ruta =
    urlUsable(pagina?.ogImageUrl) ??
    urlUsable(pagina?.heroImageUrl) ??
    `/api/og?title=${encodeURIComponent(nombre)}&subtitle=${encodeURIComponent(subtitulo)}`;
  const logo = urlUsable(ajustes?.logoUrl) ?? urlUsable(st.logo);

  return {
    sitio: nombre,
    titulo,
    descripcion,
    imagen: { ruta, ancho: 1200, alto: 630, alt: nombre },
    iconos: logo ? { icono: logo, apple: logo } : null,
  };
}
