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
import type { AnexoEmitido } from "@/lib/forestal/anexo04-registro";
import { exportarAnexo04PDF, exportarAnexosPDF } from "@/lib/forestal/anexo04-pdf";
import { exportarAnexo04Excel } from "@/lib/forestal/anexo04-excel";

export function useAnexo04Salidas(ctx: {
  filas: PiezaCubicada[];
  datos: DatosAnexo04;
  especieGlobal?: string;
  ctpEntryId?: string;
  /**
   * Volumen total declarado a mano (ver `Anexo04Opts.totalManualM3`): viaja
   * al PDF/Excel para que lo descargado sea igual al preview. La bandeja
   * (`registrar`) NO lo manda — el servidor recalcula el total desde las
   * piezas a propósito, por diseño (nunca confía en un total del cliente).
   */
  totalManualM3?: number | null;
  onAviso?: (msg: string, tono: "success" | "error") => void;
  /** Se llama cuando la bandeja cambió (para releerla). */
  onRegistrado: () => void;
}) {
  const { filas, datos, especieGlobal, ctpEntryId, totalManualM3, onAviso, onRegistrado } = ctx;
  const [generando, setGenerando] = useState(false);

  /**
   * Deja el papel registrado en la bandeja. Fire-and-forget: si el servidor
   * falla, el PDF ya se descargó y el operario no puede hacer nada al respecto
   * — se avisa y sigue.
   */
  const registrar = useCallback((piezas: PiezaCubicada[], d: DatosAnexo04) => {
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
      }),
    })
      .then((r) => { if (r.ok) onRegistrado(); })
      .catch((err) => onAviso?.(`El PDF salió, pero no quedó en el historial (${String(err).slice(0, 60)}).`, "error"));
  }, [especieGlobal, ctpEntryId, onAviso, onRegistrado]);

  const descargarPdf = useCallback(() => {
    setGenerando(true);
    exportarAnexo04PDF(filas, datos, { especieGlobal, totalManualM3 })
      .then(() => {
        onAviso?.("Anexo N° 04 descargado y registrado", "success");
        registrar(filas, datos);
      })
      .catch(() => onAviso?.("No se pudo generar el PDF.", "error"))
      .finally(() => setGenerando(false));
  }, [filas, datos, especieGlobal, totalManualM3, onAviso, registrar]);

  const descargarExcel = useCallback(() => {
    exportarAnexo04Excel(filas, datos, { especieGlobal, totalManualM3 })
      .then(() => onAviso?.("Excel del anexo descargado", "success"))
      .catch(() => onAviso?.("No se pudo generar el Excel.", "error"));
  }, [filas, datos, especieGlobal, totalManualM3, onAviso]);

  /** Re-descarga un anexo tal como se emitió, sin tocar lo que hay en pantalla. */
  const reDescargar = useCallback((a: AnexoEmitido) => {
    exportarAnexo04PDF(a.piezas, { ...datos, ...a }, { especieGlobal: a.especieGlobal })
      .then(() => onAviso?.("Anexo re-descargado", "success"))
      .catch(() => onAviso?.("No se pudo generar el PDF.", "error"));
  }, [datos, onAviso]);

  /** Todos los anexos elegidos en un PDF: el archivo del mes, listo para imprimir. */
  const pdfDeLote = useCallback((seleccion: AnexoEmitido[]) => {
    if (seleccion.length === 0) { onAviso?.("No hay anexos para imprimir.", "error"); return; }
    exportarAnexosPDF(seleccion.map((a) => ({ piezas: a.piezas, datos: { ...datos, ...a }, especieGlobal: a.especieGlobal })))
      .then(() => onAviso?.(`${seleccion.length} anexos en un PDF`, "success"))
      .catch(() => onAviso?.("No se pudo generar el PDF del lote.", "error"));
  }, [datos, onAviso]);

  return { generando, descargarPdf, descargarExcel, reDescargar, pdfDeLote };
}
