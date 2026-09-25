/**
 * URLs de fotos: sólo las que salieron de NUESTRO storage (bucket `media` de
 * Supabase Storage, subidas por `/api/upload`), para ESTE tenant.
 *
 * Auditoría de seguridad (2026-09-25, «Fotos de la guía»): `z.string().url()`
 * de Zod 4 acepta `javascript:`, `data:` y `file:` como URL válida —
 * `javascript:alert(1)` pasaba el schema de fotos del ingreso sin tocar nada
 * más. Hoy no se ejecuta (los consumidores son `<img src>` planos y la
 * ventana de impresión tiene `default-src 'none'`), pero el candado real no
 * es "es una URL": una `https://` de un servidor AJENO —o del storage de
 * OTRO tenant— tampoco es "nuestra evidencia". Ese dueño ve la IP de quien
 * abre la ficha (foto remota cargada por el navegador del que mira) y puede
 * cambiar la imagen después sin que el libro se entere, mientras la ficha
 * sigue mostrándola como si fuera la foto original del día que llegó la
 * madera. Por eso se exige el prefijo exacto que emite nuestro propio
 * `/api/upload`, con el `tenantId` de quien hace el pedido.
 */
import { z } from "zod";

const STORAGE_BUCKET = "media";

function storageBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
}

/** El prefijo exacto que arma `app/api/upload/route.ts` para este tenant. */
export function prefijoDeFotosDelTenant(tenantId: string): string | null {
  const base = storageBaseUrl();
  if (!base || !tenantId) return null;
  return `${base}/storage/v1/object/public/${STORAGE_BUCKET}/${tenantId}/`;
}

/**
 * `true` sólo si `url` es una foto pública de ESTE tenant en nuestro bucket.
 *
 * `new URL(url).protocol` ya descarta `javascript:`/`data:`/`file:` (ninguno
 * es `"https:"`), y comparar el string completo contra el prefijo del tenant
 * descarta además cualquier `https://` que no sea nuestro storage — belt and
 * suspenders, ninguna de las dos sola alcanza.
 */
export function esUrlDeFotoPropia(url: string, tenantId: string): boolean {
  const prefijo = prefijoDeFotosDelTenant(tenantId);
  if (!prefijo) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === "https:" && url.startsWith(prefijo);
}

/** Zod para un array de fotos: sólo URLs de ESTE tenant, en nuestro storage. */
export function fotosDelTenantSchema(tenantId: string, max = 10) {
  return z
    .array(
      z.string().max(500).refine((u) => esUrlDeFotoPropia(u, tenantId), {
        message: "Sólo se aceptan fotos subidas desde este panel (storage propio del tenant).",
      }),
    )
    .max(max);
}

/**
 * Guard de servidor, defensa en profundidad más allá del Zod de la ruta: una
 * DB class no puede confiar en que el único llamador de hoy sea esta ruta
 * HTTP. Tira `Error` genérico (no `CtpInvariantError`, que es forestal-only);
 * el llamador lo envuelve con el tipo de error que le sirva.
 */
export function exigirFotosPropias(tenantId: string, fotos: readonly string[] | null | undefined): void {
  for (const url of fotos ?? []) {
    if (!esUrlDeFotoPropia(url, tenantId)) {
      throw new Error(`Esa foto no viene del storage de este negocio: ${url.slice(0, 120)}`);
    }
  }
}
