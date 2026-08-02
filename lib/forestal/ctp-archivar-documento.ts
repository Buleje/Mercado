"use client";

/**
 * ctp-archivar-documento.ts — guardar un papel del libro en el expediente.
 *
 * Un PDF descargado a «Descargas» no es un expediente: cuando llega una
 * fiscalización, lo que se pide es la carpeta con las guías, y esa carpeta vive
 * en el Drive del tenant, no en la máquina del que imprimió. Esto sube el
 * documento al Drive, lo deja en su carpeta y le pone las etiquetas con las que
 * después se lo busca.
 *
 * ── Orden de las operaciones ─────────────────────────────────────────────────
 * Carpeta → archivo → etiquetas. Si las etiquetas fallan, el archivo YA está
 * arriba y se avisa igual: perder el documento por no poder etiquetarlo sería
 * cambiar lo importante por lo accesorio.
 */

import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";

/** Dónde viven las guías del libro. Un solo nombre, para que no se dispersen. */
export const CARPETA_GUIAS = "Guías forestales (GTF)";

interface CarpetaDrive {
  id: string;
  name: string;
  parentId?: string | null;
}

const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

/**
 * La carpeta del expediente, creándola si es la primera guía que se archiva.
 * Devuelve `null` si el Drive no responde: se archiva en la raíz antes que
 * perder el documento.
 */
export async function carpetaDelExpediente(nombre = CARPETA_GUIAS): Promise<string | null> {
  try {
    const r = await fetch("/api/admin/documents/folders", {
      credentials: "include",
      headers: csrfHeaders(),
    });
    if (r.ok) {
      const { folders = [] } = (await r.json()) as { folders?: CarpetaDrive[] };
      const ya = folders.find((f) => normalizar(f.name) === normalizar(nombre) && !f.parentId);
      if (ya) return ya.id;
    }
    const c = await fetch("/api/admin/documents/folders", {
      method: "POST",
      credentials: "include",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ name: nombre }),
    });
    if (!c.ok) return null;
    const { folder } = (await c.json()) as { folder?: CarpetaDrive };
    return folder?.id ?? null;
  } catch (err) {
    logger.warn("[ctp-archivar] carpeta no disponible", { error: String(err) });
    return null;
  }
}

export interface ArchivarDocumento {
  archivo: Blob;
  /** Nombre completo con extensión: "GTF 019-0000003.pdf". */
  nombreArchivo: string;
  carpeta?: string;
  etiquetas?: string[];
  /** Lo que el documento es, en una línea. Entra al texto buscable del Drive. */
  descripcion?: string;
}

export interface ResultadoArchivado {
  documentId: string;
  carpeta: string;
  /** El archivo subió pero no se pudieron fijar etiquetas o descripción. */
  sinEtiquetas?: boolean;
}

export async function archivarEnDrive(o: ArchivarDocumento): Promise<ResultadoArchivado> {
  const carpetaNombre = o.carpeta ?? CARPETA_GUIAS;
  const folderId = await carpetaDelExpediente(carpetaNombre);

  const fd = new FormData();
  // El Blob viaja como File para que el servidor conserve el NOMBRE: la
  // extensión es la que decide qué hace el sistema al abrirlo.
  fd.append("file", new File([o.archivo], o.nombreArchivo, { type: o.archivo.type || "application/pdf" }));
  if (folderId) fd.append("folderId", folderId);

  // Sin `Content-Type`: el navegador tiene que poner el boundary del multipart.
  const r = await fetch("/api/admin/documents", {
    method: "POST",
    credentials: "include",
    headers: csrfHeaders(),
    body: fd,
  });
  if (!r.ok) {
    const detalle = await r.text().catch(() => "");
    throw new Error(`No se pudo guardar en el Drive (HTTP ${r.status}). ${detalle.slice(0, 140)}`);
  }
  const { document } = (await r.json()) as { document?: { id?: string } };
  const documentId = document?.id;
  if (!documentId) throw new Error("El Drive aceptó el archivo pero no devolvió su identificador.");

  let sinEtiquetas = false;
  if (o.etiquetas?.length || o.descripcion) {
    try {
      const p = await fetch(`/api/admin/documents/${encodeURIComponent(documentId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          // El tope del endpoint es 20 etiquetas de 40 caracteres.
          ...(o.etiquetas?.length ? { tags: o.etiquetas.slice(0, 20).map((t) => t.slice(0, 40)) } : {}),
          ...(o.descripcion ? { descripcion: o.descripcion.slice(0, 2000) } : {}),
        }),
      });
      sinEtiquetas = !p.ok;
    } catch (err) {
      sinEtiquetas = true;
      logger.warn("[ctp-archivar] etiquetas fallaron", { error: String(err) });
    }
  }

  return { documentId, carpeta: carpetaNombre, sinEtiquetas };
}
