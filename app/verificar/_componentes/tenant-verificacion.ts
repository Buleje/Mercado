import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { tenantIdPublico } from "@/lib/resolve-tenant";
import { esTenantPorDefecto } from "@/lib/tenancy/negocio-por-defecto";
import type { NegocioDelHost } from "@/lib/tenant-url-publica";

/**
 * El negocio de una página pública de verificación (`/verificar/**`,
 * `/verificar-cacao/**`).
 *
 * Por defecto sale del host, como siempre (`tenantIdPublico` del
 * `x-tenant-id` que puso el proxy). La ruta corta del QR (`/v/<código>/…`,
 * ADR-486) muestra ESTAS mismas páginas sin redirigir —sin salto extra en el
 * celular y sin dejar ver el slug— y les fija el negocio del código antes de
 * dibujarlas. El almacén es de React `cache`: vive un solo pedido, así que lo
 * fijado en un pedido nunca pasa a otro.
 */
const delPedido = cache((): { fijado: boolean; tenantId: string | null } => ({ fijado: false, tenantId: null }));

/** Lo llama sólo `/v/…`: `null` = código desconocido o negocio de baja → «no encontrado». */
export function fijarTenantVerificacion(tenantId: string | null): void {
  const p = delPedido();
  p.fijado = true;
  p.tenantId = tenantId;
}

/**
 * El negocio que ya dice el pedido. El proxy pone el negocio por defecto en el
 * host principal (neutro) y marca `x-tenant-store-route` cuando entró por
 * `/t/<slug>`; un cliente que mande esa marca a mano sólo se cierra la puerta.
 */
export async function negocioDelHost(): Promise<NegocioDelHost> {
  const h = await headers();
  const crudo = h.get("x-tenant-id");
  // El host al que apuntan los QR con código es neutro aunque `ROOT_DOMAIN` no lo reconozca.
  const principal = hostname(process.env.NEXT_PUBLIC_BASE_URL);
  const esPrincipal = principal !== "" && hostname(h.get("host")) === principal;
  const concreto = h.get("x-tenant-store-route") === "1" || (!esTenantPorDefecto(crudo) && !esPrincipal);
  return { concreto, tenantId: concreto ? await tenantIdPublico(crudo) : null };
}

function hostname(v: string | null | undefined): string {
  const s = (v ?? "").trim().toLowerCase();
  if (!s) return "";
  try {
    return new URL(s.includes("://") ? s : `http://${s}`).hostname;
  } catch {
    return "";
  }
}

export async function tenantDeVerificacion(): Promise<string | null> {
  const p = delPedido();
  if (p.fijado) return p.tenantId;
  return tenantIdPublico((await headers()).get("x-tenant-id"));
}
