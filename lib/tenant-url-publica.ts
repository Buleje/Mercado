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
 * QR corto (ADR-486, 08-10): con `/t/<slug>` el QR de una troza de Blas tenía
 * 122 letras (versión 6, 41×41 módulos) y costaba leerlo impreso chico. La
 * base que reparte el servidor ahora es corta y las direcciones usan una letra
 * por documento (`RUTAS_CORTAS`):
 *   · el host ya dice el negocio (dominio propio, subdominio, el principal) →
 *     `https://<host>/v/t/<id>?c=…`;
 *   · si no → `https://<principal>/v/<código del negocio>/t/<id>?c=…`, con un
 *     código de 5 letras sacado del id del negocio (`codigoCortoNegocio`, sin
 *     escribir nada en la base).
 * Con una base larga (la de antes) las direcciones salen como antes: las
 * etiquetas ya impresas siguen abriendo `/verificar/**`.
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

/* ───────────────────────── QR corto (ADR-486) ───────────────────────── */

/**
 * La letra de cada documento en `/v/…` → su ruta larga. NUNCA cambiar ni
 * reusar una letra: está impresa en etiquetas y guías.
 */
export const RUTAS_CORTAS = {
  /** troza por la línea del Libro TH (`?c=<código>` aparte) */
  t: "verificar/troza",
  /** troza o árbol sólo por su código (pasaporte, QR viejo) */
  c: "verificar",
  g: "verificar/guia",
  d: "verificar/despacho",
  l: "verificar/lote",
  k: "verificar-cacao",
} as const;
export type TipoCorto = keyof typeof RUTAS_CORTAS;

const esTipoCorto = (v: string | undefined): v is TipoCorto => !!v && Object.hasOwn(RUTAS_CORTAS, v);

/** El código de un negocio: 5 letras/dígitos en minúscula (36⁵ ≈ 60 millones). */
export const CODIGO_CORTO_RE = /^[0-9a-z]{5}$/;
const LARGO_CODIGO = 5;

/**
 * El código corto de un negocio, derivado de su id (FNV-1a de 32 bits, módulo
 * 36⁵, en base 36). Determinístico y sin columna nueva: no escribe nada en la
 * base. NUNCA cambiar la fórmula: está impresa en los QR.
 */
export function codigoCortoNegocio(tenantId: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < tenantId.length; i++) {
    h ^= tenantId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h % 36 ** LARGO_CODIGO).toString(36).padStart(LARGO_CODIGO, "0");
}

export interface NegocioParaCodigo {
  id: string;
  active: boolean;
  createdAt: Date;
}

/**
 * Código → su dueño. Si dos negocios caen en el mismo código, es del MÁS
 * VIEJO (activo o no): el dueño de un código no cambia cuando otro negocio se
 * crea o se da de baja, así un QR impreso nunca pasa a abrir otro negocio. El
 * más nuevo queda sin código (sus QR salen con la dirección larga).
 */
export function duenosDeCodigosCortos(negocios: readonly NegocioParaCodigo[]): Map<string, { id: string; activo: boolean }> {
  const orden = [...negocios].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const mapa = new Map<string, { id: string; activo: boolean }>();
  for (const n of orden) {
    const c = codigoCortoNegocio(n.id);
    if (!mapa.has(c)) mapa.set(c, { id: n.id, activo: n.active });
  }
  return mapa;
}

/**
 * La base corta a partir de la larga (`baseVerificacion`). `codigo` = el del
 * negocio si es suyo (`null` si choca con uno más viejo o no se pudo saber):
 * sin código, un negocio que va por `/t/<slug>` se queda con la base larga.
 */
export function baseQrCorta(
  larga: RespuestaUrlPublica,
  t: { codigo: string | null; baseUrl: string },
): RespuestaUrlPublica {
  if (larga.fuente !== "ruta") return { base: `${sinBarraFinal(larga.base)}/v`, fuente: larga.fuente };
  if (t.codigo && CODIGO_CORTO_RE.test(t.codigo)) return { base: `${sinBarraFinal(t.baseUrl)}/v/${t.codigo}`, fuente: "ruta" };
  return larga;
}

