import "server-only";
import { headers } from "next/headers";
import { resolveTenantSlug, resolveTenantSlugToId } from "@/lib/resolve-tenant";

/**
 * El negocio de ESTA visita, como id real (el que guarda `Page.tenantId`), o
 * `null` si no hay forma de saberlo. Nunca cae en «main» por defecto.
 *
 * El proxy deja en `x-tenant-id` según de dónde se entre:
 *   - `/t/<slug>/cms/x` y subdominio → el slug (hay que pasarlo a id)
 *   - dominio propio → `custom--<host>` (host → slug → id)
 *   - sesión del panel en el host principal → el id directo (vista previa)
 *   - host principal anónimo → `main`, que es un negocio real (el marketplace)
 */
export async function negocioDelHost(): Promise<string | null> {
  const bruto = (await headers()).get("x-tenant-id");
  if (!bruto) return null;
  const slug = await resolveTenantSlug(bruto);
  if (!slug) return null;
  return resolveTenantSlugToId(slug);
}
