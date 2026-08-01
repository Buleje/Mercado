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
 * 2026-07-26 v5 — cabina (`libro-chrome`): identidad + período + acciones en
 * una fila y las doce vistas agrupadas por fase (Operación → Trazabilidad →
 * Control → Gestión). El cromo pasó de ~370px a ~130px y la nav de doce
 * destinos planos a cuatro grupos de tres.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Building2,
  ClipboardList,
  Coins,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Globe,
  Lock,
  MapPin,
  Flame,
  PackageOpen,
  Scale,
  Search,
  Share2,
  ShieldCheck,
  TreePine,
  TrendingUp,
  Truck,
  Upload,
  Users,
} from "@buleje/design-system/icons";
import LibroChrome, { type LibroAction, type LibroGroup } from "@/components/admin/shared/libro-chrome";
import type { ShortcutSection } from "@/contexts/admin-shortcuts-context";
import { exportarLibroCtp, exportarLibroCtpOficial } from "@/lib/forestal/ctp-export";
import { printInformePeriodo } from "@/lib/forestal/ctp-informe";
import { abrirDossierFiscalizacion } from "@/lib/forestal/ctp-dossier-abrir";
import { resolveCtpPeriod, type CtpPeriodKey } from "@/lib/forestal/ctp-period";
import CtpPeriodPicker, { type CtpCustomRange } from "./CtpPeriodPicker";
import CtpIngresosView from "./CtpIngresosView";
import { CtpEntriesView, CtpSaldosView } from "./CtpSectionViews";
import CtpCompliancePanel from "./CtpCompliancePanel";
import CtpFichaEditor from "./CtpFichaEditor";
import CtpDirectorioView from "./CtpDirectorioView";
import CtpFletesView from "./CtpFletesView";
import CtpGuiasEmitidasView from "./CtpGuiasEmitidasView";
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
import CtpBuscarGtf from "./CtpBuscarGtf";
import CtpEntryDetailModal from "./CtpEntryDetailModal";
import type { WoodEntry } from "./ctp-shared";
import { useCtpPendientes } from "@/hooks/use-ctp-pendientes";
import CtpResumenesSerfor from "./CtpResumenesSerfor";
import CtpConsumosView from "./CtpConsumosView";
import CtpTrozasView from "./CtpTrozasView";
import {
  CTP_INGRESAR_GTF_KEY,
  CTP_MODULE_TAB_ID,
  type CtpFiltroRapido,
  type CtpIngresosFiltroRapido,
} from "./ctp-shared";

type CtpView = "ingresos" | "consumos" | "produccion" | "despacho" | "trozas" | "radar" | "planta" | "saldos" | "resumenes" | "cumplimiento" | "cierre" | "eudr" | "rentabilidad" | "analisis" | "fletes" | "guias" | "directorio" | "ficha";

/**
 * Las doce vistas, agrupadas por la fase del libro a la que sirven. El orden
 * dentro de cada grupo es el del flujo real de la planta; el orden de los
 * grupos es el de un mes de trabajo: se opera, se demuestra de dónde salió,
 * se controla y recién al final se mira el negocio.
 */
const CTP_GROUPS: LibroGroup[] = [
  {
    id: "operacion",
    label: "Operación",
    views: [
      { key: "ingresos", label: "Ingresos", icon: PackageOpen, hint: "Materia prima recibida", tecla: "i" },
      { key: "consumos", label: "Consumos", icon: Flame, hint: "Qué madera entró a la sierra", tecla: "n" },
      { key: "produccion", label: "Producción", icon: Boxes, hint: "Transformación", tecla: "p" },
      { key: "despacho", label: "Despacho", icon: Truck, hint: "Salida de producto", tecla: "d" },
    ],
  },
  {
    id: "trazabilidad",
    label: "Trazabilidad",
    views: [
      { key: "trozas", label: "Trozas", icon: PackageOpen, hint: "Buscar una pieza por su codificación", tecla: "t" },
      { key: "radar", label: "Radar", icon: Share2, hint: "Cadena de custodia visual", tecla: "r" },
      { key: "planta", label: "Planta", icon: MapPin, hint: "Mapa del aserradero", tecla: "m" },
      { key: "eudr", label: "EUDR", icon: Globe, hint: "Geolocalización + dossier UE", tecla: "u" },
      { key: "guias", label: "Guías emitidas", icon: FileText, hint: "Las GTF de salida del CTP y cuáles quedaron a medio llenar", tecla: "e" },
    ],
  },
  {
    id: "control",
    label: "Control",
    views: [
      { key: "saldos", label: "Saldos", icon: Scale, hint: "Balance de planta", tecla: "s" },
      { key: "resumenes", label: "Cuadros SERFOR", icon: ClipboardList, hint: "Los 3 cuadros resumen del formato oficial", tecla: "q" },
      { key: "cumplimiento", label: "Cumplimiento", icon: ShieldCheck, hint: "Alertas del período", tecla: "c" },
      { key: "cierre", label: "Cierre", icon: Lock, hint: "Cerrar mes · bloquear el acta", tecla: "x" },
    ],
  },
  {
    id: "gestion",
    label: "Gestión",
    views: [
      { key: "rentabilidad", label: "Rentabilidad", icon: Coins, hint: "Margen: venta − COGS", tecla: "b" },
      { key: "analisis", label: "Análisis", icon: TrendingUp, hint: "Reorden + tendencias", tecla: "a" },
      { key: "fletes", label: "Fletes", icon: Truck, hint: "Lo que cuesta traer la madera y a quién se le debe", tecla: "j" },
      { key: "directorio", label: "Directorio", icon: Users, hint: "Proveedores, compradores, transportistas y placas", tecla: "g" },
      { key: "ficha", label: "Ficha CTP", icon: Building2, hint: "Identidad legal SERFOR", tecla: "f" },
    ],
  },
];

