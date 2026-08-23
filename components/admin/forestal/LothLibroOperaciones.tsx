"use client";

/**
 * LothLibroOperaciones — Módulo admin del Libro de Operaciones de los Títulos
 * Habilitantes (LO-TH, ADR-125). 6 secciones SERFOR como sub-tabs.
 *
 * Solo se renderiza si el tenant tiene `spec:forestal:loth-libro` habilitado
 * (gating sidebar via useEnabledSpecs + endpoints via 403).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  TreePine,
  AlertCircle,
  RefreshCw,
  Boxes,
  FileText,
  ShieldAlert,
  ShieldCheck,
  Ban,
  Printer,
  FileSpreadsheet,
  QrCode,
  Map as MapIcon,
  MapPin,
  Layers,
  Share2,
  Truck,
  TrendingUp,
  Lock,
  Coins,
  Scissors,
  Upload,
  Info,
} from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import LibroChrome, { type LibroAction, type LibroGroup } from "@/components/admin/shared/libro-chrome";
import AdminModal from "@/components/admin/shared/AdminModal";
import { IconAction } from "./ctp-shared";
import { csrfHeaders } from "@/lib/csrf-client";
import { downloadLothExcel, printLothLibro } from "@/lib/forestal/loth-print";
import { printLothInforme } from "@/lib/forestal/loth-informe-print";
import { printTrozaLabels } from "@/lib/forestal/loth-labels";
import {
  LOTH_SECTION_GROUPS,
  PLAZO_REGISTRO_DIAS,
  diasDeRegistro,
  estaFueraDePlazo,
  type LothSection,
  type LothEntryDTO,
} from "@/lib/forestal/loth-constants";
import LothEntryForm, { SECTION_META } from "./LothEntryForm";
import LothCaratulaForm from "./LothCaratulaForm";
import LothTraceView from "./LothTraceView";
import LothPlanView from "./LothPlanView";
import LothGtfView from "./LothGtfView";
import LothAnalyticsView from "./LothAnalyticsView";
import LothCompliancePanel from "./LothCompliancePanel";
import LothResumenStrip from "./LothResumenStrip";
import LothCadenaModal from "./LothCadenaModal";
import LothSeccionTabla, { type ColDef } from "./LothSeccionTabla";
import LothLineaDetalleModal from "./LothLineaDetalleModal";
import LothImportLineasModal from "./LothImportLineasModal";
import LothTrozadoMultipleModal from "./LothTrozadoMultipleModal";
import type { FilaImport } from "@/lib/forestal/loth-import-lineas";
import {
  FILTRO_VACIO,
  filtrarLineas,
  lineasToCsv,
  mapaCorrecciones,
  ordenarLineas,
  periodosDe,
  type FiltroSeccion,
  type OrdenCampo,
  type OrdenDir,
} from "@/lib/forestal/loth-seccion";
import LothCierrePanel from "./LothCierrePanel";
import LothMapaView from "./LothMapaView";
import LothRentabilidadPanel from "./LothRentabilidadPanel";
import type { LothNavTarget } from "@/lib/forestal/loth-compliance";
import { useVistaModulo } from "@/hooks/use-vista-modulo";
import { LOTH_VISTAS } from "@/lib/admin/subvistas-modulos";

type LothEntry = LothEntryDTO;

interface Caratula {
  id: string;
  registroNumber: string | null;
  tomo: string | null;
  titularName: string;
  tituloHabilitante: string | null;
}

interface SectionStat {
  section: LothSection;
  count: number;
  totalVolumeM3: number;
  totalQuantity: number;
}

type Col = ColDef;

const num = (v: string | null, dp = 4) => (v == null ? "—" : Number(v).toFixed(dp));

/** Renglones por página de la tabla de sección. */
const POR_PAGINA = 50;


const COLS: Record<LothSection, Col[]> = {
  tala: [
    { key: "tree", label: "Cód. árbol", orden: "codigo", render: (e) => <Code v={e.treeCode} rama={e.isRama} /> },
    { key: "esp", label: "Especie", orden: "especie", render: (e) => <Species e={e} /> },
    { key: "dM", label: "Ø may", align: "right", render: (e) => <Mono v={num(e.diamMayorM, 2)} /> },
    { key: "dm", label: "Ø men", align: "right", render: (e) => <Mono v={num(e.diamMenorM, 2)} /> },
    { key: "L", label: "Long.", align: "right", render: (e) => <Mono v={num(e.lengthM, 2)} /> },
    { key: "vol", label: "Vol. m³", align: "right", orden: "volumen", render: (e) => <Mono v={num(e.volumeM3)} bold /> },
  ],
  trozado: [
    { key: "troza", label: "Cód. troza", orden: "codigo", render: (e) => <Code v={e.trozaCode} rama={e.isRama} /> },
    { key: "esp", label: "Especie", orden: "especie", render: (e) => <Species e={e} /> },
    { key: "dM", label: "Ø may", align: "right", render: (e) => <Mono v={num(e.diamMayorM, 2)} /> },
    { key: "dm", label: "Ø men", align: "right", render: (e) => <Mono v={num(e.diamMenorM, 2)} /> },
    { key: "L", label: "Long.", align: "right", render: (e) => <Mono v={num(e.lengthM, 2)} /> },
    { key: "vol", label: "Vol. m³", align: "right", orden: "volumen", render: (e) => <Mono v={num(e.volumeM3)} bold /> },
  ],
  despacho_troza: [
    { key: "troza", label: "Cód. troza", orden: "codigo", render: (e) => <Code v={e.trozaCode} /> },
    { key: "desp", label: "Cód. despacho", render: (e) => <span className="text-[var(--text-secondary)]">{e.despachoCode ?? "—"}</span> },
    { key: "gtf", label: "N° GTF", render: (e) => <Mono v={e.gtfNumber ?? "—"} bold /> },
  ],
  consumo_troza: [
    { key: "troza", label: "Cód. troza", orden: "codigo", render: (e) => <Code v={e.trozaCode} /> },
    { key: "esp", label: "Especie", orden: "especie", render: (e) => <Species e={e} /> },
    { key: "vol", label: "Vol. m³", align: "right", orden: "volumen", render: (e) => <Mono v={num(e.volumeM3)} bold /> },
    { key: "ci", label: "", render: (e) => (e.consumoInterno ? <Tag>consumo interno</Tag> : null) },
  ],
  producto_terminado: [
    { key: "prod", label: "Producto", render: (e) => <span className="font-medium text-[var(--text-primary)]">{e.productType ?? "—"}</span> },
    { key: "esp", label: "Especie", orden: "especie", render: (e) => <Species e={e} /> },
    { key: "qty", label: "Cantidad", align: "right", orden: "volumen", render: (e) => <Mono v={num(e.quantity)} bold /> },
    { key: "unit", label: "Unidad", render: (e) => <span className="text-[var(--text-secondary)]">{unitLabel(e.unit)}</span> },
  ],
  despacho_producto: [
    { key: "gtf", label: "N° GTF", render: (e) => <Mono v={e.gtfNumber ?? "—"} bold /> },
    { key: "prod", label: "Producto", render: (e) => <span className="font-medium text-[var(--text-primary)]">{e.productType ?? "—"}</span> },
    { key: "esp", label: "Especie", orden: "especie", render: (e) => <Species e={e} /> },
    { key: "pcs", label: "Piezas", align: "right", render: (e) => <Mono v={e.pieces?.toString() ?? "—"} /> },
    { key: "qty", label: "Cantidad", align: "right", orden: "volumen", render: (e) => <Mono v={num(e.quantity)} bold /> },
    { key: "unit", label: "Unidad", render: (e) => <span className="text-[var(--text-secondary)]">{unitLabel(e.unit)}</span> },
  ],
};

