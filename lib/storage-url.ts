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
import { esPathDeCargaDelTenant, normalizarFoto, pathDeFoto, type FotoCarga } from "@/lib/forestal/fotos-carga";

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

/**
 * ¿Esta foto se puede ACEPTAR para este tenant? Sólo la privada
 * `priv:<tenant>/forestal-carga/<archivo>` de su carpeta.
 *
 * Desde 2026-09-26 una `https://` (el bucket público `media` de antes) ya no
 * entra, ni siquiera la del propio tenant: medido ese día, 0 fotos https en
 * `WoodEntry.photos` de TODOS los tenants — no hay legado que conservar, y
 * una URL pública no se puede firmar ni esconder. Leerlas sigue funcionando
 * (`normalizarFoto`), aceptarlas no.
 */
export function esFotoPropia(foto: FotoCarga | string, tenantId: string): boolean {
  const path = pathDeFoto(foto);
  return path != null && esPathDeCargaDelTenant(path, tenantId);
}

const MENSAJE_AJENA = "Sólo se aceptan fotos subidas desde este panel (almacén privado del negocio).";

/**
 * Zod para un array de fotos: objetos `FotoCarga` (o el string de la URL) con
 * `url` privada de ESTE tenant; SIEMPRE devuelve objetos, con su `firma`.
 * El Zod no verifica la firma ni si la foto ya estaba en la guía: eso lo decide
 * `WoodEntriesDB` con `resolverFotosEntrantes` (necesita la base y el secreto).
 */
export function fotosDelTenantSchema(tenantId: string, max = 10) {
  const objeto = z.looseObject({ url: z.string().max(500) });
  return z
    .array(
      z
        .union([z.string().max(500), objeto])
        .transform((v, ctx): FotoCarga => {
          const f = normalizarFoto(v);
          if (!f || !esFotoPropia(f, tenantId)) {
            ctx.addIssue({ code: "custom", message: MENSAJE_AJENA });
            return z.NEVER;
          }
          return f;
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
export function exigirFotosPropias(tenantId: string, fotos: readonly (FotoCarga | string)[] | null | undefined): void {
  for (const f of fotos ?? []) {
    if (!esFotoPropia(f, tenantId)) {
      const url = typeof f === "string" ? f : f?.url ?? "";
      throw new Error(`Esa foto no viene del storage de este negocio: ${String(url).slice(0, 120)}`);
    }
  }
}
