"use client";

/**
 * Vista previa de los casilleros (2)–(12) de la GTF con los datos de la Ficha.
 *
 * Una lista de "falta X" no muestra el daño: el daño se ve cuando mirás el
 * papel y el casillero (8) está en blanco. Esto arma el MISMO bloque que
 * imprime la guía real (`bloqueIdentidadGtf`) y lo abre en el visor de siempre,
 * así que lo que se ve acá es exactamente lo que va a salir.
 *
 * No es una guía emitible y el propio papel lo dice: sin despacho no hay número
 * de serie, ni producto, ni transportista, ni firma. Rellenar eso para que "se
 * vea completo" sería fabricar una declaración jurada.
 */

import { useMemo } from "react";
import CtpDocumentoVisor from "./CtpDocumentoVisor";
import { documentoHtml, notaDoc, tituloDoc } from "@/lib/forestal/ctp-documento-print";
import { bloqueIdentidadGtf, CSS_GTF_OFICIAL } from "@/lib/forestal/ctp-gtf-formato";
import { tituloDeGuia, type CtpFicha } from "@/lib/forestal/ctp-ficha-types";

/** Casilleros de este bloque que quedarían vacíos, con su número. */
export function casillerosVaciosDeFicha(f: CtpFicha): string[] {
  const t = tituloDeGuia(f);
  const falta: string[] = [];
  if (!f.arffs.trim()) falta.push("(2) ARFFS");
  if (!t) falta.push("(5) y (6) origen y N° del título habilitante");
  if (t && !t.codigo.trim()) falta.push("(6) N° del título");
  if (!f.razonSocial.trim()) falta.push("(7) titular");
  if (!f.representante.trim()) falta.push("representante legal");
  if (t && !t.resolucion.trim()) falta.push("(8) N° de resolución");
  if (t && !t.planManejo.trim()) falta.push("(9) plan de manejo");
  if (!f.region.trim()) falta.push("(10) departamento");
  if (!f.provincia.trim()) falta.push("(11) provincia");
  if (!f.distrito.trim()) falta.push("(12) distrito");
  return falta;
}

export default function CtpFichaPreviewGtf({ ficha, onCerrar }: { ficha: CtpFicha; onCerrar: () => void }) {
  const html = useMemo(() => {
    const falta = casillerosVaciosDeFicha(ficha);
    const aviso = falta.length
      ? notaDoc(
          `<b>${falta.length === 1 ? "Un casillero saldría vacío" : `${falta.length} casilleros saldrían vacíos`}:</b> ${falta.join(", ")}. Se completan desde la Ficha del CTP.`,
        )
      : notaDoc("<b>Los casilleros de identidad salen completos.</b> El resto de la guía lo llena cada despacho.");
    return documentoHtml({
      titulo: "Vista previa — casilleros (2) a (12) de la GTF",
      css: CSS_GTF_OFICIAL,
      cuerpo: `
        ${tituloDoc("Vista previa de la guía de salida", "Cómo quedan los casilleros que llena la Ficha del CTP")}
        ${bloqueIdentidadGtf(ficha)}
        ${aviso}
        ${notaDoc(
          "Este papel <b>no es una GTF emitida</b>: no lleva serie ni correlativo, ni el detalle del producto, del destinatario y del transportista, ni la firma de la declaración jurada. La guía real se emite desde el despacho.",
        )}`,
      pieCorrido: "Vista previa de la Ficha del CTP — sin valor como guía de transporte",
    });
  }, [ficha]);

  return (
    <CtpDocumentoVisor
      documentos={[{
        nombre: "Vista previa de la GTF",
        etiqueta: "Casilleros (2) a (12) — los que llena la Ficha",
        archivo: "vista-previa-gtf-ficha",
        html,
      }]}
      activo={0}
      onActivo={() => {}}
      onClose={onCerrar}
    />
  );
}
