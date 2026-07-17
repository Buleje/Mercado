"use client";

/**
 * CTPLibroOperaciones — Módulo admin Libro de Operaciones del Centro de
 * Transformación Primaria (LOE-CTP SERFOR, ADR-124).
 *
 * Solo se renderiza si el tenant tiene `spec:forestal:ctp-libro` habilitado
 * (gating en sidebar via useEnabledSpecs + en endpoints via 403).
 *
 * 2026-05-28 v2 — Refactor visual: AdminModuleHeader + StatCard + AdminModal.
 * 2026-07-15 v3 — El shell queda fino: cabecera + período + pestañas. El
 * período es del MÓDULO (un libro se lleva por período) y lo consumen las 5
 * vistas y el export; cada vista trae sus propios datos y acciones.
 * 2026-07-15 v4 — 5ª pestaña "Cumplimiento": las alertas del período que
 * antes solo se veían al exportar el Excel (fuera de plazo, CITES, saldos
 * negativos, pendientes de validar) ahora tienen su propio panel. Va al
 * final (después de Saldos) porque combina datos de Ingresos + Saldos —
 * un cierre de período la revisa último, no primero.
 */

import { useMemo, useState } from "react";
import {
  Boxes,
  Building2,
  FileSpreadsheet,
  FileText,
  Loader2,
  PackageOpen,
  Scale,
  ShieldCheck,
  TreePine,
  Truck,
} from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { exportarLibroCtp, exportarLibroCtpOficial } from "@/lib/forestal/ctp-export";
import { printInformePeriodo } from "@/lib/forestal/ctp-informe";
import { resolveCtpPeriod, type CtpPeriodKey } from "@/lib/forestal/ctp-period";
import CtpPeriodPicker, { type CtpCustomRange } from "./CtpPeriodPicker";
import CtpIngresosView from "./CtpIngresosView";
import { CtpEntriesView, CtpSaldosView } from "./CtpSectionViews";
import CtpCompliancePanel from "./CtpCompliancePanel";
import CtpFichaEditor from "./CtpFichaEditor";

type CtpView = "ingresos" | "produccion" | "despacho" | "saldos" | "cumplimiento" | "ficha";

const CTP_VIEWS: { key: CtpView; label: string; icon: typeof Boxes; hint: string }[] = [
  { key: "ingresos", label: "Ingresos", icon: PackageOpen, hint: "Materia prima recibida" },
  { key: "produccion", label: "Producción", icon: Boxes, hint: "Transformación" },
  { key: "despacho", label: "Despacho", icon: Truck, hint: "Salida de producto" },
  { key: "saldos", label: "Saldos", icon: Scale, hint: "Balance de planta" },
  { key: "cumplimiento", label: "Cumplimiento", icon: ShieldCheck, hint: "Alertas del período" },
  { key: "ficha", label: "Ficha CTP", icon: Building2, hint: "Identidad legal SERFOR" },
];

export default function CTPLibroOperaciones() {
  const [view, setView] = useState<CtpView>("ingresos");
  // Default = trimestre, no "mes actual": una planta con un mes flojo abriría el
  // libro vacío teniendo datos, y "vacío al abrir" se lee como "roto".
  // El cierre mensual está a un click en el selector.
  const [periodKey, setPeriodKey] = useState<CtpPeriodKey>("trimestre");
  const [custom, setCustom] = useState<CtpCustomRange>({ from: "", to: "" });
  const [exporting, setExporting] = useState<null | "interno" | "oficial" | "informe">(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const period = useMemo(() => resolveCtpPeriod(periodKey, custom), [periodKey, custom]);

  async function exportar(kind: "interno" | "oficial" | "informe") {
    setExporting(kind);
    setExportError(null);
    try {
      if (kind === "informe") await printInformePeriodo(period);
      else if (kind === "oficial") await exportarLibroCtpOficial(period);
      else await exportarLibroCtp(period);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-6">
      <AdminModuleHeader
        eyebrow="Forestal · Especialización"
        title="Libro de Operaciones CTP"
        description="Registro de ingresos de madera al Centro de Transformación Primaria. Compatible con LOE-CTP SERFOR (interno, no oficial)."
        icon={TreePine}
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => exportar("interno")}
            disabled={exporting !== null}
            title="Descarga el libro del período (Ingresos, Producción, Despacho, Saldos) en Excel — vista interna"
            className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"
          >
            {exporting === "interno" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            <span>Exportar libro</span>
          </button>
          <button
            type="button"
            onClick={() => exportar("informe")}
            disabled={exporting !== null}
            title="Informe de operaciones del período para presentar a la ARFFS (imprimible): ficha del CTP + movimientos + existencias + cumplimiento"
            className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"
          >
            {exporting === "informe" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            <span>Informe ARFFS</span>
          </button>
          <button
            type="button"
            onClick={() => exportar("oficial")}
            disabled={exporting !== null}
            title="Formato oficial LO-CTP (RDE D000025-2023-SERFOR): portada con datos del CTP + los 3 registros con columnas oficiales + existencias"
            className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--brand-ink)] bg-[var(--brand-ink)] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
          >
            {exporting === "oficial" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            <span>Formato oficial SERFOR</span>
          </button>
        </div>
      </AdminModuleHeader>

      <CtpPeriodPicker
        periodKey={periodKey}
        custom={custom}
        period={period}
        onKeyChange={setPeriodKey}
        onCustomChange={setCustom}
      />

      {exportError && (
        <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]">
          <strong>No se pudo exportar:</strong> {exportError}
        </div>
      )}

      {/* Sub-tabs del Libro CTP: flujo materia prima → producto → salida */}
      <div className="flex flex-wrap gap-2 border-b-2 border-[var(--rule-soft)] pb-px max-sm:gap-1">
        {CTP_VIEWS.map((v) => {
          const Icon = v.icon;
          const active = view === v.key;
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v.key)}
              className={`group inline-flex items-center gap-2 rounded-t-xl border-b-2 px-4 py-2.5 text-sm font-bold transition max-sm:grow max-sm:justify-center max-sm:px-2 ${
                active
                  ? "border-[var(--brand-ink)] text-[var(--brand-ink)]"
                  : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{v.label}</span>
              <span className="hidden text-xs font-normal text-[var(--text-tertiary)] sm:inline">
                · {v.hint}
              </span>
            </button>
          );
        })}
      </div>

      {view === "ingresos" && <CtpIngresosView period={period} />}
      {view === "produccion" && <CtpEntriesView section="produccion" period={period} />}
      {view === "despacho" && <CtpEntriesView section="despacho" period={period} />}
      {view === "saldos" && <CtpSaldosView period={period} />}
      {view === "cumplimiento" && <CtpCompliancePanel period={period} onNavigate={setView} />}
      {view === "ficha" && <CtpFichaEditor />}
    </div>
  );
}
