"use client";

/**
 * La fila de arriba del Control del permiso, en UNA fila (ley de la vista,
 * rule `ui-components`): el título con su ⓘ y las cifras que contesta, y a la
 * derecha el menú «Opciones» y «Escanear troza» — en el patio es LA acción
 * (rellena). Dentro del libro todo eso va al riel de las pestañas.
 *
 * El permiso que se mira NO se elige acá (04-10, Brandon): manda el selector
 * del libro (`LothPermisoChip`, en la banda, al lado de las pestañas) y el
 * tablero lo obedece. Tenía un `<select>` propio y se veían dos «Todos los
 * permisos»; el del libro ya ofrecía todo lo que éste (cada plan con su
 * titular, «Sin plan»), más la vigencia de cada uno.
 *
 * El «Informe del permiso (PDF)» también vive en el menú, al lado del reporte
 * impreso (lo trae el libro en `accionesExtra`): en una fila propia era un
 * botón huérfano.
 *
 * Merge 2026-10-04 (dos sesiones hicieron esta cabecera): el «Exportar Excel»
 * para OSINFOR (todas las columnas, hoja resumen por estado) entra al menú
 * como acción oficial, junto al Excel del control, el reporte impreso y el
 * resumen por WhatsApp: a la vista sólo queda lo de uso constante.
 */

import { useState } from "react";
import { FileSpreadsheet, ScanBarcode } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import {
  UMBRAL_PATIO_DIAS,
  type ResumenEstado,
  type ResumenViejas,
  type TrozaTablero,
} from "@/lib/forestal/loth-tablero-trozas";
import type { CaratulaTablero } from "./LothTableroBanda";
import { CabeceraDeVista } from "./ctp-cabecera-vista";
import { CLASE_PRINCIPAL_PLEGABLE, CLASE_PRINCIPAL_RIEL, RotuloPrincipal } from "./ctp-riel-piezas";

export default function LothTableroCabecera({
  resumen,
  viejas,
  acciones,
  accionesExtra = [],
  filas,
  caratula,
  cargando,
  onEscanear,
}: {
  resumen: readonly ResumenEstado[];
  viejas: ResumenViejas;
  acciones: MenuAccion[];
  /** Las que trae el libro (el informe del permiso): van después del reporte impreso. */
  accionesExtra?: readonly MenuAccion[];
  /** Las trozas del permiso elegido (sin los filtros de la tabla): lo que lleva el Excel para OSINFOR. */
  filas: readonly TrozaTablero[];
  caratula?: CaratulaTablero | null;
  /** Mientras llegan las guías y los planes, el Excel saldría sin placa ni N° de plan. */
  cargando: boolean;
  onEscanear: () => void;
}) {
  const disp = resumen.find((r) => r.estado === "disponible");
  const desp = resumen.find((r) => r.estado === "despachada");

  const [exportando, setExportando] = useState(false);
  const [errorExport, setErrorExport] = useState<string | null>(null);

  const exportarOsinfor = async () => {
    setExportando(true);
    setErrorExport(null);
    try {
      const { exportarTableroExcel } = await import("@/lib/forestal/loth-tablero-export");
      await exportarTableroExcel(filas, caratula);
    } catch (err) {
      console.error("[loth-tablero] export Excel falló", err);
      setErrorExport("No se pudo armar el Excel. Vuelve a intentarlo.");
    } finally {
      setExportando(false);
    }
  };

  const osinfor: MenuAccion = {
    id: "excel-osinfor",
    label: exportando ? "Armando el Excel…" : "Excel para OSINFOR",
    hint: "Cada troza con todas las columnas (placa, plan, parcela, medidas), más una hoja resumen por estado",
    icon: FileSpreadsheet,
    tone: "dark",
    busy: exportando,
    disabled: exportando || filas.length === 0 || cargando,
    onSelect: () => void exportarOsinfor(),
  };
  /* Al lado del otro Excel: los dos exportan, pero éste es el que se presenta. */
  const iExcel = acciones.findIndex((a) => a.id === "excel");
  const conOsinfor = iExcel < 0 ? [osinfor, ...acciones] : [...acciones.slice(0, iExcel + 1), osinfor, ...acciones.slice(iExcel + 1)];
  /* Los dos papeles impresos, juntos: el reporte de control y el informe del permiso. */
  const iReporte = conOsinfor.findIndex((a) => a.id === "reporte");
  const menu =
    iReporte < 0
      ? [...conOsinfor, ...accionesExtra]
      : [...conOsinfor.slice(0, iReporte + 1), ...accionesExtra, ...conOsinfor.slice(iReporte + 1)];

  const cifras = (
    <span
      title={`${disp?.n ?? 0} en patio · ${fmtM3(disp?.m3 ?? 0)} m³${viejas.n > 0 ? ` · ${viejas.n} con más de ${UMBRAL_PATIO_DIAS.atencion} días` : ""} · ${desp?.n ?? 0} ${desp?.n === 1 ? "despachada" : "despachadas"}`}
      className="text-sm tabular-nums text-[var(--text-secondary)] @min-[0px]/riel:max-w-[11rem] @min-[0px]/riel:truncate @min-[0px]/riel:text-xs @min-[80rem]/riel:max-w-[18rem] @max-[40rem]/riel:sr-only"
    >
      <b className="text-[var(--text-primary)]">{disp?.n ?? 0}</b> en patio ·{" "}
      <b className="text-[var(--text-primary)]">{fmtM3(disp?.m3 ?? 0)}</b> m³
      {viejas.n > 0 && (
        <>
          {" "}·{" "}
          <b className={viejas.criticas > 0 ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"}>
            {viejas.n}
          </b>{" "}
          con más de {UMBRAL_PATIO_DIAS.atencion} días
        </>
      )}{" "}
      · <b className="text-[var(--text-primary)]">{desp?.n ?? 0}</b> {desp?.n === 1 ? "despachada" : "despachadas"}
    </span>
  );

  /* Dentro del libro (17-10, «compactar el Libro TH»): el título se calla —el
     riel ya dice «Control»—, el ⓘ y las cifras van primero en el riel (en el celular, sólo en Indicadores), y el ⋯
     y «Escanear troza» (LA acción del patio, rellena y al final) detrás. */
  return (
    <>
      <CabeceraDeVista
        titulo="Control del permiso"
        info={
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <InfoTip
              title="Control del permiso"
              what="Qué pasó con cada troza amparada por el título habilitante: la que sigue en el patio, la que salió con GTF y la que se consumió adentro."
              affects="Elige el permiso para ver cuánto volumen le queda; marca trozas del patio para despacharlas con guía o imprimir sus etiquetas."
              example="Pasa la pistola por la etiqueta de la troza: queda resaltada y elegida. Con «Escanear troza» la lees con la cámara del celular."
              side="bottom"
            />
            {cifras}
          </span>
        }
      >
        <ActionMenu label="Opciones del control" actions={menu} size="md" soloIcono />
        <button
          type="button"
          onClick={onEscanear}
          disabled={filas.length === 0}
          aria-label="Escanear troza"
          title="Escanear troza: con la cámara del celular, o tipea el código"
          className={cn(CLASE_PRINCIPAL_RIEL, CLASE_PRINCIPAL_PLEGABLE, "disabled:cursor-not-allowed disabled:opacity-50")}
        >
          <ScanBarcode className="h-5 w-5" aria-hidden="true" />
          <RotuloPrincipal corto="Escanear">Escanear troza</RotuloPrincipal>
        </button>
      </CabeceraDeVista>
      {errorExport && (
        <p role="alert" className="text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {errorExport}
        </p>
      )}
    </>
  );
}
