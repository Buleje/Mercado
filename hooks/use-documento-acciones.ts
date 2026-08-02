"use client";

/**
 * use-documento-acciones — qué se puede HACER con el papel que muestra el visor:
 * bajarlo (PDF o HTML), guardarlo en el expediente y mandarlo por WhatsApp.
 *
 * Vive fuera del visor porque el visor ya tiene bastante con dibujar la hoja, y
 * porque estas tres cosas son la misma cadena: el PDF que se baja es el que se
 * archiva, y el que se manda por WhatsApp es el que quedó archivado — no tres
 * archivos que se parecen.
 */

import { useCallback, useState, type RefObject } from "react";
import { documentoAPdf, nombreArchivo } from "@/lib/forestal/ctp-documento-pdf";
import { archivarEnDrive } from "@/lib/forestal/ctp-archivar-documento";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import type { DbDocument } from "@/lib/types/documents";

/** Con qué datos se archiva la hoja en el Drive del tenant. */
export interface MetaArchivado {
  etiquetas?: string[];
  descripcion?: string;
  carpeta?: string;
}

/** Lo que el visor le pasa al hook: la hoja y dónde está dibujada. */
export interface DocumentoActivo {
  nombre: string;
  archivo?: string;
  html: string;
  pieCorrido?: string;
}

export interface EstadoDrive {
  estado: "guardando" | "listo" | "error";
  detalle?: string;
  aviso?: boolean;
  /** Id en el Drive: con él se manda por WhatsApp sin volver a subirlo. */
  documentId?: string;
}

export function useDocumentoAcciones({
  marco,
  doc,
  onArchivar,
}: {
  marco: RefObject<HTMLIFrameElement | null>;
  doc: DocumentoActivo | undefined;
  onArchivar?: (doc: DocumentoActivo) => MetaArchivado;
}) {
  const [pdf, setPdf] = useState<"armando" | "error" | null>(null);
  const [drive, setDrive] = useState<EstadoDrive | null>(null);
  /** Documento del Drive listo para el modal de envío (null = cerrado). */
  const [wasap, setWasap] = useState<DbDocument | null>(null);
  const [preparandoWasap, setPreparandoWasap] = useState(false);

  /** Baja lo que se le pase con el nombre del documento. */
  const bajar = useCallback((blob: Blob, ext: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivo(doc?.archivo ?? doc?.nombre ?? "documento", ext);
    a.click();
    // Se libera tarde a propósito: revocarlo en el mismo tick cancela la
    // descarga en algunos navegadores antes de que arranque.
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, [doc]);

  const descargarHtml = useCallback(() => {
    if (doc) bajar(new Blob([doc.html], { type: "text/html;charset=utf-8" }), "html");
  }, [doc, bajar]);

  /** El PDF de la hoja que se está viendo. Lo comparten bajar y archivar. */
  const armarPdf = useCallback(async () => {
    const d = marco.current?.contentDocument;
    if (!d || !doc) throw new Error("El documento todavía no terminó de dibujarse.");
    return documentoAPdf(d, { pieCorrido: doc.pieCorrido });
  }, [doc]);

  const descargarPdf = useCallback(async () => {
    setPdf("armando");
    try {
      bajar(await armarPdf(), "pdf");
      setPdf(null);
    } catch (err) {
      // Sin PDF queda el HTML, que imprime igual: se dice, no se rompe la vista.
      logger.error("[ctp-visor] pdf failed", { error: String(err) });
      setPdf("error");
    }
  }, [armarPdf, bajar]);

  const archivar = useCallback(async (): Promise<string | null> => {
    if (!doc || !onArchivar) return null;
    setDrive({ estado: "guardando" });
    try {
      const meta = onArchivar(doc);
      const r = await archivarEnDrive({
        archivo: await armarPdf(),
        nombreArchivo: nombreArchivo(doc.archivo ?? doc.nombre, "pdf"),
        etiquetas: meta.etiquetas,
        descripcion: meta.descripcion,
        carpeta: meta.carpeta,
      });
      setDrive({ estado: "listo", detalle: r.carpeta, aviso: r.sinEtiquetas, documentId: r.documentId });
      return r.documentId;
    } catch (err) {
      logger.error("[ctp-visor] archivar failed", { error: String(err) });
      setDrive({ estado: "error", detalle: err instanceof Error ? err.message : "No se pudo guardar." });
      return null;
    }
  }, [doc, onArchivar, armarPdf]);

  /**
   * Mandar la guía por WhatsApp. Primero tiene que estar EN el expediente: el
   * envío manda el archivo del Drive, no un blob suelto, así que el chofer y la
   * carpeta terminan con exactamente el mismo PDF. Si ya se archivó en esta
   * sesión no se vuelve a subir.
   */
  const enviarPorWhatsapp = useCallback(async () => {
    setPreparandoWasap(true);
    try {
      const id = drive?.documentId ?? (await archivar());
      if (!id) return;
      const r = await fetch(`/api/admin/documents/${encodeURIComponent(id)}`, {
        credentials: "include",
        headers: csrfHeaders(),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const { document } = (await r.json()) as { document?: DbDocument };
      if (!document) throw new Error("el Drive no devolvió el documento");
      setWasap(document);
    } catch (err) {
      logger.error("[ctp-visor] whatsapp failed", { error: String(err) });
      setDrive({ estado: "error", detalle: "No se pudo preparar el envío por WhatsApp. Probá guardarlo en el expediente primero." });
    } finally {
      setPreparandoWasap(false);
    }
  }, [drive, archivar]);

  /** Cambiar de hoja borra los avisos: son de la anterior. */
  const limpiar = useCallback(() => {
    setDrive(null);
    setPdf(null);
  }, []);

  return {
    pdf,
    drive,
    wasap,
    preparandoWasap,
    setWasap,
    descargarHtml,
    descargarPdf,
    archivar,
    enviarPorWhatsapp,
    limpiar,
  };
}