/**
 * ¿La base es corta (`…/v` o `…/v/<código>`)? Se mira la RUTA de la base,
 * anclada: `https://x/t/v` (un negocio con slug «v») es larga.
 */
export function esBaseCorta(base: string): boolean {
  let ruta: string;
  try {
    ruta = new URL(base).pathname.replace(/\/+$/, "");
  } catch {
    return false;
  }
  return /^\/v(?:\/[0-9a-z]{5})?$/.test(ruta);
}

/** Arma la dirección: con base corta, la letra del documento; con larga, la ruta de siempre. */
function direccion(base: string, tipo: TipoCorto, valor: string, query = ""): string {
  const b = sinBarraFinal(base);
  return `${b}/${esBaseCorta(b) ? tipo : RUTAS_CORTAS[tipo]}/${encodeURIComponent(valor)}${query}`;
}

export interface RutaCorta {
  /** El código del negocio; `null` = el host dice el negocio. */
  negocio: string | null;
  tipo: TipoCorto;
  /** Tal cual vino en la dirección (puede traer `%2F`). */
  valor: string;
}

/**
 * Los tramos después de `/v/`: `[t, <id>]` (el host dice el negocio) o
 * `[<código>, t, <id>]`. Cualquier otra forma → `null` (404, sin pistas).
 */
export function leerRutaCorta(tramos: readonly string[]): RutaCorta | null {
  const [a, b, c] = tramos;
  if (tramos.length === 2 && esTipoCorto(a) && b) return { negocio: null, tipo: a, valor: b };
  if (tramos.length === 3 && a && CODIGO_CORTO_RE.test(a) && esTipoCorto(b) && c) return { negocio: a, tipo: b, valor: c };
  return null;
}

/** El negocio que ya dice el pedido: `concreto` = dominio propio, subdominio o `/t/<slug>`. */
export interface NegocioDelHost {
  concreto: boolean;
  tenantId: string | null;
}

/**
 * El código corto sólo elige el negocio en el host NEUTRO (el principal). Si
 * el host o un `/t/<slug>` ya dicen otro negocio → `null` («no encontrado»):
 * `/t/<slug de A>/v/<código de B>/…` no muestra el certificado de B bajo la
 * dirección de A (revisión ADR-486).
 */
export function negocioDeCodigoEnHost(delCodigo: string | null, host: NegocioDelHost): string | null {
  if (!delCodigo) return null;
  if (!host.concreto) return delCodigo;
  return host.tenantId === delCodigo ? delCodigo : null;
}

/**
 * `/v/<código>/t/<id>` → `/verificar/troza/<id>` (la ruta larga equivalente,
 * sin el negocio). `null` si no es una ruta corta. Para quien lee un QR (la
 * pistola, el escáner del despacho): así entiende las dos formas igual.
 */
export function rutaLargaDeCorta(pathname: string): string | null {
  const m = /^\/v\/(.+?)\/?$/.exec(pathname);
  const r = m?.[1] ? leerRutaCorta(m[1].split("/")) : null;
  return r ? `/${RUTAS_CORTAS[r.tipo]}/${r.valor}` : null;
}

/**
 * QR de una troza (o árbol) del Libro TH: `…/verificar/troza/<id de la línea>?c=<código>`
 * (corta: `…/v/…/t/<id>?c=<código>`). Sin línea (un papel que sólo conoce el
 * código, p. ej. el pasaporte del árbol) queda la forma por código
 * `…/verificar/<código>` (corta: `…/c/<código>`), que sigue abriendo.
 */
export function urlVerificarTroza(base: string, t: { lineaId?: string | null; codigo: string }): string {
  if (t.lineaId) return direccion(base, "t", t.lineaId, `?c=${encodeURIComponent(t.codigo)}`);
  return direccion(base, "c", t.codigo);
}

/** La lista pública de una guía del Libro TH: se abre con el id de una de sus líneas de despacho. */
export const urlVerificarGuiaLoth = (base: string, lineaId: string) => direccion(base, "g", lineaId);

export const urlVerificarDespacho = (base: string, id: string) => direccion(base, "d", id);

export const urlVerificarLote = (base: string, id: string) => direccion(base, "l", id);

export const urlVerificarCacao = (base: string, code: string) => direccion(base, "k", code);
