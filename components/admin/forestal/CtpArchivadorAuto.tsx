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
 * ── Y por qué de a una ───────────────────────────────────────────────────────
 * Validar veinte guías en tanda dispararía veinte rasterizaciones a la vez y
 * dejaría el panel duro. La cola avanza de a una; si una falla, sigue con la
 * siguiente y se reporta al final: el archivado NUNCA bloquea la validación,
 * que es la operación que el almacenero vino a hacer.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { documentoAPdf, nombreArchivo } from "@/lib/forestal/ctp-documento-pdf";
import { archivarEnDrive, existeEnDrive } from "@/lib/forestal/ctp-archivar-documento";
import { logger } from "@/lib/logger";

export interface GuiaParaArchivar {
  /** Identifica la hoja en la cola (id del ingreso + tipo de documento). */
  clave: string;
  /** Nombre del archivo, sin extensión. */
  nombre: string;
  html: string;
  pieCorrido?: string;
  etiquetas: string[];
  descripcion: string;
}

export interface ResumenArchivado {
  guardadas: number;
  yaEstaban: number;
  fallidas: number;
}

/** Ancho del lienzo: el mismo del visor, para que la hoja mida lo que mide. */
const ANCHO = 854;

export default function CtpArchivadorAuto({
  cola,
  onFin,
}: {
  /** Documentos pendientes de archivar. Se procesan en orden. */
  cola: GuiaParaArchivar[];
  onFin: (r: ResumenArchivado) => void;
}) {
  const marco = useRef<HTMLIFrameElement>(null);
  const [i, setI] = useState(0);
  const resumen = useRef<ResumenArchivado>({ guardadas: 0, yaEstaban: 0, fallidas: 0 });
  // El onLoad del iframe dispara también al montar vacío: sin esta guarda, la
  // primera hoja se procesaría dos veces.
  const procesando = useRef(false);

  const actual = cola[i];

  const siguiente = useCallback(() => {
    procesando.current = false;
    setI((n) => n + 1);
  }, []);

  const procesar = useCallback(async () => {
    if (!actual || procesando.current) return;
    procesando.current = true;
    const archivo = nombreArchivo(actual.nombre, "pdf");
    try {
      // Ojo: sin `siguiente()` acá. El `finally` ya avanza la cola, y llamarlo
      // en los dos lados hacía saltar DOS posiciones — la lista de trozas de
      // cada guía se perdía en silencio.
      if (await existeEnDrive(archivo)) {
        resumen.current.yaEstaban += 1;
        return;
      }
      const d = marco.current?.contentDocument;
      if (!d?.querySelector(".doc-hoja")) throw new Error("la hoja no llegó a dibujarse");
      await archivarEnDrive({
        archivo: await documentoAPdf(d, { pieCorrido: actual.pieCorrido }),
        nombreArchivo: archivo,
        etiquetas: actual.etiquetas,
        descripcion: actual.descripcion,
      });
      resumen.current.guardadas += 1;
    } catch (err) {
      resumen.current.fallidas += 1;
      logger.error("[ctp-archivador] no se pudo archivar", { doc: actual.nombre, error: String(err) });
    } finally {
      siguiente();
    }
  }, [actual, siguiente]);

  // Terminó la cola: se informa una sola vez y el componente se desmonta solo.
  useEffect(() => {
    if (cola.length > 0 && i >= cola.length) onFin({ ...resumen.current });
  }, [i, cola.length, onFin]);

  if (!actual) return null;

  return (
    <iframe
      ref={marco}
      title="Archivando la guía"
      srcDoc={actual.html}
      sandbox="allow-same-origin"
      aria-hidden
      tabIndex={-1}
      // Fuera de la pantalla pero con medidas reales: `display:none` no calcula
      // layout y la hoja saldría de alto cero.
      style={{ position: "fixed", left: -20000, top: 0, width: ANCHO, height: 1400, border: 0, opacity: 0 }}
      onLoad={() => {
        // Un respiro para que asienten fuentes y tablas antes de fotografiar.
        setTimeout(() => void procesar(), 300);
      }}
    />
  );
}
