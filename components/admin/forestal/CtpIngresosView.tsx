"use client";

/**
 * CtpIngresosView — pestaña Ingresos del Libro CTP (ADR-124): la materia prima
 * que entra a planta, su validación y su trazabilidad.
 *
 * Los KPIs vienen de `?stats=1` (agregado en DB sobre todo el período) y no de
 * sumar la tabla: la tabla está paginada y sumarla diría "total" de una página.
 *
 * 2026-07-29 v2 — la vista orquesta y no dibuja: KPIs (CtpIngresosKpis) y
 * filtros (CtpIngresosFiltros) salieron a sus propios archivos. Suma filtros
 * por faceta, orden por columna, rechazo en lote, duplicar un ingreso y
 * descarga de lo filtrado.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDateNumeric } from "@/lib/format";
import { useMiRol } from "@/hooks/use-mi-rol";
import { AlertCircle, PackageCheck } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useDebounce } from "@/hooks/use-debounce";
import { useGuardarPrefs, usePrefsIniciales } from "@/hooks/use-ctp-ingresos-prefs";
import {
  CTP_EXPORT_MAX,
  CTP_PAGE_SIZE,
  useCtpIngresos,
  type CtpSort,
  type CtpSortField,
} from "@/hooks/use-ctp-ingresos";
import { ingresosACsv, nombreArchivoIngresos } from "@/lib/forestal/ctp-ingresos-csv";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import WoodEntryForm, { type WoodEntryPreset } from "./WoodEntryForm";
import SpeciesAggregateChart from "./SpeciesAggregateChart";
import CtpEntryDetailModal from "./CtpEntryDetailModal";
import CtpDocumentoVisor, { type DocumentoImprimible } from "./CtpDocumentoVisor";
import { CSS_GTF_SERFOR, documentoGtfSerfor, trozasDesdeSerfor } from "@/lib/forestal/ctp-gtf-desde-serfor";
import { CSS_GTF_OFICIAL, fechaGtf } from "@/lib/forestal/ctp-gtf-formato";
import { documentoHtml } from "@/lib/forestal/ctp-documento-print";
import { CSS_LISTA_TROZAS, htmlListaTrozas } from "@/lib/forestal/ctp-lista-trozas";
import { CSS_LEGAJO, portadaLegajo } from "@/lib/forestal/ctp-legajo";
import { metaArchivado, papelesDeGuia, papelesDeIngreso } from "@/lib/forestal/ctp-documentos-ingreso";
import { hojaFotosDeLaCarga } from "@/lib/forestal/ctp-fotos-papel";
import { normalizarFotos } from "@/lib/forestal/fotos-carga";
import { useLogosTitulares } from "@/hooks/use-logos-titulares";
import CtpArchivadorAuto, { type GuiaParaArchivar } from "./CtpArchivadorAuto";
import { hayNovedades } from "@/lib/forestal/ctp-cola-archivado";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import type { GuiaIngreso } from "@/lib/forestal/ingresos-por-guia";
import { ctpGet, invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { esSinCosto } from "@/lib/forestal/madera-de-servicio";
import { faltaRecibirMadera } from "@/lib/forestal/recepcion-guias";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import CtpEtiquetasTrozasModal from "./CtpEtiquetasTrozasModal";
import CtpDocumentosGuiaModal from "./CtpDocumentosGuiaModal";
import { DocumentosGuiaProvider } from "./ctp-documentos-guia-contexto";
import { useConteoDocumentosGuias } from "@/hooks/use-documentos-guia";
import type { ResultadoBloque } from "@/hooks/use-recepcion-bloque";
import { logger } from "@/lib/logger";

/** Lo que el endpoint de trozas devuelve: lo usan el papel y la ficha. */
interface TrozaDeGuia {
  id: string;
  /** La fila de la guía de la que cuelga (la pone `piezasDeGuia`). */
  woodEntryId?: string | null;
  codificacion?: string | null;
  codigoPlanta?: string | null;
  especieComun?: string | null;
  especieCientifica?: string | null;
  producto?: string | null;
  d1Cm?: number | null;
  d2Cm?: number | null;
  largoM?: number | null;
  volumenM3?: number | string | null;
  fechaRecepcion?: string | null;
  noRecepcionada?: boolean | null;
  consumidaEnId?: string | null;
}
import CtpIngresoCadenaModal from "./CtpIngresoCadenaModal";
import CtpIngresoEditModal from "./CtpIngresoEditModal";
import { useActionToasts, ActionToasts } from "./cubicador-toasts";
import CtpGuiasTable, { COLUMNAS_GUIAS_OPCIONALES } from "./CtpGuiasTable";
import { CLAVE_ORDEN_GUIAS, ORDEN_GUIAS_DEFECTO, useColumnasGuias } from "./ctp-guias-columnas";
import { etiquetaDePermiso, filtrosDeCabeceraGuias, filtrosDeCabeceraGuiasMovil } from "./CtpGuiasFiltrosCabecera";
import { BotonRestablecerColumnas, useOrdenColumnas } from "@/components/admin/shared/columnas-ordenables";
import {
  hayFiltroDeColumna,
  textosDeFiltrosColumna,
  type FiltrosColumnaIngresos,
} from "@/lib/forestal/ingresos-filtros-columna";
import CtpCuadrarGuiaModal from "./CtpCuadrarGuiaModal";
import CtpGuiaFichaModal from "./CtpGuiaFichaModal";
import CtpCubicarOxapampaModal from "./CtpCubicarOxapampaModal";
import CtpAcomodarTrozasModal from "./CtpAcomodarTrozasModal";
import type { AlcanceAcomodoCliente } from "@/hooks/use-acomodar-trozas";
import CtpCostoGuiaModal, { type GuiaACostear } from "./CtpCostoGuiaModal";
import CtpPonerPrecioModal from "./CtpPonerPrecioModal";
import CtpRecepcionBloqueModal, { type GuiaParaBloque } from "./CtpRecepcionBloqueModal";
import CtpGuiasSeleccionBarra from "./CtpGuiasSeleccionBarra";
import CtpCorregirRecepcionModal from "./CtpCorregirRecepcionModal";
import CtpAvisoLlegadaTardia from "./CtpAvisoLlegadaTardia";
import { ddmm, estadoDeVencimiento, yaRecibida } from "@/lib/forestal/fecha-de-llegada";
import { limaDateKey } from "@/lib/utils";
import CtpTrozasIndividuales from "./CtpTrozasIndividuales";
import CtpIngresosKpis from "./CtpIngresosKpis";
import CtpKpiFiltros, { camposDeIngresos, notaDeFiltros } from "./CtpKpiFiltros";
import CtpGtfIngresadasKpis from "./CtpGtfIngresadasKpis";
import CtpIngresosFiltros, { type CtpFacetasActivas } from "./CtpIngresosFiltros";
import CtpGuiasBandeja from "./CtpGuiasBandeja";
import CtpGuiasGuardadasBandeja from "./CtpGuiasGuardadasBandeja";
import CtpGuiasGuardadasCapa, { type ModalGuardadas } from "./CtpGuiasGuardadasCapa";
import CtpRecibirGuiaThModal from "./CtpRecibirGuiaThModal";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { buscarGuiaGuardada, detalleDeGuia } from "@/hooks/use-guias-guardadas";
import type { GuiaGuardadaDetalle, GuiaGuardadaVista } from "@/lib/forestal/guias-guardadas";
import CtpIngresosPaginacion from "./CtpIngresosPaginacion";
import {
  ColumnasMenu,
  STATUS_META,
  originLabel,
  productLabel,
  type CtpFiltroRapido,
  type WoodEntry,
} from "./ctp-shared";

/**
 * Cuántos ingresos entran en un legajo armado desde el filtro. Con 30 ya son
 * ~90 hojas: más que eso no es un legajo, es un libro que nadie imprime.
 */
const LEGAJO_MAX = 30;

/* Las facetas admiten uno o varios valores (2026-09-10). Estos tres ayudantes
   evitan repetir el `Array.isArray` en cada lugar que las lee. */
/** Lo elegido, siempre como lista. */
const listaDe = (v: string | readonly string[] | undefined): string[] =>
  v == null ? [] : Array.isArray(v) ? [...v] : [v as string];
/** El primero — para nombrar el archivo del CSV, que admite un solo apodo. */
const unFiltro = (v: string | readonly string[] | undefined): string => listaDe(v)[0] ?? "";
/** «especie tornillo o cachimbo», o vacío si esa columna no está acotada. */
const textoDeFiltro = (
  nombre: string,
  v: string | readonly string[] | undefined,
  etiqueta: (x: string) => string = (x) => x,
): string => {
  const vs = listaDe(v);
  return vs.length === 0 ? "" : `${nombre} ${vs.map(etiqueta).join(" o ")}`;
};

/**
 * La guía tal como la pide el modal de costo. Vive suelto porque se arma desde
 * DOS caminos —al recepcionar (ADR-135) y desde la fila, sin pasar por
 * Rentabilidad— y dos copias derivarían en dos repartos distintos.
 */
const costeableDeGuia = (guia: GuiaIngreso<WoodEntry>): GuiaACostear => ({
  gtfNumber: guia.gtfNumber,
  providerName: guia.lineas[0]?.providerName ?? null,
  especie: guia.lineas[0]?.speciesCommonName ?? null,
  volumenM3: guia.lineas.reduce((a, l) => a + (Number(l.volumeM3) || 0), 0),
  lineas: guia.lineas.map((l) => ({ id: l.id, volumeM3: l.volumeM3 })),
  fecha: guia.lineas[0]?.entryDate?.slice(0, 10) ?? null,
  originCode: guia.lineas[0]?.originCode ?? null,
});

/** La fecha de hoy como se escribe en el papel. */
const hoyPE = () => formatDateNumeric(new Date());

