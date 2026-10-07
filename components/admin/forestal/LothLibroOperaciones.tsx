"use client";

/**
 * LothLibroOperaciones — Módulo admin del Libro de Operaciones de los Títulos
 * Habilitantes (LO-TH, ADR-125). 6 secciones SERFOR como sub-tabs.
 *
 * Solo se renderiza si el tenant tiene `spec:forestal:loth-libro` habilitado
 * (gating sidebar via useEnabledSpecs + endpoints via 403).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Axe,
  TreePine,
  AlertCircle,
  RefreshCw,
  FileText,
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
  Lock,
  Coins,
  Scissors,
  Upload,
  LayoutGrid,
  FileDown,
  Trash2,
} from "@buleje/design-system/icons";
import LibroChrome, { type LibroAction, type LibroGroup } from "@/components/admin/shared/libro-chrome";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import LothPermisoChip, { useContratoDelPlan } from "./LothPermisoChip";
import { downloadLothExcel, printLothLibro } from "@/lib/forestal/loth-print";
import { printLothInforme } from "@/lib/forestal/loth-informe-print";
import { printTrozaLabels } from "@/lib/forestal/loth-labels";
import { imprimirEtiquetasTrozasLoth } from "@/lib/forestal/loth-troza-etiquetas";
import {
  LOTH_SECTIONS,
  type LothSection,
  type LothEntryDTO,
} from "@/lib/forestal/loth-constants";
import { toast } from "sonner";
import LothEntryForm, { SECTION_META } from "./LothEntryForm";
import { olvidarCensoDeTala } from "./hooks/use-censo-de-tala";
import LothCaratulaForm from "./LothCaratulaForm";
import LothTraceView from "./LothTraceView";
import LothCensoAltaDesdeTrace from "./LothCensoAltaDesdeTrace";
import LothCupoEnPie from "./LothCupoEnPie";
import { talasDelPlan } from "@/lib/forestal/loth-cupo-vista";
import { cupoPorEspecie, type EspecieAutorizadaCupo } from "@/lib/forestal/loth-cupo-especie";
import LothTableroTrozas from "./LothTableroTrozas";
import LothControlPermisoEncabezado, { accionInformeDelControl } from "./LothControlPermisoEncabezado";
import { planFichaDesdeApi, type CaratulaFicha, type PlanFichaApi } from "@/lib/forestal/loth-ficha-permiso";
import LothPlanView from "./LothPlanView";
import LothGtfView from "./LothGtfView";
import LothCompliancePanel from "./LothCompliancePanel";
import LothResumenStrip from "./LothResumenStrip";
import LothSeccionesRiel from "./LothSeccionesRiel";
import LothSeccionKpis from "./LothSeccionKpis";
import LothSeccionBarra from "./LothSeccionBarra";
import { GtfConCtp, GtfCtpContext } from "./LothGtfCtp";
import { useGtfEnCtp } from "./hooks/use-gtf-en-ctp";
import { CTP_MODULE_TAB_ID } from "./ctp-shared";
import { useEnabledSpecs } from "@/hooks/use-enabled-specs";
import LothCadenaModal from "./LothCadenaModal";
import LothSeccionTabla, { type ColDef } from "./LothSeccionTabla";
import LothLineaDetalleModal from "./LothLineaDetalleModal";
import LothImportLineasModal from "./LothImportLineasModal";
import { reetiquetarErroresImport } from "@/lib/forestal/loth-import-plan";
import LothTrozadoMultipleModal from "./LothTrozadoMultipleModal";
import LothEtiquetasRecienTrozadas from "./LothEtiquetasRecienTrozadas";
import LothTalaTandaModal from "./LothTalaTandaModal";
import type { TandaTalaInicial } from "./hooks/use-tala-en-tanda";
import LothDespachoGuiaModal from "./LothDespachoGuiaModal";
import { mensajeErrorFilaImport, type FilaImport } from "@/lib/forestal/loth-import-lineas";
import { lineasToCsv, mapaCorrecciones, type OrdenCampo, type OrdenDir } from "@/lib/forestal/loth-seccion";
import { LINEAS_POR_PAGINA, useLothSeccionTabla } from "./hooks/use-loth-seccion-tabla";
import { BarraFiltrosTabla } from "./filtros-tabla-forestal";
import { etiquetaUnidad as unitLabel } from "./loth-seccion-filtros";
import LothSeccionPaginas from "./LothSeccionPaginas";
import LothCierrePanel from "./LothCierrePanel";
import LothMapaView from "./LothMapaView";
import LothRentabilidadView from "./LothRentabilidadView";
import type { LothNavTarget } from "@/lib/forestal/loth-compliance";
import { useVistaModulo } from "@/hooks/use-vista-modulo";
import { LOTH_VISTAS } from "@/lib/admin/subvistas-modulos";
import { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { formatNumber } from "@/lib/format";
import { cumplePermiso, PERMISO_SIN_PLAN } from "@/lib/forestal/loth-filtro-permiso";
import { LothPermisoContext, useLothLibroPermiso } from "./hooks/use-loth-libro-permiso";
import LothAtarSinPlan from "./LothAtarSinPlan";
import LothBorrarLineasModal from "./LothBorrarLineasModal";
import { conColumnaPermiso, mapaDePermisos, mezclaPlanes, opcionBorrarFiltradas } from "./loth-seccion-permiso";
import { useMiRol } from "@/hooks/use-mi-rol";
import { CLAVE_PLAN_TABLERO } from "./hooks/use-loth-tablero-permiso";

type LothEntry = LothEntryDTO;

/** `?arbol=113`: el mapa llega parado en ese árbol. Lo escribe `urlDelArbolEnElMapa` (tarjeta-troza). */
const PARAM_ARBOL = "arbol";

/**
 * La carátula tal como la devuelve `/loth/caratula` (fila completa). Además de
 * los cinco campos de siempre, la ficha del permiso lee RUC, representante,
 * documento de gestión y resolución — antes se tiraban al guardar el estado.
 */
interface Caratula extends CaratulaFicha {
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
const POR_PAGINA = LINEAS_POR_PAGINA;


const COLS: Record<LothSection, Col[]> = {
  tala: [
    { key: "tree", label: "Cód. árbol", orden: "codigo", render: (e) => <Code v={e.treeCode} rama={e.isRama} marcado={estadoMarcadoDe(e)} /> },
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
    // La guía es el puente al Libro CTP: la celda dice si ya entró a la planta.
    { key: "gtf", label: "N° GTF", render: (e) => <GtfConCtp gtf={e.gtfNumber} /> },
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

type LothView = "secciones" | "trazabilidad" | "tablero" | "plan" | "gtf" | "extraccion" | "cumplimiento" | "cierre" | "mapa" | "rentabilidad";

/** «Analítica» y «Rentabilidad» se fusionaron en «Rentabilidad y rendimiento» (2026-09-29):
 *  un `?vista=analitica` guardado, o un botón que aún la nombra, llegan a la nueva. */
const LOTH_VISTAS_FUSIONADAS = { analitica: "rentabilidad" } as const satisfies Record<string, LothView>;

/* «Importar guías despachadas» (ADR-461): se usa de vez en cuando, se baja al abrirlo. */
const LothImportarGuiasModal = dynamic(() => import("./LothImportarGuiasModal"), { ssr: false });

/* «Extracción» (ADR-454) trae recharts: se baja sólo al abrir la vista. */
const LothExtraccionView = dynamic(() => import("./LothExtraccionView"), {
  ssr: false,
  loading: () => <p className="p-6 text-sm text-[var(--text-tertiary)]">Abriendo la extracción…</p>,
});

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
      { key: "tablero", ...LOTH_VISTAS_POR_KEY["tablero"], icon: LayoutGrid },
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
      { key: "extraccion", ...LOTH_VISTAS_POR_KEY["extraccion"], icon: Axe },
      { key: "rentabilidad", ...LOTH_VISTAS_POR_KEY["rentabilidad"], icon: Coins },
    ],
  },
];

