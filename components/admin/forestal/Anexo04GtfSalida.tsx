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
 * Usa el MISMO renderer que la guía de salida del detalle (`documentoGtfSalida`):
 * si tuviera plantilla propia, el papel que se revisa acá y el que se imprime
 * allá podrían diferir. La cadena de custodia se pide aparte —es la que llena el
 * casillero (36), «N° GTF de origen»— y si no llega, la guía sale igual con ese
 * casillero vacío, que es el comportamiento correcto: en blanco se llena a mano,
 * inventado invalida el documento.
 */

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "@buleje/design-system/icons";
import { documentoHtml } from "@/lib/forestal/ctp-documento-print";
import { documentoGtfSalida, type GtfCadena, type GtfDespacho } from "@/lib/forestal/ctp-gtf-print";
import { leerGtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import type { CtpFicha } from "@/lib/forestal/ctp-ficha-types";
import { logger } from "@/lib/logger";

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

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        // La cadena llena el (36). Si el pedido falla, la guía se arma igual.
        let cadena: GtfCadena | null = null;
        try {
          const r = await fetch(
            `/api/admin/forestal/ctp/origenes?despachoEntryId=${encodeURIComponent(despacho.id)}`,
            { credentials: "include" },
          );
          if (r.ok) {
            const j = (await r.json()) as { trazabilidad?: { corridas?: GtfCadena["corridas"] } };
            cadena = j.trazabilidad?.corridas ? { corridas: j.trazabilidad.corridas } : null;
          }
        } catch (err) {
          logger.warn("[anexo04-gtf] sin cadena de custodia", { error: String(err) });
        }

        const doc: GtfDespacho = {
          id: despacho.id,
          lineNo: despacho.lineNo,
          entryDate: despacho.entryDate,
          productType: despacho.productType,
          speciesCommon: despacho.speciesCommon,
          speciesScientific: despacho.speciesScientific,
          cites: despacho.cites,
          quantity: despacho.quantity,
          unitLabel: despacho.unit ?? "m3",
          pieces: despacho.pieces,
          gtfNumber: despacho.gtfNumber,
          destino: despacho.destino,
        };
        const d = await documentoGtfSalida(doc, ficha ?? {}, cadena, leerGtfDatos(despacho.gtfDatos));
        const armado = documentoHtml({
          titulo: d.titulo,
          css: d.css,
          cuerpo: d.cuerpos,
          pieCorrido: d.pieCorrido,
        });
        if (!vivo) return;
        setHtml(armado);
        onHtml(armado);
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
  }, [despacho, ficha, onHtml]);

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
  );
}
