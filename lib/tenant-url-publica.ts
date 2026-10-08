/**
 * tenant-url-publica — la dirección pública del negocio para los QR de
 * verificación (contrato K4 (d), 08-10).
 *
 * Los QR forestales se armaban con `window.location.origin`: impresos desde la
 * PC del dueño en el host principal, el celular del inspector caía en otro
 * negocio y la troza salía «no encontrada». La base la decide el SERVIDOR
 * (`GET /api/admin/tenant/url-publica`) con esta regla:
 *
 *   1. dominio propio → `https://<customDomain>`
 *   2. el negocio por defecto → la dirección principal (`NEXT_PUBLIC_BASE_URL`)
 *   3. subdominios de verdad (`ROOT_DOMAIN` ≠ localhost) → `https://<slug>.<ROOT_DOMAIN>`
 *   4. si no → `<NEXT_PUBLIC_BASE_URL>/t/<slug>` (anda en cualquier host:
 *      el proxy reescribe `/t/<slug>/*` con el negocio del slug)
 *
 * Y las direcciones de cada QR salen de acá (una sola forma por documento).
 * El QR de una troza lleva el id de SU línea del libro, no el código: el
 * código se repite entre permisos y va a cambiar (`12A-0001`, ADR del código
 * único), el id no. El código viaja igual en `?c=` para que la pistola, sin
 * internet, sepa qué troza es.
 *
 * PURO y client-safe.
 */

import { z } from "zod";
import { esTenantPorDefecto } from "@/lib/tenancy/negocio-por-defecto";

export type FuenteBasePublica = "dominio" | "principal" | "subdominio" | "ruta";

/** Lo que responde `GET /api/admin/tenant/url-publica` (se valida al leerlo). */
export const RespuestaUrlPublicaSchema = z.object({
  base: z.string().url(),
  fuente: z.enum(["dominio", "principal", "subdominio", "ruta"]),
});
export type RespuestaUrlPublica = z.infer<typeof RespuestaUrlPublicaSchema>;

const sinBarraFinal = (v: string) => v.trim().replace(/\/+$/, "");

/** ¿El dominio raíz sirve para subdominios? `localhost` (y vacío) no. */
function dominioConSubdominios(rootDomain: string | null): string | null {
  const r = (rootDomain ?? "").trim().toLowerCase().split(":")[0] ?? "";
  if (!r || r === "localhost" || r.endsWith(".localhost") || /^\d+\.\d+\.\d+\.\d+$/.test(r)) return null;
  return r;
}

export function baseVerificacion(t: {
  slug: string;
  customDomain: string | null;
  rootDomain: string | null;
  baseUrl: string;
}): RespuestaUrlPublica {
  const dominio = (t.customDomain ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (dominio) return { base: `https://${dominio}`, fuente: "dominio" };
  const baseUrl = sinBarraFinal(t.baseUrl);
  if (esTenantPorDefecto(t.slug)) return { base: baseUrl, fuente: "principal" };
  const root = dominioConSubdominios(t.rootDomain);
  if (root) return { base: `https://${t.slug}.${root}`, fuente: "subdominio" };
  return { base: `${baseUrl}/t/${encodeURIComponent(t.slug)}`, fuente: "ruta" };
}

/**
 * QR de una troza (o árbol) del Libro TH: `…/verificar/troza/<id de la línea>?c=<código>`.
 * Sin línea (un papel que sólo conoce el código, p. ej. el pasaporte del
 * árbol) queda la forma vieja `…/verificar/<código>`, que sigue abriendo.
 */
export function urlVerificarTroza(base: string, t: { lineaId?: string | null; codigo: string }): string {
  const b = sinBarraFinal(base);
  if (t.lineaId) return `${b}/verificar/troza/${encodeURIComponent(t.lineaId)}?c=${encodeURIComponent(t.codigo)}`;
  return `${b}/verificar/${encodeURIComponent(t.codigo)}`;
}

/** La lista pública de una guía del Libro TH: se abre con el id de una de sus líneas de despacho. */
export const urlVerificarGuiaLoth = (base: string, lineaId: string) =>
  `${sinBarraFinal(base)}/verificar/guia/${encodeURIComponent(lineaId)}`;

export const urlVerificarDespacho = (base: string, id: string) =>
  `${sinBarraFinal(base)}/verificar/despacho/${encodeURIComponent(id)}`;

export const urlVerificarLote = (base: string, id: string) =>
  `${sinBarraFinal(base)}/verificar/lote/${encodeURIComponent(id)}`;

export const urlVerificarCacao = (base: string, code: string) =>
  `${sinBarraFinal(base)}/verificar-cacao/${encodeURIComponent(code)}`;