type LothView = "secciones" | "trazabilidad" | "plan" | "gtf" | "analitica" | "cumplimiento" | "cierre" | "mapa" | "rentabilidad";

// Navegación en cabina compartida con el Libro CTP (`libro-chrome`): las nueve
// vistas agrupadas por fase, con los MISMOS nombres de grupo que el otro libro
// — quien sabe moverse en uno se mueve en el otro sin volver a aprender.
const LOTH_MODULE_ID = "loth-libro";
/** label y hint salen de `lib/admin/subvistas-modulos` — la MISMA fuente que
 *  indexa el buscador global. Acá sólo se agrega lo visual (icono) y la tecla. */
const LOTH_VISTAS_POR_KEY = Object.fromEntries(LOTH_VISTAS.map((v) => [v.key, { label: v.label, hint: v.hint }]));

const LOTH_GROUPS: LibroGroup[] = [
  {
    id: "operacion",
    label: "Operación",
    views: [
      { key: "secciones", ...LOTH_VISTAS_POR_KEY["secciones"], icon: Layers },
      { key: "gtf", ...LOTH_VISTAS_POR_KEY["gtf"], icon: Truck },
    ],
  },
  {
    id: "trazabilidad",
    label: "Trazabilidad",
    views: [
      { key: "plan", ...LOTH_VISTAS_POR_KEY["plan"], icon: MapIcon },
      { key: "mapa", ...LOTH_VISTAS_POR_KEY["mapa"], icon: MapPin },
      { key: "trazabilidad", ...LOTH_VISTAS_POR_KEY["trazabilidad"], icon: Share2 },
    ],
  },
  {
    id: "control",
    label: "Control",
    views: [
      { key: "cumplimiento", ...LOTH_VISTAS_POR_KEY["cumplimiento"], icon: ShieldCheck },
      { key: "cierre", ...LOTH_VISTAS_POR_KEY["cierre"], icon: Lock },
    ],
  },
  {
    id: "gestion",
    label: "Gestión",
    views: [
      { key: "rentabilidad", ...LOTH_VISTAS_POR_KEY["rentabilidad"], icon: Coins },
      { key: "analitica", ...LOTH_VISTAS_POR_KEY["analitica"], icon: TrendingUp },
    ],
  },
];

const LOTH_VIEW_KEYS = LOTH_GROUPS.flatMap((g) => g.views.map((v) => v.key));
/** Las mismas claves, tipadas: es lo que valida la vista que pide la URL. */
const LOTH_VIEW_KEYS_TIPADAS = LOTH_VIEW_KEYS as LothView[];

