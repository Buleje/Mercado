"use client";

/**
 * Anexo04GtfSalida — la GUÍA del despacho, al lado de su anexo.
 *
 * El ANEXO N° 04 es la lista de lo que va en el camión; la GTF es el permiso
 * con el que ese camión sale. Viajan juntos y se presentan juntos en un puesto
 * de control, pero en el panel vivían en dos pantallas distintas: el anexo en su
 * modal y la guía dentro del detalle del despacho. Acá se miran de corrido, que
 * es como se revisan antes de imprimir.
 *
 * ── Qué arma y qué no ────────────────────────────────────────────────────────
 * Usa el MISMO armado que la guía de salida del detalle y del menú ⋯
 * (`papelesDeLaGuiaEntera` → `documentoGtfSalida`): si tuviera plantilla
 * propia, el papel que se revisa acá y el que se imprime allá podrían diferir.
 * La cadena de custodia —la que llena el casillero (36), «N° GTF de origen»—
 * sale de los puentes del Libro: lo que no tiene origen queda en blanco, que se
 * llena a mano; inventado invalida el documento.
 */

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "@buleje/design-system/icons";
import type { AvisoTipo } from "@/lib/forestal/gtf-validador-tipo";
import { AvisoTipoGtf } from "./aviso-tipo-gtf";
import type { CtpFicha } from "@/lib/forestal/ctp-ficha-types";
import { usePermisosForestal } from "@/hooks/use-permisos-forestal";
import { papelesDeLaGuiaEntera } from "./hooks/use-impresion-despacho";

export interface DespachoParaGtf {
  id: string;
  lineNo: number;
  entryDate: string;
  productType: string | null;
  speciesCommon: string | null;
  speciesScientific: string | null;
  cites: boolean;
  quantity: string | null;
  unit: string | null;
  pieces: number | null;
  gtfNumber: string | null;
  destino: string | null;
  /** JSON crudo de la base: lo valida `leerGtfDatos`. */
  gtfDatos?: unknown;
}

export default function Anexo04GtfSalida({
  despacho,
  ficha,
  onHtml,
}: {
  despacho: DespachoParaGtf;
  ficha: Partial<CtpFicha> | null;
  /** El HTML armado, para que el modal pueda imprimirlo desde su barra. */
  onHtml: (html: string | null) => void;
}) {
  const marco = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avisosTipo, setAvisosTipo] = useState<AvisoTipo[]>([]);
  /* Los permisos cargados (ADR-421/425): el título declarado en la guía puede
     ser uno que la Ficha del CTP no tiene, y sin la lista sus casilleros
     (5)(8)(9) salían en blanco. `contratos` arranca `[]` y sólo cambia de
     identidad cuando la carga termina — por eso puede ir en las deps. */
  const { contratos: permisos } = usePermisosForestal();

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        /* La guía ENTERA (27-10): todas sus líneas con el mismo N°, su cadena
           —que llena el (36)— y el binomio del catálogo, como la arma el
           servidor para el menú ⋯ y el talonario. Antes salía sólo la línea
           de este anexo: una guía de tres productos declaraba uno. */
        const { papeles, avisosTipo: avisos } = await papelesDeLaGuiaEntera(despacho.id, { ficha: ficha ?? {}, permisos });
        if (!vivo) return;
        setAvisosTipo(avisos);
        setHtml(papeles.gtf.html);
        onHtml(papeles.gtf.html);
      } catch (err) {
        if (!vivo) return;
        // El motivo importa: «falta el destinatario» se arregla en un minuto,
        // «no se pudo» manda a adivinar.
        setError(err instanceof Error ? err.message : String(err));
        onHtml(null);
      }
    })();
    return () => {
      vivo = false;
      onHtml(null);
    };
    /* `permisos` arranca `[]` y cambia de identidad sólo cuando termina de
       cargar: con él en las deps la hoja se vuelve a armar con los casilleros
       (5)(8)(9) del permiso declarado. */
  }, [despacho.id, ficha, onHtml, permisos]);

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-4 py-3 text-sm font-medium text-[var(--data-warning-700)] dark:bg-transparent dark:text-[var(--data-warning-500)]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          La guía todavía no se puede armar. {error}{" "}
          {/* Todo lo que pide `faltantesGtf` se completa en el MISMO lugar: el
              formulario de la guía del despacho. El título habilitante también
              —cada guía declara con cuál sale, no se hereda de la Ficha—. */}
          Se completa en el detalle del despacho, en «GTF de salida» → «Traslado y títulos».
        </span>
      </div>
    );
  }

  if (!html) {
    return (
      <div className="flex h-[60vh] items-center justify-center gap-2 text-sm text-[var(--text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Armando la guía del despacho…
      </div>
    );
  }

  return (
    <div className="space-y-2">
    <AvisoTipoGtf avisos={avisosTipo} />
    <iframe
      ref={marco}
      title={`GTF ${despacho.gtfNumber ?? ""}`}
      srcDoc={html}
      // Sin `allow-scripts`: el documento es papel. Con `allow-same-origin` para
      // que la barra del modal pueda imprimirlo.
      sandbox="allow-same-origin allow-modals"
      data-gtf-salida="1"
      className="h-[64vh] w-full rounded-lg border-0 bg-[var(--surface-sunken)]"
    />
    </div>
  );
}
