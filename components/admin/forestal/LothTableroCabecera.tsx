"use client";

/**
 * La fila de arriba del Control del permiso, en UNA fila (ley de la vista,
 * rule `ui-components`): el título con su ⓘ y las cifras que contesta, y a la
 * derecha «Escanear troza» — en el patio es LA acción (primera y rellena) —,
 * el permiso que se mira y el menú «Opciones».
 *
 * Merge 2026-10-04 (dos sesiones hicieron esta cabecera): el «Exportar Excel»
 * para OSINFOR (todas las columnas, hoja resumen por estado) entra al menú
 * como acción oficial, junto al Excel del control, el reporte impreso y el
 * resumen por WhatsApp: a la vista sólo queda lo de uso constante.
 */

import { useState } from "react";
import { SectionTitle } from "@buleje/design-system";
import { FileSpreadsheet, ScanBarcode } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { nombreDelPlan, type PlanTablero } from "@/lib/forestal/loth-tablero-permiso";
import {
  PLAN_SIN_PLAN,
  UMBRAL_PATIO_DIAS,
  type ResumenEstado,
  type ResumenViejas,
  type TrozaTablero,
} from "@/lib/forestal/loth-tablero-trozas";
import type { CaratulaTablero } from "./LothTableroBanda";

export default function LothTableroCabecera({
  resumen,
  viejas,
  planes,
  planSel,
  haySinPlan,
  onElegirPlan,
  acciones,
  filas,
  caratula,
  cargando,
  onEscanear,
}: {
  resumen: readonly ResumenEstado[];
  viejas: ResumenViejas;
  planes: readonly PlanTablero[];
  planSel: string | null;
  haySinPlan: boolean;
  onElegirPlan: (id: string | null) => void;
  acciones: MenuAccion[];
  /** Las trozas del permiso elegido (sin los filtros de la tabla): lo que lleva el Excel para OSINFOR. */
  filas: readonly TrozaTablero[];
  caratula?: CaratulaTablero | null;
  /** Mientras llegan las guías y los planes, el Excel saldría sin placa ni N° de plan. */
  cargando: boolean;
  onEscanear: () => void;
}) {
  const disp = resumen.find((r) => r.estado === "disponible");
  const desp = resumen.find((r) => r.estado === "despachada");
  const elegido = planes.find((p) => p.id === planSel) ?? null;

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
  const menu = iExcel < 0 ? [osinfor, ...acciones] : [...acciones.slice(0, iExcel + 1), osinfor, ...acciones.slice(iExcel + 1)];

  return (
    <>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <span className="inline-flex items-center gap-1.5">
            <SectionTitle className="text-[var(--text-primary)]">Control del permiso</SectionTitle>
            <InfoTip
              title="Control del permiso"
              what="Qué pasó con cada troza amparada por el título habilitante: la que sigue en el patio, la que salió con GTF y la que se consumió adentro."
              affects="Elige el permiso para ver cuánto volumen le queda; marca trozas del patio para despacharlas con guía o imprimir sus etiquetas."
              example="Pasa la pistola por la etiqueta de la troza: queda resaltada y elegida. Con «Escanear troza» la lees con la cámara del celular."
              side="bottom"
            />
          </span>
          <p className="text-sm tabular-nums text-[var(--text-secondary)]">
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
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Entre 640 y 1536 px la fila no entra con el rótulo: queda el ícono
              (rellena, sigue siendo LA acción) antes que partir la cabecera. */}
          <button
            type="button"
            onClick={onEscanear}
            disabled={filas.length === 0}
            aria-label="Escanear troza"
            title="Escanear troza: con la cámara del celular, o tipea el código"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--accent-600)] disabled:cursor-not-allowed disabled:opacity-50 max-sm:px-3.5 2xl:px-3.5"
          >
            <ScanBarcode className="h-5 w-5" aria-hidden="true" />
            <span className="hidden max-sm:inline 2xl:inline">Escanear troza</span>
          </button>
          <label className="sr-only" htmlFor="tablero-permiso">
            Permiso
          </label>
          <select
            id="tablero-permiso"
            value={planSel ?? ""}
            onChange={(e) => onElegirPlan(e.target.value || null)}
            title={elegido ? `${nombreDelPlan(elegido)} · ${elegido.titularName ?? ""}` : "Las trozas de todos los permisos del libro"}
            /* `dark:bg-…` saca al select del respaldo oscuro de globals.css, que le pisaba
               el borde con --rule-base: elegido, el borde de acento no se veía en oscuro. */
            className={`h-10 w-48 rounded-xl border-2 bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none dark:bg-[var(--surface-raised)] ${
              planSel ? "border-[var(--accent)]" : "border-[var(--rule-base)]"
            }`}
          >
            <option value="">Todos los permisos</option>
            {planes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.titularName && p.titularName !== nombreDelPlan(p) ? `${nombreDelPlan(p)} · ${p.titularName}` : nombreDelPlan(p)}
              </option>
            ))}
            {(haySinPlan || planSel === PLAN_SIN_PLAN) && <option value={PLAN_SIN_PLAN}>Sin plan</option>}
          </select>
          <ActionMenu label="Opciones del control" actions={menu} size="sm" soloIcono />
        </div>
      </header>
      {errorExport && (
        <p role="alert" className="text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {errorExport}
        </p>
      )}
    </>
  );
}