/** Un chip de sub-tab de sección, agrupado bajo su rótulo bosque/transformación. */
function SectionChip({
  meta,
  active,
  count,
  onClick,
}: {
  meta: { index: number; short: string };
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl border-2 px-3.5 py-2 text-sm font-bold transition ${
        active
          ? "border-[var(--data-success-600)] bg-[var(--data-success-500)]/10 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]"
      }`}
    >
      <span className="grid h-5 w-5 place-items-center rounded-md bg-[var(--surface-sunken)] text-[length:var(--ts-2xs)] tabular-nums">
        {meta.index}
      </span>
      {meta.short}
      {count > 0 && (
        <span className="rounded-full bg-[var(--surface-sunken)] px-1.5 text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-tertiary)]">
          {count}
        </span>
      )}
    </button>
  );
}

export default function LothLibroOperaciones() {
  const [section, setSection] = useState<LothSection>("tala");
  const [entries, setEntries] = useState<LothEntry[]>([]);
  const [stats, setStats] = useState<SectionStat[]>([]);
  const [caratula, setCaratula] = useState<Caratula | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showCaratula, setShowCaratula] = useState(false);
  const [annulReason, setAnnulReason] = useState("");
  const [cadenaCode, setCadenaCode] = useState<string | null>(null);
  // Foco que viaja desde la trazabilidad hacia otra vista del libro: al abrir
  // una GTF o un árbol desde «Por árbol», la vista destino tiene que llegar
  // mostrando ESE registro, no su lista entera.
  const [focoGtf, setFocoGtf] = useState<string | null>(null);
  const [focoArbol, setFocoArbol] = useState<string | null>(null);
  // Señal reactiva: se incrementa tras cada escritura (registro/anulación/carátula)
  // para que los paneles con fetch propio (Resumen, Cumplimiento, Rentabilidad)
  // se refresquen solos, sin depender de que el usuario apriete "Recargar".
  const [reloadSignal, setReloadSignal] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  // Misma cabina que el CTP: la vista vive en la URL con memoria de respaldo.
  const { vista: view, irA } = useVistaModulo<LothView>(LOTH_MODULE_ID, LOTH_VIEW_KEYS_TIPADAS, "secciones");
  const setView = irA;
  const [allEntries, setAllEntries] = useState<LothEntry[]>([]);
  /** Página de la sección visible y total real que declara la API. */
  const [page, setPage] = useState(0);
  const [totalSeccion, setTotalSeccion] = useState(0);
  /** Si ni siquiera 40 páginas alcanzaron, hay que decirlo en vez de mentir. */
  const [libroTruncado, setLibroTruncado] = useState<{ leidas: number; total: number } | null>(null);
  const [filtro, setFiltro] = useState<FiltroSeccion>(FILTRO_VACIO);
  const [orden, setOrden] = useState<OrdenCampo>("lineNo");
  const [ordenDir, setOrdenDir] = useState<OrdenDir>("asc");
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [detalle, setDetalle] = useState<LothEntry | null>(null);
  /** Línea de la que parte el formulario: duplicar (sin corrigeLineNo) o corregir. */
  const [plantilla, setPlantilla] = useState<LothEntry | null>(null);
  const [corrigeLineNo, setCorrigeLineNo] = useState<number | null>(null);
  /** Líneas a anular: una desde su fila, o todas las seleccionadas. */
  const [anularLineas, setAnularLineas] = useState<LothEntry[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [showTrozar, setShowTrozar] = useState(false);
  /** Censo del plan activo — alimenta el cuadro "censo vs realidad". */
  const [censoArboles, setCensoArboles] = useState<
    { treeCode: string; speciesCommon: string; dapM: number | null; volumenEstimadoM3: number | null; estado: string }[]
  >([]);
  /**
   * N° de las guías realmente emitidas. Cruzarlas contra las que el libro
   * declara destapa la GTF fantasma: un despacho que nombra una guía que nadie
   * emitió (se hizo fuera del sistema, o el número está mal tipeado).
   */
  const [gtfEmitidas, setGtfEmitidas] = useState<Set<string> | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const [printingLabels, setPrintingLabels] = useState(false);

  /** Etiquetas de las líneas indicadas; sin argumento, las de la sección visible. */
  async function doPrintLabels(lineas?: LothEntry[]) {
    setPrintingLabels(true);
    setError(null);
    try {
      const count = await printTrozaLabels(lineas ?? entries, {
        origin: window.location.origin,
        titular: caratula?.titularName ?? null,
        planNumber: caratula?.tituloHabilitante ?? null,
      });
      if (count === 0) setError("No hay códigos imprimibles en esta sección (usá Trozado o Tala).");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPrintingLabels(false);
    }
  }

  async function doExport(kind: "pdf" | "excel") {
    setExporting(kind);
    setError(null);
    try {
      if (kind === "excel") await downloadLothExcel();
      else await printLothLibro();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(null);
    }
  }

  const [informing, setInforming] = useState(false);
  async function doInforme() {
    setInforming(true);
    setError(null);
    try {
      await printLothInforme();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInforming(false);
    }
  }

  /** Lo que se presenta ante la autoridad, plegado: se usa al cerrar el mes,
   *  no en cada línea que se registra. */
  const acciones: LibroAction[] = useMemo(
    () => [
      {
        id: "pdf",
        label: "PDF formato SERFOR",
        hint: "Carátula + las 6 secciones, para imprimir y firmar",
        icon: Printer,
        tone: "dark",
        busy: exporting === "pdf",
        disabled: exporting !== null,
        onSelect: () => void doExport("pdf"),
      },
      {
        id: "informe",
        label: "Informe ARFFS / OSINFOR",
        hint: "Informe del período para presentar",
        icon: FileText,
        busy: informing,
        disabled: informing,
        onSelect: () => void doInforme(),
      },
      {
        id: "excel",
        label: "Excel (.xlsx) editable",
        hint: "1 hoja por sección + resumen",
        icon: FileSpreadsheet,
        busy: exporting === "excel",
        disabled: exporting !== null,
        onSelect: () => void doExport("excel"),
      },
      {
        id: "caratula",
        label: caratula ? "Editar carátula" : "Configurar carátula",
        hint: "Titular, título habilitante, registro y tomo",
        icon: FileText,
        onSelect: () => setShowCaratula(true),
      },
    ],
    // doExport/doInforme se redefinen por render; lo que cambia el menú es el
    // trabajo en curso y si ya hay carátula.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exporting, informing, caratula],
  );

  // Solo la lista de la sección activa — corre en cada cambio de sección/búsqueda.
  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        section,
        limit: String(POR_PAGINA),
        offset: String(page * POR_PAGINA),
        includeAnnulled: "1",
      });
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/forestal/loth?${params.toString()}`, { credentials: "include" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message ?? d.error ?? `HTTP ${res.status}`);
      }
      // `total` venía en la respuesta y se tiraba: la tabla mostraba 200 líneas
      // y no decía que hubiera más. Un libro de operaciones no puede ocultar
      // renglones en silencio.
      const json = await res.json();
      setEntries(json.entries ?? []);
      setTotalSeccion(Number(json.total ?? 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [section, search, page]);

  // Stats + carátula NO dependen de la sección → solo al montar y tras escrituras.
  const loadMeta = useCallback(async () => {
    try {
      const [statsRes, caratulaRes] = await Promise.all([
        fetch(`/api/admin/forestal/loth?stats=1`, { credentials: "include" }),
        fetch(`/api/admin/forestal/loth/caratula`, { credentials: "include" }),
      ]);
      if (statsRes.ok) setStats((await statsRes.json()).stats ?? []);
      if (caratulaRes.ok) setCaratula((await caratulaRes.json()).active ?? null);
    } catch {
      /* meta es best-effort; no rompe la vista */
    }
  }, []);

  // Todas las secciones juntas — para la vista de trazabilidad.
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // El libro ENTERO, no su primera página: de acá salen la trazabilidad por
      // árbol y el cruce con el censo. Con el `limit=500` de antes, un libro de
      // 600 líneas producía una trazabilidad incompleta sin avisar — y los
      // totales derivados salían mal sin que nada se pusiera en rojo.
      const TOPE_PAGINAS = 40; // 20.000 líneas: red de seguridad, no un límite real
      const acumuladas: LothEntry[] = [];
      let totalLibro = 0;
      for (let p = 0; p < TOPE_PAGINAS; p++) {
        const r = await fetch(`/api/admin/forestal/loth?limit=500&offset=${p * 500}&includeAnnulled=1`, { credentials: "include" });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.message ?? d.error ?? `HTTP ${r.status}`);
        }
        const j = await r.json();
        const lote = (j.entries ?? []) as LothEntry[];
        totalLibro = Number(j.total ?? lote.length);
        acumuladas.push(...lote);
        if (lote.length < 500 || acumuladas.length >= totalLibro) break;
      }
      setAllEntries(acumuladas);
      setLibroTruncado(acumuladas.length < totalLibro ? { leidas: acumuladas.length, total: totalLibro } : null);

      // Las guías emitidas, para poder decir cuáles del libro no existen.
      // Falla blanda: sin la lista, `gtfEmitidas` queda null y la trazabilidad
      // NO acusa a nadie — «no la encontré» y «no la busqué» no son lo mismo.
      fetch("/api/admin/forestal/gtf", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d) return;
          const vivas = ((d.gtfs ?? []) as { gtfNumber: string; status: string }[]).filter((g) => g.status !== "anulada");
          setGtfEmitidas(new Set(vivas.map((g) => g.gtfNumber)));
        })
        .catch((err) => console.warn("[loth] no se pudieron leer las GTF emitidas", err));

      // El censo del plan activo: sin él, la trazabilidad arranca en la tala y
      // el volumen ESTIMADO (el que sustenta la autorización) no se compara.
      const planRes = await fetch("/api/admin/forestal/plan?active=1", { credentials: "include" });
      const planId = planRes.ok ? ((await planRes.json()).active?.id ?? null) : null;
      if (planId) {
        const cRes = await fetch(`/api/admin/forestal/plan/census?planId=${encodeURIComponent(planId)}`, { credentials: "include" });
        if (cRes.ok) {
          const trees = (await cRes.json()).trees ?? [];
          setCensoArboles(
            trees.map((t: { treeCode: string; speciesCommon: string; dapM: string | null; volumenEstimadoM3: string | null; estado: string }) => ({
              treeCode: t.treeCode,
              speciesCommon: t.speciesCommon,
              dapM: t.dapM != null ? Number(t.dapM) : null,
              volumenEstimadoM3: t.volumenEstimadoM3 != null ? Number(t.volumenEstimadoM3) : null,
              estado: t.estado,
            })),
          );
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Recargar manual + tras escrituras: lista + meta (+ trazabilidad).
  const refreshAll = useCallback(async () => {
    setReloadSignal((s) => s + 1); // gatilla el refetch de los paneles con fetch propio
    await Promise.all([loadEntries(), loadMeta(), loadAll()]);
  }, [loadEntries, loadMeta, loadAll]);

  // Cambio de sección/página → solo la lista (1 request).
  useEffect(() => {
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, page]);

  // Otra sección empieza en su primera página: quedarse en la 4 de una lista
  // que ahora tiene 3 renglones muestra el vacío y parece un error.
  useEffect(() => {
    setPage(0);
    setFiltro(FILTRO_VACIO);
  }, [section]);

  // La selección es de las líneas que se están viendo: al pasar de página o de
  // sección, quedaría apuntando a filas que ya no están en pantalla.
  useEffect(() => {
    setSeleccion(new Set());
  }, [section, page]);

  // Montaje → meta una sola vez.
  useEffect(() => {
    loadMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * El libro completo lo necesitan DOS vistas: la trazabilidad por árbol y —desde
   * que la tabla muestra períodos, especies, correcciones y las talas a trozar—
   * también la de secciones. Sin esto, esos controles salían vacíos sin error:
   * la pantalla se veía bien y no tenía datos.
   */
  useEffect(() => {
    if (view === "trazabilidad" || view === "secciones" || view === "cierre" || view === "rentabilidad") loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  /**
   * Asienta N líneas de una. Va de a una porque el backend numera el `lineNo`
   * correlativo por libro; y devuelve cuántas entraron DE VERDAD, no cuántas se
   * mandaron — el importador anterior del CTP decía «60» y habían entrado 9.
   */
  async function crearLineas(payloads: Record<string, unknown>[]): Promise<{ creadas: number; errores: string[] }> {
    let creadas = 0;
    const errores: string[] = [];
    for (const [i, payload] of payloads.entries()) {
      try {
        const res = await fetch("/api/admin/forestal/loth", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({ ...payload, caratulaId: caratula?.id ?? null }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          errores.push(`Fila ${i + 1}: ${d.message ?? d.error ?? `HTTP ${res.status}`}`);
          continue;
        }
        creadas += 1;
      } catch (err) {
        errores.push(`Fila ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await refreshAll();
    return { creadas, errores };
  }

  function descargarCsv(lineas: LothEntry[], nombre: string) {
    const blob = new Blob([String.fromCharCode(0xfeff) + lineasToCsv(lineas)], { type: "text/csv;charset=utf-8" }); // BOM → Excel lee UTF-8
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Anula las líneas elegidas con un mismo motivo (una, o todas las marcadas). */
  async function doAnnul(ids: string[]) {
    setPending(ids[0] ?? "lote");
    setError(null);
    try {
      for (const id of ids) {
        const res = await fetch(`/api/admin/forestal/loth/${id}`, {
          method: "PATCH",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({ action: "annul", reason: annulReason.trim() }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.message ?? d.error ?? `HTTP ${res.status}`);
        }
      }
      setAnularLineas([]);
      setAnnulReason("");
      setSeleccion(new Set());
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(null);
    }
  }

  const statBy = useMemo(() => {
    const map = new Map(stats.map((s) => [s.section, s]));
    return map;
  }, [stats]);

  const cur = statBy.get(section);
  const totalLines = stats.reduce((a, s) => a + s.count, 0);
  // El orden y los filtros se aplican sobre la PÁGINA que trajo la API: filtrar
  // el libro entero en el cliente exigiría bajarlo entero, que es justo lo que
  // la paginación evita. El contador de abajo dice siempre cuántas hay en total.
  const correcciones = useMemo(() => mapaCorrecciones(allEntries), [allEntries]);
  /**
   * Especies del plan activo. Se usan para avisar en la vista previa del
   * importador; si el censo no cargó, queda `undefined` y NO se avisa nada —
   * acusar por falta de datos es peor que no avisar.
   */
  const especiesAutorizadasPlan = useMemo(
    () => (censoArboles.length > 0 ? new Set(censoArboles.map((c) => c.speciesCommon)) : undefined),
    [censoArboles],
  );
  const periodos = useMemo(() => periodosDe(allEntries.filter((e) => e.section === section)), [allEntries, section]);
  const especiesSeccion = useMemo(
    () => Array.from(new Set(allEntries.filter((e) => e.section === section).map((e) => e.speciesCommon).filter((x): x is string => !!x))).sort((a, b) => a.localeCompare(b, "es")),
    [allEntries, section],
  );
  const visibles = useMemo(
    () => ordenarLineas(filtrarLineas(entries, filtro, estaFueraDePlazo, correcciones.corregidaPor), orden, ordenDir),
    [entries, filtro, orden, ordenDir, correcciones],
  );
  const seleccionadas = useMemo(() => visibles.filter((e) => seleccion.has(e.id)), [visibles, seleccion]);

  const toggleOrden = (campo: OrdenCampo) => {
    if (campo === orden) setOrdenDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setOrden(campo);
      setOrdenDir(campo === "lineNo" || campo === "fecha" ? "asc" : "desc");
    }
  };

  const citesCount = entries.filter((e) => e.cites && e.status === "registrado").length;
  const tardiasSeccion = entries.filter((e) => e.status === "registrado" && estaFueraDePlazo(e.entryDate, e.createdAt)).length;
  const cols = COLS[section];
  // Qué métrica tiene sentido en el KPI de cada sección (evita el "0.00" de ruido).
  const usaVolumen = section === "tala" || section === "trozado" || section === "consumo_troza";
  const usaCantidad = section === "producto_terminado" || section === "despacho_producto";

  return (
    <LibroChrome
      moduleId={LOTH_MODULE_ID}
      eyebrow="Forestal · LO-TH SERFOR"
      title="Libro de Operaciones · Títulos Habilitantes"
      icon={TreePine}
      groups={LOTH_GROUPS}
      view={view}
      onView={irA}
      status={
        // La carátula ES la identidad del libro: sin ella, ningún export es
        // presentable. Por eso el chip vive en la cabina y no en un banner.
        <button
          type="button"
          onClick={() => setShowCaratula(true)}
          title={caratula ? "Carátula del libro — titular, título habilitante, registro y tomo" : "El libro necesita carátula para poder presentarse"}
          className={`inline-flex h-10 max-w-[18rem] items-center gap-2 rounded-xl border-2 px-3 text-sm transition-colors ${
            caratula
              ? "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
              : "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] font-bold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]"
          }`}
        >
          <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
          {caratula ? (
            <>
              <span className="truncate font-bold">{caratula.titularName}</span>
              {caratula.tituloHabilitante && (
                <span className="hidden shrink-0 font-mono text-xs text-[var(--text-tertiary)] lg:inline">
                  {caratula.tituloHabilitante}
                </span>
              )}
            </>
          ) : (
            <span>Configurar carátula</span>
          )}
        </button>
      }
      tools={
        <>
          <button
            type="button"
            onClick={refreshAll}
            disabled={loading}
            aria-label="Recargar"
            title="Recargar el libro"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-canvas)] disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark)] px-4 text-sm font-bold text-white shadow-sm transition hover:brightness-110"
          >
            <Plus className="h-4 w-4" />
            Nueva línea
          </button>
        </>
      }
      actions={acciones}
    >

      {/* Vista Plan de Manejo — base maestra (censo + especies autorizadas) */}
      {view === "plan" && <LothPlanView reloadSignal={reloadSignal} />}

      {/* Vista GTF — guías de transporte forestal */}
      {view === "gtf" && <LothGtfView focusGtf={focoGtf} onFocusHandled={() => setFocoGtf(null)} />}

      {/* Vista Analítica — inteligencia de aprovechamiento + anomalías (Batch 2) */}
      {view === "analitica" && <LothAnalyticsView reloadSignal={reloadSignal} />}

      {/* Vista Cumplimiento — veredicto de fiscalización OSINFOR + reporte (ADR-305) */}
      {view === "cumplimiento" && (
        <LothCompliancePanel
          totalLineas={totalLines}
          reloadSignal={reloadSignal}
          onNavigate={(t: LothNavTarget) => {
            if (t === "caratula") setShowCaratula(true);
            else setView(t);
          }}
        />
      )}

      {/* Vista Cierre — cerrar el mes → acta inmutable (invariante P1) */}
      {view === "cierre" && <LothCierrePanel entries={allEntries} caratula={caratula} />}

      {/* Vista Mapa — dónde se taló cada árbol (GPS de campo, EUDR) */}
      {view === "mapa" && <LothMapaView focusTree={focoArbol} onFocusHandled={() => setFocoArbol(null)} />}

      {/* Vista Rentabilidad — margen por especie (dashboard de negocio) */}
      {view === "rentabilidad" && <LothRentabilidadPanel reloadSignal={reloadSignal} entries={allEntries} />}

      {/* Vista de trazabilidad — operación completa por árbol */}
      {view === "trazabilidad" && (
        <>
          {error && (
            <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]">
              <strong>Error:</strong> {error}
            </div>
          )}
          {loading ? (
            <div className="p-8 text-center text-[var(--text-tertiary)]">
              <RefreshCw className="mx-auto h-6 w-6 animate-spin" />
              <p className="mt-2 text-sm">Cargando trazabilidad...</p>
            </div>
          ) : (
            /* El censo entra a la MISMA vista en vez de vivir en un cuadro
               aparte: «Censo vs realidad» era esta misma pregunta contestada
               por segunda vez, con otros decimales. Ahora es el modo Tabla.
               `nav` es lo que saca a la pantalla del callejón sin salida: la
               troza abre su cadena, la GTF su guía y el árbol el mapa. */
            <LothTraceView
              entries={allEntries}
              caratula={caratula}
              censo={censoArboles}
              gtfEmitidas={gtfEmitidas}
              nav={{
                onVerCadena: (code) => setCadenaCode(code),
                onVerGtf: (gtf) => {
                  setFocoGtf(gtf);
                  setView("gtf");
                },
                onVerMapa: (tree) => {
                  setFocoArbol(tree);
                  setView("mapa");
                },
              }}
            />
          )}
        </>
      )}

      {view === "secciones" && (
        <>
      {/* Resumen "de un vistazo" del aprovechamiento (bosque → producto) */}
      <LothResumenStrip onNavigate={(v) => setView(v)} reloadSignal={reloadSignal} />

      {libroTruncado && (
        <div className="rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 px-4 py-3 text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          Se leyeron {libroTruncado.leidas.toLocaleString("es-PE")} de {libroTruncado.total.toLocaleString("es-PE")} líneas del libro. La
          trazabilidad por árbol y el cuadro de censo se calculan sobre lo leído: para un libro de este tamaño, filtrá por período antes
          de sacar conclusiones.
        </div>
      )}

      {/* Sub-tabs de las 6 secciones, agrupadas: bosque (RDE 264-2019 §1-3) vs
          transformación en el propio TH (§4-6) — dos momentos del MISMO libro,
          no dos libros. Ver `LOTH_SECTION_GROUPS` en loth-constants. */}
      <div className="flex flex-col gap-2.5">
        {LOTH_SECTION_GROUPS.map((g) => (
          <div key={g.key}>
            <div className="mb-1.5 flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
              {g.label}
              {g.key === "transformacion" && (
                <span
                  title="Obligatorio en el LO-TH (RDE 264-2019) solo si el titular transforma su propia madera. Si toda la troza sale con GTF a un CTP aparte, estas 3 secciones quedan en cero — es correcto, no falta nada."
                  className="grid h-3.5 w-3.5 cursor-help place-items-center text-[var(--text-tertiary)]"
                >
                  <Info className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {g.sections.map((s) => (
                <SectionChip
                  key={s}
                  meta={SECTION_META[s]}
                  active={s === section}
                  count={statBy.get(s)?.count ?? 0}
                  onClick={() => setSection(s)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* KPIs — adaptados a la sección (evita mostrar métricas que no aplican:
          volumen en tala/trozado/consumo · cantidad en producto/despacho PT). */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard density="compact" label={`Líneas · ${SECTION_META[section].short}`} value={(cur?.count ?? 0).toString()} subValue={`${totalLines} en el libro`} icon={Boxes} emphasis="neutral" />
        {usaVolumen ? (
          <StatCard density="compact" label="Volumen registrado" value={`${(cur?.totalVolumeM3 ?? 0).toFixed(2)} m³`} subValue={SECTION_META[section].short} icon={TreePine} emphasis="success" />
        ) : usaCantidad ? (
          <StatCard density="compact" label="Cantidad registrada" value={(cur?.totalQuantity ?? 0).toFixed(2)} subValue={SECTION_META[section].short} icon={FileText} emphasis="success" />
        ) : (
          <StatCard density="compact" label="Trozas despachadas" value={(cur?.count ?? 0).toString()} subValue="con N° de GTF" icon={Truck} emphasis="success" />
        )}
        {/* El tercer KPI decía «Especies CITES 0» casi siempre: un tercio de la
            fila para un cero. Ahora muestra lo que sí cambia una decisión —el
            registro tardío, que es lo primero que mira una fiscalización— y
            deja el CITES como subtítulo cuando lo hay. */}
        <StatCard
          density="compact"
          label="Fuera de plazo"
          value={tardiasSeccion.toString()}
          subValue={
            tardiasSeccion > 0
              ? `de ${entries.length} en pantalla · plazo ${PLAZO_REGISTRO_DIAS} días`
              : citesCount > 0
                ? `${citesCount} especie(s) CITES en la sección`
                : "todo asentado en plazo"
          }
          icon={tardiasSeccion > 0 ? AlertCircle : citesCount > 0 ? ShieldAlert : ShieldCheck}
          emphasis={tardiasSeccion > 0 ? "warning" : citesCount > 0 ? "error" : "success"}
        />
      </div>

      {/* Búsqueda + etiquetas */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex h-12 flex-1 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4">
          <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadEntries()}
            placeholder="Buscar por código, especie o GTF..."
            className="w-full bg-transparent text-base text-[var(--text-primary)] outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => doPrintLabels()}
          disabled={printingLabels || entries.length === 0}
          title="Imprimir etiquetas con QR de origen para las trozas de esta sección"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50"
        >
          {printingLabels ? <RefreshCw className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
          <span>Etiquetas QR</span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-[var(--data-error-700)]">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="text-sm"><strong>Error:</strong> {error}</div>
          </div>
        </div>
      )}

      {/* Filtros del libro: período (el libro cierra por mes), estado y especie. */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm">
          <span className="text-[var(--text-tertiary)]">Período</span>
          <select
            value={filtro.periodo}
            onChange={(e) => setFiltro((f) => ({ ...f, periodo: e.target.value }))}
            className="bg-transparent font-bold text-[var(--text-primary)] outline-none"
          >
            <option value="">Todos</option>
            {periodos.map((p) => (
              <option key={p.periodo} value={p.periodo}>
                {p.label} ({p.count})
              </option>
            ))}
          </select>
        </label>
        <label className="flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm">
          <span className="text-[var(--text-tertiary)]">Estado</span>
          <select
            value={filtro.estado}
            onChange={(e) => setFiltro((f) => ({ ...f, estado: e.target.value as FiltroSeccion["estado"] }))}
            className="bg-transparent font-bold text-[var(--text-primary)] outline-none"
          >
            <option value="todas">Todas</option>
            <option value="registrado">Registradas</option>
            <option value="fuera_plazo">Fuera de plazo</option>
            <option value="corregidas">Corregidas</option>
            <option value="anulado">Anuladas</option>
          </select>
        </label>
        {especiesSeccion.length > 1 && (
          <label className="flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm">
            <span className="text-[var(--text-tertiary)]">Especie</span>
            <select
              value={filtro.especie}
              onChange={(e) => setFiltro((f) => ({ ...f, especie: e.target.value }))}
              className="max-w-[10rem] bg-transparent font-bold text-[var(--text-primary)] outline-none"
            >
              <option value="">Todas</option>
              {especiesSeccion.map((sp) => (
                <option key={sp} value={sp}>
                  {sp}
                </option>
              ))}
            </select>
          </label>
        )}
        {section === "trozado" && (
          <button
            type="button"
            onClick={() => setShowTrozar(true)}
            title="Registrar todas las trozas de un mismo árbol en una sola pantalla"
            className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
          >
            <Scissors className="h-4 w-4" /> Trozar árbol
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowImport(true)}
          title="Pegar un cuadro de Excel o subir un CSV con muchas líneas"
          className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
        >
          <Upload className="h-4 w-4" /> Importar
        </button>
        <button
          type="button"
          onClick={() => descargarCsv(visibles, `libro-th-${section}.csv`)}
          disabled={visibles.length === 0}
          className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50"
        >
          <FileSpreadsheet className="h-4 w-4" /> CSV
        </button>
      </div>

      {/* Barra de selección — sólo cuando hay algo elegido */}
      {seleccionadas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border-2 border-[var(--data-info-500)] bg-[var(--surface-raised)] px-4 py-2 shadow-[var(--shadow-lg)]">
          <span className="text-sm font-bold text-[var(--text-primary)]">
            {seleccionadas.length} línea{seleccionadas.length === 1 ? "" : "s"} seleccionada{seleccionadas.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={() => doPrintLabels(seleccionadas)}
            disabled={printingLabels}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            <QrCode className="h-4 w-4" /> Etiquetas QR
          </button>
          <button
            type="button"
            onClick={() => descargarCsv(seleccionadas, `libro-th-${section}-seleccion.csv`)}
            className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
          >
            CSV de la selección
          </button>
          <button
            type="button"
            onClick={() => setAnularLineas(seleccionadas.filter((e) => e.status !== "anulado"))}
            disabled={seleccionadas.every((e) => e.status === "anulado")}
            className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-[var(--data-error-500)] px-4 text-sm font-bold text-[var(--data-error-700)] hover:bg-[var(--data-error-500)]/10 disabled:opacity-40 dark:text-[var(--data-error-500)]"
          >
            <Ban className="h-4 w-4" /> Anular
          </button>
          <button
            type="button"
            onClick={() => setSeleccion(new Set())}
            className="ml-auto inline-flex h-10 items-center rounded-xl px-3 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
          >
            Limpiar
          </button>
        </div>
      )}

      <LothSeccionTabla
        section={section}
        entries={visibles}
        cols={cols}
        loading={loading}
        orden={orden}
        dir={ordenDir}
        onOrdenar={toggleOrden}
        seleccion={seleccion}
        onSeleccionar={(id) =>
          setSeleccion((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })
        }
        onSeleccionarTodo={() =>
          setSeleccion((prev) => (visibles.every((e) => prev.has(e.id)) ? new Set() : new Set(visibles.map((e) => e.id))))
        }
        corregidaPor={correcciones.corregidaPor}
        onDetalle={(e) => setDetalle(e)}
        onCadena={(code) => setCadenaCode(code)}
        onDuplicar={(e) => {
          setPlantilla(e);
          setCorrigeLineNo(null);
          setShowForm(true);
        }}
        onCorregir={(e) => {
          setPlantilla(e);
          setCorrigeLineNo(e.lineNo);
          setShowForm(true);
        }}
        onAnular={(e) => setAnularLineas([e])}
      />

      {!loading && visibles.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-12 text-center text-[var(--text-tertiary)]">
          <TreePine className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="text-base font-medium">
            {entries.length === 0
              ? `Sin registros en ${SECTION_META[section].label.toLowerCase()}.`
              : "Ninguna línea coincide con el filtro."}
          </p>
          <p className="mt-1 text-sm">
            {entries.length === 0 ? 'Hacé click en "Nueva línea" para registrar el primer movimiento.' : "Probá con otro período o estado."}
          </p>
        </div>
      )}
      {loading && (
        <div className="rounded-2xl border-2 border-[var(--rule-base)] p-8 text-center text-[var(--text-tertiary)]">
          <RefreshCw className="mx-auto h-6 w-6 animate-spin" />
          <p className="mt-2 text-sm">Cargando registros...</p>
        </div>
      )}

      {/* Cuántas hay de verdad + cómo llegar al resto. Antes se mostraban las
          primeras 200 y el resto no existía para el usuario. */}
      {totalSeccion > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[var(--text-tertiary)]">
            {totalSeccion <= POR_PAGINA
              ? `${totalSeccion} línea${totalSeccion === 1 ? "" : "s"} en ${SECTION_META[section].label.toLowerCase()}`
              : `Mostrando ${page * POR_PAGINA + 1}–${Math.min((page + 1) * POR_PAGINA, totalSeccion)} de ${totalSeccion.toLocaleString("es-PE")}`}
          </p>
          {totalSeccion > POR_PAGINA && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
                className="h-10 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="text-sm font-semibold tabular-nums text-[var(--text-tertiary)]">
                {page + 1} / {Math.ceil(totalSeccion / POR_PAGINA)}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * POR_PAGINA >= totalSeccion || loading}
                className="h-10 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      )}
        </>
      )}

      {showForm && (
        <LothEntryForm
          // `key` fuerza un formulario nuevo por plantilla: sin esto, duplicar
          // una segunda línea reusaría el estado del modal anterior.
          key={`${plantilla?.id ?? "nuevo"}-${corrigeLineNo ?? ""}`}
          section={section}
          caratulaId={caratula?.id ?? null}
          plantilla={plantilla}
          corrigeLineNo={corrigeLineNo}
          onClose={() => {
            setShowForm(false);
            setPlantilla(null);
            setCorrigeLineNo(null);
          }}
          onSaved={(opts) => {
            if (!opts?.keepOpen) {
              setShowForm(false);
              setPlantilla(null);
              setCorrigeLineNo(null);
            }
            refreshAll();
          }}
        />
      )}

      <LothImportLineasModal
        open={showImport}
        section={section}
        especiesAutorizadas={especiesAutorizadasPlan}
        onClose={() => setShowImport(false)}
        onImportar={(filas: FilaImport[]) =>
          crearLineas(
            filas.map((f) => ({
              section,
              entryDate: new Date(f.entryDate ?? new Date().toISOString().slice(0, 10)).toISOString(),
              treeCode: f.treeCode,
              trozaCode: f.trozaCode,
              speciesCommon: f.speciesCommon,
              diamMayorM: f.diamMayorM,
              diamMenorM: f.diamMenorM,
              lengthM: f.lengthM,
              volumeM3: f.volumeM3,
              productType: f.productType,
              quantity: f.quantity,
              unit: f.unit === "m3" || f.unit === "kg" || f.unit === "unidad" ? f.unit : f.quantity != null ? "m3" : null,
              gtfNumber: f.gtfNumber,
              observations: f.observations,
            })),
          )
        }
      />

      <LothTrozadoMultipleModal
        open={showTrozar}
        talas={allEntries.filter((e) => e.section === "tala" && e.status === "registrado" && e.treeCode)}
        onClose={() => setShowTrozar(false)}
        onGuardar={(arbol, trozas) =>
          crearLineas(
            trozas.map((t) => ({
              section: "trozado",
              entryDate: new Date().toISOString(),
              treeCode: arbol.treeCode,
              trozaCode: t.trozaCode,
              speciesCommon: arbol.speciesCommon,
              speciesScientific: arbol.speciesScientific,
              cites: arbol.cites,
              diamMayorM: t.diamMayorM,
              diamMenorM: t.diamMenorM,
              lengthM: t.lengthM,
              volumeM3: t.volumeM3,
              isRama: t.isRama,
            })),
          )
        }
      />

      <LothLineaDetalleModal
        linea={detalle}
        corregidaPorLineNo={detalle ? (correcciones.corregidaPor.get(detalle.lineNo) ?? null) : null}
        onClose={() => setDetalle(null)}
        onVerCadena={(code) => setCadenaCode(code)}
      />

      {/* Anular 1..N con un solo motivo. El libro no borra: la línea queda con
          su razón a la vista (subsanación SERFOR). */}
      <AdminModal
        open={anularLineas.length > 0}
        onClose={() => {
          setAnularLineas([]);
          setAnnulReason("");
        }}
        title={anularLineas.length === 1 ? `Anular la línea N° ${anularLineas[0].lineNo}` : `Anular ${anularLineas.length} líneas`}
        description="No se borran: quedan en el libro con el motivo, como pide SERFOR."
        icon={Ban}
      >
        <div className="space-y-3">
          {anularLineas.length > 1 && (
            <p className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3 text-sm text-[var(--text-secondary)]">
              Líneas N° {anularLineas.map((e) => e.lineNo).join(", ")}. El mismo motivo queda asentado en todas.
            </p>
          )}
          <input
            type="text"
            value={annulReason}
            onChange={(e) => setAnnulReason(e.target.value)}
            placeholder="Motivo de la anulación (mínimo 3 caracteres)"
            autoFocus
            className="h-12 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-base text-[var(--text-primary)] outline-none focus:border-[var(--data-error-500)]"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setAnularLineas([]);
                setAnnulReason("");
              }}
              className="inline-flex h-11 items-center rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={annulReason.trim().length < 3 || pending != null}
              onClick={() => doAnnul(anularLineas.map((e) => e.id))}
              className="inline-flex h-11 items-center rounded-xl bg-[var(--data-error-600)] px-5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              {pending != null ? "Anulando…" : `Anular ${anularLineas.length > 1 ? anularLineas.length : ""}`}
            </button>
          </div>
        </div>
      </AdminModal>
      {showCaratula && (
        <LothCaratulaForm
          current={caratula}
          onClose={() => setShowCaratula(false)}
          onSaved={() => { setShowCaratula(false); refreshAll(); }}
        />
      )}
      {cadenaCode && <LothCadenaModal code={cadenaCode} onClose={() => setCadenaCode(null)} />}
    </LibroChrome>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 font-bold text-[var(--text-primary)] ${className ?? ""}`}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>;
}
function Mono({ v, bold }: { v: string; bold?: boolean }) {
  return <span className={`font-mono tabular-nums text-[var(--text-primary)] ${bold ? "font-bold" : ""}`}>{v}</span>;
}
function Code({ v, rama }: { v: string | null; rama?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono font-bold text-[var(--text-primary)]">{v ?? "—"}</span>
      {rama && <span className="rounded bg-[var(--surface-sunken)] px-1 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">R</span>}
    </span>
  );
}
function Species({ e }: { e: LothEntry }) {
  if (!e.speciesCommon) return <span className="text-[var(--text-tertiary)]">—</span>;
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="font-medium text-[var(--text-primary)]">{e.speciesCommon}</span>
        {e.cites && <span className="rounded bg-[var(--data-error-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">CITES</span>}
      </div>
      {e.speciesScientific && <div className="text-xs italic text-[var(--text-tertiary)]">{e.speciesScientific}</div>}
    </div>
  );
}
function Tag({ children, tone }: { children: React.ReactNode; tone?: "danger" }) {
  const cls = tone === "danger"
    ? "bg-[var(--data-error-100)] text-[var(--data-error-700)]"
    : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]";
  return <span className={`rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide ${cls}`}>{children}</span>;
}
function unitLabel(u: string | null) {
  return u === "m3" ? "m³" : u === "kg" ? "Kg" : u === "unidad" ? "Unidad" : (u ?? "—");
}
function formatDate(iso: string) {
  try {
    // Fecha date-only: se guarda como UTC medianoche → mostrar en UTC para no
    // restar un día por el huso horario (-5 en Perú).
    return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  } catch {
    return iso;
  }
}
