"use client";

/**
 * CtpArchivadorAuto — el expediente se arma solo al validar.
 *
 * Archivar a mano funciona el primer día. Al mes, el legajo tiene las guías que
 * alguien se acordó de guardar, y las que faltan aparecen justo cuando llega la
 * fiscalización. Acá, cada ingreso que se valida deja su GTF y su lista de
 * trozas en el Drive sin que nadie apriete nada.
 *
 * ── Por qué un iframe y no un render suelto ──────────────────────────────────
 * El PDF se arma fotografiando la hoja ya dibujada (ver `ctp-documento-pdf`), y
 * para dibujarla hace falta un documento con el CSS de impresión aislado. Este
 * iframe es el mismo del visor pero fuera de la vista: se le da tamaño real —no
 * `display:none`, que no calcula layout y devolvería una hoja de alto cero— y se
 * lo esconde corriéndolo fuera de la pantalla.
 *
 * ── Quién hace qué ───────────────────────────────────────────────────────────
 * El recorrido de la cola vive en `ctp-cola-archivado` (probado); acá queda sólo
 * lo que necesita un navegador: dibujar la hoja y esperar a que esté lista.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { documentoAPdf, nombreArchivo } from "@/lib/forestal/ctp-documento-pdf";
import { archivarEnDrive, carpetaAnidada, existeEnDrive } from "@/lib/forestal/ctp-archivar-documento";
import { procesarCola, type ResumenArchivado } from "@/lib/forestal/ctp-cola-archivado";

export type { ResumenArchivado } from "@/lib/forestal/ctp-cola-archivado";

export interface GuiaParaArchivar {
  /** Identifica la hoja en la cola (id del ingreso + tipo de documento). */
  clave: string;
  /** Nombre del archivo, sin extensión. */
  nombre: string;
  html: string;
  pieCorrido?: string;
  etiquetas: string[];
  descripcion: string;
  /** Ruta de carpeta anidada (ej. `["Guías forestales (GTF)", "2026", "08"]`,
   *  Brandon 2026-08-26: "organizá también las GTF"). Sin esto cae a la raíz
   *  de `CARPETA_GUIAS` — mismo default de siempre. */
  carpetaRuta?: string[];
}

/** Ancho del lienzo: el mismo del visor, para que la hoja mida lo que mide. */
const ANCHO = 854;
/** Respiro tras cargar la hoja: sin esto se fotografía antes de las fuentes. */
const ASENTAR_MS = 320;

export default function CtpArchivadorAuto({
  cola,
  onFin,
}: {
  /** Documentos pendientes de archivar. Se procesan en orden. */
  cola: GuiaParaArchivar[];
  onFin: (r: ResumenArchivado) => void;
}) {
  const marco = useRef<HTMLIFrameElement>(null);
  /** Se resuelve cuando la hoja pedida terminó de dibujarse en el iframe. */
  const listo = useRef<(() => void) | null>(null);
  const [hoja, setHoja] = useState<GuiaParaArchivar | null>(null);

  /** Pone la hoja en el iframe y espera a que el navegador la dibuje. */
  const dibujar = useCallback(async (papel: GuiaParaArchivar) => {
    await new Promise<void>((resolver) => {
      listo.current = resolver;
      setHoja(papel);
    });
    const d = marco.current?.contentDocument;
    if (!d?.querySelector(".doc-hoja")) throw new Error("la hoja no llegó a dibujarse");
    return d;
  }, []);

  // Una sola pasada por cola: el efecto se dispara con la cola, no con cada
  // render, y el componente se desmonta solo cuando el padre la vacía.
  useEffect(() => {
    if (cola.length === 0) return;
    let vivo = true;
    void procesarCola(cola, {
      existe: (papel) => existeEnDrive(nombreArchivo(papel.nombre, "pdf")),
      guardar: async (papel) => {
        const d = await dibujar(papel);
        const folderId = papel.carpetaRuta ? await carpetaAnidada(papel.carpetaRuta) : undefined;
        await archivarEnDrive({
          archivo: await documentoAPdf(d, { pieCorrido: papel.pieCorrido }),
          nombreArchivo: nombreArchivo(papel.nombre, "pdf"),
          etiquetas: papel.etiquetas,
          descripcion: papel.descripcion,
          folderId,
        });
      },
    }).then((r) => {
      if (vivo) onFin(r);
    });
    return () => {
      vivo = false;
    };
    // `onFin` queda fuera a propósito: llega inline desde el padre y cambia en
    // cada render suyo — incluirlo reiniciaría la cola a mitad de camino.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cola, dibujar]);

  if (!hoja) return null;

  return (
    <iframe
      ref={marco}
      title="Archivando la guía"
      srcDoc={hoja.html}
      sandbox="allow-same-origin"
      aria-hidden
      tabIndex={-1}
      // Fuera de la pantalla pero con medidas reales: `display:none` no calcula
      // layout y la hoja saldría de alto cero.
      style={{ position: "fixed", left: -20000, top: 0, width: ANCHO, height: 1400, border: 0, opacity: 0 }}
      onLoad={() => {
        const avisar = listo.current;
        listo.current = null;
        if (avisar) setTimeout(avisar, ASENTAR_MS);
      }}
    />
  );
}
