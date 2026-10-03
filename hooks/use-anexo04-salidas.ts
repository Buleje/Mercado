"use client";

/**
 * use-anexo04-salidas — las descargas del ANEXO N° 04 y el registro de lo que
 * se emitió: PDF oficial, Excel editable, PDF de varios anexos juntos y la
 * re-descarga de uno del historial.
 *
 * Vive fuera del modal porque son la parte "de afuera" (libs de export + POST a
 * la bandeja) y el modal ya carga con el estado del formulario y del preview.
 */
import { useCallback, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import type { DatosAnexo04 } from "@/lib/forestal/anexo04-serfor";
import { traseraDelEmitido, traseraParaGuardar, type AnexoEmitido } from "@/lib/forestal/anexo04-registro";
import { exportarAnexo04PDF, exportarAnexosPDF, type TraseraParaPdf } from "@/lib/forestal/anexo04-pdf";
import { exportarAnexo04Excel } from "@/lib/forestal/anexo04-excel";

export function useAnexo04Salidas(ctx: {
  filas: PiezaCubicada[];
  datos: DatosAnexo04;
  especieGlobal?: string;
  ctpEntryId?: string;
  /**
   * Volumen total declarado a mano (ver `Anexo04Opts.totalManualM3`): viaja
   * al PDF/Excel para que lo descargado sea igual al preview, y desde
   * 2026-09-09 **también a la bandeja**, en su propio campo.
   *
   * El total que el servidor guarda como `totalM3` sigue saliendo de las
   * piezas —nunca se cree un total del cliente—; el declarado se guarda al
   * lado para poder re-imprimir el papel que se entregó. Sin eso, un anexo
   * emitido con 1,890 declarados sobre 1,840 calculados se re-descargaba con
   * otro número en el casillero (3).
   */
  totalManualM3?: number | null;
  /**
   * La parte trasera del camión: si viene, el PDF la agrega como última hoja
   * (el croquis + su formato) y el registro del emitido la guarda (desde el
   * 2026-10-03), para que re-descargarlo desde el historial salga con el
   * mismo croquis. Los emitidos de antes no la tienen y salen como siempre.
   */
  trasera?: TraseraParaPdf | null;
  onAviso?: (msg: string, tono: "success" | "error") => void;
  /** Se llama cuando la bandeja cambió (para releerla). */
  onRegistrado: () => void;
}) {
  const { filas, datos, especieGlobal, ctpEntryId, totalManualM3, trasera, onAviso, onRegistrado } = ctx;
  const [generando, setGenerando] = useState(false);

  /**
   * Deja el papel registrado en la bandeja. Fire-and-forget: si el servidor
   * falla, el PDF ya se descargó y el operario no puede hacer nada al respecto
   * — se avisa y sigue.
   */
  const registrar = useCallback((piezas: PiezaCubicada[], d: DatosAnexo04, totalManual?: number | null, conTrasera?: TraseraParaPdf | null) => {
    const traseraGuardada = traseraParaGuardar(conTrasera);
    if (piezas.length === 0) return;
    fetch("/api/admin/forestal/anexos", {
      method: "POST",
      credentials: "include",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        numero: d.numero, gtf: d.gtf, empresa: d.empresa, firmante: d.firmante,
        documento: d.documento, cargo: d.cargo, observaciones: d.observaciones,
        unidadV: d.unidadV, modo: d.modo, especieGlobal: especieGlobal ?? null,
        ctpEntryId: ctpEntryId ?? null, piezas,
        totalManualM3: totalManual ?? null,
        /* Sólo si hay: sin el campo, el servidor conserva la que el registro
           ya tenía si las piezas no cambiaron. */
        ...(traseraGuardada ? { trasera: traseraGuardada } : {}),
      }),
    })
      .then((r) => { if (r.ok) onRegistrado(); })
      .catch((err) => onAviso?.(`El PDF salió, pero no quedó en el historial (${String(err).slice(0, 60)}).`, "error"));
  }, [especieGlobal, ctpEntryId, onAviso, onRegistrado]);

  const descargarPdf = useCallback(() => {
    setGenerando(true);
    const conTrasera = trasera && trasera.piezas.length > 0 ? trasera : null;
    exportarAnexo04PDF(filas, datos, { especieGlobal, totalManualM3 }, { trasera: conTrasera })
      .then(() => {
        onAviso?.(conTrasera ? "Anexo N° 04 + parte trasera del camión, descargado y registrado" : "Anexo N° 04 descargado y registrado", "success");
        registrar(filas, datos, totalManualM3, conTrasera);
      })
      .catch(() => onAviso?.("No se pudo generar el PDF.", "error"))
      .finally(() => setGenerando(false));
  }, [filas, datos, especieGlobal, totalManualM3, trasera, onAviso, registrar]);

  const descargarExcel = useCallback(() => {
    exportarAnexo04Excel(filas, datos, { especieGlobal, totalManualM3 })
      .then(() => onAviso?.("Excel del anexo descargado", "success"))
      .catch(() => onAviso?.("No se pudo generar el Excel.", "error"));
  }, [filas, datos, especieGlobal, totalManualM3, onAviso]);

  /** Re-descarga un anexo tal como se emitió, sin tocar lo que hay en pantalla. */
  const reDescargar = useCallback((a: AnexoEmitido) => {
    /* Con su total declarado (es el número que llevaba el papel) y con su
       trasera si se guardó: el mismo papel de 2 hojas que se entregó. */
    const conTrasera = traseraDelEmitido(a);
    exportarAnexo04PDF(a.piezas, { ...datos, ...a }, { especieGlobal: a.especieGlobal, totalManualM3: a.totalManualM3 }, { trasera: conTrasera })
      .then(() => onAviso?.(conTrasera ? "Anexo re-descargado con la parte trasera del camión" : "Anexo re-descargado", "success"))
      .catch(() => onAviso?.("No se pudo generar el PDF.", "error"));
  }, [datos, onAviso]);

  /** Todos los anexos elegidos en un PDF: el archivo del mes, listo para imprimir. */
  const pdfDeLote = useCallback((seleccion: AnexoEmitido[]) => {
    if (seleccion.length === 0) { onAviso?.("No hay anexos para imprimir.", "error"); return; }
    exportarAnexosPDF(seleccion.map((a) => ({
      piezas: a.piezas, datos: { ...datos, ...a }, especieGlobal: a.especieGlobal,
      totalManualM3: a.totalManualM3, trasera: traseraDelEmitido(a),
    })))
      .then(() => onAviso?.(`${seleccion.length} anexos en un PDF`, "success"))
      .catch(() => onAviso?.("No se pudo generar el PDF del lote.", "error"));
  }, [datos, onAviso]);

  return { generando, descargarPdf, descargarExcel, reDescargar, pdfDeLote };
}
