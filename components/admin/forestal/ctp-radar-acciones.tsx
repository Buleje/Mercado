"use client";

/**
 * Las acciones del Radar en el riel del libro: un «Descargar ▾» con los cuatro
 * archivos (CSV, imprimible, PNG y SVG del dibujo) y recargar como ícono.
 *
 * Antes eran cinco botones con texto en la cabecera (Brandon 17-10: «los
 * botones… se pondrán al lado de las pestañas en la esquina para ocupar menos
 * espacio»): ninguno se usa a cada rato, así que van juntos en un menú.
 */

import { Camera, Download, FileDown, FileSpreadsheet, RefreshCw } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { BTN_ICONO_RIEL } from "./ctp-riel-piezas";

export default function CtpRadarAcciones({
  hayCadena,
  conDibujo,
  exportando,
  cargando,
  onCsv,
  onImprimir,
  onImagen,
  onRecargar,
}: {
  /** Hay grafo y no está vacío: sin eso no hay nada que bajar. */
  hayCadena: boolean;
  /** La cadena está en pantalla: el PNG y el SVG son su dibujo. */
  conDibujo: boolean;
  exportando: null | "png" | "svg";
  cargando: boolean;
  onCsv: () => void;
  onImprimir: () => void;
  onImagen: (formato: "png" | "svg") => void;
  onRecargar: () => void;
}) {
  const acciones: MenuAccion[] = [
    {
      id: "csv",
      label: "Planilla CSV",
      hint: "El saldo de cada línea y el volumen de cada eslabón",
      icon: FileSpreadsheet,
      onSelect: onCsv,
    },
    {
      id: "imprimir",
      label: "Imprimir la cadena",
      hint: "Documento de la cadena de custodia, para adjuntar a un informe ARFFS",
      icon: FileDown,
      onSelect: onImprimir,
    },
    ...(conDibujo
      ? ([
          {
            id: "png",
            label: "Imagen PNG",
            hint: "El dibujo al doble de resolución, para pegarlo en un WhatsApp o un Word",
            icon: Camera,
            busy: exportando === "png",
            disabled: !!exportando,
            seccion: "Imagen del dibujo",
            onSelect: () => onImagen("png"),
          },
          {
            id: "svg",
            label: "Imagen SVG",
            hint: "Vectorial: se agranda sin pixelarse, para el informe impreso",
            icon: Camera,
            busy: exportando === "svg",
            disabled: !!exportando,
            seccion: "Imagen del dibujo",
            onSelect: () => onImagen("svg"),
          },
        ] satisfies MenuAccion[])
      : []),
  ];
  return (
    <>
      {hayCadena && (
        <ActionMenu label="Descargar la cadena" soloIcono icon={Download} actions={acciones} />
      )}
      <button
        type="button"
        onClick={onRecargar}
        disabled={cargando}
        aria-label="Recargar la cadena"
        title="Recargar"
        className={BTN_ICONO_RIEL}
      >
        <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} aria-hidden />
      </button>
    </>
  );
}
