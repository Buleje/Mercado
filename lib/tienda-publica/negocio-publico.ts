import "server-only";
import { z } from "zod";
import { tenantIdPublico } from "@/lib/resolve-tenant";
import { CatalogoPublicoDB } from "@/lib/db/catalogo-publico.db";
import { SettingsDB } from "@/lib/db/settings.db";
import { StorePageDB } from "@/lib/db/store-page.db";
import { ROOT_DOMAIN } from "@/lib/middleware/constants";
import { baseVerificacion } from "@/lib/tenant-url-publica";

/**
 * negocio-publico — QUÉ negocio pide una superficie pública sin sesión (feed de
 * productos, catálogo público, enlace para compartir) y cuál es la dirección
 * real de su tienda.
 *
 * El negocio sale de:
 *  1. `?tienda=<slug>` si viene (para pedir el feed de una tienda desde la
 *     dirección principal), o
 *  2. el identificador crudo que elige cada ruta: el feed usa SOLO el host
 *     (`resolveTenantFromHost`, el mismo del proxy: subdominio,
 *     `custom--<dominio propio>` o la principal), así una caché compartida
 *     nunca guarda el feed de la sesión de un admin bajo la dirección
 *     principal; el catálogo y el enlace para compartir usan `x-tenant-id`
 *     (el proxy suma la página de origen `/t/<slug>`).
 * Las dos pasan por `tenantIdPublico` (el mismo resolvedor de las páginas
 * `/verificar`): slug o dominio → id real, y solo si el negocio está activo.
 * Nada cae a otro negocio: sin cabecera, slug inventado, dominio desconocido,
 * negocio dado de baja o página de la tienda despublicada → `null` (404).
 */

/** `?tienda=`: un slug de negocio (minúsculas, dígitos y guiones), nunca un dominio sintético. */
export const TiendaParamSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(80)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/)
  .refine((s) => !s.startsWith("custom--"), "slug inválido");

export interface NegocioPublico {
  tenantId: string;
  slug: string;
  /** Como se presenta en su tienda: nombre de la tienda › razón comercial › nombre del negocio. */
  nombre: string;
  /** Base pública de su tienda, sin barra final. */
  base: string;
}

export type ResultadoNegocioPublico =
  | { ok: true; negocio: NegocioPublico }
  | { ok: false; status: 400 | 404 };

function nombreDeLaTienda(
  storeTheme: Record<string, unknown> | undefined,
  businessName: string | undefined,
  nombreNegocio: string,
): string {
  const deLaTienda = typeof storeTheme?.storeName === "string" ? storeTheme.storeName.trim() : "";
  return deLaTienda || businessName?.trim() || nombreNegocio;
}

export async function resolverNegocioPublico(entrada: {
  /** Valor crudo de `?tienda=` (null si no vino). */
  tienda: string | null;
  /** Slug, id o `custom--<dominio>` del negocio (host o `x-tenant-id`, según la ruta). */
  tenantCrudo: string | null;
  /** Origen de la petición (`https://host`): base si falta `NEXT_PUBLIC_BASE_URL`. */
  origen: string;
}): Promise<ResultadoNegocioPublico> {
  let crudo: string | null = entrada.tenantCrudo;
  if (entrada.tienda !== null) {
    const p = TiendaParamSchema.safeParse(entrada.tienda);
    if (!p.success) return { ok: false, status: 400 };
    crudo = p.data;
  }

  const tenantId = await tenantIdPublico(crudo);
  if (!tenantId) return { ok: false, status: 404 };

  const [negocio, settings, pagina] = await Promise.all([
    CatalogoPublicoDB.negocio(tenantId),
    SettingsDB.get(tenantId),
    StorePageDB.getCustomization(tenantId),
  ]);
  if (!negocio || !negocio.activo || pagina.published === false) return { ok: false, status: 404 };

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim() || entrada.origen;
  const { base } = baseVerificacion({
    slug: negocio.slug,
    customDomain: negocio.dominioPropio,
    rootDomain: ROOT_DOMAIN,
    baseUrl,
  });

  return {
    ok: true,
    negocio: {
      tenantId,
      slug: negocio.slug,
      nombre: nombreDeLaTienda(settings.storeTheme, settings.businessName, negocio.nombre),
      base,
    },
  };
}