export default function CtpIngresosView({
  period,
  openGtf,
  onOpenConsumed,
  filtroRapido,
  recepcion,
}: {
  period: CtpPeriod;
  /** Puente inverso: GTF que el shell mandó a ingresar (abre el form pre-llenado). */
  openGtf?: string | null;
  onOpenConsumed?: () => void;
  /** Filtro pedido desde otra pestaña (tira de pendientes / Cumplimiento). */
  filtroRapido?: CtpFiltroRapido | null;
  /**
   * Con qué mitad del libro abre la vista (ADR-339): `pendiente` es la **bandeja
   * del patio** —lo que falta recibir— y `cerrada` el archivo de **GTF
   * ingresadas**. Sin valor, el listado completo de siempre.
   */
  recepcion?: "pendiente" | "cerrada";
}) {
  /* Corregir la recepción y acomodar trozas los firma admin o dueño (el servidor
     rechaza al resto). `null` = todavía no se sabe: se ofrece y el servidor decide,
     igual que en «Para poner al día» de la ficha del permiso. */
  const rolActual = useMiRol();
  const firma = rolActual == null || rolActual === "admin" || rolActual === "owner" || rolActual === "superadmin";
  // Cómo dejó la pestaña la última vez (orden + filtros; la búsqueda no).
  const prefs = usePrefsIniciales(recepcion ?? "todas");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 350);
  const [statusFilter, setStatusFilter] = useState<string>(prefs.statusFilter);
  const [facetas, setFacetas] = useState<CtpFacetasActivas>(prefs.facetas);
  /* Qué columnas de la tabla se ven (Brandon, 2026-09-08). Se recuerda por
     dispositivo, como en Producción. */
  /* 2026-09-25: clave `-v2` porque cambió el defecto; la elección hecha con la
     vieja se migra una vez (`migrarColumnasGuias`). */
  const [colsGuias, setColsGuias] = useColumnasGuias();
  /* El orden de las columnas, arrastrando los títulos (Brandon, 2026-09-26). */
  const ordenGuias = useOrdenColumnas(CLAVE_ORDEN_GUIAS, ORDEN_GUIAS_DEFECTO);
  /**
   * Los autofiltros de cabecera que no tenían otro control: documento, SNIFFS,
   * fechas, cantidad… (2026-09-26). No se recuerdan entre visitas, igual que
   * la búsqueda: un N° de guía tipeado ayer vacía la bandeja de hoy sin aviso.
   */
  const [colFiltros, setColFiltros] = useState<FiltrosColumnaIngresos>({});
  /**
   * El ARCHIVO se ordena por lo último RECIBIDO (ADR-351).
   *
   * Con el orden por fecha de la operación, una guía vieja recepcionada hoy caía
   * al fondo de la lista: el operador acababa de recibirla, entraba a «GTF
   * ingresadas» y no la veía. En la bandeja manda la fecha del asiento, que es
   * como se prioriza lo que falta recibir.
   */
  const [sort, setSort] = useState<CtpSort>(prefs.sort);
  const [page, setPage] = useState(0);
  /**
   * Por guía o por troza. Se recuerda por tenant: el que trabaja con inventario
   * de patio mira SIEMPRE por pieza, y volver a elegirlo cada vez es fricción.
   * Se lee en el inicializador y no en un efecto (un efecto que guarda corre
   * antes que uno que carga y pisa lo guardado).
   */
  const [modo, setModoState] = useState<"guia" | "troza">(() => {
    if (typeof window === "undefined") return "guia";
    try { return localStorage.getItem("ctp-ingresos-modo") === "troza" ? "troza" : "guia"; } catch { return "guia"; }
  });
  const setModo = useCallback((v: "guia" | "troza") => {
    setModoState(v);
    try { localStorage.setItem("ctp-ingresos-modo", v); } catch { /* quota */ }
  }, []);
  const [detail, setDetail] = useState<WoodEntry | null>(null);
  const [chainEntry, setChainEntry] = useState<WoodEntry | null>(null);
  const [editEntry, setEditEntry] = useState<WoodEntry | null>(null);
  /** Ingreso cuya GUÍA se está mirando como documento. */
  const [guiaEntry, setGuiaEntry] = useState<WoodEntry | null>(null);
  /** El papel de una GUÍA entera (ADR-348): su GTF y su lista de trozas. */
  const [docGuia, setDocGuia] = useState<GuiaIngreso<WoodEntry> | null>(null);
  /** Las piezas de una guía que van al modal de etiquetas QR (ADR-436). */
  const [etiquetasGuia, setEtiquetasGuia] = useState<{ ids: string[]; contexto: string } | null>(null);
  const [docsGuia, setDocsGuia] = useState<GuiaIngreso<WoodEntry> | null>(null);
  const [docTrozas, setDocTrozas] = useState<TrozaDeGuia[] | null>(null);
  /** La FICHA de la guía (ADR-350): se revisa y se recibe en el mismo lugar. */
  const [fichaGuia, setFichaGuia] = useState<GuiaIngreso<WoodEntry> | null>(null);
  /**
   * La guía a la que hay que ponerle precio, recién recepcionada (ADR-135).
   *
   * Se pregunta acá y no en la pestaña Rentabilidad porque acá es cuando la
   * factura del proveedor está sobre la mesa. Medido antes de esto: **0 % del
   * patio valorizado**, con la pantalla para cargarlo existiendo desde agosto.
   */
  const [costoGuia, setCostoGuia] = useState<GuiaACostear | null>(null);
  /** «Poner precio a la madera» en tanda (Opciones). */
  const [ponerPrecio, setPonerPrecio] = useState(false);
  const [fichaTrozas, setFichaTrozas] = useState<TrozaDeGuia[] | null>(null);
  const [fichaError, setFichaError] = useState<string | null>(null);
  /**
   * La planilla «Cubicar Oxapampa» (2026-09-26): desde la ficha se abre ENCIMA
   * de ella (`desdeFicha`); desde el menú de la guía, sola. `trozas: null` =
   * cargando.
   */
  const [cubicar, setCubicar] = useState<{ guia: GuiaIngreso<WoodEntry>; trozas: TrozaDeGuia[] | null; desdeFicha: boolean } | null>(null);
  /** «Acomodar trozas en su especie» (ADR-435): de la ficha (una guía) o de Opciones (todas). */
  const [acomodar, setAcomodar] = useState<{ alcance: AlcanceAcomodoCliente; descripcion: string; desdeFicha: boolean } | null>(null);
  /** La guía que se está CUADRANDO: declara un volumen y sus piezas suman otro (ADR-353). */
  const [cuadreGuia, setCuadreGuia] = useState<GuiaIngreso<WoodEntry> | null>(null);
  /** Recibir varias guías en un acto: el caso real son 10 esperando hace días. */
  const [bloqueAbierto, setBloqueAbierto] = useState(false);
  /** Las guías tildadas en la tabla con que se abre el bloque (claves); `null` = cerrado. */
  const [bloqueElegidas, setBloqueElegidas] = useState<string[] | null>(null);
  /** Corregir la fecha de llegada de guías ya recibidas (ADR-434); `inicial` = la fila desde la que se abrió. */
  const [corregirRecepcion, setCorregirRecepcion] = useState<{ inicial: string | null } | null>(null);
  const [guiaHoja, setGuiaHoja] = useState(0);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const { toasts, push: pushToast, dismiss: dismissToast } = useActionToasts();
  const [showDashboard, setShowDashboard] = useState(false);
  // Bandeja monte→planta: guía elegida para pre-cargar el form + key para refrescarla tras guardar.
  const [formGtf, setFormGtf] = useState<string | null>(null);
  const [formPreset, setFormPreset] = useState<WoodEntryPreset | undefined>(undefined);
  const [bandejaKey, setBandejaKey] = useState(0);
  /* ADR-442: la guía guardada antes del ingreso con la que se abre el alta, el
     modal de guías guardadas que está abierto y la llave que relee su bandeja. */
  const [guiaGuardadaForm, setGuiaGuardadaForm] = useState<GuiaGuardadaDetalle | null>(null);
  const [modalGuardadas, setModalGuardadas] = useState<ModalGuardadas>(null);
  const [guardadasKey, setGuardadasKey] = useState(0);
  /* La guía guardada que viene del Libro TH y se está recibiendo (28-09-2026). */
  const [recibirTh, setRecibirTh] = useState<{ id: string; gtfNumber: string } | null>(null);
  // Rechazo en lote: el motivo es obligatorio, así que se pide una vez para todos.
  const [bulkRejecting, setBulkRejecting] = useState(false);
  const [bulkReason, setBulkReason] = useState("");
  const [descargando, setDescargando] = useState(false);

  // El membrete de la guía es el del TITULAR, no el del aserradero: si el
  // directorio tiene su logo, el papel sale con él.
  const { logoDe } = useLogosTitulares();

  /** Legajo armado: un solo documento con las guías marcadas y su índice. */
  const [legajo, setLegajo] = useState<DocumentoImprimible[] | null>(null);
  const [armandoLegajo, setArmandoLegajo] = useState(false);
  /** Guías esperando irse al expediente (se archivan solas al validar). */
  const [colaArchivo, setColaArchivo] = useState<GuiaParaArchivar[]>([]);

  /* La bandeja arranca en lo que pidió la pestaña, pero se puede abrir a todo:
     un salto desde Cumplimiento («3 fuera de plazo») puede apuntar a guías ya
     recepcionadas, y llevar a una lista vacía sería peor que no saltar. */
  const [recepcionSel, setRecepcionSel] = useState<"pendiente" | "cerrada" | "">(recepcion ?? "");
  /**
   * El ARCHIVO («GTF ingresadas») no es la bandeja (ADR-357).
   *
   * Mostraba los mismos KPI y el mismo aviso de «guías del monte sin ingresar»
   * que Ingresos, fila por fila. Acá todo está recepcionado: lo que se pregunta
   * es cuánta madera bajó y cuántas piezas quedaron, no qué falta recibir.
   */
  const esArchivo = recepcion === "cerrada";
  useEffect(() => { setRecepcionSel(recepcion ?? ""); }, [recepcion]);

  const filtros = useMemo(
    () => ({ status: statusFilter, search, recepcion: recepcionSel, ...facetas,
      /* «Sin costo» (tarjeta o panel) gana sobre el «Con precio» de la cabecera: juntos darían cero. */
      columnas: facetas.sinCosto ? { ...colFiltros, conCosto: undefined } : colFiltros }),
    [statusFilter, search, recepcionSel, facetas, colFiltros],
  );

  useGuardarPrefs(useMemo(() => ({ statusFilter, facetas, sort }), [statusFilter, facetas, sort]), recepcion ?? "todas");

  const {
    entries,
    guias,
    lineas,
    stats,
    statsPrevios,
    etiquetaPrevio,
    total,
    loading,
    error,
    setError,
    reload,
    runAction,
    validateMany,
    recepcionarMany,
    rejectMany,
    fetchAllFiltered,
  } = useCtpIngresos({ period, filtros, sort, page });

  // Un filtro nuevo describe otro conjunto: la página 4 del anterior no existe.
  useEffect(() => {
    setPage(0);
    setSelectedIds([]);
  }, [search, statusFilter, facetas, colFiltros, period, sort, recepcionSel]);

  // Llegó desde un aviso ("2 fuera de plazo", "1 CITES sin permiso"): la lista
  // se abre mostrando ESOS casos. El filtro pedido reemplaza al que hubiera —
  // dos filtros superpuestos darían un vacío inexplicable.
  useEffect(() => {
    if (!filtroRapido) return;
    setSearchInput("");
    /* Y los de cabecera: un «Documento: 123» tipeado vaciaría el salto. */
    setColFiltros({});
    /* El salto manda: si la guía buscada ya se recepcionó, la bandeja la
       escondería y el click terminaría en una lista vacía. */
    setRecepcionSel("");
    if (filtroRapido.tipo === "pendiente") {
      setStatusFilter("pendiente");
      setFacetas({});
    } else if (filtroRapido.tipo === "fuera-de-plazo") {
      setStatusFilter("");
      setFacetas({ late: true });
    } else if (filtroRapido.tipo === "sin-origen") {
      setStatusFilter("");
      setFacetas({ sinOrigen: true });
    } else if (filtroRapido.tipo === "sin-pagar") {
      /* «3 guías sin pagar a Nelly» (ADR-437): las compras con algo pendiente. */
      setStatusFilter("");
      setFacetas({});
      setColFiltros({ pago: "sin-pagar" });
    } else {
      setStatusFilter("");
      setFacetas({ cites: true });
    }
  }, [filtroRapido]);

  // Puente inverso desde Títulos Habilitantes: abre el form con la guía elegida.
  /* Si esa guía ya está guardada en el CTP y viene del Libro TH, se abre
     «Recibir» (entra con sus trozas); si no, el alta de siempre con el N°. */
  useEffect(() => {
    if (!openGtf) return;
    const gtf = openGtf;
    // Consumir ya: el handoff no se repite aunque la búsqueda tarde.
    onOpenConsumed?.();
    void buscarGuiaGuardada(gtf).then((g) => {
      if (g?.libroTh?.recibible && !g.ingreso) {
        setRecibirTh({ id: g.id, gtfNumber: g.gtfNumber });
        return;
      }
      setFormGtf(gtf);
      setFormPreset(undefined);
      setShowForm(true);
    });
  }, [openGtf, onOpenConsumed]);

  /**
   * El legajo: portada con el índice + cada guía (y su lista) en hoja nueva.
   *
   * Va en el orden en que se ven en la tabla, no en el de los clics: el índice
   * y las hojas tienen que coincidir con lo que el operador está mirando.
   */
  const componerLegajo = useCallback((elegidos: WoodEntry[], acotado: number) => {
    if (elegidos.length === 0) return;

    const hoy = formatDateNumeric(new Date());
    const cuerpos: string[] = [
      portadaLegajo({
        titular: "Libro de Operaciones del CTP",
        subtitulo: "Centro de Transformación Primaria",
        periodo: period.label,
        emitidoEl: hoy,
        renglones: elegidos.map((e) => ({
          libroNro: e.libroNro,
          gtfNumber: e.gtfNumber,
          entryDate: e.entryDate,
          providerName: e.providerName,
          especie: e.speciesCommonName,
          volumenM3: e.volumeM3,
          piezas: e.pieces,
          estado: STATUS_META[e.status]?.label ?? e.status,
          conGuia: Boolean(e.serforGtf),
        })),
      }),
    ];

    for (const e of elegidos) {
      if (!e.serforGtf) continue; // sin ficha no hay guía que reproducir
      const g = e.serforGtf as unknown as GtfSerfor;
      cuerpos.push(documentoGtfSerfor(g, { impresoEl: hoy, logo: logoDe(e.providerName, e.providerDocument) }));
      const trozas = trozasDesdeSerfor(g);
      if (trozas.length > 0) {
        cuerpos.push(
          htmlListaTrozas({
            titular: g.titular ?? e.providerName,
            subtitulo: g.gtfNumber ? `Guía ${g.gtfNumber}` : undefined,
            ubicacion: [g.distrito, g.provincia, g.departamento].filter(Boolean).join(" · "),
            numero: g.listaTrozas ?? g.gtfNumber ?? "",
            guia: g.gtfNumber ?? undefined,
            fecha: fechaGtf(g.fechaExpedicion),
            trozas,
          }),
        );
      }
    }

    const conGuia = elegidos.filter((e) => e.serforGtf).length;
    setLegajo([
      {
        nombre: `Legajo · ${elegidos.length} ingreso(s)`,
        archivo: `Legajo CTP · ${period.label}`,
        etiqueta:
          `${conGuia} con guía adjunta · índice al frente` +
          (acotado > 0 ? ` · ${acotado} quedaron afuera` : ""),
        pieCorrido: `Legajo del Libro de Operaciones del CTP · ${elegidos.length} ingreso(s) · armado el ${hoy}`,
        html: documentoHtml({
          titulo: `Legajo CTP · ${period.label}`,
          css: CSS_LEGAJO + CSS_GTF_OFICIAL + CSS_GTF_SERFOR + CSS_LISTA_TROZAS,
          cuerpo: cuerpos,
          pieCorrido: `Legajo del Libro de Operaciones del CTP · ${elegidos.length} ingreso(s) · armado el ${hoy}`,
        }),
      },
    ]);
  }, [period, logoDe]);

  /**
   * Validar deja la guía en el expediente, sin que nadie apriete nada.
   *
   * Se dispara DESPUÉS de validar y no antes: si el libro rechaza el ingreso, no
   * tiene que quedar su papel archivado como si hubiera entrado. Y no bloquea —
   * el almacenero validó, que es lo que vino a hacer; el archivado avisa cuando
   * termina y, si falla, la guía se puede guardar a mano desde el visor.
   */
  const encolarArchivado = useCallback((elegidos: WoodEntry[]) => {
    const nuevas = elegidos.flatMap((e) => {
      const papeles = papelesDeIngreso(e, {
        impresoEl: hoyPE(),
        logo: logoDe(e.providerName, e.providerDocument),
      });
      if (!papeles) return []; // sin ficha de SERFOR no hay guía que archivar
      const hojas = [papeles.gtf, ...(papeles.lista ? [papeles.lista] : [])];
      return hojas.map((h) => ({
        clave: `${e.id}:${h.archivo}`,
        nombre: h.archivo,
        html: h.html,
        pieCorrido: h.pieCorrido,
        ...metaArchivado(e, h.nombre),
      }));
    });
    if (nuevas.length === 0) return;
    setColaArchivo((prev) => {
      const vistas = new Set(prev.map((c) => c.clave));
      return [...prev, ...nuevas.filter((n) => !vistas.has(n.clave))];
    });
  }, [logoDe]);

  /**
   * De dónde salen las guías del legajo:
   * · con filas marcadas → esas, en el orden de la tabla;
   * · sin marcar → TODO el filtro, que es lo que se pide para una fiscalización
   *   ("las del mes"), y que puede no estar en pantalla porque la lista pagina.
   *
   * El tope es real y se DICE: un legajo de 30 ingresos ya son ~90 hojas y un
   * PDF de decenas de MB. Recortar en silencio sería peor que no armarlo — el
   * que lo imprime creería que están todas.
   */
  const armarLegajo = useCallback(async () => {
    if (selectedIds.length > 0) {
      componerLegajo(entries.filter((e) => selectedIds.includes(e.id)), 0);
      return;
    }
    setArmandoLegajo(true);
    try {
      const { entries: todas } = await fetchAllFiltered();
      const acotado = Math.max(0, todas.length - LEGAJO_MAX);
      if (acotado > 0) {
        pushToast({
          tono: "warning",
          msg: `El legajo toma los primeros ${LEGAJO_MAX} ingresos`,
          detail: `El filtro tiene ${todas.length}: quedaron afuera ${acotado}. Filtra por mes o marca las que necesitas.`,
        });
      }
      componerLegajo(todas.slice(0, LEGAJO_MAX), acotado);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setArmandoLegajo(false);
    }
  }, [selectedIds, entries, componerLegajo, fetchAllFiltered, pushToast, setError]);

  const pendingIds = useMemo(
    () => entries.filter((e) => e.status === "pendiente").map((e) => e.id),
    [entries],
  );
  const selectedPending = useMemo(
    () => selectedIds.filter((id) => pendingIds.includes(id)),
    [selectedIds, pendingIds],
  );
  /* El motivo del rechazo en lote cuenta GUÍAS, como el resto de la barra
     (`CtpGuiasSeleccionBarra`): «2 guías» explica lo que el operador eligió
     —el papel—, no los 5 asientos que ese papel puede traer (dos especies en
     la misma GTF son dos asientos, ADR-346). */
  const guiasDelRechazo = useMemo(
    () => guias.filter((g) => g.lineas.some((l) => selectedPending.includes(l.id))).length,
    [guias, selectedPending],
  );

  // Atajos del teclado para la carga en tanda: el almacenero valida 20 guías
  // seguidas y soltar el mouse para cada una cuesta más que la validación.
  // Se apagan mientras se escribe (input/textarea/select o contenteditable) y
  // con cualquier modificador — Ctrl+N del navegador no se toca.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const t = ev.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return;
      // Con un modal abierto manda el modal (Escape lo cierra, no la vista).
      if (showForm || detail || chainEntry || editEntry) return;

      if (ev.key === "n" || ev.key === "N") {
        ev.preventDefault();
        setFormGtf(null);
        setFormPreset(undefined);
        setShowForm(true);
      } else if (ev.key === "/") {
        ev.preventDefault();
        document.getElementById("ctp-ing-search")?.focus();
      } else if (ev.key === "r" || ev.key === "R") {
        ev.preventDefault();
        void reload();
      } else if (ev.key === "v" || ev.key === "V") {
        // Validar lo seleccionado: sólo si hay selección, y sin confirmación
        // extra — validar es reversible (se anula con motivo).
        if (selectedPending.length === 0) return;
        ev.preventDefault();
        setBusy("bulk");
        void validateMany(selectedPending).then(() => {
          setSelectedIds([]);
          setBusy(null);
        });
      } else if (ev.key === "Escape") {
        setSelectedIds([]);
        setBulkRejecting(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showForm, detail, chainEntry, editEntry, selectedPending, reload, validateMany]);


  // Confirma el motivo: rechaza si el ingreso está pendiente, o ANULA si ya
  // estaba validado (corrección post-validación). Reusa el mismo input de motivo.
  async function reject(id: string) {
    const entry = entries.find((e) => e.id === id);
    const action = entry?.status === "validado" ? "annul" : "reject";
    setBusy(`${id}:reject`);
    await runAction(id, action, rejectReason.trim());
    setRejectingId(null);
    setRejectReason("");
    setBusy(null);
  }

  async function validate(id: string) {
    setBusy(`${id}:validate`);
    const e = entries.find((x) => x.id === id);
    await runAction(id, "validate");
    setBusy(null);
    if (e) encolarArchivado([e]);
  }

  /**
   * Las dos acciones que valen para el PAPEL entero (ADR-346).
   *
   * Una GTF de dos especies son dos asientos en el libro, pero el operador
   * recibió un documento: recepcionarlo dos veces era pedirle que tratara como
   * dos cosas lo que en el patio bajó de un solo camión.
   */
  async function validarGuia(guia: GuiaIngreso<WoodEntry>) {
    const ids = guia.lineas.filter((l) => l.status === "pendiente").map((l) => l.id);
    if (ids.length === 0) return;
    setBusy(`${guia.clave}:validate`);
    const fallaron = await validateMany(ids);
    setBusy(null);
    if (fallaron === 0) {
      pushToast({
        tono: "success",
        msg: `Guía ${guia.gtfNumber} validada`,
        detail: `${ids.length} asiento${ids.length === 1 ? "" : "s"} del libro`,
      });
      encolarArchivado(guia.lineas);
    }
  }

  async function recepcionarGuia(guia: GuiaIngreso<WoodEntry>): Promise<boolean> {
    const ids = guia.lineas.map((l) => l.id);
    setBusy(`${guia.clave}:recepcion`);
    const fallaron = await recepcionarMany(ids);
    setBusy(null);
    if (fallaron > 0) return false;
    pushToast({
      tono: "success",
      msg: `Guía ${guia.gtfNumber} recepcionada`,
      detail:
        "Está arriba de todo en «GTF ingresadas», y sus piezas ya se pueden llevar a la sierra desde Consumos.",
    });
    encolarArchivado(guia.lineas);
    /* Sólo si TODA la guía espera costo: preguntar por algo ya contestado es
       ruido, y el operador aprende a cerrar el modal sin leerlo. Una guía de
       madera de servicio no lo espera nunca (ADR-437). */
    if (guia.lineas.length > 0 && guia.lineas.every((l) => esSinCosto(l))) setCostoGuia(costeableDeGuia(guia));
    return true;
  }

  /**
   * La plata de la guía se guarda DENTRO del modal con un solo `PUT` (ADR-437):
   * antes eran N PATCH sueltos y una falla a la mitad dejaba media factura.
   * Acá sólo se relee la bandeja cuando algo se escribió.
   */
  function alGuardarPlata(mensaje: string) {
    invalidarCtp("wood-entries");
    void reload();
    pushToast({ tono: "success", msg: mensaje });
  }

  /**
   * Qué pasó con la tanda, dicho por guía.
   *
   * «Fallaron 2» no sirve para nada parado en el patio: hay que poder ir a
   * buscar CUÁLES. Por eso el resultado nombra las guías y separa las que se
   * recibieron pero quedaron sin costo — ésas ya están en el libro y su plata
   * se carga desde su propia fila.
   */
  function avisarDelBloque(r: ResultadoBloque) {
    if (r.recibidas.length > 0) {
      pushToast({
        tono: "success",
        msg: `${r.recibidas.length} guía${r.recibidas.length === 1 ? "" : "s"} recibida${r.recibidas.length === 1 ? "" : "s"}`,
        detail: "Sus trozas quedaron fechadas: ya se pueden llevar a la sierra desde Consumos.",
      });
    }
    if (r.fallaron.length > 0) {
      pushToast({
        tono: "error",
        msg: `${r.fallaron.length} no ${r.fallaron.length === 1 ? "entró" : "entraron"}`,
        detail: r.fallaron.map((f) => `${f.gtfNumber}: ${f.motivo}`).join(" · "),
      });
    }
    if (r.sinCosto.length > 0) {
      pushToast({
        tono: "warning",
        msg: `${r.sinCosto.length} quedó sin costo`,
        detail: `${r.sinCosto.map((f) => f.gtfNumber).join(", ")} — se recibieron igual; carga la plata desde «⋯ → Cargar lo que costó».`,
      });
    }
  }

  /**
   * Las piezas de todos los asientos de la guía — las usan la ficha (ADR-350) y
   * el papel (ADR-348). Se piden al abrir y no en el listado: son de la lista de
   * trozas y sólo hacen falta ahí.
   */
  const piezasDeGuia = useCallback(async (guia: GuiaIngreso<WoodEntry>): Promise<TrozaDeGuia[]> => {
    const listas = await Promise.all(
      guia.lineas.map((l) =>
        ctpGet<{ trozas?: TrozaDeGuia[] }>(
          `/api/admin/forestal/trozas?woodEntryId=${encodeURIComponent(l.id)}`,
        /* Cada pieza sabe de qué fila vino (ADR-435): el endpoint no manda
           `woodEntryId`, y sin él la ficha no puede contar las trozas de cada
           especie ni marcar las que cuelgan de la fila de otra. */
        ).then((r) => (r.trozas ?? []).map((t) => ({ ...t, woodEntryId: l.id }))),
      ),
    );
    return listas.flat();
  }, []);

  /** Abre la ficha y pide sus piezas. La ficha se ve aunque las piezas fallen. */
  const verFicha = useCallback(async (guia: GuiaIngreso<WoodEntry>) => {
    setFichaGuia(guia);
    setFichaTrozas(null);
    setFichaError(null);
    try {
      setFichaTrozas(await piezasDeGuia(guia));
    } catch (err) {
      logger.warn("[ingresos] no se pudieron leer las piezas de la ficha", { error: String(err) });
      setFichaTrozas([]);
    }
  }, [piezasDeGuia]);

  const verDocumento = useCallback(async (guia: GuiaIngreso<WoodEntry>) => {
    setDocGuia(guia);
    setDocTrozas(null);
    setGuiaHoja(0);
    try {
      setDocTrozas(await piezasDeGuia(guia));
    } catch (err) {
      /* Sin piezas el papel sale igual: la GTF no depende de la lista, y decir
         «no pude leer las trozas» es mejor que no abrir nada. */
      logger.warn("[ingresos] no se pudieron leer las piezas de la guía", { error: String(err) });
      setDocTrozas([]);
    }
  }, [piezasDeGuia]);

  /**
   * Etiquetas QR de las trozas de esta guía que HOY siguen en el patio
   * (ADR-436). Se pide el patio entero y se filtra por GTF en vez de traer
   * las piezas del ingreso: así la etiqueta refleja el estado de VERDAD
   * —consumida, despachada, sin recepcionar— y no lo que la guía declaró.
   */
  const imprimirEtiquetasDeGuia = useCallback(async (guia: GuiaIngreso<WoodEntry>) => {
    try {
      const r = await fetch("/api/admin/forestal/trozas/patio", { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { trozas?: TrozaConsumible[] };
      const deLaGuia = (j.trozas ?? []).filter((t) => t.gtfNumber === guia.gtfNumber);
      if (deLaGuia.length === 0) {
        pushToast({ tono: "warning", msg: "Sin trozas en el patio", detail: `La guía ${guia.gtfNumber} no tiene piezas cargadas en el patio.` });
        return;
      }
      /* El modal dice cuántas siguen en el patio, cuáles ya tienen etiqueta y
         cuáles no tienen código, y deja elegir el formato antes de imprimir. */
      setEtiquetasGuia({ ids: deLaGuia.map((t) => t.id), contexto: `Guía ${guia.gtfNumber}` });
    } catch (err) {
      pushToast({ tono: "error", msg: "No se pudieron generar las etiquetas", detail: err instanceof Error ? err.message : String(err) });
    }
  }, [pushToast]);

  /** Abre «Cubicar Oxapampa»; si no vienen las piezas (desde el menú), las pide. */
  const abrirCubicar = useCallback(
    async (guia: GuiaIngreso<WoodEntry>, desdeFicha: boolean, ya?: TrozaDeGuia[] | null) => {
      setCubicar({ guia, trozas: ya ?? null, desdeFicha });
      if (ya) return;
      try {
        const trozas = await piezasDeGuia(guia);
        setCubicar((c) => (c && c.guia.clave === guia.clave ? { ...c, trozas } : c));
      } catch (err) {
        setCubicar(null);
        pushToast({ tono: "error", msg: "No se pudieron leer las trozas", detail: err instanceof Error ? err.message : String(err) });
      }
    },
    [piezasDeGuia, pushToast],
  );

  /**
   * Después de guardar medidas: la planilla y la ficha de atrás releen las
   * piezas (el PATCH ya invalidó el caché de trozas). La planilla no pisa lo
   * tipeado: sólo toma el código y las medidas de la guía para mostrar.
   */
  const releerCubicada = useCallback(
    (guia: GuiaIngreso<WoodEntry>) => {
      piezasDeGuia(guia)
        .then((trozas) => {
          setCubicar((c) => (c && c.guia.clave === guia.clave ? { ...c, trozas } : c));
          if (fichaGuia?.clave === guia.clave) setFichaTrozas(trozas);
        })
        .catch((err) => logger.warn("[ingresos] no se pudieron releer las piezas cubicadas", { error: String(err) }));
    },
    [piezasDeGuia, fichaGuia],
  );

  /** Duplicar: abre el form con lo que se repite; GTF y volumen quedan vacíos. */
  const duplicar = useCallback((e: WoodEntry) => {
    setFormGtf(null);
    setFormPreset({
      providerName: e.providerName,
      providerDocument: e.providerDocument,
      providerDocumentType: e.providerDocumentType,
      originType: e.originType,
      originCode: e.originCode,
      originRegion: e.originRegion,
      originDistrict: e.originDistrict,
      speciesCommonName: e.speciesCommonName,
      productType: e.productType,
    });
    setShowForm(true);
  }, []);

  /** Ordenar: mismo campo alterna dirección; campo nuevo arranca descendente
   *  (lo más nuevo / lo más grande primero es lo que se busca el 90% de veces). */
  const ordenar = useCallback((field: CtpSortField) => {
    setSort((prev) => (prev.by === field ? { by: field, dir: prev.dir === "asc" ? "desc" : "asc" } : { by: field, dir: "desc" }));
  }, []);

  async function descargar() {
    setDescargando(true);
    try {
      const { entries: todos, truncated } = await fetchAllFiltered();
      const csv = ingresosACsv(todos, {
        origenLabel: originLabel,
        productoLabel: productLabel,
        estadoLabel: (s) => STATUS_META[s as keyof typeof STATUS_META]?.label ?? s,
      });
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombreArchivoIngresos(period.label, statusFilter || unFiltro(facetas.provider) || unFiltro(facetas.species));
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      pushToast({
        tono: truncated ? "warning" : "success",
        msg: truncated ? `Descargados los primeros ${CTP_EXPORT_MAX}` : `${todos.length} ingresos descargados`,
        detail: truncated
          ? `El filtro tiene más de ${CTP_EXPORT_MAX} registros. Acota el período para bajar el resto.`
          : "Se abre en Excel con las columnas ya separadas.",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDescargando(false);
    }
  }

  const hayFiltro = Boolean(
    statusFilter || search ||
    [facetas.species, facetas.provider, facetas.product, facetas.permiso].some((v) => listaDe(v).length > 0) ||
    facetas.cites !== undefined || facetas.late || facetas.sinOrigen || facetas.sinCosto ||
    hayFiltroDeColumna(colFiltros),
  );
  /** Qué está filtrando, con nombre: el vacío tiene que poder explicarse. */
  const filtrosActivos = useMemo(
    () =>
      [
        statusFilter ? `estado «${STATUS_META[statusFilter as keyof typeof STATUS_META]?.label ?? statusFilter}»` : "",
        search ? `búsqueda «${search}»` : "",
        textoDeFiltro("especie", facetas.species),
        textoDeFiltro("proveedor", facetas.provider),
        textoDeFiltro("producto", facetas.product, productLabel),
        textoDeFiltro("permiso", facetas.permiso),
        facetas.cites !== undefined ? (facetas.cites ? "sólo CITES" : "sin CITES") : "",
        facetas.late ? "fuera de plazo" : "",
        facetas.sinOrigen ? "sin código de origen" : "",
        facetas.sinCosto ? "sin costo" : "",
        ...textosDeFiltrosColumna(filtros.columnas),
      ].filter(Boolean),
    [statusFilter, search, facetas, filtros.columnas],
  );
  /**
   * Los campos de la fila de filtros del ARCHIVO (ADR-400).
   *
   * Se arman acá y no adentro de `CtpGtfIngresadasKpis` porque ese componente
   * cuenta guías y no sabe de facetas ni de `stats` — y son EXACTAMENTE los de
   * la bandeja: el mismo helper, para que no haya dos listas que mantener.
   */
  const camposArchivo = useMemo(
    () => camposDeIngresos({ stats, facetas, onFacetas: setFacetas, productLabel }),
    [stats, facetas],
  );

  /**
   * Las guías EN PANTALLA a las que todavía les falta recibir madera.
   *
   * Es lo que gobierna el aviso y el bloque. Se calcula sobre lo que se ve —no
   * sobre todo el período— para que el número del aviso y las filas de abajo
   * nunca digan cosas distintas; si hay más, se llega paginando o filtrando.
   */
  /* ADR-438: el «3/6 docs» de las guías en pantalla, en UN pedido, y el modal. */
  const conteoDocs = useConteoDocumentosGuias(guias.map((g) => g.gtfNumber));
  const ctxDocs = useMemo(() => ({ llenos: conteoDocs.llenos, abrir: setDocsGuia }), [conteoDocs.llenos]);

  /* ADR-442: «Ingresar» una guía guardada abre el alta ya llena con ella (el
     formulario necesita la ficha: si la lista no la trae, se pide). */
  /* Cada «Ingresar» numera su pedido: si mientras llegaba el detalle se abrió
     otra alta («Nuevo ingreso», tecla N), la respuesta tardía se descarta en
     vez de pisar lo que ya se está escribiendo. */
  const turnoIngresar = useRef(0);
  const showFormRef = useRef(showForm);
  useEffect(() => {
    showFormRef.current = showForm;
  }, [showForm]);
  const ingresarGuardada = useCallback(
    async (g: GuiaGuardadaVista | GuiaGuardadaDetalle) => {
      /* La guía viene del Libro TH: «Recibir» la registra con sus trozas. */
      if (g.libroTh?.recibible && !g.ingreso) {
        setModalGuardadas(null);
        setRecibirTh({ id: g.id, gtfNumber: g.gtfNumber });
        return;
      }
      const mio = ++turnoIngresar.current;
      const det = await detalleDeGuia(g);
      if (mio !== turnoIngresar.current || showFormRef.current) return;
      if (!det) {
        pushToast({ tono: "error", msg: "No se pudo leer la guía guardada", detail: "Prueba de nuevo en un momento." });
        return;
      }
      setModalGuardadas(null);
      setFormGtf(null);
      setFormPreset(undefined);
      setGuiaGuardadaForm(det);
      setShowForm(true);
    },
    [pushToast],
  );
  const porRecibir = useMemo(() => guias.filter((g) => faltaRecibirMadera(g)), [guias]);
  /** Las guías EN PANTALLA que ya se recibieron: las que se pueden corregir (ADR-434). */
  const recibidas = useMemo(() => guias.filter((g) => yaRecibida(g)), [guias]);
  const gtfsRecibidas = useMemo(() => recibidas.map((g) => g.gtfNumber), [recibidas]);
  /* ADR-434 §Vencimiento: las que figuran recibidas con la guía ya vencida, y
     las por recibir cuya guía ya venció. La MISMA regla que el chip de la fila. */
  const vencidas = useMemo(() => {
    const hoy = limaDateKey();
    return {
      recibidas: recibidas.filter((g) => estadoDeVencimiento(g, hoy)?.tipo === "recibida_vencida").map((g) => g.gtfNumber),
      porRecibir: porRecibir.filter((g) => estadoDeVencimiento(g, hoy)?.tipo === "vencida_sin_recibir").length,
    };
  }, [recibidas, porRecibir]);

  /** Saca TODO lo que filtra. El período no: ése se ve arriba y es otra decisión. */
  const limpiarFiltros = useCallback(() => {
    setStatusFilter("");
    setSearchInput("");
    setFacetas({});
    setColFiltros({});
  }, []);

  /**
   * La barra de acciones de la vista (buscador · Filtros · Opciones · Nuevo
   * ingreso), armada UNA vez y pasada como `acciones` al botón «Indicadores»
   * (Brandon, 2026-09-24: «alineado con otros botones... para evitar que
   * ocupe mucho espacio»). Antes vivía en su propia fila debajo de los KPIs;
   * ahora comparte fila con el botón que los pliega.
   */
  /** Lo que necesitan los autofiltros de cabecera: la tabla y el panel del celular los arman igual. */
  const argsCabecera = {
    col: colFiltros,
    setCol: setColFiltros,
    statusFilter,
    setStatusFilter,
    recepcionSel,
    setRecepcionSel,
    facetas,
    setFacetas,
    stats,
  };
  const barraFiltros = (boton: React.ReactNode) => (
    <CtpIngresosFiltros
      antes={boton}
      /* Dos lecturas del MISMO registro: por guía (lo que declara el papel) o
         por troza (una fila por pieza). Viaja con los chips de estado — antes
         tenía su propia fila con un texto que repetía el nombre del botón. */
      /* Qué columnas de la tabla se ven — sólo en la lista por guía, que es
         la que tiene columnas opcionales. */
      columnas={
        modo === "guia" ? (
          /* Sólo con tabla (≥640 px): en el celular cada guía es una tarjeta
             que muestra todo igual, y el desplegable abría cortado a la
             izquierda (x=−25 a 400 px, 2026-09-25) para elegir algo que ahí
             no cambia nada. */
          <div className="flex items-center gap-1 max-sm:hidden">
            <ColumnasMenu columnas={COLUMNAS_GUIAS_OPCIONALES} visibles={colsGuias} onChange={setColsGuias} className="h-9 rounded-full" />
            <BotonRestablecerColumnas cambiado={ordenGuias.cambiado} onRestablecer={ordenGuias.restablecer} />
          </div>
        ) : undefined
      }
      modoLista={
        <div role="radiogroup" aria-label="Cómo listar los ingresos" className="inline-flex items-center gap-0.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-0.5">
          {([
            { v: "guia", label: "Por guía", hint: "Una fila por documento de ingreso" },
            { v: "troza", label: "Por troza", hint: "Una fila por pieza, con su código y sus tres dimensiones" },
          ] as const).map((o) => (
            <button
              key={o.v}
              type="button"
              role="radio"
              aria-checked={modo === o.v}
              title={o.hint}
              onClick={() => setModo(o.v)}
              className={`inline-flex h-8 items-center rounded-full px-3 text-sm font-bold transition-colors ${modo === o.v
                ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      }
      searchInput={searchInput}
      onSearch={setSearchInput}
      statusFilter={statusFilter}
      onStatus={setStatusFilter}
      facetas={facetas}
      onFacetas={setFacetas}
      enCabecera={modo === "guia"}
      /* En el celular la tabla por guía es una pila de tarjetas: sus
         autofiltros de cabecera se ofrecen dentro de «Filtros». */
      filtrosMovil={modo === "guia" ? filtrosDeCabeceraGuiasMovil(argsCabecera) : undefined}
      /* Recepción no cuenta: la pone también «Por recepcionar / Todas» de arriba,
         y quitarla desde acá dejaría ese selector diciendo otra cosa. */
      hayFiltroMovil={hayFiltroDeColumna(colFiltros) || !!facetas.sinCosto}
      onLimpiarMovil={() => {
        setColFiltros({});
        setFacetas((f) => ({ ...f, sinCosto: undefined }));
      }}
      stats={stats}
      loading={loading}
      dashboardOn={showDashboard}
      onDashboard={() => setShowDashboard((v) => !v)}
      onReload={() => void reload()}
      onNuevo={() => { setFormGtf(null); setFormPreset(undefined); setGuiaGuardadaForm(null); setShowForm(true); }}
      onGuardarGuia={() => setModalGuardadas({ tipo: "guia", id: null })}
      onGuiasGuardadas={() => setModalGuardadas({ tipo: "lista" })}
      onDescargar={() => void descargar()}
      descargando={descargando}
      totalFiltrado={total}
      onLegajo={() => void armarLegajo()}
      onAcomodar={firma ? () => setAcomodar({ alcance: { todas: true }, descripcion: "Todas las guías de varias especies", desdeFicha: false }) : undefined}
      legajoCount={selectedIds.length || total}
      legajoDeTodo={selectedIds.length === 0}
      armandoLegajo={armandoLegajo}
      onPonerPrecio={() => setPonerPrecio(true)}
    />
  );

  return (
    <div className="space-y-3">
      {/* La bandeja se puede abrir a todo el libro sin cambiar de pestaña: el
          operador que busca «esa guía que ya recibí» no tiene por qué saber en
          cuál de las dos vistas quedó (ADR-339). */}
      {recepcion === "pendiente" && (
        <div className="flex flex-wrap items-center gap-2">
          <ChipRecepcion activo={recepcionSel === "pendiente"} onClick={() => setRecepcionSel("pendiente")}>
            Por recepcionar
          </ChipRecepcion>
          <ChipRecepcion activo={recepcionSel === ""} onClick={() => setRecepcionSel("")}>
            Todas las del período
          </ChipRecepcion>
          {/* El detalle va como tooltip: explicaba en un renglón entero lo que
              el propio chip ya dice, y ese renglón se paga en TODAS las cargas. */}
          <span
            className="text-sm text-[var(--text-tertiary)]"
            title={
              recepcionSel === "pendiente"
                ? "Al recepcionarlas pasan a «GTF ingresadas» y sus piezas quedan disponibles para la sierra."
                : "Incluye las ya recepcionadas."
            }
          >
            {recepcionSel === "pendiente" ? "Llegaron y falta recibirlas." : "También las ya recepcionadas."}
          </span>
        </div>
      )}

      {/* El ARCHIVO tiene sus propios números (ADR-357): «Pendientes validar» y
          «Fuera de plazo» son siempre 0 acá —todo está recepcionado— y una fila
          de KPI que nunca dice nada enseña a no mirarla. */}
      {esArchivo ? (
        <CtpGtfIngresadasKpis
          guias={guias}
          lateOn={facetas.late === true}
          onLate={() => setFacetas((f) => ({ ...f, late: f.late ? undefined : true }))}
          /* La misma fila que la bandeja (ADR-400): el archivo se filtra con los
             mismos parámetros de servidor, así que comparte la definición. */
          filtrosActivos={camposArchivo.filter((c) => c.valor).length}
          filtros={
            <CtpKpiFiltros
              campos={camposArchivo}
              onLimpiar={() =>
                setFacetas((f) => ({ ...f, species: undefined, permiso: undefined, provider: undefined, product: undefined }))
              }
              nota={notaDeFiltros(camposArchivo)}
            />
          }
          acciones={barraFiltros}
        />
      ) : (
      <CtpIngresosKpis
        stats={stats}
        /* Los mismos agregados una ventana atrás: sin esto «15.17 m³» es un
           número que nadie puede juzgar. */
        statsPrevios={statsPrevios}
        etiquetaPrevio={etiquetaPrevio}
        statusFilter={statusFilter}
        citesOn={facetas.cites === true}
        lateOn={facetas.late === true}
        onStatus={setStatusFilter}
        onCites={() => setFacetas((f) => ({ ...f, cites: f.cites === true ? undefined : true }))}
        onLate={() => setFacetas((f) => ({ ...f, late: f.late ? undefined : true }))}
        onVolumen={() => setShowDashboard((v) => !v)}
        dashboardOn={showDashboard}
        sinOrigenOn={facetas.sinOrigen === true}
        onSinOrigen={() => setFacetas((f) => ({ ...f, sinOrigen: f.sinOrigen ? undefined : true }))}
        sinCostoOn={facetas.sinCosto === true}
        onSinCosto={() => {
          /* «Sin costo» y el «Con precio» de la cabecera se excluyen: los dos
             juntos dan cero filas y la cabecera seguiría diciendo «Con precio». */
          setFacetas((f) => ({ ...f, sinCosto: f.sinCosto ? undefined : true }));
          setColFiltros((f) => ({ ...f, conCosto: undefined }));
        }}
        /* El período completo, para dibujar el ritmo diario con los días vacíos. */
        period={period}
        /* Los mismos filtros que recortan la tabla gobiernan las cifras
           (ADR-400): el servidor calcula los agregados con ese mismo `where`. */
        facetas={facetas}
        onFacetas={setFacetas}
        acciones={barraFiltros}
      />
      )}

      {showDashboard && <SpeciesAggregateChart period={period} />}

      {/* Puente monte→planta: guías emitidas en Títulos Habilitantes sin ingresar. */}
      {!esArchivo && (
      <CtpGuiasBandeja key={bandejaKey} onIngresar={(n) => { setFormPreset(undefined); setGuiaGuardadaForm(null); setFormGtf(n); setShowForm(true); }} />
      )}

      {/* ADR-442: las guías guardadas antes de que llegue la madera, esperando su ingreso. */}
      {!esArchivo && (
        <CtpGuiasGuardadasBandeja
          recargarKey={guardadasKey}
          onAbrir={(g) => setModalGuardadas({ tipo: "guia", id: g.id, inicial: g })}
          onDocumentos={(g) => setModalGuardadas({ tipo: "docs", guia: g })}
          onIngresar={(g) => void ingresarGuardada(g)}
          onVerTodas={() => setModalGuardadas({ tipo: "lista" })}
        />
      )}

      {/* La madera que bajó pero que el libro todavía no fechó. No es un error:
          es trabajo esperando, y hasta que se haga esas trozas NO aparecen en
          Consumos para llevarlas a la sierra. */}
      {porRecibir.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 p-3">
          <PackageCheck className="h-5 w-5 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden />
          <p className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm text-[var(--text-secondary)]">
            <b className="text-[var(--text-primary)]">
              {porRecibir.length} guía{porRecibir.length === 1 ? "" : "s"} sin recibir
            </b>{" "}
            en pantalla ·{" "}
            <span className="font-mono tabular-nums">
              {porRecibir.reduce((a, g) => a + Math.max(0, g.trozasCount - g.trozasDecididas), 0)} trozas
            </span>{" "}
            sin fechar
            {vencidas.porRecibir > 0 && (
              <b className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                {" "}· {vencidas.porRecibir} con la guía ya vencida
              </b>
            )}
            .
            <InfoTip icono="ayuda" title="Guías sin recibir" what="Hasta que se reciban, esa madera no aparece en Consumos." />
          </p>
          <button
            type="button"
            onClick={() => setBloqueAbierto(true)}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white transition-opacity hover:opacity-90"
          >
            <PackageCheck className="h-4 w-4" aria-hidden /> Recibir en bloque
          </button>
        </div>
      )}

      {/* ADR-434: recibidas después de que la sierra ya cortaba su permiso. */}
      <CtpAvisoLlegadaTardia
        gtfs={gtfsRecibidas}
        vencidas={vencidas.recibidas}
        onCorregir={() => setCorregirRecepcion({ inicial: null })}
      />

      {error && (
        <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="text-sm">
            <strong>Error:</strong> {error}
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto shrink-0 text-xs font-bold underline opacity-70 hover:opacity-100"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* UN tilde para recibir, validar y rechazar (2026-09-26): recepcionar
          abre el bloque ya marcado, con la fecha de cada guía y sus avisos. */}
      <CtpGuiasSeleccionBarra
        guias={guias}
        selectedIds={selectedIds}
        busy={busy === "bulk"}
        onSeleccionarTodas={(ids) => setSelectedIds((prev) => [...new Set([...prev, ...ids])])}
        onLimpiar={() => { setSelectedIds([]); setBulkRejecting(false); }}
        onRecepcionar={(claves) => setBloqueElegidas(claves)}
        onValidar={async (ids) => {
          setBusy("bulk");
          const marcados = entries.filter((e) => ids.includes(e.id));
          await validateMany(ids);
          setSelectedIds([]);
          setBusy(null);
          encolarArchivado(marcados);
        }}
        /* No dispara nada todavía: rechazar exige motivo, y un lote sin
           motivo es un rechazo que después nadie puede explicar. */
        onRechazar={() => { setBulkRejecting(true); setBulkReason(""); }}
      />

      {bulkRejecting && selectedPending.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] p-3 dark:bg-[var(--data-error-500)]/12">
          <label htmlFor="ctp-bulk-reason" className="text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            Motivo del rechazo de {guiasDelRechazo} guía{guiasDelRechazo === 1 ? "" : "s"}
            {" "}({selectedPending.length} asiento{selectedPending.length === 1 ? "" : "s"}):
          </label>
          <input
            id="ctp-bulk-reason"
            type="text"
            value={bulkReason}
            onChange={(e) => setBulkReason(e.target.value)}
            placeholder="Ej: volumen no coincide con la guía (mín. 3 caracteres)"
            className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--data-error-500)]"
            // eslint-disable-next-line jsx-a11y/no-autofocus -- único campo del motivo de rechazo masivo, foco intencional
            autoFocus
          />
          <button
            type="button"
            disabled={bulkReason.trim().length < 3 || busy === "bulk"}
            onClick={async () => {
              setBusy("bulk");
              await rejectMany(selectedPending, bulkReason.trim());
              setSelectedIds([]);
              setBulkRejecting(false);
              setBulkReason("");
              setBusy(null);
            }}
            className="inline-flex h-10 items-center rounded-xl bg-[var(--data-error-600)] px-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            Confirmar rechazo
          </button>
          <button
            type="button"
            onClick={() => setBulkRejecting(false)}
            className="inline-flex h-10 items-center rounded-xl border border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--text-primary)]"
          >
            Cancelar
          </button>
        </div>
      )}

      {modo === "troza" ? (
        <CtpTrozasIndividuales period={period} />
      ) : (
      <DocumentosGuiaProvider value={ctxDocs}>
      <CtpGuiasTable
        guias={guias}
        /* Autofiltros de cabecera: mismo `facetas` que el panel (dos lugares, un filtro). */
        filtrosColumna={{
          provider: {
            value: facetas.provider,
            options: stats?.providers ?? [],
            onChange: (v) => setFacetas((f) => ({ ...f, provider: v.length > 0 ? v : undefined })),
          },
          species: {
            value: facetas.species,
            options: stats?.species ?? [],
            onChange: (v) => setFacetas((f) => ({ ...f, species: v.length > 0 ? v : undefined })),
            placeholder: "Todas",
          },
          /* El permiso, etiquetado con su resolución y su proveedor (Brandon,
             2026-09-08): el código suelto no alcanza para elegir, y ahora que
             salió de la celda del proveedor tiene que traerse esa información
             consigo. */
          permiso: {
            value: facetas.permiso,
            options: stats?.permisos ?? [],
            onChange: (v) => setFacetas((f) => ({ ...f, permiso: v.length > 0 ? v : undefined })),
            etiqueta: etiquetaDePermiso(stats),
          },
        }}
        cols={colsGuias}
        ordenCols={ordenGuias}
        filtrosCabecera={filtrosDeCabeceraGuias(argsCabecera)}
        loading={loading}
        period={period}
        filtered={hayFiltro}
        filtrosActivos={filtrosActivos}
        onLimpiarFiltros={limpiarFiltros}
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        busy={busy}
        rejectingId={rejectingId}
        rejectReason={rejectReason}
        setRejectReason={setRejectReason}
        onStartReject={(id) => {
          setRejectingId(id);
          setRejectReason("");
        }}
        onCancelReject={() => {
          setRejectingId(null);
          setRejectReason("");
        }}
        onConfirmReject={reject}
        onValidate={validate}
        onValidarGuia={(g) => void validarGuia(g)}
        onRecepcionarGuia={(g) => void recepcionarGuia(g)}
        onDetail={setDetail}
        onChain={setChainEntry}
        onDuplicate={duplicar}
        onEdit={setEditEntry}
        onVerGuia={setGuiaEntry}
        onVerDocumento={(g) => void verDocumento(g)}
        onVerFicha={(g) => void verFicha(g)}
        onCuadrar={setCuadreGuia}
        onCostear={(g) => setCostoGuia(costeableDeGuia(g))}
        onCorregirRecepcion={firma ? (g) => setCorregirRecepcion({ inicial: g.clave }) : undefined}
        /* ADR-435 desde la fila o la tarjeta: sólo ESTA guía, sin pasar por la ficha. */
        onAcomodar={firma ? (g) => setAcomodar({ alcance: { woodEntryId: g.lineas[0]!.id }, descripcion: `Guía ${g.gtfNumber}`, desdeFicha: false }) : undefined}
        onImprimirEtiquetas={(g) => void imprimirEtiquetasDeGuia(g)}
        onCubicarOxapampa={(g) => void abrirCubicar(g, false)}
        sort={sort}
        onSort={ordenar}
      />
      </DocumentosGuiaProvider>
      )}

      <CtpIngresosPaginacion
        total={total}
        page={page}
        pageSize={CTP_PAGE_SIZE}
        loading={loading}
        onPage={setPage}
        sustantivo={total === 1 ? "guía" : "guías"}
        detalle={lineas > total ? `${lineas} asientos del libro` : undefined}
      />

      {recibirTh && (
        <CtpRecibirGuiaThModal
          guardadaId={recibirTh.id}
          gtfNumber={recibirTh.gtfNumber}
          onClose={() => setRecibirTh(null)}
          onRecibida={(r) => {
            setRecibirTh(null);
            setBandejaKey((k) => k + 1);
            setGuardadasKey((k) => k + 1); // la guardada pasa a «ya ingresada»
            void conteoDocs.refrescar();
            void reload();
            const ingresos = r.ingresos.length === 1 ? "1 ingreso" : `${r.ingresos.length} ingresos`;
            if (r.recibida) {
              pushToast({
                tono: "success",
                msg: `Guía ${recibirTh.gtfNumber} recibida`,
                detail: `${ingresos} con ${r.trozas} trozas · ${fmtM3(r.totalM3)} m³.`,
              });
            } else {
              pushToast({
                tono: "warning",
                msg: `Guía ${recibirTh.gtfNumber} registrada, falta recibirla`,
                detail: r.motivoSinRecibir ?? "Recíbela desde la tabla de Ingresos.",
              });
            }
          }}
        />
      )}

      {showForm && (
        <WoodEntryForm
          initialGtfNumber={formGtf ?? undefined}
          preset={formPreset}
          guiaGuardada={guiaGuardadaForm}
          onClose={() => { setShowForm(false); setFormGtf(null); setFormPreset(undefined); setGuiaGuardadaForm(null); }}
          onSaved={(o) => {
            setShowForm(false);
            setFormGtf(null);
            setFormPreset(undefined);
            setGuiaGuardadaForm(null);
            setBandejaKey((k) => k + 1); // la guía ingresada sale de la bandeja
            setGuardadasKey((k) => k + 1); // y la guardada pasa a «ya ingresada»
            void conteoDocs.refrescar(); // sus papeles ya cuentan en la fila nueva
            void reload();
            // Sin señal el ingreso NO está en el libro: decirlo, no dar por guardado.
            if (o?.offline) {
              pushToast({
                tono: "warning",
                msg: "Sin señal: quedó anotado en el patio",
                detail: "El ingreso todavía NO está en el libro. Sube solo cuando vuelva la conexión.",
              });
            }
            /* El ingreso entró y sus campos personalizados no (ADR-427). El
               aviso se muestra ACÁ y no en el modal: el modal ya se cerró y su
               mensaje se iría con él. */
            if (o?.camposAviso) {
              pushToast({
                tono: "warning",
                msg: "El ingreso entró; sus campos propios no",
                detail: o.camposAviso,
              });
            }
          }}
        />
      )}

      {guiaEntry && (() => {
        // Los papeles del ingreso los arma `papelesDeIngreso` y NO esta vista:
        // el que se mira acá y el que se archiva al validar tienen que ser el
        // mismo documento, no dos que se parecen.
        const papeles = papelesDeIngreso(guiaEntry, {
          impresoEl: hoyPE(),
          logo: logoDe(guiaEntry.providerName, guiaEntry.providerDocument),
        });
        if (!papeles) return null;
        // Las fotos de la carga, como última hoja (ADR-434): la GTF queda tal cual.
        const fotos = hojaFotosDeLaCarga({
          gtf: papeles.guia.gtfNumber ?? guiaEntry.gtfNumber,
          emisor: papeles.guia.titular ?? guiaEntry.providerName,
          fotos: normalizarFotos(guiaEntry.photos),
          logo: logoDe(guiaEntry.providerName, guiaEntry.providerDocument),
        });
        return (
          <CtpDocumentoVisor
            documentos={[papeles.gtf, ...(papeles.lista ? [papeles.lista] : []), ...(fotos ? [fotos] : [])]}
            activo={guiaHoja}
            onActivo={setGuiaHoja}
            // Se archiva con el N° de guía, el proveedor y la especie: son los
            // tres datos con los que después se busca el papel en el Drive.
            onArchivar={(d) => metaArchivado(guiaEntry, d.nombre)}
            onClose={() => { setGuiaEntry(null); setGuiaHoja(0); }}
          />
        );
      })()}

      {(bloqueAbierto || bloqueElegidas) && (
        <CtpRecepcionBloqueModal
          /* Desde la tabla: sólo las tildadas, ya marcadas. Desde el aviso: todas, en cero. */
          guias={
            (bloqueElegidas ? porRecibir.filter((g) => bloqueElegidas.includes(g.clave)) : porRecibir) as unknown as GuiaParaBloque[]
          }
          preseleccion={bloqueElegidas ?? undefined}
          onClose={() => { setBloqueAbierto(false); setBloqueElegidas(null); }}
          onListo={(r) => {
            if (bloqueElegidas) setSelectedIds([]);
            setBloqueAbierto(false);
            setBloqueElegidas(null);
            invalidarCtp("wood-entries");
            void reload();
            /* Las recibidas se van al expediente solas, igual que al validar. */
            encolarArchivado(
              porRecibir.filter((g) => r.recibidas.includes(g.clave)).flatMap((g) => g.lineas),
            );
            avisarDelBloque(r);
          }}
        />
      )}

      {corregirRecepcion && (
        <CtpCorregirRecepcionModal
          guias={recibidas}
          inicial={corregirRecepcion.inicial}
          onClose={() => setCorregirRecepcion(null)}
          onListo={(r) => {
            setCorregirRecepcion(null);
            invalidarCtp("wood-entries");
            void reload();
            if (r.corregidas.length > 0) {
              pushToast({
                tono: "success",
                msg: `Recepción corregida — ${r.corregidas.length} guía${r.corregidas.length === 1 ? "" : "s"}`,
                detail: r.corregidas
                  .map((c) => `${c.gtfNumber}: ${c.antes ? ddmm(c.antes) : "—"} → ${ddmm(c.despues)}`)
                  .join(" · "),
              });
            }
            if (r.fallaron.length > 0) {
              pushToast({
                tono: "error",
                msg: `${r.fallaron.length} no se corrigi${r.fallaron.length === 1 ? "ó" : "eron"}`,
                detail: r.fallaron.map((f) => `${f.gtfNumber}: ${f.motivo}`).join(" · "),
              });
            }
          }}
        />
      )}

      {costoGuia && (
        <CtpCostoGuiaModal
          guia={costoGuia}
          historial={entries}
          onGuardado={alGuardarPlata}
          onClose={() => setCostoGuia(null)}
        />
      )}

      {ponerPrecio && (
        <CtpPonerPrecioModal onClose={() => setPonerPrecio(false)} onGuardado={() => void reload()} />
      )}

      {fichaGuia && (
        <CtpGuiaFichaModal
          guia={fichaGuia}
          trozas={fichaTrozas}
          cargandoTrozas={fichaTrozas == null}
          recepcionando={busy === `${fichaGuia.clave}:recepcion`}
          error={fichaError}
          onRecepcionar={() => void (async () => {
            setFichaError(null);
            const ok = await recepcionarGuia(fichaGuia);
            if (ok) {
              /* Cerrar al recibir: la guía deja la bandeja y se va al archivo.
                 Dejar la ficha abierta mostraría un estado que ya cambió. */
              setFichaGuia(null);
              setFichaTrozas(null);
            } else {
              setFichaError("No se pudo recepcionar la guía. Prueba de nuevo o revisa sus piezas.");
            }
          })()}
          onVerDocumento={() => {
            /* Del papel se vuelve a la ficha: son dos vistas de lo mismo y
               apilar dos modales obliga a cerrar dos veces. */
            const g = fichaGuia;
            setFichaGuia(null);
            void verDocumento(g);
          }}
          onCuadrar={() => {
            /* Misma regla que el documento: el cuadre REEMPLAZA la ficha. */
            const g = fichaGuia;
            setFichaGuia(null);
            setFichaTrozas(null);
            setCuadreGuia(g);
          }}
          onAcomodar={
            firma
              ? () =>
                  setAcomodar({ alcance: { woodEntryId: fichaGuia.lineas[0]!.id }, descripcion: `Guía ${fichaGuia.gtfNumber}`, desdeFicha: true })
              : undefined
          }
          /* Los atajos de la cabecera de la ficha (rediseño 09-26): cada uno
             REEMPLAZA la ficha, igual que el documento y el cuadre. */
          onPlata={() => { const g = fichaGuia; setFichaGuia(null); setFichaTrozas(null); setCostoGuia(costeableDeGuia(g)); }}
          onDocumentos={() => { const g = fichaGuia; setFichaGuia(null); setFichaTrozas(null); setDocsGuia(g); }}
          onEtiquetas={() => { const g = fichaGuia; setFichaGuia(null); setFichaTrozas(null); void imprimirEtiquetasDeGuia(g); }}
          onFotos={fichaGuia.lineas[0] ? () => { const e = fichaGuia.lineas[0]!; setFichaGuia(null); setFichaTrozas(null); setDetail(e); } : undefined}
          onCorregirRecepcion={firma ? () => { const g = fichaGuia; setFichaGuia(null); setFichaTrozas(null); setCorregirRecepcion({ inicial: g.clave }); } : undefined}
          /* La planilla SÍ se apila: se mide, se guarda y se vuelve a la ficha
             con la lista ya releída. */
          onCubicar={() => void abrirCubicar(fichaGuia, true, fichaTrozas)}
          onClose={() => { setFichaGuia(null); setFichaTrozas(null); setFichaError(null); }}
        />
      )}

      {cubicar && (
        <CtpCubicarOxapampaModal
          contexto={`Guía ${cubicar.guia.gtfNumber} · ${cubicar.guia.providerName}`}
          trozas={cubicar.trozas}
          aboveModals={cubicar.desdeFicha}
          onGuardado={() => releerCubicada(cubicar.guia)}
          onClose={() => setCubicar(null)}
        />
      )}

      {acomodar && (
        <CtpAcomodarTrozasModal
          alcance={acomodar.alcance}
          descripcion={acomodar.descripcion}
          aboveModals={acomodar.desdeFicha}
          onClose={() => setAcomodar(null)}
          onAcomodado={() => {
            /* La ficha de abajo relee sus trozas: al cerrar, cada especie ya
               muestra las suyas. La lista, por el conteo de piezas por fila. */
            if (fichaGuia) {
              piezasDeGuia(fichaGuia)
                .then(setFichaTrozas)
                .catch((err) => logger.warn("[ingresos] no se pudieron releer las piezas", { error: String(err) }));
            }
            void reload();
          }}
        />
      )}

      {cuadreGuia && (
        <CtpCuadrarGuiaModal
          gtfNumber={cuadreGuia.gtfNumber}
          subtitulo={cuadreGuia.providerName}
          entryIds={cuadreGuia.lineas.map((l) => l.id)}
          onCuadrada={() => { void reload(); }}
          onClose={() => setCuadreGuia(null)}
        />
      )}

      {docGuia && docTrozas != null && (() => {
        const logo = logoDe(docGuia.providerName, docGuia.lineas[0].providerDocument);
        const papeles = papelesDeGuia(docGuia, docTrozas, { impresoEl: hoyPE(), logo });
        // Las fotos se guardan en TODAS las filas de la GTF; se juntan por si
        // alguna fila quedó con una lista distinta (dato viejo).
        const fotos = hojaFotosDeLaCarga({
          gtf: docGuia.gtfNumber,
          emisor: docGuia.providerName,
          fotos: normalizarFotos(docGuia.lineas.flatMap((l) => normalizarFotos(l.photos))),
          logo,
        });
        return (
          <CtpDocumentoVisor
            documentos={[papeles.gtf, ...(papeles.lista ? [papeles.lista] : []), ...(fotos ? [fotos] : [])]}
            activo={guiaHoja}
            onActivo={setGuiaHoja}
            onArchivar={(d) => metaArchivado(docGuia.lineas[0], d.nombre)}
            onClose={() => { setDocGuia(null); setDocTrozas(null); setGuiaHoja(0); }}
          />
        );
      })()}

      {colaArchivo.length > 0 && (
        <CtpArchivadorAuto
          cola={colaArchivo}
          onFin={(r) => {
            setColaArchivo([]);
            if (!hayNovedades(r)) return; // nada que contar
            if (r.guardadas > 0 || r.yaEstaban > 0) {
              pushToast({
                tono: "success",
                msg: r.guardadas > 0
                  ? `${r.guardadas} documento(s) al expediente`
                  : "La guía ya estaba en el expediente",
                detail: `En Documentos › Guías forestales (GTF).${
                  r.guardadas > 0 && r.yaEstaban > 0 ? ` ${r.yaEstaban} ya estaba(n).` : ""
                }`,
              });
            }
            // Un archivado que falla en silencio es peor que no tenerlo: la
            // carpeta parecería completa cuando no lo está.
            if (r.fallidas > 0) {
              pushToast({
                tono: "warning",
                msg: `${r.fallidas} guía(s) no se pudieron archivar`,
                detail: "Se pueden guardar a mano desde «Ver la GTF» → «Guardar en el expediente».",
              });
            }
          }}
        />
      )}

      {legajo && (
        <CtpDocumentoVisor
          documentos={legajo}
          activo={0}
          onActivo={() => {}}
          onArchivar={(d) => ({
            etiquetas: ["forestal", "legajo", "GTF"],
            descripcion: `${d.nombre} del período ${period.label}, armado desde el Libro de Operaciones del CTP.`,
          })}
          onClose={() => setLegajo(null)}
        />
      )}

      {detail && (
        <CtpEntryDetailModal
          entry={detail}
          onClose={() => setDetail(null)}
          // Completar cierra el detalle y abre el editor: dejar los dos modales
          // apilados obliga a cerrar dos veces para volver a la lista.
          onCompletar={(e) => { setDetail(null); setEditEntry(e); }}
          /**
           * Refresca la LISTA y además el ingreso que está abierto.
           *
           * Sólo con `reload()` la tabla de atrás quedaba al día pero el modal
           * seguía mostrando el `entry` con el que se abrió: al corregir el
           * volumen desde el detalle, la pantalla seguía diciendo "faltan 5 m³"
           * sobre un ingreso ya corregido, y el camino natural era volver a
           * apretar el botón. Lo destapó la verificación en navegador.
           */
          onCambio={() => {
            void reload();
            void (async () => {
              try {
                const r = await fetch(`/api/admin/forestal/wood-entries/${encodeURIComponent(detail.id)}`, {
                  credentials: "include",
                });
                if (!r.ok) return;
                const fresco = (await r.json())?.entry;
                if (fresco) setDetail(fresco as WoodEntry);
              } catch {
                // Si falla, la tabla de atrás ya se recargó: el modal muestra el
                // dato viejo hasta reabrirlo, que es molesto pero no incorrecto.
              }
            })();
          }}
        />
      )}
      {chainEntry && <CtpIngresoCadenaModal entry={chainEntry} onClose={() => setChainEntry(null)} />}
      {editEntry && (
        <CtpIngresoEditModal
          entry={editEntry}
          onClose={() => setEditEntry(null)}
          onSaved={() => {
            setEditEntry(null);
            void reload();
            pushToast({ tono: "success", msg: "Ingreso corregido", detail: "El cambio quedó registrado en el historial del ingreso." });
          }}
        />
      )}
      {etiquetasGuia && (
        <CtpEtiquetasTrozasModal ids={etiquetasGuia.ids} contexto={etiquetasGuia.contexto} onClose={() => setEtiquetasGuia(null)} />
      )}
      {docsGuia && (
        <CtpDocumentosGuiaModal
          gtf={docsGuia.gtfNumber}
          contexto={docsGuia.providerName}
          onClose={() => { setDocsGuia(null); void conteoDocs.refrescar(); }}
          /* El visor es un overlay a mano: con este modal Radix abierto quedaría sin clics. */
          onArmarGtf={() => { const g = docsGuia; setDocsGuia(null); void verDocumento(g); }}
        />
      )}
      <CtpGuiasGuardadasCapa
        abierto={modalGuardadas}
        onCerrar={() => setModalGuardadas(null)}
        onCambio={() => setGuardadasKey((k) => k + 1)}
        onIngresar={(g) => void ingresarGuardada(g)}
      />
      <ActionToasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

/**
 * Chip de la bandeja: «por recepcionar» vs «todas». Mismo lenguaje visual que
 * los chips de estado de las otras vistas del libro (ADR-339).
 */
function ChipRecepcion({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-bold transition ${
        activo
          ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
      }`}
    >
      {children}
    </button>
  );
}
