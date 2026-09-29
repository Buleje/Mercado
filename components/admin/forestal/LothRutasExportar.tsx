"use client";

/**
 * LothRutasExportar — los botones del bloque «Rutas y puntos»: copiar todo
 * (texto para WhatsApp o el informe) y un menú «Exportar» con Excel (rutas,
 * vértices y puntos en tres hojas), GeoJSON (QGIS) y KML (Google Earth, el
 * celular). Todo sale de las mismas filas que la tabla y la ficha del mapa.
 */

import { useState } from "react";
import { toast } from "sonner";
import { ClipboardCopy, Download, FileJson, FileSpreadsheet, Globe } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { exportSheetsToExcel } from "@/lib/export-excel";
import { geoJsonDeRutas, hojasDeRutas, kmlDeRutas, textoDeTodo, type FilaPunto, type FilaRuta } from "@/lib/forestal/loth-rutas-coordenadas";
import { descargarTexto } from "./loth-mapa-coordenadas";
import { copiarTexto } from "./loth-rutas-ui";

const BTN =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40";

export default function LothRutasExportar({ rutas, puntos }: { rutas: readonly FilaRuta[]; puntos: readonly FilaPunto[] }) {
  const [excel, setExcel] = useState(false);
  const vacio = rutas.length === 0 && puntos.length === 0;

  const acciones: MenuAccion[] = [
    {
      id: "excel",
      label: "Excel",
      hint: "Tres hojas: rutas, cada vértice y los puntos, con UTM y lat/lng",
      icon: FileSpreadsheet,
      busy: excel,
      onSelect: () => {
        setExcel(true);
        exportSheetsToExcel(hojasDeRutas(rutas, puntos), "rutas-y-puntos-libro-th")
          .catch((err: unknown) => toast.error(`No se pudo armar el Excel: ${err instanceof Error ? err.message : String(err)}`))
          .finally(() => setExcel(false));
      },
    },
    {
      id: "geojson",
      label: "GeoJSON",
      hint: "Para QGIS o el regente: líneas y puntos en WGS 84",
      icon: FileJson,
      onSelect: () => descargarTexto(JSON.stringify(geoJsonDeRutas(rutas, puntos), null, 2), "rutas-y-puntos-libro-th.geojson", "application/geo+json"),
    },
    {
      id: "kml",
      label: "KML",
      hint: "Para Google Earth o el celular en el monte",
      icon: Globe,
      onSelect: () => descargarTexto(kmlDeRutas(rutas, puntos), "rutas-y-puntos-libro-th.kml", "application/vnd.google-earth.kml+xml"),
    },
  ];

  return (
    <>
      <button type="button" disabled={vacio} onClick={() => void copiarTexto(textoDeTodo(rutas, puntos), "las coordenadas de las rutas y los puntos")} className={BTN}>
        <ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" /> Copiar todo
      </button>
      <ActionMenu label="Exportar" icon={Download} actions={acciones} size="xs" disabled={vacio} className="h-9!" />
    </>
  );
}
