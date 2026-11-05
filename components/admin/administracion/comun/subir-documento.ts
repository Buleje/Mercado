/**
 * subir-documento — sube un papel al Archivo y lo cuelga de lo que se está
 * llenando (ADR-524 §3.1, `POST /api/admin/documents` extendido): el servidor
 * crea la carpeta de `carpetaRuta` si falta y, con `vinculoTipo`/`vinculoId`,
 * pone el tag de máquina y deja el papel en su lugar (un requisito queda en
 * «hay», un pago con su comprobante, un alquiler con su contrato).
 */
import { csrfHeaders } from "@/lib/csrf-client";
import { comprimirParaArchivo } from "@/lib/documents/compress-image";
import { MAX_UPLOAD_SIZE } from "@/lib/types/documents";
import type { Dia, VinculoDocumento } from "@/lib/admin/fichas-tramites-alquileres";

export interface OpcionesSubida {
  /** «Trámites/Agrobanco 2026-10». */
  carpetaRuta: string;
  vinculoTipo: VinculoDocumento;
  /** El id de la entidad; para un requisito, `<tramiteId>:<requisitoId>`. */
  vinculoId: string;
  expiresAt?: Dia | null;
}

export type ResultadoSubida = { ok: true; id: string; vinculado: boolean } | { ok: false; error: string };

export async function subirDocumento(archivo: File, o: OpcionesSubida): Promise<ResultadoSubida> {
  if (archivo.size > MAX_UPLOAD_SIZE) return { ok: false, error: "El archivo pasa de 50 MB: achícalo o pártelo." };
  const fd = new FormData();
  fd.append("file", await comprimirParaArchivo(archivo));
  fd.append("carpetaRuta", o.carpetaRuta);
  fd.append("vinculoTipo", o.vinculoTipo);
  fd.append("vinculoId", o.vinculoId);
  if (o.expiresAt) fd.append("expiresAt", o.expiresAt);
  try {
    const res = await fetch("/api/admin/documents", { method: "POST", credentials: "include", headers: csrfHeaders(), body: fd });
    const j = (await res.json().catch(() => null)) as { document?: { id?: string }; id?: string; vinculado?: boolean; error?: string; message?: string } | null;
    const id = j?.document?.id ?? j?.id;
    if (!res.ok || !id) {
      const texto = j?.message ?? (j?.error && !/^[a-z_]+$/.test(j.error) ? j.error : null);
      return { ok: false, error: texto ?? (res.status === 404 ? "Ya no existe a qué colgar el papel: actualiza la lista." : "No se pudo subir el archivo.") };
    }
    return { ok: true, id, vinculado: j?.vinculado === true };
  } catch {
    return { ok: false, error: "Sin conexión: el archivo no se subió." };
  }
}

/** El enlace para abrir un papel del Archivo. */
export const enlaceDocumento = (id: string) => `/api/admin/documents/${encodeURIComponent(id)}/download`;
