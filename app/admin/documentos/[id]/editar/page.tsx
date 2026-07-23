"use client";

/**
 * /admin/documentos/[id]/editar — editor de planillas del drive.
 *
 * Se abre en una PESTAÑA NUEVA desde la ficha del documento: editar una lista
 * de precios no debería costar salir del panel, bajar el archivo, abrir Excel
 * y volver a subirlo.
 *
 * La página sólo resuelve "qué documento es y si se puede editar"; el trabajo
 * lo hace HojaCalculoEditor, que carga el archivo, lo deja editar y lo guarda
 * como una versión nueva del mismo documento.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Loader2 } from "@buleje/design-system/icons";
import { esHojaEditable } from "@/lib/documentos/hoja-calculo";
import { esTextoEditable } from "@/lib/documentos/texto-docx";

const cargando = () => (
  <div className="p-16 text-center text-[var(--text-tertiary)]">
    <Loader2 className="mx-auto h-6 w-6 animate-spin" />
    <p className="mt-2 text-sm">Preparando el editor…</p>
  </div>
);

// exceljs y jszip pesan: se cargan sólo cuando alguien abre el editor que los
// necesita, no en el panel ni en el editor del otro tipo de archivo.
const HojaCalculoEditor = dynamic(() => import("@/components/admin/documentos/HojaCalculoEditor"), {
  ssr: false, loading: cargando,
});
const DocumentoTextoEditor = dynamic(() => import("@/components/admin/documentos/DocumentoTextoEditor"), {
  ssr: false, loading: cargando,
});

interface DocInfo {
  id: string;
  name: string;
  mimeType: string;
  /** Qué editor abre este archivo. */
  editor: "hoja" | "texto";
}

export default function EditarDocumentoPage({ params }: { params: Promise<{ id: string }> }) {
  const [doc, setDoc] = useState<DocInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const { id } = await params;
        const r = await fetch(`/api/admin/documents/${id}`, { credentials: "include" });
        if (!r.ok) throw new Error(r.status === 404 ? "Ese documento no existe o no tenés permiso para verlo." : `No se pudo abrir (HTTP ${r.status})`);
        const j = await r.json();
        const d = j.document ?? j;
        if (cancelado) return;
        const editor = esHojaEditable(d.mimeType, d.name) ? "hoja"
          : esTextoEditable(d.mimeType, d.name) ? "texto"
          : null;
        if (!editor) {
          setError(`"${d.name}" no se puede editar acá. El editor abre planillas (.xlsx, .csv) y documentos de texto (.docx, .txt, .md).`);
          return;
        }
        setDoc({ id: d.id, name: d.name, mimeType: d.mimeType, editor });
      } catch (e) {
        if (!cancelado) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelado = true; };
  }, [params]);

  useEffect(() => {
    if (doc) document.title = `${doc.name} — Buleje`;
  }, [doc]);

  if (error) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <div className="rounded-2xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-6 dark:bg-[var(--data-warning-500)]/12">
          <AlertTriangle className="mb-3 h-7 w-7 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden />
          <p className="text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{error}</p>
          <Link href="/admin?tab=documentos#documentos" className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]">
            <ArrowLeft className="h-4 w-4" /> Volver a Documentación
          </Link>
        </div>
      </main>
    );
  }

  if (!doc) {
    return (
      <main className="p-16 text-center text-[var(--text-tertiary)]">
        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
        <p className="mt-2 text-sm">Buscando el documento…</p>
      </main>
    );
  }

  const Editor = doc.editor === "hoja" ? HojaCalculoEditor : DocumentoTextoEditor;
  return <Editor docId={doc.id} nombre={doc.name} mimeType={doc.mimeType} />;
}
