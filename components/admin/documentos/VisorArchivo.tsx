"use client";

/**
 * VisorArchivo — el PDF y la imagen del drive, con el error a la vista.
 *
 * EL BUG QUE ARREGLA: la vista previa apuntaba el `<iframe>` (y el `<img>`)
 * directo al endpoint del archivo. Cuando el servidor contestaba un 429, el
 * navegador recibía un JSON y lo dibujaba como texto plano DENTRO del visor:
 * el usuario veía `{"error":"Too many requests",...}` en lugar de su documento,
 * sin saber que era temporal ni cuándo reintentar.
 *
 * Acá el archivo se pide con `fetch` —que sí puede mirar el status— y recién
 * cuando llegaron los bytes se arma un blob para el visor. Si algo falla, se
 * muestra el aviso con su cuenta regresiva.
 *
 * Los archivos muy grandes siguen yendo directo al `<iframe>`: cargar 80 MB en
 * memoria para poder leer un status no es un buen negocio, y el visor de PDF
 * del navegador los muestra de a pedazos.
 */

import { useEffect, useState } from "react";
import { Loader2 } from "@buleje/design-system/icons";
import { pedirArchivo } from "@/lib/documentos/archivo-remoto";
import { VERSION_MINIATURA } from "@/lib/documents/miniatura-version";
import AvisoArchivo from "./AvisoArchivo";

/** Arriba de esto se prefiere el streaming del navegador al blob en memoria. */
const MAX_BLOB = 40 * 1024 * 1024;

/** Trae el archivo a un blob URL. `null` mientras carga; lanza al fallar. */
function useBlobDelArchivo(url: string, activo: boolean, intento: number) {
  const [blob, setBlob] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    let creada: string | null = null;
    setBlob(null);
    setError(null);
    (async () => {
      try {
        const res = await pedirArchivo(url);
        const datos = await res.blob();
        if (!vivo) return;
        creada = URL.createObjectURL(datos);
        setBlob(creada);
      } catch (e) {
        if (vivo) setError(e);
      }
    })();
    return () => {
      vivo = false;
      // Sin esto, pasar por 200 documentos con las flechas deja 200 blobs
      // colgados en memoria hasta recargar la pestaña.
      if (creada) URL.revokeObjectURL(creada);
    };
  }, [url, activo, intento]);

  return { blob, error };
}

/**
 * Las páginas del PDF dibujadas por el servidor, como imágenes.
 *
 * Es la red de seguridad: hay navegadores sin visor de PDF (varios Android, y
 * cualquier WebView), donde el `<iframe>` no muestra nada o directamente ofrece
 * descargar. Acá el PDF se ve igual, porque llega como imagen — el mismo
 * dibujo que ya usa la miniatura de la tarjeta.
 */
function VisorPdfPaginas({ docId, nombre }: { docId: string; nombre: string }) {
  const [paginas, setPaginas] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vivo = true;
    setError(null);
    fetch(`/api/admin/documents/${docId}/pages`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => { if (vivo) setPaginas(Math.max(1, Math.min(60, Number(d.pageCount) || 1))); })
      .catch((e) => { if (vivo) setError(e); });
    return () => { vivo = false; };
  }, [docId, intento]);

  if (error) {
    return (
      <AvisoArchivo
        error={error}
        titulo="No se pudo abrir el PDF"
        sugerencia="También podés descargarlo y abrirlo en tu equipo."
        urlDescarga={`/api/admin/documents/${docId}/raw`}
        onReintentar={() => setIntento((n) => n + 1)}
      />
    );
  }
  if (paginas === null) {
    return (
      <div className="flex h-[78vh] w-full items-center justify-center gap-2 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Abriendo el documento…
      </div>
    );
  }
  return (
    <div className="h-[78vh] w-full overflow-auto rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        {Array.from({ length: paginas }, (_, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- imagen del propio servidor
          <img
            key={i}
            data-pagina={i + 1}
            src={`/api/admin/documents/${docId}/thumbnail?page=${i + 1}&r=${VERSION_MINIATURA}`}
            alt={`${nombre} — página ${i + 1} de ${paginas}`}
            loading={i < 2 ? "eager" : "lazy"}
            className="w-full rounded-md border border-[var(--rule-base)] bg-white shadow-sm"
          />
        ))}
      </div>
    </div>
  );
}

export function VisorPdf({ url, nombre, tamano, docId }: {
  url: string;
  nombre: string;
  tamano: number;
  /** Para dibujar las páginas en el servidor si el navegador no sabe abrir PDFs. */
  docId?: string;
}) {
  const [intento, setIntento] = useState(0);
  const [comoImagenes, setComoImagenes] = useState(false);
  const porBlob = tamano <= MAX_BLOB;
  const { blob, error } = useBlobDelArchivo(url, porBlob && !comoImagenes, intento);

  // `pdfViewerEnabled` dice si el navegador sabe mostrar un PDF embebido. Donde
  // es `false` (varios Android, WebViews) el iframe queda en blanco: mejor
  // dibujar las páginas directamente.
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.pdfViewerEnabled === false) setComoImagenes(true);
  }, []);

  if (comoImagenes && docId) {
    return <VisorPdfPaginas docId={docId} nombre={nombre} />;
  }

  if (!porBlob) {
    return <iframe src={url} title={nombre} className={MARCO} />;
  }
  if (error) {
    // Si bajar el archivo falló, todavía queda un camino que funciona: las
    // páginas dibujadas en el servidor. Es preferible a dejar sólo "descargá".
    return (
      <div className="space-y-3">
        <AvisoArchivo
          error={error}
          titulo="No se pudo mostrar el PDF"
          sugerencia="También podés descargarlo y abrirlo en tu equipo."
          urlDescarga={url}
          onReintentar={() => setIntento((n) => n + 1)}
        />
        {docId && (
          <button
            onClick={() => setComoImagenes(true)}
            className="mx-auto block rounded-xl border-2 border-[var(--rule-base)] px-4 py-2 text-sm font-bold text-[var(--text-secondary)] hover:border-primary hover:text-primary"
          >
            Verlo como imágenes
          </button>
        )}
      </div>
    );
  }
  if (!blob) {
    return (
      <div className="flex h-[78vh] w-full items-center justify-center gap-2 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Abriendo el documento…
      </div>
    );
  }
  return (
    <div className="relative">
      <iframe src={blob} title={nombre} className={MARCO} />
      {docId && (
        // Escape a mano: si el visor del navegador queda en blanco (pasa con
        // algunas extensiones y con PDFs que sólo abre Acrobat), esto muestra
        // el documento igual.
        <button
          onClick={() => setComoImagenes(true)}
          className="absolute right-3 top-3 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)]/95 px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)] shadow-sm hover:text-primary"
          title="Si no ves el documento acá, mostralo como imágenes"
        >
          ¿No se ve?
        </button>
      )}
    </div>
  );
}

export function VisorImagen({ url, nombre }: { url: string; nombre: string }) {
  const [intento, setIntento] = useState(0);
  const { blob, error } = useBlobDelArchivo(url, true, intento);

  if (error) {
    return (
      <AvisoArchivo
        error={error}
        titulo="No se pudo mostrar la imagen"
        urlDescarga={url}
        onReintentar={() => setIntento((n) => n + 1)}
      />
    );
  }
  if (!blob) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Abriendo la imagen…
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- blob local, no pasa por el optimizador
  return <img src={blob} alt={nombre} className="max-h-full max-w-full rounded-lg object-contain shadow-md" />;
}

const MARCO = "w-full h-[78vh] rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)]";
