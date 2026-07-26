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

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Building2,
  Coins,
  FileSpreadsheet,
  FileText,
  Globe,
  Loader2,
  Lock,
  MapPin,
  PackageOpen,
  Scale,
  Share2,
  ShieldCheck,
  TreePine,
  TrendingUp,
  Truck,
  Upload,
} from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { exportarLibroCtp, exportarLibroCtpOficial } from "@/lib/forestal/ctp-export";
import { printInformePeriodo } from "@/lib/forestal/ctp-informe";
import { resolveCtpPeriod, type CtpPeriodKey } from "@/lib/forestal/ctp-period";
import CtpPeriodPicker, { type CtpCustomRange } from "./CtpPeriodPicker";
import CtpIngresosView from "./CtpIngresosView";
import { CtpEntriesView, CtpSaldosView } from "./CtpSectionViews";
import CtpCompliancePanel from "./CtpCompliancePanel";
import CtpFichaEditor from "./CtpFichaEditor";
import CtpCierrePanel from "./CtpCierrePanel";
import { useCtpCierres } from "@/hooks/use-ctp-cierres";
import CtpPatioBandeja from "./CtpPatioBandeja";
import { usePatioCola } from "@/hooks/use-patio-cola";
import CtpCierreAsistido from "./CtpCierreAsistido";
import CtpEudrPanel from "./CtpEudrPanel";
import CtpRentabilidadPanel from "./CtpRentabilidadPanel";
import CtpImportModal from "./CtpImportModal";
import CtpTrazaRadar from "./CtpTrazaRadar";
import CtpPlantaView from "./CtpPlantaView";
import CtpAsistente from "./CtpAsistente";
import CtpAnalisis from "./CtpAnalisis";
import CtpHealthChip from "./CtpHealthChip";
import CtpPendientes from "./CtpPendientes";
import { CTP_INGRESAR_GTF_KEY, CTP_MODULE_TAB_ID } from "./ctp-shared";

type CtpView = "ingresos" | "produccion" | "despacho" | "radar" | "planta" | "saldos" | "cumplimiento" | "cierre" | "eudr" | "rentabilidad" | "analisis" | "ficha";

const CTP_VIEWS: { key: CtpView; label: string; icon: typeof Boxes; hint: string }[] = [
  { key: "ingresos", label: "Ingresos", icon: PackageOpen, hint: "Materia prima recibida" },
  { key: "produccion", label: "Producción", icon: Boxes, hint: "Transformación" },
  { key: "despacho", label: "Despacho", icon: Truck, hint: "Salida de producto" },
  { key: "radar", label: "Radar", icon: Share2, hint: "Cadena de custodia visual" },
  { key: "planta", label: "Planta", icon: MapPin, hint: "Mapa del aserradero" },
  { key: "saldos", label: "Saldos", icon: Scale, hint: "Balance de planta" },
  { key: "cumplimiento", label: "Cumplimiento", icon: ShieldCheck, hint: "Alertas del período" },
  { key: "cierre", label: "Cierre", icon: Lock, hint: "Cerrar mes · bloquear el acta" },
  { key: "eudr", label: "EUDR", icon: Globe, hint: "Geolocalización + dossier UE" },
  { key: "rentabilidad", label: "Rentabilidad", icon: Coins, hint: "Margen: venta − COGS" },
  { key: "analisis", label: "Análisis", icon: TrendingUp, hint: "Reorden + tendencias" },
  { key: "ficha", label: "Ficha CTP", icon: Building2, hint: "Identidad legal SERFOR" },
];

// Sub-tabs coherentes con el resto del admin: AdminTabBar da reorden por drag,
// persistencia del orden y registro en el sidebar. `title` = el hint como tooltip.
const CTP_MODULE_ID = "ctp-libro";
const CTP_TAB_ITEMS = CTP_VIEWS.map((v) => ({ id: v.key, label: v.label, icon: v.icon, title: v.hint }));