const LOTH_VIEW_KEYS = LOTH_GROUPS.flatMap((g) => g.views.map((v) => v.key));
/** Las mismas claves, tipadas: es lo que valida la vista que pide la URL. */
const LOTH_VIEW_KEYS_TIPADAS = LOTH_VIEW_KEYS as LothView[];

export default function LothLibroOperaciones() {
  const [section, setSection] = useState<LothSection>("tala");
  const [entries, setEntries] = useState<LothEntry[]>([]);
  const [stats, setStats] = useState<SectionStat[]>([]);
  const [caratula, setCaratula] = useState<Caratula | null>(null);
  /** ¿Asierra dentro del TH? Decide si se ven las secciones 4-6 (ForestLothTransformacionDB). */
  const [transformaEnElTh, setTransformaEnElTh] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
  const { vista: view, irA } = useVistaModulo<LothView>(LOTH_MODULE_ID, LOTH_VIEW_KEYS_TIPADAS, "secciones", undefined, { alias: LOTH_VISTAS_FUSIONADAS });
  const setView = irA;
  /* EL permiso del libro (02-10-2026): lo elige el chip de la banda (o «Ver
     libro de» en Secciones, que es el MISMO estado) y lo leen todas las vistas
     por `LothPermisoContext`: tabla, contadores, Excel, impreso, plan de manejo,
     mapa, trazabilidad y los formularios de alta. `recargaPermiso` relee la
     lista cuando se elige un plan recién creado que todavía no está en ella. */
  const [recargaPermiso, setRecargaPermiso] = useState(0);
  const permiso = useLothLibroPermiso(reloadSignal + recargaPermiso);
  const qPermiso = permiso.query;
  /** Los contadores del permiso elegido; `null` = «Todos» (se usan los del libro). */
  const [statsPermiso, setStatsPermiso] = useState<{ q: string; stats: SectionStat[] } | null>(null);
  /** Sólo vale la ÚLTIMA lista pedida: cambiar de permiso rápido no deja la vieja pisando a la nueva. */
  const pedidoLista = useRef(0);
  const [allEntries, setAllEntries] = useState<LothEntry[]>([]);
  /** Total real de la sección que declara la API (la primera vista, antes de leer el libro entero). */
  const [totalSeccion, setTotalSeccion] = useState(0);
  /** Si ni siquiera 40 páginas alcanzaron, hay que decirlo en vez de mentir. */
  const [libroTruncado, setLibroTruncado] = useState<{ leidas: number; total: number } | null>(null);
  const [orden, setOrden] = useState<OrdenCampo>("lineNo");
  const [ordenDir, setOrdenDir] = useState<OrdenDir>("asc");
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [detalle, setDetalle] = useState<LothEntry | null>(null);
  /** Línea de la que parte el formulario: duplicar (sin corrigeLineNo) o corregir. */
  const [plantilla, setPlantilla] = useState<LothEntry | null>(null);
  const [corrigeLineNo, setCorrigeLineNo] = useState<number | null>(null);
  /** Árbol con el que arranca el formulario: `?nuevaTala=` o «Trozarlo ahora». */
  const [arbolInicial, setArbolInicial] = useState<string | null>(null);
  /** Líneas a anular: una desde su fila, o todas las seleccionadas. */
  const [anularLineas, setAnularLineas] = useState<LothEntry[]>([]);
  /** «Borrar…» de Secciones (Brandon 07-10): las marcadas o las filtradas. */
  const [borrarLineas, setBorrarLineas] = useState<{ ids: string[]; titulo: string } | null>(null);
  const rol = useMiRol();
  /* Los mismos roles que acepta el servidor (`requireAdmin(["admin","owner"])`). */
  const puedeBorrar = rol === "admin" || rol === "owner";
  const [showImport, setShowImport] = useState(false);
  /** «Importar guías despachadas» (ADR-461): guías ya salidas → trozas, tala referencial y permiso. */
  const [showImportarGuias, setShowImportarGuias] = useState(false);
  const [showTrozar, setShowTrozar] = useState(false);
  /** «Talar varios árboles»: lo marcado en «Ver censo», en una planilla (28-09). */
  const [tandaTala, setTandaTala] = useState<TandaTalaInicial | null>(null);
  /** «Trozar estos árboles» después de la tanda: el trozado ofrece sólo ésos. */
  const [trozarSolo, setTrozarSolo] = useState<readonly string[] | null>(null);
  /**
   * Trozas asentadas y sin imprimir todavía (28-09): al guardar un trozado —de
   * a uno, "Guardar y otro" del mismo árbol, o el múltiple de una sola
   * pantalla, venga de "Trozar un árbol" o de "Trozar estos árboles" después
   * de la tala en tanda— la vista ofrece imprimir sus etiquetas sin volver a
   * la tabla a marcarlas. `trozasEnSesionForm` acumula lo guardado mientras el
   * formulario de a una sigue abierto ("Guardar y otro"); se vuelca acá recién
   * cuando la sesión termina (Guardar final o Cerrar).
   */
  const [trozasParaImprimir, setTrozasParaImprimir] = useState<LothEntry[]>([]);
  const [trozasEnSesionForm, setTrozasEnSesionForm] = useState<LothEntry[]>([]);
  /** «Despachar con guía»: la GTF completa y sus líneas de despacho en un registro. */
  const [showDespachoGuia, setShowDespachoGuia] = useState(false);
  /** Trozas que llegan elegidas a la guía desde el Control del permiso (ADR-459). */
  const [despachoElegidas, setDespachoElegidas] = useState<string[] | null>(null);
  /** Censo del permiso elegido (o del plan activo con «Todos») — alimenta el cuadro "censo vs realidad". */
  const [censoArboles, setCensoArboles] = useState<
    { treeCode: string; speciesCommon: string; dapM: number | null; volumenEstimadoM3: number | null; estado: string }[]
  >([]);
  /** N° del plan activo — va en la etiqueta de la troza (28-09). */
  /** Especies autorizadas (volumen y árboles) del plan que se mide: el cupo de cada una. De qué plan son, para no mostrar las de otro mientras llegan. */
  const [especiesDe, setEspeciesDe] = useState<{ planId: string; especies: EspecieAutorizadaCupo[] } | null>(null);
  const [planIdActivo, setPlanIdActivo] = useState<string | null>(null);
  const [planNumeroActivo, setPlanNumeroActivo] = useState<string | null>(null);
  /** El plan activo COMPLETO (vigencia, parcela, estado): lo lee la ficha del permiso. */
  const [planActivo, setPlanActivo] = useState<PlanFichaApi | null>(null);
  /** «Agregar al censo» desde «Qué falta hacer»: la tala cuyo árbol el censo no declara. */
  const [altaCenso, setAltaCenso] = useState<{ treeCode: string; speciesCommon: string } | null>(null);
  /**
   * N° de las guías realmente emitidas. Cruzarlas contra las que el libro
   * declara destapa la GTF fantasma: un despacho que nombra una guía que nadie
   * emitió (se hizo fuera del sistema, o el número está mal tipeado).
   */
  const [gtfEmitidas, setGtfEmitidas] = useState<Set<string> | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);

  /**
   * Enlace directo desde otras pantallas (el mapa del censo, la ficha de un
   * árbol): `?seccion=tala&nuevaTala=<código>` abre la tala con ese árbol ya
   * elegido. Los dos parámetros se borran ANTES de abrir: si no, cerrar el
   * modal y recargar lo volvía a abrir.
   *
   * También en caliente (`popstate`): el mapa del censo vive DENTRO del libro
   * y, para no recargar el panel, escribe la URL y avisa con un `popstate`
   * (`irARegistrarTala`); si el parámetro sigue ahí a los 400 ms, recarga.
   */
  useEffect(() => {
    const leer = () => {
      const params = new URLSearchParams(window.location.search);
      const seccion = params.get("seccion");
      const nueva = params.get("nuevaTala")?.trim() ?? "";
      /* ADR-450: «Ver en el mapa del bosque» desde la ficha de una troza del CTP
         (`?vista=mapa&arbol=113`): el mapa llega parado en ese árbol. La vista
         la lee `useVistaModulo`; acá sólo el foco, que antes era estado interno. */
      const arbol = params.get(PARAM_ARBOL)?.trim() ?? "";
      if (!seccion && !nueva && !arbol) return;
      params.delete("seccion");
      params.delete("nuevaTala");
      params.delete(PARAM_ARBOL);
      const qs = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
      if (seccion && (LOTH_SECTIONS as readonly string[]).includes(seccion)) setSection(seccion as LothSection);
      if (arbol) setFocoArbol(arbol);
      if (nueva) {
        setSection("tala");
        setPlantilla(null);
        setCorrigeLineNo(null);
        setArbolInicial(nueva);
        setShowForm(true);
      }
    };
    leer();
    window.addEventListener("popstate", leer);
    return () => window.removeEventListener("popstate", leer);
  }, []);

  /**
   * Cierra la sesión de trozado del formulario de a una: lo acumulado en
   * `trozasEnSesionForm` (por "Guardar y otro") más, si llega, la última
   * línea guardada, pasa al aviso persistente y la sesión se vacía. Se llama
   * tanto al Guardar final como al Cerrar a medio llenar — lo ya asentado no
   * deja de necesitar su etiqueta porque la persona no siguió cargando.
   */
  function flushSesionTrozado(ultimaEntrada?: LothEntry | null) {
    const todas = ultimaEntrada ? [...trozasEnSesionForm, ultimaEntrada] : trozasEnSesionForm;
    if (todas.length > 0) setTrozasParaImprimir((prev) => [...prev, ...todas]);
    setTrozasEnSesionForm([]);
  }

  /** «Talar y trozar»: después de la tala, el trozado de ese mismo árbol. */
  function abrirTrozado(treeCode: string) {
    setSection("trozado");
    setPlantilla(null);
    setCorrigeLineNo(null);
    setArbolInicial(treeCode);
    setShowForm(true);
  }
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
      if (count === 0) setError("No hay códigos imprimibles en esta sección: las etiquetas salen de Tala y Trozado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPrintingLabels(false);
    }
  }

  const [printingLabelsCtp, setPrintingLabelsCtp] = useState(false);

  /**
   * «Imprimir etiquetas» de Trozado (28-09): la ficha en el QR usa el MISMO
   * formato que ya lee la recepción del Libro CTP (ADR-436) — así una troza
   * que sale del TH y entra al CTP se reconoce con la misma pistola. La
   * ventana se abre YA, en el clic: después de un `await` el navegador la
   * bloquea como pop-up (mismo gotcha que las etiquetas del CTP).
   */
  async function doPrintLabelsCtp(lineas: LothEntry[], ventana: Window | null) {
    if (!ventana) {
      setError("El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para este sitio.");
      return;
    }
    setPrintingLabelsCtp(true);
    setError(null);
    try {
      const count = await imprimirEtiquetasTrozasLoth(lineas, {
        origin: window.location.origin,
        tituloHabilitante: caratula?.tituloHabilitante ?? null,
        planNumber: permiso.plan?.planNumber ?? planNumeroActivo,
        ventana,
      });
      if (count === 0) {
        setError("Ninguna de estas líneas tiene código de troza o de árbol todavía.");
        ventana.close();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      try { ventana.close(); } catch { /* ya cerrada */ }
    } finally {
      setPrintingLabelsCtp(false);
    }
  }

  /** Abre la ventana en el clic (sincrónico) y recién ahí arma la hoja. */
  function alImprimirEtiquetasCtp(lineas: LothEntry[]) {
    const ventana = window.open("", "_blank", "width=980,height=760");
    ventana?.document.write(
      '<!doctype html><meta charset="utf-8"><title>Generando etiquetas…</title><p style="font:16px system-ui;padding:24px">Generando etiquetas…</p>',
    );
    void doPrintLabelsCtp(lineas, ventana);
  }

  /* El PDF y el Excel salen del permiso elegido desde CUALQUIER vista: el
     selector ahora vive en la banda (02-10-2026) y se ve en todas. */
  const permisoExport = permiso.filtro;
  const planExport = permiso.plan;
  const rotuloPermiso = !permisoExport
    ? ""
    : permisoExport.tipo === "sin-plan"
      ? "las líneas sin plan"
      : `el permiso ${planExport?.planNumber ?? planExport?.alias ?? "elegido"}`;
  /* Estable por permiso: el menú de abajo lo guarda en un `useMemo`, y una
     versión vieja exportaría el permiso elegido antes. */
  const doExport = useCallback(
    async (kind: "pdf" | "excel") => {
      setExporting(kind);
      setError(null);
      try {
        if (kind === "excel") await downloadLothExcel({ permiso: permisoExport });
        else await printLothLibro({ permiso: permisoExport, plan: planExport });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setExporting(null);
      }
    },
    [permisoExport, planExport],
  );

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
        hint: permisoExport
          ? `Sólo ${rotuloPermiso}: carátula + las 6 secciones, para imprimir y firmar`
          : "Carátula + las 6 secciones, para imprimir y firmar",
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
        hint: permisoExport ? `Sólo ${rotuloPermiso}: 1 hoja por sección + resumen` : "1 hoja por sección + resumen",
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
    // doInforme se redefine por render; lo que cambia el menú es el trabajo en
    // curso, si ya hay carátula y de qué permiso sale el libro (`doExport`).
    [exporting, informing, caratula, doExport, permisoExport, rotuloPermiso],
  );

  /* La PRIMERA página de la sección: se pinta mientras llega el libro entero
     (`loadAll`), que es de donde la tabla filtra, ordena y pagina. */
  const loadEntries = useCallback(async () => {
    // Sin saber todavía qué permiso vale, pedir «Todos» sería mostrar otro libro un instante.
    if (!permiso.listo) return;
    const pedido = ++pedidoLista.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        section,
        limit: String(POR_PAGINA),
        offset: "0",
        includeAnnulled: "1",
      });
      // El servidor filtra de verdad (antes ignoraba `planId` y devolvía todo el negocio).
      new URLSearchParams(qPermiso).forEach((v, k) => params.set(k, v));
      const res = await fetch(`/api/admin/forestal/loth?${params.toString()}`, { credentials: "include" });
      if (pedido !== pedidoLista.current) return;
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message ?? d.error ?? `HTTP ${res.status}`);
      }
      // `total` venía en la respuesta y se tiraba: la tabla mostraba 200 líneas
      // y no decía que hubiera más. Un libro de operaciones no puede ocultar
      // renglones en silencio.
      const json = await res.json();
      if (pedido !== pedidoLista.current) return;
      setEntries(json.entries ?? []);
      setTotalSeccion(Number(json.total ?? 0));
    } catch (err) {
      if (pedido === pedidoLista.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (pedido === pedidoLista.current) setLoading(false);
    }
  }, [section, qPermiso, permiso.listo]);

  // Stats + carátula NO dependen de la sección → solo al montar y tras escrituras.
  const loadMeta = useCallback(async () => {
    try {
      const [statsRes, caratulaRes] = await Promise.all([
        fetch(`/api/admin/forestal/loth?stats=1`, { credentials: "include" }),
        fetch(`/api/admin/forestal/loth/caratula`, { credentials: "include" }),
      ]);
      if (statsRes.ok) {
        const j = await statsRes.json();
        setStats(j.stats ?? []);
      }
      if (caratulaRes.ok) {
        const json = await caratulaRes.json();
        setCaratula(json.active ?? null);
        setTransformaEnElTh(typeof json.transformaEnElTh === "boolean" ? json.transformaEnElTh : null);
      }
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

      // El N° del plan activo, para la etiqueta de la troza cuando el libro se
      // mira con «Todos». El censo de la trazabilidad va aparte: depende del
      // permiso elegido (efecto de abajo).
      const planRes = await fetch("/api/admin/forestal/plan?active=1", { credentials: "include" });
      const planJson = planRes.ok ? await planRes.json() : null;
      const planId = planJson?.active?.id ?? null;
      setPlanNumeroActivo(planJson?.active?.planNumber ?? null);
      setPlanIdActivo(planId);
      setPlanActivo(planFichaDesdeApi(planJson?.active));
      // Las especies autorizadas van aparte: son las del plan que se mide (efecto de abajo).
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Recargar manual + tras escrituras: lista + meta (+ trazabilidad).
  const refreshAll = useCallback(async () => {
    // Tras escribir (anular una tala, importar líneas…), el censo recordado de
    // la tala ya no dice la verdad sobre qué árbol está disponible.
    olvidarCensoDeTala();
    setReloadSignal((s) => s + 1); // gatilla el refetch de los paneles con fetch propio
    await Promise.all([loadEntries(), loadMeta(), loadAll()]);
  }, [loadEntries, loadMeta, loadAll]);

  // Cambio de sección/permiso → solo la primera página (1 request).
  useEffect(() => {
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, qPermiso, permiso.listo]);

  // Los contadores por sección del permiso elegido (con «Todos», los del libro).
  // También tras cada escritura (`reloadSignal`).
  useEffect(() => {
    if (!qPermiso) {
      setStatsPermiso(null);
      return;
    }
    const ac = new AbortController();
    fetch(`/api/admin/forestal/loth?stats=1&${qPermiso}`, { credentials: "include", signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { stats?: SectionStat[] } | null) => {
        if (j && !ac.signal.aborted) setStatsPermiso({ q: qPermiso, stats: j.stats ?? [] });
      })
      .catch((err) => {
        if (!ac.signal.aborted) console.warn("[loth] no se pudieron leer los contadores del permiso", err);
      });
    return () => ac.abort();
  }, [qPermiso, reloadSignal]);

  /**
   * Elegir permiso (desde el chip, «Ver libro de» o una vista con selector
   * propio): vuelve a la primera página y suelta la selección (eran filas de
   * otro permiso); si el plan está atado a un permiso del Directorio, el
   * permiso de trabajo del CTP lo sigue.
   */
  const { elegirPlan, planes: planesDelLibro } = permiso;
  const seguirContrato = useContratoDelPlan();
  /** Un plan recién creado que todavía no está en la lista: mientras se relee, no es «se dio de baja». */
  const [planEsperado, setPlanEsperado] = useState<string | null>(null);
  const elegirPermiso = useCallback(
    (id: string | null) => {
      elegirPlan(id);
      setSeleccion(new Set());
      if (!id || id === PERMISO_SIN_PLAN) return;
      const p = planesDelLibro.find((x) => x.id === id);
      if (p) {
        void seguirContrato(p);
        return;
      }
      setPlanEsperado(id);
      setRecargaPermiso((n) => n + 1);
    },
    [elegirPlan, planesDelLibro, seguirContrato],
  );
  /* Llegó la lista nueva: el plan esperado ya está (y su permiso se sigue) o
     de verdad no existe (y entonces sí se avisa). */
  useEffect(() => {
    if (!planEsperado) return;
    const p = planesDelLibro.find((x) => x.id === planEsperado);
    if (p) void seguirContrato(p);
    setPlanEsperado(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planesDelLibro]);
  /* Campo por campo y no `...permiso`: el hook devuelve un objeto nuevo en cada
     render, y las vistas no deben releer por eso. */
  const { planSel, plan: planDelLibro, filtro: filtroDelLibro, listo: permisoListo, seCayo: permisoSeCayo, errorLista, reintentar } = permiso;
  const permisoDelLibro = useMemo(
    () => ({
      planes: planesDelLibro,
      planSel,
      plan: planDelLibro,
      filtro: filtroDelLibro,
      query: qPermiso,
      listo: permisoListo,
      seCayo: permisoSeCayo && planEsperado == null,
      errorLista,
      reintentar,
      elegirPlan: elegirPermiso,
    }),
    [planesDelLibro, planSel, planDelLibro, filtroDelLibro, qPermiso, permisoListo, permisoSeCayo, planEsperado, errorLista, reintentar, elegirPermiso],
  );

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
    if (view === "trazabilidad" || view === "tablero" || view === "secciones" || view === "cierre" || view === "rentabilidad") loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  /* El censo de la trazabilidad por árbol: sin él arranca en la tala y el
     volumen ESTIMADO (el que sustenta la autorización) no se compara. Es el
     del permiso elegido; con «Todos», el del plan activo (como antes); con
     «Líneas sin permiso», ninguno: esas líneas no son de ningún censo. */
  const planDelCenso = permiso.planSel && permiso.planSel !== PERMISO_SIN_PLAN ? permiso.planSel : null;
  const censoSinPlan = permiso.planSel === PERMISO_SIN_PLAN;
  useEffect(() => {
    // «tablero» también: el saldo por especie de Control del permiso mide contra el censo.
    if ((view !== "trazabilidad" && view !== "tablero") || !permiso.listo) return;
    if (censoSinPlan) {
      setCensoArboles([]);
      return;
    }
    const ac = new AbortController();
    (async () => {
      try {
        /* Con «Todos», el activo que ya trajo la carga inicial (04-10: antes se
           volvía a pedir `?active=1` acá; el efecto corre otra vez cuando llega). */
        const pid = planDelCenso ?? planIdActivo;
        if (!pid) {
          if (!ac.signal.aborted) setCensoArboles([]);
          return;
        }
        const cRes = await fetch(`/api/admin/forestal/plan/census?planId=${encodeURIComponent(pid)}`, { credentials: "include", signal: ac.signal });
        if (!cRes.ok) throw new Error(`HTTP ${cRes.status}`);
        const trees = (await cRes.json()).trees ?? [];
        if (ac.signal.aborted) return;
        setCensoArboles(
          trees.map((t: { treeCode: string; speciesCommon: string; dapM: string | null; volumenEstimadoM3: string | null; estado: string }) => ({
            treeCode: t.treeCode,
            speciesCommon: t.speciesCommon,
            dapM: t.dapM != null ? Number(t.dapM) : null,
            volumenEstimadoM3: t.volumenEstimadoM3 != null ? Number(t.volumenEstimadoM3) : null,
            estado: t.estado,
          })),
        );
      } catch (err) {
        if (ac.signal.aborted) return;
        /* Falla blanda: sin censo la trazabilidad sigue desde la tala. Se vacía
           para no cruzar el libro de este permiso con el censo de otro. */
        setCensoArboles([]);
        console.warn("[loth] no se pudo leer el censo de la trazabilidad", err);
      }
    })();
    return () => ac.abort();
  }, [view, planDelCenso, planIdActivo, censoSinPlan, permiso.listo, reloadSignal]);

  /* Contra qué plan se miden el cupo y el saldo por especie de «Control del
     permiso»: el del chip si es uno puntual (04-10, como la tabla y el censo);
     con «Todos» o «Líneas sin permiso», el activo del libro, como antes. */
  const planDelControl = planDelCenso ?? planIdActivo;
  useEffect(() => {
    if (!planDelControl) return;
    const ac = new AbortController();
    // Falla blanda: sin las especies el cupo sale «del censo», no se inventa.
    fetch(`/api/admin/forestal/plan?planId=${encodeURIComponent(planDelControl)}`, { credentials: "include", signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (ac.signal.aborted) return;
        const sp = (d?.species ?? []) as { speciesCommon: string; volumenAutorizadoM3: string | number | null; arbolesAutorizados: number | null }[];
        setEspeciesDe({
          planId: planDelControl,
          especies: sp.map((x) => ({ speciesCommon: x.speciesCommon, volumenAutorizadoM3: x.volumenAutorizadoM3, arbolesAutorizados: x.arbolesAutorizados })),
        });
      })
      .catch((err) => {
        if (!ac.signal.aborted) console.warn("[loth] no se pudieron leer las especies del plan", err);
      });
    return () => ac.abort();
  }, [planDelControl, reloadSignal]);
  const especiesAutorizadas = useMemo(
    () => (especiesDe && especiesDe.planId === planDelControl ? especiesDe.especies : []),
    [especiesDe, planDelControl],
  );

  /**
   * Asienta N líneas de una. Va de a una porque el backend numera el `lineNo`
   * correlativo por libro; y devuelve cuántas entraron DE VERDAD, no cuántas se
   * mandaron — el importador anterior del CTP decía «60» y habían entrado 9.
   */
  async function crearLineas(
    payloads: Record<string, unknown>[],
  ): Promise<{ creadas: number; errores: string[]; entries: LothEntry[] }> {
    let creadas = 0;
    const errores: string[] = [];
    // La línea que el servidor acaba de crear (con su `trozaCode` ya
    // asignado): sin esto, «Imprimir las etiquetas» del trozado múltiple no
    // tenía qué imprimir — sólo el conteo de éxito/error.
    const entries: LothEntry[] = [];
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
          errores.push(mensajeErrorFilaImport(i + 1, res.status, d, typeof payload.motivoSobreCupo === "string" ? payload.motivoSobreCupo : null));
          continue;
        }
        const d = await res.json().catch(() => ({}));
        if (d?.entry) entries.push(d.entry as LothEntry);
        creadas += 1;
      } catch (err) {
        errores.push(`Fila ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await refreshAll();
    return { creadas, errores, entries };
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

  /* Secciones cuenta lo del permiso elegido; Cumplimiento sigue con el libro
     entero (`totalLines`). Mientras llegan los del permiso, ceros y no los de
     otro permiso. */
  const statsSecciones = useMemo(
    () => (!qPermiso ? stats : statsPermiso?.q === qPermiso ? statsPermiso.stats : []),
    [qPermiso, stats, statsPermiso],
  );
  const statSeccionBy = useMemo(() => new Map(statsSecciones.map((s) => [s.section, s])), [statsSecciones]);
  const cur = statSeccionBy.get(section);
  const totalLines = stats.reduce((a, s) => a + s.count, 0);
  const totalLineasPermiso = statsSecciones.reduce((a, s) => a + s.count, 0);
  const correcciones = useMemo(() => mapaCorrecciones(allEntries), [allEntries]);
  /** El libro del permiso elegido, para la trazabilidad por árbol (con «Todos», el libro entero). */
  const entriesDelPermiso = useMemo(
    () => (permiso.filtro ? allEntries.filter((e) => cumplePermiso(e.planId, permiso.filtro)) : allEntries),
    [allEntries, permiso.filtro],
  );
  const lineasSeccion = useMemo(
    () => allEntries.filter((e) => e.section === section && cumplePermiso(e.planId, permiso.filtro)),
    [allEntries, section, permiso.filtro],
  );
  /** Cupo por especie: censo del plan + talas vivas del libro + especies autorizadas. */
  const cupoEspecies = useMemo(
    () =>
      cupoPorEspecie({
        censo: censoArboles,
        // Sólo las talas de ESTE plan: las de otro plan o de códigos fuera de su
        // censo no gastan su cupo.
        talas: talasDelPlan(
          allEntries.filter((e) => e.section === "tala" && e.status === "registrado"),
          new Set(censoArboles.map((c) => c.treeCode.trim())),
          planDelControl,
        ).delPlan,
        autorizadas: especiesAutorizadas,
      }),
    [censoArboles, allEntries, especiesAutorizadas, planDelControl],
  );
  /** Lo que el saldo por especie de «Control del permiso» mide: lo mismo que el cupo. */
  const entradaSaldo = useMemo(
    () => ({ censo: censoArboles, entries: allEntries, autorizadas: especiesAutorizadas }),
    [censoArboles, allEntries, especiesAutorizadas],
  );
  const cupoPorClave = useMemo(() => new Map(cupoEspecies.map((f) => [f.clave, f])), [cupoEspecies]);
  /* La tabla filtra (autofiltro de cada cabecera), ordena y pagina la sección
     ENTERA, que llega con el libro (`loadAll`). Mientras tanto se ve la primera
     página que trajo la API. */
  const libroLeido = allEntries.length > 0;
  const lineasTabla = libroLeido ? lineasSeccion : entries;
  /* «Permiso · titular» sólo si la sección mezcla planes (ver loth-seccion-permiso). */
  const planesPorId = useMemo(() => mapaDePermisos(permiso.planes), [permiso.planes]);
  const variosPlanes = useMemo(() => mezclaPlanes(lineasTabla), [lineasTabla]);
  const cols = useMemo(
    () => (variosPlanes ? conColumnaPermiso(COLS[section], planesPorId) : COLS[section]),
    [section, variosPlanes, planesPorId],
  );
  const tabla = useLothSeccionTabla({
    section,
    cols,
    lineas: lineasTabla,
    corregidaPor: correcciones.corregidaPor,
    orden,
    dir: ordenDir,
    planes: planesPorId,
  });
  const visibles = tabla.enPagina;
  // La selección es de las líneas que se están viendo: al pasar de página o de
  // sección, quedaría apuntando a filas que ya no están en pantalla.
  useEffect(() => {
    setSeleccion(new Set());
  }, [section, tabla.pagina]);
  const seleccionadas = useMemo(() => visibles.filter((e) => seleccion.has(e.id)), [visibles, seleccion]);

  const toggleOrden = (campo: OrdenCampo) => {
    if (campo === orden) setOrdenDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setOrden(campo);
      setOrdenDir(campo === "lineNo" || campo === "fecha" ? "asc" : "desc");
    }
  };

  // Puente al Libro CTP: sólo si el negocio lo tiene (spec habilitada).
  const { enabledKeys } = useEnabledSpecs();
  const hayLibroCtp = enabledKeys.has("spec:forestal:ctp-libro");
  /** A dónde va la transformación: el riel y el aviso del modal usan el mismo camino. */
  const irAlCtp = hayLibroCtp
    ? () => window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { moduleId: CTP_MODULE_TAB_ID } }))
    : undefined;
  const { estado: gtfEnCtp } = useGtfEnCtp(
    section === "despacho_troza" ? visibles.map((e) => e.gtfNumber) : [],
    hayLibroCtp && view === "secciones" && section === "despacho_troza",
  );

  /** Lo que se hace de vez en cuando en una sección: plegado en «Opciones». */
  const opcionesSeccion: LibroAction[] = [
    ...(section === "trozado"
      ? [
          {
            id: "trozar",
            label: "Trozar un árbol",
            hint: "Registra todas las trozas de un mismo árbol en una sola pantalla",
            icon: Scissors,
            onSelect: () => setShowTrozar(true),
          },
        ]
      : []),
    {
      id: "importar",
      label: "Importar líneas",
      hint: "Pega un cuadro de Excel o sube un CSV con muchas líneas",
      icon: Upload,
      onSelect: () => setShowImport(true),
    },
    {
      id: "importar-guias",
      label: "Importar guías despachadas",
      hint: "Las guías que ya salieron, con sus trozas y su permiso: por N° de registro SERFOR, foto o las recibidas en el aserradero",
      icon: FileDown,
      onSelect: () => setShowImportarGuias(true),
    },
    {
      id: "etiquetas",
      label: "Etiquetas QR",
      hint: "Imprime el QR de origen de cada código en pantalla",
      icon: QrCode,
      busy: printingLabels,
      disabled: visibles.length === 0,
      onSelect: () => void doPrintLabels(visibles),
    },
    {
      id: "csv",
      label: "Descargar CSV",
      hint: "Las líneas de la sección con los filtros de columna puestos (todas las páginas)",
      icon: FileSpreadsheet,
      disabled: tabla.ordenadas.length === 0,
      meta: `${tabla.ordenadas.length} ${tabla.ordenadas.length === 1 ? "línea" : "líneas"}`,
      onSelect: () => descargarCsv(tabla.ordenadas, `libro-th-${section}.csv`),
    },
    ...[opcionBorrarFiltradas({
      filtradas: tabla.ordenadas,
      hayFiltro: tabla.f.activos > 0 || permiso.filtro != null,
      /* Hasta que el libro entero no llegó, «las N filtradas» serían sólo la primera página. */
      puede: puedeBorrar && libroLeido,
      onBorrar: (ids) => setBorrarLineas({ ids, titulo: `Borrar las ${ids.length} líneas filtradas` }),
    })].filter((o): o is LibroAction => o != null),
  ];

  return (
    <LothPermisoContext.Provider value={permisoDelLibro}>
    <LibroChrome
      moduleId={LOTH_MODULE_ID}
      eyebrow="Forestal · LO-TH SERFOR"
      title="Libro de Operaciones · Títulos Habilitantes"
      icon={TreePine}
      groups={LOTH_GROUPS}
      view={view}
      onView={irA}
      /* El permiso del LIBRO, al lado de la carátula (Brandon 02-10-2026; antes,
         19-09, el permiso de trabajo del CTP). Son dos cosas distintas y por
         eso van separadas: la carátula es la identidad del libro —de quién es
         este LO-TH— y el permiso es con qué plan se mira y se registra ahora,
         en todas las vistas. Si el plan está atado a un permiso del
         Directorio, el CTP lo sigue (`useContratoDelPlan`). */
      contrato={<LothPermisoChip />}
      status={
        // La carátula ES la identidad del libro: sin ella, ningún export es
        // presentable. Por eso el chip vive en la cabina y no en un banner.
        <button
          type="button"
          onClick={() => setShowCaratula(true)}
          title={
            caratula
              ? `Carátula del libro: ${[caratula.tituloHabilitante, caratula.titularName].filter(Boolean).join(" · ")}. Titular, título habilitante, registro y tomo.`
              : "El libro necesita carátula para poder presentarse"
          }
          /* Con carátula es un dato, no un aviso: borde neutro de 1 px (ADR-068)
             y ancho acotado, para que título + fases + botones entren en UNA
             fila de la cabina. Lo que distingue un libro de otro es el código
             del título habilitante: ése va siempre y entero. El titular sólo
             desde 1800 px: medido a 1650 con «17-CPO/C-J-045-26», dentro de
             13rem el titular quedaba en «M…» y además le recortaba el código.
             El código no se achica nunca (`shrink-0`): con 12rem un
             «10-HUA-PUE/PER-FMP-2026-007» salía cortado. Sin código, el que
             identifica es el titular, en letra normal y entero hasta 18rem
             (28-09: «Maderera El Aguaja…» en mono dentro de 12rem).
             Sin carátula sí es un aviso, y el borde de color va a 2 px. */
          className={`inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm transition-colors ${
            caratula
              ? "max-w-[18rem] border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] min-[1800px]:max-w-[26rem]"
              : "border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]"
          }`}
        >
          <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
          {caratula ? (
            <>
              {caratula.tituloHabilitante ? (
                <span className="shrink-0 whitespace-nowrap font-mono text-xs font-bold tabular-nums">
                  {caratula.tituloHabilitante}
                </span>
              ) : (
                <span className="min-w-0 truncate font-semibold">{caratula.titularName}</span>
              )}
              {caratula.tituloHabilitante && (
                <span className="hidden min-w-0 flex-1 basis-0 truncate text-[var(--text-tertiary)] min-[1800px]:inline">
                  {caratula.titularName}
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
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-canvas)] disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </>
      }
      actions={acciones}
    >

      {/* Vista Plan de Manejo — base maestra (censo + especies autorizadas) */}
      {view === "plan" && <LothPlanView reloadSignal={reloadSignal} onCambioDelLibro={() => void refreshAll()} />}

      {/* Vista GTF — guías de transporte forestal */}
      {view === "gtf" && (
        <LothGtfView
          focusGtf={focoGtf}
          onFocusHandled={() => setFocoGtf(null)}
          onImportarGuias={() => setShowImportarGuias(true)}
          reloadSignal={reloadSignal}
        />
      )}

      {/* Vista Extracción — el permiso de punta a punta: censo, saldos y cadena (ADR-454) */}
      {view === "extraccion" && <LothExtraccionView reloadSignal={reloadSignal} onIr={setView} />}

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
      {view === "mapa" && (
        <LothMapaView
          focusTree={focoArbol}
          onFocusHandled={() => setFocoArbol(null)}
          onTalarVarios={(t) => setTandaTala(t)}
          reloadSignal={reloadSignal}
        />
      )}

      {/* Vista Rentabilidad y rendimiento — margen, flujo bosque→producto, anomalías y valor (antes: Rentabilidad + Analítica) */}
      {view === "rentabilidad" && <LothRentabilidadView reloadSignal={reloadSignal} entries={allEntries} onIrAExtraccion={() => setView("extraccion")} />}

      {/* Vista de trazabilidad — operación completa por árbol */}
      {view === "tablero" && (
        <>
          {/* El spinner sólo la primera vez: al recargar tras despachar, el
              tablero se queda montado y no pierde filtros ni permiso. */}
          {loading && allEntries.length === 0 ? (
            <div className="p-8 text-center text-[var(--text-tertiary)]">
              <RefreshCw className="mx-auto h-6 w-6 animate-spin" />
              <p className="mt-2 text-sm">Cargando el control del permiso...</p>
            </div>
          ) : (
            <LothTableroTrozas
              entries={allEntries}
              caratula={caratula}
              reloadSignal={reloadSignal}
              onDespacharConGuia={(codigos) => {
                setDespachoElegidas(codigos);
                setShowDespachoGuia(true);
              }}
              nav={{
                onVerCadena: (code) => setCadenaCode(code),
                onVerGtf: (gtf) => {
                  setFocoGtf(gtf);
                  setView("gtf");
                },
                onIrAlPlan: () => setView("plan"),
              }}
              accionesExtra={(datos) => [accionInformeDelControl({ datos, caratula, planActivo, saldo: entradaSaldo })]}
              encabezado={(datos) => (
                <LothControlPermisoEncabezado
                  datos={datos}
                  caratula={caratula}
                  planActivo={planActivo}
                  saldo={entradaSaldo}
                  onCompletarCaratula={() => setShowCaratula(true)}
                  onCompletarPlan={() => irA("plan")}
                  onVerGtf={(gtf) => {
                    setFocoGtf(gtf);
                    setView("gtf");
                  }}
                />
              )}
            />
          )}
        </>
      )}

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
              entries={entriesDelPermiso}
              caratula={caratula}
              censo={censoArboles}
              cupoEspecies={cupoEspecies}
              cupoEnPie={(g) => <LothCupoEnPie fila={cupoPorClave.get(g.clave)} />}
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
                // «Qué falta hacer» → el mismo trozado que abre «Trozarlo ahora».
                onRegistrarTrozado: abrirTrozado,
                // «Qué falta hacer» → el alta del censo, con código y especie escritos.
                onAgregarAlCenso: setAltaCenso,
              }}
            />
          )}
          {/* El alta va al censo que se está mirando (el del chip; con «Todos», el activo), no siempre al activo. */}
          <LothCensoAltaDesdeTrace planId={planDelControl} arbol={altaCenso} onClose={() => setAltaCenso(null)} onAgregado={refreshAll} />
        </>
      )}

      {view === "secciones" && (
        <>
      {/* Resumen del libro entero (bosque → producto). Se pliega y se recuerda. */}
      <LothResumenStrip onNavigate={(v) => setView(v)} reloadSignal={reloadSignal} />

      {libroTruncado && (
        <div className="rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 px-4 py-3 text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          Se leyeron {formatNumber(libroTruncado.leidas)} de {formatNumber(libroTruncado.total)} líneas del libro. La
          trazabilidad por árbol y el cuadro de censo se calculan sobre lo leído: para un libro de este tamaño, filtra por período antes
          de sacar conclusiones.
        </div>
      )}

      {/* Las 6 secciones en un riel: bosque (RDE 264-2019 §1-3) | transformación
          en el propio TH (§4-6) — dos momentos del MISMO libro, no dos libros. */}
      {/* «Ver libro de» se sacó el 02-10 (Brandon): repetía el chip de la banda, que ya
          filtra todo el libro. */}
      {/* Líneas sin permiso: cuentan en el saldo de todos. Una línea; «Atarlas» abre el modal. */}
      <LothAtarSinPlan
        planes={permiso.planes}
        planInicial={permiso.plan?.id ?? null}
        reloadSignal={reloadSignal}
        onAtado={() => void refreshAll()}
      />

      <LothSeccionesRiel
        section={section}
        contar={(s) => statSeccionBy.get(s)?.count ?? 0}
        onSection={setSection}
        onIrAlCtp={irAlCtp}
        transformaEnElTh={transformaEnElTh}
      />

      {/* Título de la sección + sus indicadores, plegables y recordados (una
          preferencia para las seis: ver LothSeccionKpis). Con el libro entero
          leído, el «fuera de plazo» cuenta la sección y no sólo la página. */}
      <LothSeccionKpis
        section={section}
        cur={cur}
        totalLibro={totalLineasPermiso}
        lineas={allEntries.length > 0 ? lineasSeccion : entries}
        delLibroEntero={allEntries.length > 0 && !libroTruncado}
      />

      {/* La acción del día a la vista; lo de vez en cuando, en «Opciones». Los
          filtros van en la cabecera de cada columna de la tabla. */}
      <LothSeccionBarra
        opciones={opcionesSeccion}
        onNuevaLinea={() => setShowForm(true)}
        principal={
          section === "despacho_troza"
            ? {
                label: "Despachar con guía",
                title: "Arma la guía de transporte completa con las trozas que salen y las asienta en el libro",
                icon: Truck,
                onClick: () => setShowDespachoGuia(true),
              }
            : undefined
        }
      />

      {error && (
        <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-[var(--data-error-700)]">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="text-sm"><strong>Error:</strong> {error}</div>
          </div>
        </div>
      )}

      {/* Aviso persistente (no un toast) de que un trozado recién guardado
          todavía no imprimió sus etiquetas — de a uno, "Guardar y otro", el
          múltiple de un árbol, o el que sigue a "Trozar estos árboles". */}
      {trozasParaImprimir.length > 0 && (
        <LothEtiquetasRecienTrozadas
          trozas={trozasParaImprimir}
          imprimiendo={printingLabelsCtp}
          onImprimir={() => alImprimirEtiquetasCtp(trozasParaImprimir)}
          onCerrar={() => setTrozasParaImprimir([])}
        />
      )}

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
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            <QrCode className="h-4 w-4" /> Etiquetas QR
          </button>
          {section === "trozado" && (
            <button
              type="button"
              onClick={() => alImprimirEtiquetasCtp(seleccionadas)}
              disabled={printingLabelsCtp}
              title="La ficha del QR se lee con la misma pistola que recibe trozas en el Libro CTP"
              className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent)]/12 disabled:opacity-50 dark:text-[var(--accent)]"
            >
              <QrCode className="h-4 w-4" /> Imprimir etiquetas
            </button>
          )}
          <button
            type="button"
            onClick={() => descargarCsv(seleccionadas, `libro-th-${section}-seleccion.csv`)}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
          >
            CSV de la selección
          </button>
          <button
            type="button"
            onClick={() => setAnularLineas(seleccionadas.filter((e) => e.status !== "anulado"))}
            disabled={seleccionadas.every((e) => e.status === "anulado")}
            className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-[var(--data-error-500)] px-4 text-sm font-semibold text-[var(--data-error-700)] hover:bg-[var(--data-error-500)]/10 disabled:opacity-40 dark:text-[var(--data-error-500)]"
          >
            <Ban className="h-4 w-4" /> Anular
          </button>
          {puedeBorrar && (
            <button
              type="button"
              onClick={() => setBorrarLineas({
                ids: seleccionadas.map((e) => e.id),
                titulo: `Borrar ${seleccionadas.length === 1 ? "la línea seleccionada" : `${seleccionadas.length} líneas seleccionadas`}`,
              })}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--data-error-600)] px-4 text-sm font-semibold text-white hover:opacity-90"
            >
              <Trash2 className="h-4 w-4" /> Borrar…
            </button>
          )}
          <button
            type="button"
            onClick={() => setSeleccion(new Set())}
            className="ml-auto inline-flex h-10 items-center rounded-xl px-3 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
          >
            Limpiar
          </button>
        </div>
      )}

      {/* A <640 px la tabla pasa a tarjetas y pierde la cabecera: ahí los
          filtros viven en «Filtros por columna». Los chips, en todos los anchos. */}
      <BarraFiltrosTabla f={tabla.f} sinConteo />

      <GtfCtpContext.Provider value={gtfEnCtp}>
      <LothSeccionTabla
        section={section}
        entries={visibles}
        filasTotal={tabla.ordenadas}
        filtros={tabla.f}
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
      </GtfCtpContext.Provider>

      {!loading && visibles.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--rule-base)] p-12 text-center text-[var(--text-tertiary)]">
          <TreePine className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="text-base font-medium">
            {tabla.f.total === 0
              ? `Sin registros en ${SECTION_META[section].label.toLowerCase()}.`
              : "Ninguna línea coincide con los filtros de columna."}
          </p>
          <p className="mt-1 text-sm">
            {tabla.f.total > 0 ? (
              <button type="button" onClick={tabla.f.limpiar} className="font-semibold text-[var(--text-primary)] underline underline-offset-4">
                Quitar los filtros
              </button>
            ) : section === "despacho_troza" ? (
              "Usa «Despachar con guía»: la guía y sus trozas se registran juntas."
            ) : (
              "Usa «Nueva línea» para registrar el primer movimiento."
            )}
          </p>
        </div>
      )}
      {loading && (
        <div className="rounded-2xl border border-[var(--rule-base)] p-6 text-center text-[var(--text-tertiary)]">
          <RefreshCw className="mx-auto h-6 w-6 animate-spin" />
          <p className="mt-2 text-sm">Cargando registros...</p>
        </div>
      )}

      {/* Cuántas hay de verdad + cómo llegar al resto. Antes se mostraban las
          primeras 200 y el resto no existía para el usuario. */}
      <LothSeccionPaginas
        seccion={SECTION_META[section].label.toLowerCase()}
        filtradas={tabla.ordenadas.length}
        total={libroLeido ? tabla.f.total : totalSeccion}
        pagina={tabla.pagina}
        paginas={tabla.paginas}
        porPagina={POR_PAGINA}
        leyendoLibro={!libroLeido && totalSeccion > entries.length}
        disabled={loading}
        onPagina={tabla.setPagina}
      />
        </>
      )}

      {showForm && (
        <LothEntryForm
          // `key` fuerza un formulario nuevo por plantilla: sin esto, duplicar
          // una segunda línea reusaría el estado del modal anterior.
          key={`${section}-${plantilla?.id ?? "nuevo"}-${corrigeLineNo ?? ""}-${arbolInicial ?? ""}`}
          section={section}
          arbolInicial={arbolInicial}
          caratulaId={caratula?.id ?? null}
          plantilla={plantilla}
          corrigeLineNo={corrigeLineNo}
          onIrAlCtp={irAlCtp}
          onClose={() => {
            setShowForm(false);
            setPlantilla(null);
            setCorrigeLineNo(null);
            setArbolInicial(null);
            // Cerrar a medio llenar no borra lo ya asentado con "Guardar y otro".
            if (section === "trozado") flushSesionTrozado();
          }}
          onTalarVarios={(t) => {
            setShowForm(false);
            setPlantilla(null);
            setCorrigeLineNo(null);
            setArbolInicial(null);
            setTandaTala(t);
          }}
          onSaved={(opts) => {
            if (!opts?.keepOpen) {
              setShowForm(false);
              setPlantilla(null);
              setCorrigeLineNo(null);
              setArbolInicial(null);
            }
            refreshAll();
            // «Imprimir las etiquetas» del trozado de a uno: con "Guardar y
            // otro" se acumula hasta que la sesión termine; con el Guardar
            // final, se ofrece ya.
            if (section === "trozado") {
              if (opts?.keepOpen) {
                if (opts.entry) setTrozasEnSesionForm((prev) => [...prev, opts.entry as LothEntry]);
              } else {
                flushSesionTrozado(opts?.entry ?? null);
              }
            }
            // Medido 28-09 en Blas: el 111 se taló y se trozó el mismo día.
            const talado = opts?.arbolTalado;
            if (talado) {
              toast.success(`Tala del árbol ${talado} registrada`, {
                description: "¿Lo trozas ahora? Se abre el trozado con ese árbol.",
                action: { label: "Trozarlo ahora", onClick: () => abrirTrozado(talado) },
                duration: 12_000,
              });
            }
          }}
        />
      )}

      {showDespachoGuia && (
        <LothDespachoGuiaModal
          trozasIniciales={despachoElegidas ?? undefined}
          onClose={() => {
            setShowDespachoGuia(false);
            setDespachoElegidas(null);
          }}
          onRegistrada={refreshAll}
        />
      )}

      {showImportarGuias && (
        <LothImportarGuiasModal
          onClose={() => setShowImportarGuias(false)}
          onImportadas={() => void refreshAll()}
          onVerGuia={(gtf) => {
            setShowImportarGuias(false);
            setFocoGtf(gtf);
            setView("gtf");
          }}
          onVerPermiso={(planId) => {
            setShowImportarGuias(false);
            /* El Control del permiso recuerda su plan con su propia clave: se deja
               elegido el importado antes de llegar (mismo formato que useLocalStorage). */
            try {
              window.localStorage.setItem(CLAVE_PLAN_TABLERO, JSON.stringify(planId));
              window.dispatchEvent(new CustomEvent("local-storage", { detail: { key: CLAVE_PLAN_TABLERO, value: planId } }));
            } catch (err) {
              console.warn("[loth] no se pudo dejar elegido el permiso importado", err);
            }
            // Y el permiso del libro: las demás vistas también abren en el importado.
            elegirPermiso(planId);
            setView("tablero");
          }}
        />
      )}

      <LothImportLineasModal
        open={showImport}
        section={section}
        onClose={() => setShowImport(false)}
        onImportar={async (filas: FilaImport[], planId: string | null) => {
          const r = await crearLineas(
            filas.map((f) => ({
              section,
              // El permiso elegido en el modal: sin él T6/T7 no la revisan y la línea cuenta en todos los planes.
              planId,
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
              // T9: la misma regla del servidor; sin columna, no se manda.
              ...(section === "tala" && f.motivoSobreCupo ? { motivoSobreCupo: f.motivoSobreCupo } : {}),
            })),
          );
          return { creadas: r.creadas, errores: reetiquetarErroresImport(r.errores, filas) };
        }}
      />

      {tandaTala && (
        <LothTalaTandaModal
          inicial={tandaTala}
          caratulaId={caratula?.id ?? null}
          onClose={() => setTandaTala(null)}
          onGuardadas={refreshAll}
          onTrozar={(codigos) => {
            setTandaTala(null);
            setSection("trozado");
            setTrozarSolo(codigos);
            setShowTrozar(true);
          }}
        />
      )}

      <LothTrozadoMultipleModal
        open={showTrozar}
        talas={allEntries.filter((e) => e.section === "tala" && e.status === "registrado" && e.treeCode && (!trozarSolo || trozarSolo.includes(e.treeCode)))}
        onClose={() => {
          setShowTrozar(false);
          setTrozarSolo(null);
        }}
        onGuardar={async (arbol, trozas) => {
          const r = await crearLineas(
            trozas.map((t) => ({
              section: "trozado",
              entryDate: new Date().toISOString(),
              // La troza va al plan de SU tala: sin plan contaba en el saldo de
              // todos los permisos y saltaba T6/T7 (ADR-459).
              planId: arbol.planId ?? null,
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
              // Las medidas cruzadas de cada troza (ADR-422): sin esto el
              // múltiple guardaba sólo el promedio aunque se midiera en cruz.
              medicionCruda: t.medicionCruda,
            })),
          );
          // «Imprimir las etiquetas» del trozado múltiple: mismas trozas que
          // acaba de asentar, vengan de «Trozar un árbol» o de «Trozar estos
          // árboles» después de la tala en tanda (ambas pasan por acá).
          if (r.entries.length > 0) setTrozasParaImprimir((prev) => [...prev, ...r.entries]);
          return { creadas: r.creadas, errores: r.errores };
        }}
      />

      <LothLineaDetalleModal
        linea={detalle}
        corregidaPorLineNo={detalle ? (correcciones.corregidaPor.get(detalle.lineNo) ?? null) : null}
        onClose={() => setDetalle(null)}
        onVerCadena={(code) => setCadenaCode(code)}
        onImprimirEtiqueta={(linea) => alImprimirEtiquetasCtp([linea])}
      />

      {borrarLineas && (
        <LothBorrarLineasModal
          ids={borrarLineas.ids}
          titulo={borrarLineas.titulo}
          planes={planesPorId}
          onClose={() => setBorrarLineas(null)}
          onBorrado={() => {
            setBorrarLineas(null);
            setSeleccion(new Set());
            void refreshAll();
          }}
        />
      )}

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
        <div className={`space-y-3 ${MODAL_BODY}`}>
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
            // eslint-disable-next-line jsx-a11y/no-autofocus -- único campo del modal de anular, foco intencional
            autoFocus
            className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-base text-[var(--text-primary)] outline-none focus:border-[var(--data-error-500)]"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setAnularLineas([]);
                setAnnulReason("");
              }}
              className="inline-flex h-11 items-center rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={annulReason.trim().length < 3 || pending != null}
              onClick={() => doAnnul(anularLineas.map((e) => e.id))}
              className="inline-flex h-11 items-center rounded-xl bg-[var(--data-error-600)] px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {pending != null ? "Anulando…" : `Anular ${anularLineas.length > 1 ? anularLineas.length : ""}`}
            </button>
          </div>
        </div>
      </AdminModal>
      {showCaratula && (
        <LothCaratulaForm
          current={caratula}
          transformaEnElTh={transformaEnElTh}
          onClose={() => setShowCaratula(false)}
          onSaved={() => { setShowCaratula(false); refreshAll(); }}
        />
      )}
      {cadenaCode && <LothCadenaModal code={cadenaCode} onClose={() => setCadenaCode(null)} />}
    </LibroChrome>
    </LothPermisoContext.Provider>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Mono({ v, bold }: { v: string; bold?: boolean }) {
  return <span className={`font-mono tabular-nums text-[var(--text-primary)] ${bold ? "font-bold" : ""}`}>{v}</span>;
}
function Code({ v, rama, marcado }: { v: string | null; rama?: boolean; marcado?: "completo" | "parcial" | "sin" }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono font-bold text-[var(--text-primary)]">{v ?? "—"}</span>
      {rama && <span className="rounded bg-[var(--surface-sunken)] px-1 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">R</span>}
      {marcado && marcado !== "sin" && (
        <span
          title={
            marcado === "completo"
              ? "Código marcado en el fuste y en el tocón (RDE 264-2019, item 3)"
              : "Marcado declarado a medias: falta el fuste o el tocón"
          }
          className={`rounded px-1 text-[length:var(--ts-2xs)] font-bold ${
            marcado === "completo"
              ? "bg-[var(--data-success-50)] text-[var(--data-success-700)]"
              : "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]"
          }`}
        >
          {marcado === "completo" ? "M" : "M·"}
        </span>
      )}
    </span>
  );
}

/**
 * El marcado físico del item 3 se guardaba y no se veía en ninguna parte: un
 * dato que no se puede leer no existe para quien fiscaliza. Va como pastilla
 * junto al código —no como columna nueva— para no ensanchar una tabla que ya
 * tiene seis.
 */
function estadoMarcadoDe(e: LothEntryDTO): "completo" | "parcial" | "sin" {
  const f = e.marcadoFuste === true;
  const t = e.marcadoTocon === true;
  if (f && t) return "completo";
  if (f || t) return "parcial";
  return "sin";
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
