/**
 * Pieza `madera-disponible` — las lecturas (servidor).
 *
 * · `leerMaderaPublica` corre `ForestCtpDB.productosDisponibles` (la misma
 *   lectura de la pestaña, ~600 ms en `main` medido el 01-10) y la proyecta a
 *   lo público. La portada no tiene caché propia, así que esto SÍ la tiene:
 *   60 s fresca y como mucho 10 min vieja. El libro no avisa a esta caché
 *   cuando cambia, y por eso la portada dice a qué hora se tomó la foto.
 *   La DB class se importa con `import()`: el libro CTP entero no tiene por qué
 *   entrar al paquete de la portada de todos los negocios.
 * · `contactoDelNegocio` arma el WhatsApp y el nombre con lo que el dueño
 *   cargó en Mi Tienda (las dos lecturas ya tienen su caché).
 */
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { StorePageDB } from "@/lib/db/store-page.db";
import { SettingsDB } from "@/lib/db/settings.db";
import { sinDato } from "@/lib/errores/sin-dato";
import { maderaPublica, type MaderaPublica } from "./proyeccion";

export const tagMaderaDisponible = (tenantId: string): string =>
  `tenant:${tenantId}:madera-disponible`;

export async function leerMaderaPublica(tenantId: string): Promise<MaderaPublica> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 600 });
  cacheTag(tagMaderaDisponible(tenantId));
  const { ForestCtpDB } = await import("@/lib/db/forest-ctp.db");
  const { corridas } = await ForestCtpDB.productosDisponibles(tenantId);
  return maderaPublica(corridas, new Date());
}

export interface ContactoPublico {
  /** El nombre público de la tienda (el del editor, o el del negocio). */
  negocio: string;
  /** El número tal como lo cargó el dueño; el enlace lo arma `waLink`. `null` = sin botón. */
  whatsapp: string | null;
}

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * El WhatsApp de PEDIDOS, en el orden en que el dueño lo declara: Mi Tienda →
 * Contacto, después el del botón flotante del editor, después el teléfono del
 * negocio. El teléfono personal del dueño de la cuenta no se usa acá.
 */
export async function contactoDelNegocio(tenantId: string): Promise<ContactoPublico> {
  const [pagina, ajustes] = await Promise.all([
    StorePageDB.getCustomization(tenantId).catch(sinDato("pieza madera-disponible: Mi Tienda")),
    SettingsDB.get(tenantId).catch(sinDato("pieza madera-disponible: ajustes")),
  ]);
  const tema = (ajustes?.storeTheme ?? {}) as Record<string, unknown>;
  const whatsapp =
    texto(pagina?.whatsappPhone) ||
    texto(tema["whatsapp"]) ||
    texto(ajustes?.businessPhone) ||
    null;
  const negocio = texto(tema["storeName"]) || texto(ajustes?.businessName) || "la tienda";
  return { negocio, whatsapp };
}
