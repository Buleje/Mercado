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

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "@buleje/design-system/icons";
import { pedirArchivo } from "@/lib/documentos/archivo-remoto";
import { VERSION_MINIATURA } from "@/lib/documents/miniatura-version";
import AvisoArchivo from "./AvisoArchivo";

/** Arriba de esto se prefiere el streaming del navegador al blob en memoria. */
const MAX_BLOB = 40 * 1024 * 1024;

/** Tope de páginas que se dibujan de una: más que esto es un libro, no un doc. */
const MAX_PAGINAS = 60;

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
  /** 1 = la página llena el ancho del modal. */
  const [zoom, setZoom] = useState(1);
  /** Texto por página; `null` mientras se pide, `[]` si el PDF no tiene texto. */
  const [textoPdf, setTextoPdf] = useState<string[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    let vivo = true;
    setError(null);
    // `pedirArchivo` y no un fetch pelado: renueva la sesión vencida sola y
    // traduce el error (antes acá salía un "HTTP 401" crudo en pantalla).
    pedirArchivo(`/api/admin/documents/${docId}/pages`)
      .then((r) => r.json())
      .then((d) => { if (vivo) setPaginas(Math.max(1, Math.min(MAX_PAGINAS, Number(d.pageCount) || 1))); })
      .catch((e) => { if (vivo) setError(e); });
    return () => { vivo = false; };
  }, [docId, intento]);

  // El texto se pide una sola vez, y recién cuando alguien empieza a buscar:
  // extraerlo de un PDF grande no es gratis y la mayoría sólo mira.
  useEffect(() => {
    if (textoPdf !== null || !busqueda.trim()) return;
    let vivo = true;
    pedirArchivo(`/api/admin/documents/${docId}/text`)
      .then((r) => r.json())
      .then((d) => { if (vivo) setTextoPdf(Array.isArray(d.paginas) ? d.paginas : []); })
      .catch(() => { if (vivo) setTextoPdf([]); });
    return () => { vivo = false; };
  }, [busqueda, docId, textoPdf]);

  /** Páginas (1-based) donde aparece lo buscado. */
  const coincidencias = useMemo(() => {
    const aguja = busqueda.trim().toLowerCase();
    if (!aguja || !textoPdf) return [];
    return textoPdf
      .map((t, i) => (t.toLowerCase().includes(aguja) ? i + 1 : 0))
      .filter((n) => n > 0);
  }, [busqueda, textoPdf]);

  useEffect(() => { setIndice(0); }, [busqueda]);

  const saltar = (delta: number) => {
    if (coincidencias.length === 0) return;
    const siguiente = (indice + delta + coincidencias.length) % coincidencias.length;
    setIndice(siguiente);
    document.querySelector(`img[data-pagina="${coincidencias[siguiente]}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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
    <div className="relative h-[78vh] w-full overflow-auto rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
      {/* Zoom y buscador: fijos arriba mientras se scrollea. El Ctrl+F del
          navegador no sirve acá —las páginas son imágenes—, así que el buscador
          consulta el texto del PDF y salta a la página donde está. */}
      <div className="sticky top-0 z-10 mb-2 flex flex-wrap items-center justify-center gap-1.5">
        <div className="inline-flex items-center gap-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]/95 px-1.5 py-1 shadow-sm">
          <Search className="ml-1 h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar en el documento"
            aria-label="Buscar en el documento"
            className="w-40 bg-transparent px-1 py-0.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
          />
          {busqueda.trim() && (
            <span className="whitespace-nowrap px-1 text-xs font-bold tabular-nums text-[var(--text-secondary)]">
              {coincidencias.length === 0
                ? (textoPdf === null ? "…" : "0")
                : `${indice + 1}/${coincidencias.length}`}
            </span>
          )}
          {coincidencias.length > 0 && (
            <>
              <button onClick={() => saltar(-1)} className="rounded-lg px-1.5 py-0.5 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]" aria-label="Coincidencia anterior">‹</button>
              <button onClick={() => saltar(1)} className="rounded-lg px-1.5 py-0.5 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]" aria-label="Coincidencia siguiente">›</button>
            </>
          )}
        </div>
        <div className="inline-flex items-center gap-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]/95 px-1.5 py-1 shadow-sm">
          <button
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
            disabled={zoom <= 0.5}
            className="rounded-lg px-2 py-0.5 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-40"
            aria-label="Alejar"
          >
            −
          </button>
          <span className="min-w-[3.5rem] text-center text-xs font-bold tabular-nums text-[var(--text-secondary)]">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
            disabled={zoom >= 3}
            className="rounded-lg px-2 py-0.5 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-40"
            aria-label="Acercar"
          >
            +
          </button>
          {zoom !== 1 && (
            <button
              onClick={() => setZoom(1)}
              className="ml-1 rounded-lg px-2 py-0.5 text-xs font-bold text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-primary"
            >
              Ajustar
            </button>
          )}
        </div>
      </div>

      {/* `width` y no `max-width`: max-width sólo limita, nunca agranda, y el
          zoom no hacía nada. Con el ancho por encima del 100% el contenedor de
          arriba scrollea en horizontal, que es lo que se espera al acercar. */}
      <div
        className="mx-auto flex flex-col gap-3 transition-[width] duration-150"
        style={{ width: `${Math.round(zoom * 100)}%` }}
      >
        {Array.from({ length: paginas }, (_, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- imagen del propio servidor
          <img
            key={i}
            data-pagina={i + 1}
            src={`/api/admin/documents/${docId}/thumbnail?page=${i + 1}&s=2&r=${VERSION_MINIATURA}`}
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
