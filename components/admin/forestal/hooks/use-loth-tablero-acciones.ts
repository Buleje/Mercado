"use client";

/**
 * useLothTableroAcciones — lo que el Control del permiso manda afuera
 * (ADR-459): Excel, reporte impreso, resumen por WhatsApp, y la tanda
 * (etiquetas y exportar lo elegido).
 *
 * Todo lee el MISMO `DatosControl` que pinta la pantalla.
 *
 * Etiquetas: la ventana se abre EN el clic (después de un `await` el navegador
 * la bloquea como pop-up, gotcha ADR-436) y llevan el permiso de LAS TROZAS,
 * no el plan activo del libro: con tres planes vivos no es el mismo.
 */

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Map as MapIcon, MessageCircle, Printer } from "@buleje/design-system/icons";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { exportSheetsToExcel } from "@/lib/export-excel";
import { describirError } from "@/lib/errores/sin-dato";
import { openCtpReport } from "@/lib/forestal/ctp-print-shared";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import {
  enlaceWhatsapp,
  filaExcelDeTroza,
  hojasDelControl,
  htmlReporteControl,
  nombreArchivoControl,
  textoWhatsappControl,
  type DatosControl,
} from "@/lib/forestal/loth-tablero-reporte";
import type { PlanTablero } from "@/lib/forestal/loth-tablero-permiso";
import { planesDe, type TrozaTablero } from "@/lib/forestal/loth-tablero-trozas";
import { imprimirEtiquetasTrozasLoth } from "@/lib/forestal/loth-troza-etiquetas";

const ESPERA_ETIQUETAS =
  '<!doctype html><meta charset="utf-8"><title>Generando etiquetas…</title><p style="font:16px system-ui;padding:24px">Generando etiquetas…</p>';

export function useLothTableroAcciones({
  datos,
  nombre,
  entries,
  seleccion,
  planes,
  tituloDelLibro,
  onIrAlPlan,
}: {
  datos: DatosControl;
  /** Nombre del permiso para el archivo («PO 12», «todos»). */
  nombre: string;
  entries: readonly LothEntryDTO[];
  seleccion: readonly TrozaTablero[];
  planes: readonly PlanTablero[];
  tituloDelLibro: string | null;
  onIrAlPlan?: () => void;
}) {
  const [imprimiendo, setImprimiendo] = useState(false);

  const exportarExcel = useCallback(async () => {
    try {
      await exportSheetsToExcel(hojasDelControl(datos), nombreArchivoControl(nombre, datos.hoyKey));
    } catch (err) {
      toast.error(`No se pudo armar el Excel: ${describirError(err)}`);
    }
  }, [datos, nombre]);

  const imprimirReporte = useCallback(() => {
    try {
      openCtpReport(htmlReporteControl(datos));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }, [datos]);

  const compartirWhatsapp = useCallback(() => {
    window.open(enlaceWhatsapp(textoWhatsappControl(datos)), "_blank", "noopener,noreferrer");
  }, [datos]);

  const exportarSeleccion = useCallback(async () => {
    try {
      await exportSheetsToExcel(
        [{ nombre: "Trozas elegidas", filas: seleccion.map((f) => filaExcelDeTroza(f, datos.nombrePlanDe)) }],
        nombreArchivoControl(nombre, datos.hoyKey, "eleccion"),
      );
    } catch (err) {
      toast.error(`No se pudo armar el Excel: ${describirError(err)}`);
    }
  }, [seleccion, datos, nombre]);

  const imprimirEtiquetas = useCallback(() => {
    const ventana = window.open("", "_blank", "width=980,height=760");
    if (!ventana) {
      toast.error("El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para este sitio.");
      return;
    }
    ventana.document.write(ESPERA_ETIQUETAS);
    const porId = new Map(entries.map((e) => [e.id, e]));
    const lineas = seleccion.map((f) => (f.trozadoId ? porId.get(f.trozadoId) : undefined)).filter((e): e is LothEntryDTO => e != null);
    const ids = planesDe(seleccion);
    const plan = ids.length === 1 && ids[0] ? (planes.find((p) => p.id === ids[0]) ?? null) : null;
    setImprimiendo(true);
    void imprimirEtiquetasTrozasLoth(lineas, {
      origin: window.location.origin,
      tituloHabilitante: plan?.tituloHabilitante ?? tituloDelLibro,
      planNumber: plan?.planNumber ?? null,
      ventana,
    })
      .then((n) => {
        if (n === 0) {
          toast.error("Ninguna de estas trozas tiene código para imprimir.");
          ventana.close();
        }
      })
      .catch((err: unknown) => {
        toast.error(`No se pudieron armar las etiquetas: ${describirError(err)}`);
        ventana.close();
      })
      .finally(() => setImprimiendo(false));
  }, [entries, seleccion, planes, tituloDelLibro]);

  const sinTrozas = datos.filas.length === 0;
  const acciones: MenuAccion[] = useMemo(
    () => [
      {
        id: "excel",
        label: "Exportar a Excel",
        hint: "Resumen por estado, cada troza y el saldo por especie",
        icon: FileSpreadsheet,
        onSelect: () => void exportarExcel(),
        disabled: sinTrozas && !datos.cascada,
      },
      {
        id: "reporte",
        label: "Imprimir reporte de control",
        hint: "Para supervisión: el permiso, los estados, el volumen y el patio",
        icon: Printer,
        onSelect: imprimirReporte,
      },
      {
        id: "whatsapp",
        label: "Compartir resumen por WhatsApp",
        hint: "En patio, lo que se está quedando viejo y lo despachado hoy",
        icon: MessageCircle,
        onSelect: compartirWhatsapp,
      },
      ...(onIrAlPlan
        ? [{ id: "plan", label: "Ir al Plan de manejo", hint: "Especies, volumen y censo del permiso", icon: MapIcon, onSelect: onIrAlPlan }]
        : []),
    ],
    [exportarExcel, imprimirReporte, compartirWhatsapp, onIrAlPlan, sinTrozas, datos.cascada],
  );

  return { acciones, imprimiendo, imprimirEtiquetas, exportarSeleccion };
}
