"use client";

/**
 * TextoPreview — un .docx/.txt/.md leído dentro del modal, como documento.
 *
 * El drive mostraba «Sin vista previa. Descargá para verlo en tu equipo» para
 * los documentos de texto: para saber si el contrato era el correcto había que
 * bajarlo. Acá se lee de una, respetando la jerarquía (título, subtítulo,
 * párrafo, lista) y las negritas/cursivas del original.
 *
 * Sólo lectura: `Editar documento` sigue siendo el camino para cambiarlo, y es
 * el único que reescribe el .docx sin romperlo (ver texto-docx.ts).
 */

import { useEffect, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Loader2 } from "@buleje/design-system/icons";
import { formatoTextoDe, leerPlano, type DocumentoTexto } from "@/lib/documentos/texto-docx";
import { descargarArchivo, descargarTexto } from "@/lib/documentos/archivo-remoto";
import { esOdt } from "@/lib/documentos/odf";
import AvisoArchivo from "./AvisoArchivo";

/** Cuántos párrafos se muestran antes de cortar (un contrato largo no se lee acá). */
const MAX_BLOQUES = 120;

export default function TextoPreview({ url, mimeType, nombre, miniaturaUrl }: {
  url: string;
  mimeType: string | null;
  nombre: string;
  /** Miniatura del archivo, para mostrar algo real mientras se lee. */
  miniaturaUrl?: string;
}) {
  const [doc, setDoc] = useState<DocumentoTexto | null>(null);
  const [error, setError] = useState<unknown>(null);
  /** Sube con cada "reintentar": vuelve a pedir el archivo. */
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vivo = true;
    setDoc(null);
    setError(null);
    (async () => {
      try {
        if (esOdt(mimeType, nombre)) {
          // LibreOffice: el texto vive en content.xml dentro del zip.
          const [{ default: JSZip }, { leerOdt }] = await Promise.all([
            import("jszip"),
            import("@/lib/documentos/odf"),
          ]);
          const zip = await JSZip.loadAsync(await descargarArchivo(url));
          if (vivo) setDoc(await leerOdt(zip));
          return;
        }
        if (formatoTextoDe(mimeType, nombre) === "plano") {
          const texto = await descargarTexto(url);
          if (vivo) setDoc(leerPlano(texto));
          return;
        }
        // El lector de .docx arrastra jszip: entra sólo cuando hace falta.
        const [{ leerDocx }, datos] = await Promise.all([
          import("@/lib/documentos/texto-docx"),
          descargarArchivo(url),
        ]);
        const d = await leerDocx(datos);
        if (vivo) setDoc(d);
      } catch (e) {
        if (vivo) setError(e);
      }
    })();
    return () => { vivo = false; };
  }, [url, mimeType, nombre, intento]);

  if (error) {
    return (
      <AvisoArchivo
        error={error}
        titulo="No se pudo mostrar el documento"
        sugerencia="También podés descargarlo y abrirlo en Word."
        urlDescarga={url}
        onReintentar={() => setIntento((n) => n + 1)}
      />
    );
  }

  if (!doc) {
    return (
      <div className="relative flex h-full min-h-[320px] items-center justify-center py-6">
        {/* Igual que en la planilla: la miniatura ya está cacheada, así que se
            ve el documento de verdad mientras se termina de leer. */}
        {miniaturaUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={miniaturaUrl}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 m-auto max-h-full w-auto max-w-full object-contain opacity-40 blur-[1px]"
          />
        )}
        <span className="relative inline-flex items-center gap-2 rounded-xl bg-[var(--surface-raised)]/90 px-3 py-2 text-sm text-[var(--text-secondary)] shadow-[var(--shadow-sm)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Leyendo el documento…
        </span>
      </div>
    );
  }

  const bloques = doc.bloques.slice(0, MAX_BLOQUES);
  const restantes = doc.bloques.length - bloques.length;

  if (bloques.length === 0) {
    return <p className="py-16 text-center text-sm text-[var(--text-tertiary)]">El documento está vacío.</p>;
  }

  return (
    <div className="h-full overflow-auto">
      {/* Ancho de lectura (~70 caracteres) y fondo de hoja: se lee como el
          documento que es, no como un volcado de texto. */}
      <article className="mx-auto max-w-[46rem] space-y-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-6 py-7 sm:px-10">
        {bloques.map((b) => {
          const estilo = `${b.negrita ? "font-bold " : ""}${b.cursiva ? "italic " : ""}`;
          if (b.tipo === "titulo") {
            return <CardTitle as="h3" key={b.id} className={`text-lg font-bold text-[var(--text-primary)] ${estilo}`}>{b.texto}</CardTitle>;
          }
          if (b.tipo === "subtitulo") {
            return <h4 key={b.id} className={`text-base font-bold text-[var(--text-primary)] ${estilo}`}>{b.texto}</h4>;
          }
          if (b.tipo === "lista") {
            return (
              <p key={b.id} className={`flex gap-2 text-sm leading-relaxed text-[var(--text-secondary)] ${estilo}`}>
                <span aria-hidden="true" className="select-none text-[var(--text-tertiary)]">•</span>
                <span>{b.texto}</span>
              </p>
            );
          }
          // Un párrafo vacío en el original es un salto: se respeta como aire.
          if (!b.texto.trim()) return <div key={b.id} className="h-2" aria-hidden="true" />;
          return <p key={b.id} className={`text-sm leading-relaxed text-[var(--text-secondary)] ${estilo}`}>{b.texto}</p>;
        })}

        {restantes > 0 && (
          <p className="border-t border-[var(--rule-soft)] pt-3 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
            y {restantes} párrafos más — abrí «Editar documento» para verlo completo.
          </p>
        )}
      </article>
    </div>
  );
}
