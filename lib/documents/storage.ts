import "server-only";
import { randomBytes } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { SIGNED_URL_TTL_SECONDS } from "@/lib/types/documents";

export const BUCKET = "documents";

/**
 * Construye un storage path multi-tenant seguro.
 *   tenants/<tenantId>/<documentId>/<version>__<originalName>
 *
 * tenantId y documentId siempre son cuids ([a-z0-9]); originalName se sanea.
 * Bloqueamos path traversal (..) y caracteres fuera del set seguro.
 */
export function buildStoragePath(opts: {
  tenantId: string;
  documentId: string;
  versionLabel?: string; // ej "v1" | "v2-sig"
  originalName: string;
}): string {
  const safeName = opts.originalName
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.+/g, ".")
    .slice(0, 80);
  const version = opts.versionLabel ?? "v1";
  const nonce = randomBytes(4).toString("hex");
  return `tenants/${opts.tenantId}/${opts.documentId}/${version}-${nonce}__${safeName}`;
}

export async function uploadToStorage(
  path: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabaseAdmin();
  const { error } = await sb.storage.from(BUCKET).upload(path, body, {
    contentType,
    upsert: false,
  });
  if (error) {
    logger.error("documents.storage.upload_fail", { path, error: error.message });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function deleteFromStorage(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const sb = getSupabaseAdmin();
  const { error } = await sb.storage.from(BUCKET).remove(paths);
  if (error) {
    logger.warn("documents.storage.delete_fail", { paths, error: error.message });
  }
}

export async function getSignedUrl(
  path: string,
  ttlSeconds = SIGNED_URL_TTL_SECONDS
): Promise<string | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, ttlSeconds);
  if (error || !data?.signedUrl) {
    logger.warn("documents.storage.signed_url_fail", { path, error: error?.message });
    return null;
  }
  return data.signedUrl;
}

export async function downloadFromStorage(path: string): Promise<Buffer | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.storage.from(BUCKET).download(path);
  if (error || !data) {
    logger.warn("documents.storage.download_fail", { path, error: error?.message });
    return null;
  }
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/** Sanea el mime contra una allowlist amplia de tipos de oficina/imágen. */
export const ALLOWED_MIME_PREFIXES = [
  "image/",
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-excel",
  "application/msword",
  "application/vnd.ms-powerpoint",
  "text/plain",
  "text/csv",
  "text/markdown",
  "video/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
];

export function isMimeAllowed(mime: string): boolean {
  return ALLOWED_MIME_PREFIXES.some((p) =>
    p.endsWith("/") ? mime.startsWith(p) : mime === p || mime.startsWith(p)
  );
}