const CTP_VIEW_KEYS = CTP_GROUPS.flatMap((g) => g.views.map((v) => v.key));
const CTP_MODULE_ID = "ctp-libro";
/** Vistas que YA muestran los pendientes en detalle: la tira arriba sobraría. */
const SIN_TIRA: CtpView[] = ["cumplimiento", "cierre"];
/** Vistas que no leen el período: Análisis (6 meses fijos), Cierre (por mes) y
 *  Ficha (identidad). Con el selector visible parecería que no hace nada. */
const SIN_PERIODO: CtpView[] = ["analisis", "cierre", "ficha", "trozas", "directorio"];

export default function CTPLibroOperaciones() {
  /** Un solo estado de cierres para el asistente y el historial. */
  const cierres = useCtpCierres();
  /** Lo anotado en el patio sin señal, esperando subir al libro. */
  const cola = usePatioCola();
  const [view, setView] = useState<CtpView>(() => {
    if (typeof window === "undefined") return "ingresos";
    const saved = localStorage.getItem(`admin-last-tab-${CTP_MODULE_ID}`);
    return saved && CTP_VIEW_KEYS.includes(saved) ? (saved as CtpView) : "ingresos";
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
  /** Producto elegido en Saldos para despachar (atajo "del stock a la guía"). */
  const [productoADespachar, setProductoADespachar] = useState<{ producto: string; especie: string | null } | null>(null);
  const [periodKey, setPeriodKey] = useState<CtpPeriodKey>("trimestre");
  const [custom, setCustom] = useState<CtpCustomRange>({ from: "", to: "" });
  const [exporting, setExporting] = useState<null | "interno" | "oficial" | "informe" | "dossier">(null);
  const [exportError, setExportError] = useState<string | null>(null);
  // Puente inverso: GTF que el Libro de Títulos Habilitantes mandó a ingresar.
  const [pendingIngresoGtf, setPendingIngresoGtf] = useState<string | null>(null);
  // Importación del LO-CTP (ADR-138) — etapa 1: ingresos.
  const [showImport, setShowImport] = useState(false);
  // Remonta la vista de Ingresos tras importar → re-fetch de la lista.
  const [ingresosKey, setIngresosKey] = useState(0);
  /** Buscador de guías del libro (atajo `b`): "¿qué pasó con esta GTF?". */
  const [buscarGtf, setBuscarGtf] = useState(false);
  /** Ficha abierta desde el buscador, sin salir de la vista donde estabas. */
  const [fichaIngreso, setFichaIngreso] = useState<WoodEntry | null>(null);

  const period = useMemo(() => resolveCtpPeriod(periodKey, custom), [periodKey, custom]);

  /** Qué falta hacer en el libro. Vive en el shell y no en la tira: los avisos
   *  de la cabina y la tira leen la MISMA carga (antes cada uno fetcheaba). */
  const pendientes = useCtpPendientes(period);

  /** Filtro que otra pestaña dejó pedido para Ingresos ("mostrame ESOS 2"). */
  const [filtroIngresos, setFiltroIngresos] = useState<CtpFiltroRapido | null>(null);

  /** Estable: la cabina y los paneles la pasan a efectos (atajos de teclado).
   *  El 2° argumento deja el destino filtrado — hoy sólo Ingresos lo entiende. */
  const irA = useCallback((v: string, filtro?: CtpIngresosFiltroRapido) => {
    setView(v as CtpView);
    // El contador hace que repetir el MISMO salto vuelva a aplicar el filtro.
    if (filtro) setFiltroIngresos((prev) => ({ tipo: filtro, n: (prev?.n ?? 0) + 1 }));
  }, []);

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

  async function exportar(kind: "interno" | "oficial" | "informe" | "dossier") {
    setExporting(kind);
    setExportError(null);
    try {
      if (kind === "informe") await printInformePeriodo(period);
      else if (kind === "oficial") await exportarLibroCtpOficial(period);
      else if (kind === "dossier") await abrirDossierFiscalizacion(period, period.label);
      else await exportarLibroCtp(period);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(null);
    }
  }

  /**
   * `b` abre el buscador de guías desde cualquier vista. Vive en el shell y no
   * en una vista porque la pregunta ("¿qué pasó con esta guía?") no pertenece a
   * ninguna: llega por teléfono mientras mirás cualquier pestaña.
   */
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const t = ev.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (ev.key === "b" || ev.key === "B") {
        ev.preventDefault();
        setBuscarGtf(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Los atajos de la vista activa, para que la hoja (`?`) los liste junto a los
   *  de navegación. Declararlos acá y no en la vista mantiene la hoja completa
   *  aunque la vista todavía no esté montada. */
  const atajosDeVista = useMemo<ShortcutSection[]>(() => {
    const global: ShortcutSection = {
      title: "En todo el Libro CTP",
      items: [{ keys: ["B"], description: "Buscar una guía (de entrada o de salida)" }],
    };
    if (view === "ingresos") {
      return [
        global,
        {
          title: "En Ingresos",
          items: [
            { keys: ["N"], description: "Nuevo ingreso" },
            { keys: ["/"], description: "Ir al buscador" },
            { keys: ["V"], description: "Validar lo marcado" },
            { keys: ["R"], description: "Recargar la lista" },
            { keys: ["Esc"], description: "Limpiar la selección" },
          ],
        },
      ];
    }
    if (view === "produccion" || view === "despacho") {
      return [
        global,
        {
          title: view === "produccion" ? "En Producción" : "En Despacho",
          items: [
            { keys: ["N"], description: view === "produccion" ? "Nueva producción" : "Nuevo despacho" },
            { keys: ["/"], description: "Ir al buscador" },
            { keys: ["R"], description: "Recargar la lista" },
          ],
        },
      ];
    }
    return [global];
  }, [view]);

  /** Un pendiente que se resuelve en una pestaña se anuncia EN esa pestaña:
   *  el número aparece en el grupo y el punto en la vista. Misma fuente que la
   *  tira de abajo — no puede decir "3" arriba y listar dos. */
  const alertasPorVista = useMemo(
    () => pendientes.lista.reduce<Record<string, number>>((acc, p) => {
      acc[p.vista] = (acc[p.vista] ?? 0) + p.cantidad;
      return acc;
    }, {}),
    [pendientes.lista],
  );

  /** Importar/exportar/informar se usan una vez por mes: van plegadas en el
   *  menú, no ocupando dos filas de la cabecera todo el tiempo. */
  const acciones: LibroAction[] = useMemo(
    () => [
      {
        id: "dossier",
        label: "Carpeta de fiscalización",
        hint: "Todo el período en un documento: portada, índice, los 3 registros, existencias, guías y anexos",
        icon: FolderOpen,
        tone: "dark",
        busy: exporting === "dossier",
        disabled: exporting !== null,
        onSelect: () => void exportar("dossier"),
      },
      {
        id: "oficial",
        label: "Formato oficial SERFOR",
        hint: "LO-CTP (RDE D000025-2023): portada + las 4 secciones con su numeración + existencias",
        icon: ShieldCheck,
        tone: "dark",
        busy: exporting === "oficial",
        disabled: exporting !== null,
        onSelect: () => void exportar("oficial"),
      },
      {
        id: "informe",
        label: "Informe ARFFS",
        hint: "Imprimible para presentar: ficha + movimientos + existencias + cumplimiento",
        icon: FileText,
        busy: exporting === "informe",
        disabled: exporting !== null,
        onSelect: () => void exportar("informe"),
      },
      {
        id: "interno",
        label: "Exportar libro (Excel)",
        hint: "Ingresos, Producción, Despacho y Saldos del período — vista interna",
        icon: FileSpreadsheet,
        busy: exporting === "interno",
        disabled: exporting !== null,
        onSelect: () => void exportar("interno"),
      },
      {
        id: "importar",
        label: "Importar libro",
        hint: "Desde el Excel oficial LO-CTP — etapa 1: ingresos",
        icon: Upload,
        onSelect: () => setShowImport(true),
      },
    ],
    // `exportar` se redefine en cada render (usa `period`): la lista depende del
    // período y del export en curso, que es lo que realmente cambia el menú.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exporting, period],
  );

  return (
    <>
      <LibroChrome
        moduleId={CTP_MODULE_ID}
        eyebrow="Forestal · LO-CTP SERFOR"
        title="Libro de Operaciones CTP"
        icon={TreePine}
        groups={CTP_GROUPS}
        view={view}
        onView={irA}
        alerts={alertasPorVista}
        status={
          view !== "cumplimiento" ? (
            <CtpHealthChip period={period} onNavigate={() => setView("cumplimiento")} />
          ) : undefined
        }
        context={
          // El período no aplica a Análisis (tendencia fija de 6 meses), Cierre
          // (por mes) ni Ficha (identidad): mostrarlo ahí hacía parecer que "el
          // selector no hace nada".
          SIN_PERIODO.includes(view) ? undefined : (
            <CtpPeriodPicker
              periodKey={periodKey}
              custom={custom}
              period={period}
              onKeyChange={setPeriodKey}
              onCustomChange={setCustom}
            />
          )
        }
        tools={
          <>
            <button
              type="button"
              onClick={() => setBuscarGtf(true)}
              title="Buscar una guía en el libro (atajo: B)"
              aria-label="Buscar una guía en el libro"
              className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-canvas)]"
            >
              <Search className="h-4 w-4" />
              <span className="max-lg:sr-only">Buscar guía</span>
            </button>
            <CtpAsistente />
          </>
        }
        actions={acciones}
        atajosDeVista={atajosDeVista}
      >
        {exportError && (
          <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
            <strong>No se pudo exportar:</strong> {exportError}
          </div>
        )}

        {/* Lo anotado sin señal y lo que falta hacer: semáforo de camino, no
            contenido — una tira de chips arriba de la vista. */}
        <CtpPatioBandeja cola={cola} />
        {!SIN_TIRA.includes(view) && <CtpPendientes estado={pendientes} onIr={irA} />}

        {view === "ingresos" && (
          <CtpIngresosView
            key={ingresosKey}
            period={period}
            openGtf={pendingIngresoGtf}
            onOpenConsumed={() => setPendingIngresoGtf(null)}
            filtroRapido={filtroIngresos}
          />
        )}
        {view === "consumos" && <CtpConsumosView period={period} />}
        {view === "produccion" && <CtpEntriesView key={`prod-${ingresosKey}`} section="produccion" period={period} />}
        {view === "despacho" && (
          <CtpEntriesView
            key={`desp-${ingresosKey}`}
            section="despacho"
            period={period}
            presetProducto={productoADespachar?.producto ?? null}
            presetEspecie={productoADespachar?.especie ?? null}
            onPresetUsado={() => setProductoADespachar(null)}
          />
        )}
        {view === "radar" && <CtpTrazaRadar period={period} />}
        {view === "planta" && <CtpPlantaView period={period} />}
        {view === "saldos" && (
          <CtpSaldosView
            period={period}
            onDespachar={(producto, especie) => {
              // Del stock a la guía: se elige el producto en Saldos y el
              // despacho se abre con él, sin volver a buscarlo en el catálogo.
              setProductoADespachar({ producto, especie });
              setView("despacho");
            }}
          />
        )}
        {view === "trozas" && <CtpTrozasView />}
        {view === "resumenes" && <CtpResumenesSerfor period={period} />}
        {view === "cumplimiento" && <CtpCompliancePanel period={period} onNavigate={irA} />}
        {view === "cierre" && (
          <div className="space-y-6">
            {/* El asistente ordena el trabajo; el panel de abajo sigue siendo
                el historial de cierres (y el único lugar para reabrir). */}
            <CtpCierreAsistido onIr={irA} cierres={cierres} />
            <CtpCierrePanel estado={cierres} />
          </div>
        )}
        {view === "eudr" && <CtpEudrPanel period={period} onNavigate={irA} />}
        {view === "rentabilidad" && <CtpRentabilidadPanel period={period} />}
        {view === "analisis" && <CtpAnalisis />}
        {view === "guias" && <CtpGuiasEmitidasView period={period} onAbrirDespacho={() => setView("despacho")} />}
        {view === "fletes" && <CtpFletesView period={period} />}
        {view === "directorio" && <CtpDirectorioView />}
        {view === "ficha" && <CtpFichaEditor />}
      </LibroChrome>

      {buscarGtf && (
        <CtpBuscarGtf
          period={period}
          onCerrar={() => setBuscarGtf(false)}
          onVerIngreso={setFichaIngreso}
          onIrA={irA}
        />
      )}
      {fichaIngreso && <CtpEntryDetailModal entry={fichaIngreso} onClose={() => setFichaIngreso(null)} />}

      {showImport && (
        <CtpImportModal
          onClose={() => setShowImport(false)}
          onImported={(reg) => { setIngresosKey((k) => k + 1); setView(reg === "produccion" ? "produccion" : reg === "salida" ? "despacho" : "ingresos"); }}
        />
      )}
    </>
  );
}