export default function CTPLibroOperaciones() {
  /** Un solo estado de cierres para el asistente y el historial. */
  const cierres = useCtpCierres();
  /** Lo anotado en el patio sin señal, esperando subir al libro. */
  const cola = usePatioCola();
  const [view, setView] = useState<CtpView>(() => {
    if (typeof window === "undefined") return "ingresos";
    const saved = localStorage.getItem(`admin-last-tab-${CTP_MODULE_ID}`);
    return saved && CTP_VIEWS.some((v) => v.key === saved) ? (saved as CtpView) : "ingresos";
  });
  useEffect(() => {
    try {
      localStorage.setItem(`admin-last-tab-${CTP_MODULE_ID}`, view);
    } catch {
      // localStorage puede fallar (modo privado): sin persistencia, sin bug.
    }
  }, [view]);
  // Default = trimestre, no "mes actual": una planta con un mes flojo abriría el
  // libro vacío teniendo datos, y "vacío al abrir" se lee como "roto".
  // El cierre mensual está a un click en el selector.
  const [periodKey, setPeriodKey] = useState<CtpPeriodKey>("trimestre");
  const [custom, setCustom] = useState<CtpCustomRange>({ from: "", to: "" });
  const [exporting, setExporting] = useState<null | "interno" | "oficial" | "informe">(null);
  const [exportError, setExportError] = useState<string | null>(null);
  // Puente inverso: GTF que el Libro de Títulos Habilitantes mandó a ingresar.
  const [pendingIngresoGtf, setPendingIngresoGtf] = useState<string | null>(null);
  // Importación del LO-CTP (ADR-138) — etapa 1: ingresos.
  const [showImport, setShowImport] = useState(false);
  // Remonta la vista de Ingresos tras importar → re-fetch de la lista.
  const [ingresosKey, setIngresosKey] = useState(0);

  const period = useMemo(() => resolveCtpPeriod(periodKey, custom), [periodKey, custom]);

  // Levanta el handoff de sessionStorage → abre Ingresos pre-llenado. Se
  // dispara al montar (tab abierto en frío) y cada vez que el tab se re-activa
  // (TabMultiplexer cachea el módulo montado, así que el mount no vuelve a correr).
  const consumirHandoff = useCallback(() => {
    let gtf: string | null = null;
    try {
      gtf = sessionStorage.getItem(CTP_INGRESAR_GTF_KEY);
      if (gtf) sessionStorage.removeItem(CTP_INGRESAR_GTF_KEY);
    } catch {
      // sessionStorage puede fallar (modo privado/SSR): sin handoff, sin bug.
    }
    if (gtf) {
      setView("ingresos");
      setPendingIngresoGtf(gtf);
    }
  }, []);

  useEffect(() => {
    consumirHandoff();
    const onActivated = (e: Event) => {
      if ((e as CustomEvent).detail?.tab === CTP_MODULE_TAB_ID) consumirHandoff();
    };
    window.addEventListener("admin-tab-activated", onActivated);
    return () => window.removeEventListener("admin-tab-activated", onActivated);
  }, [consumirHandoff]);

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
            onClick={() => setShowImport(true)}
            title="Importar el Libro de Operaciones desde el Excel oficial LO-CTP (SERFOR) — etapa 1: ingresos"
            className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
          >
            <Upload className="h-4 w-4" />
            <span>Importar libro</span>
          </button>
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

      {/* El selector de período solo aplica a las vistas period-scoped. Análisis
          (tendencia fija de 6 meses), Cierre (por mes) y Ficha (identidad) NO lo
          usan — mostrarlo ahí hacía parecer que "el selector no hace nada". */}
      {!["analisis", "cierre", "ficha"].includes(view) && (
        <CtpPeriodPicker
          periodKey={periodKey}
          custom={custom}
          period={period}
          onKeyChange={setPeriodKey}
          onCustomChange={setCustom}
        />
      )}

      <CtpAsistente />

      {exportError && (
        <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]">
          <strong>No se pudo exportar:</strong> {exportError}
        </div>
      )}

      {/* Sub-tabs del Libro CTP: flujo materia prima → producto → salida.
          AdminTabBar = coherencia con el resto del admin (reorden por drag,
          registro en sidebar). El semáforo del período va en rightSlot. */}
      <AdminTabBar
        moduleId={CTP_MODULE_ID}
        tabs={CTP_TAB_ITEMS}
        activeTab={view}
        onTabChange={(id) => setView(id as CtpView)}
        rightSlot={
          view !== "cumplimiento" ? (
            <CtpHealthChip period={period} onNavigate={() => setView("cumplimiento")} />
          ) : undefined
        }
      >
        {/* Lo que falta hacer, antes de la vista: el Libro tiene 12 pestañas y
            la respuesta a "¿qué me falta?" estaba repartida entre todas. */}
        <div className="mt-6">
          <CtpPatioBandeja cola={cola} />
          <CtpPendientes period={period} onIr={(v) => setView(v as CtpView)} />
        </div>

        <div className="mt-6">
          {view === "ingresos" && (
            <CtpIngresosView
              key={ingresosKey}
              period={period}
              openGtf={pendingIngresoGtf}
              onOpenConsumed={() => setPendingIngresoGtf(null)}
            />
          )}
          {view === "produccion" && <CtpEntriesView key={`prod-${ingresosKey}`} section="produccion" period={period} />}
          {view === "despacho" && <CtpEntriesView key={`desp-${ingresosKey}`} section="despacho" period={period} />}
          {view === "radar" && <CtpTrazaRadar period={period} />}
          {view === "planta" && <CtpPlantaView period={period} />}
          {view === "saldos" && <CtpSaldosView period={period} />}
          {view === "cumplimiento" && <CtpCompliancePanel period={period} onNavigate={setView} />}
          {view === "cierre" && (
            <div className="space-y-6">
              {/* El asistente ordena el trabajo; el panel de abajo sigue siendo
                  el historial de cierres (y el único lugar para reabrir). */}
              <CtpCierreAsistido onIr={(v) => setView(v as CtpView)} cierres={cierres} />
              <CtpCierrePanel estado={cierres} />
            </div>
          )}
          {view === "eudr" && <CtpEudrPanel period={period} />}
          {view === "rentabilidad" && <CtpRentabilidadPanel period={period} />}
          {view === "analisis" && <CtpAnalisis />}
          {view === "ficha" && <CtpFichaEditor />}
        </div>
      </AdminTabBar>

      {showImport && (
        <CtpImportModal
          onClose={() => setShowImport(false)}
          onImported={(reg) => { setIngresosKey((k) => k + 1); setView(reg === "produccion" ? "produccion" : reg === "salida" ? "despacho" : "ingresos"); }}
        />
      )}
    </div>
  );
}
