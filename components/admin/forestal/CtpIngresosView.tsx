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

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, PackageCheck, ThumbsDown, ThumbsUp } from "@buleje/design-system/icons";
import BulkActionsBar from "@/components/admin/shared/BulkActionsBar";
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
import { useLogosTitulares } from "@/hooks/use-logos-titulares";
import CtpArchivadorAuto, { type GuiaParaArchivar } from "./CtpArchivadorAuto";
import { hayNovedades } from "@/lib/forestal/ctp-cola-archivado";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import type { GuiaIngreso } from "@/lib/forestal/ingresos-por-guia";
import { ctpGet, invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { csrfHeaders } from "@/lib/csrf-client";
import { tieneCosto } from "@/lib/forestal/costo-sugerido";
import { logger } from "@/lib/logger";

/** Lo que el endpoint de trozas devuelve: lo usan el papel y la ficha. */
interface TrozaDeGuia {
  id: string;
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
import CtpGuiasTable from "./CtpGuiasTable";
import CtpCuadrarGuiaModal from "./CtpCuadrarGuiaModal";
import CtpGuiaFichaModal from "./CtpGuiaFichaModal";
import CtpCostoGuiaModal, { type GuiaACostear } from "./CtpCostoGuiaModal";
import CtpTrozasIndividuales from "./CtpTrozasIndividuales";
import CtpIngresosKpis from "./CtpIngresosKpis";
import CtpGtfIngresadasKpis from "./CtpGtfIngresadasKpis";
import CtpIngresosFiltros, { type CtpFacetasActivas } from "./CtpIngresosFiltros";
import CtpGuiasBandeja from "./CtpGuiasBandeja";
import CtpIngresosPaginacion from "./CtpIngresosPaginacion";
import {
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

/** La fecha de hoy como se escribe en el papel. */
const hoyPE = () =>
  new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });

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
  // Cómo dejó la pestaña la última vez (orden + filtros; la búsqueda no).
  const prefs = usePrefsIniciales(recepcion ?? "todas");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 350);
  const [statusFilter, setStatusFilter] = useState<string>(prefs.statusFilter);
  const [facetas, setFacetas] = useState<CtpFacetasActivas>(prefs.facetas);
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
  const [fichaTrozas, setFichaTrozas] = useState<TrozaDeGuia[] | null>(null);
  const [fichaError, setFichaError] = useState<string | null>(null);
  /** La guía que se está CUADRANDO: declara un volumen y sus piezas suman otro (ADR-353). */
  const [cuadreGuia, setCuadreGuia] = useState<GuiaIngreso<WoodEntry> | null>(null);
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
    () => ({ status: statusFilter, search, recepcion: recepcionSel, ...facetas }),
    [statusFilter, search, recepcionSel, facetas],
  );

  useGuardarPrefs(useMemo(() => ({ statusFilter, facetas, sort }), [statusFilter, facetas, sort]), recepcion ?? "todas");

  const {
    entries,
    guias,
    lineas,
    stats,
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
  }, [search, statusFilter, facetas, period, sort, recepcionSel]);

  // Llegó desde un aviso ("2 fuera de plazo", "1 CITES sin permiso"): la lista
  // se abre mostrando ESOS casos. El filtro pedido reemplaza al que hubiera —
  // dos filtros superpuestos darían un vacío inexplicable.
  useEffect(() => {
    if (!filtroRapido) return;
    setSearchInput("");
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
    } else {
      setStatusFilter("");
      setFacetas({ cites: true });
    }
  }, [filtroRapido]);

  // Puente inverso desde Títulos Habilitantes: abre el form con la guía elegida.
  useEffect(() => {
    if (!openGtf) return;
    setFormGtf(openGtf);
    setFormPreset(undefined);
    setShowForm(true);
    onOpenConsumed?.();
  }, [openGtf, onOpenConsumed]);

  /**
   * El legajo: portada con el índice + cada guía (y su lista) en hoja nueva.
   *
   * Va en el orden en que se ven en la tabla, no en el de los clics: el índice
   * y las hojas tienen que coincidir con lo que el operador está mirando.
   */
  const componerLegajo = useCallback((elegidos: WoodEntry[], acotado: number) => {
    if (elegidos.length === 0) return;

    const hoy = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
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
  }, [period]);

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
          detail: `El filtro tiene ${todas.length}: quedaron afuera ${acotado}. Filtrá por mes o marcá las que necesitás.`,
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
    /* Sólo si NO tiene costo: preguntar por algo ya contestado es ruido, y el
       operador aprende a cerrar el modal sin leerlo. */
    if (!guia.lineas.some(tieneCosto)) {
      setCostoGuia({
        gtfNumber: guia.gtfNumber,
        providerName: guia.lineas[0]?.providerName ?? null,
        especie: guia.lineas[0]?.speciesCommonName ?? null,
        volumenM3: guia.lineas.reduce((a, l) => a + (Number(l.volumeM3) || 0), 0),
        lineas: guia.lineas.map((l) => ({ id: l.id, volumeM3: l.volumeM3 })),
      });
    }
    return true;
  }

  /**
   * Guarda el costo de cada asiento de la guía. Devuelve `false` si alguno
   * falló: el modal lo dice y no cierra —la plata cargada a medias es peor que
   * no cargada, porque el margen que muestre va a estar mal y nadie lo va a
   * saber.
   */
  async function guardarCostoGuia(porAsiento: { id: string; costoTotal: number }[]): Promise<boolean> {
    const rs = await Promise.all(
      porAsiento.map((a) =>
        fetch(`/api/admin/forestal/wood-entries/${encodeURIComponent(a.id)}`, {
          method: "PATCH",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({ action: "set_costo", costoTotal: a.costoTotal, moneda: "PEN" }),
        })
          .then((r) => r.ok)
          .catch((err) => {
            logger.error("[ingresos] no se pudo guardar el costo", { error: String(err) });
            return false;
          }),
      ),
    );
    if (rs.some((ok) => !ok)) return false;
    invalidarCtp("wood-entries");
    void reload();
    pushToast({
      tono: "success",
      msg: `Costo cargado — ${porAsiento.length} asiento${porAsiento.length === 1 ? "" : "s"}`,
      detail: "Ya cuenta para el margen y para el valor del patio.",
    });
    return true;
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
        ).then((r) => r.trozas ?? []),
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
      a.download = nombreArchivoIngresos(period.label, statusFilter || facetas.provider || facetas.species);
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      pushToast({
        tono: truncated ? "warning" : "success",
        msg: truncated ? `Descargados los primeros ${CTP_EXPORT_MAX}` : `${todos.length} ingresos descargados`,
        detail: truncated
          ? `El filtro tiene más de ${CTP_EXPORT_MAX} registros. Acotá el período para bajar el resto.`
          : "Se abre en Excel con las columnas ya separadas.",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDescargando(false);
    }
  }

  const hayFiltro = Boolean(statusFilter || search || facetas.species || facetas.provider || facetas.product || facetas.cites !== undefined || facetas.late || facetas.sinOrigen);
  /** Qué está filtrando, con nombre: el vacío tiene que poder explicarse. */
  const filtrosActivos = useMemo(
    () =>
      [
        statusFilter ? `estado «${STATUS_META[statusFilter as keyof typeof STATUS_META]?.label ?? statusFilter}»` : "",
        search ? `búsqueda «${search}»` : "",
        facetas.species ? `especie ${facetas.species}` : "",
        facetas.provider ? `proveedor ${facetas.provider}` : "",
        facetas.product ? `producto ${productLabel(facetas.product)}` : "",
        facetas.cites !== undefined ? (facetas.cites ? "sólo CITES" : "sin CITES") : "",
        facetas.late ? "fuera de plazo" : "",
        facetas.sinOrigen ? "sin código de origen" : "",
      ].filter(Boolean),
    [statusFilter, search, facetas],
  );
  /** Saca TODO lo que filtra. El período no: ése se ve arriba y es otra decisión. */
  const limpiarFiltros = useCallback(() => {
    setStatusFilter("");
    setSearchInput("");
    setFacetas({});
  }, []);

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
        />
      ) : (
      <CtpIngresosKpis
        stats={stats}
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
      />
      )}

      {showDashboard && <SpeciesAggregateChart period={period} />}

      <CtpIngresosFiltros
        /* Dos lecturas del MISMO registro: por guía (lo que declara el papel) o
           por troza (una fila por pieza). Viaja con los chips de estado — antes
           tenía su propia fila con un texto que repetía el nombre del botón. */
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
        stats={stats}
        loading={loading}
        dashboardOn={showDashboard}
        onDashboard={() => setShowDashboard((v) => !v)}
        onReload={() => void reload()}
        onNuevo={() => { setFormGtf(null); setFormPreset(undefined); setShowForm(true); }}
        onDescargar={() => void descargar()}
        descargando={descargando}
        totalFiltrado={total}
        onLegajo={() => void armarLegajo()}
        legajoCount={selectedIds.length || total}
        legajoDeTodo={selectedIds.length === 0}
        armandoLegajo={armandoLegajo}
      />

      {/* Puente monte→planta: guías emitidas en Títulos Habilitantes sin ingresar. */}
      {!esArchivo && (
      <CtpGuiasBandeja key={bandejaKey} onIngresar={(n) => { setFormPreset(undefined); setFormGtf(n); setShowForm(true); }} />
      )}

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

      <BulkActionsBar
        selectedIds={selectedPending}
        totalCount={pendingIds.length}
        onSelectAll={() => setSelectedIds(pendingIds)}
        onClearSelection={() => { setSelectedIds([]); setBulkRejecting(false); }}
        actions={[
          /* En la bandeja, la acción del patio es RECEPCIONAR (ADR-339): fecha
             las piezas que bajaron, fecha la guía y la valida — un paso, y la
             guía se va sola a «GTF ingresadas». Validar sigue existiendo para
             quien sólo quiere aceptar el papel. */
          ...(recepcion === "pendiente"
            ? [
                {
                  id: "recepcionar",
                  label: "Recepcionar seleccionadas",
                  icon: PackageCheck,
                  onClick: async (ids: string[]) => {
                    setBusy("bulk");
                    const marcados = entries.filter((e) => ids.includes(e.id));
                    const fallaron = await recepcionarMany(ids);
                    setSelectedIds([]);
                    setBusy(null);
                    if (fallaron === 0) {
                      pushToast({
                        tono: "success",
                        msg: `${ids.length} guía${ids.length === 1 ? "" : "s"} recepcionada${ids.length === 1 ? "" : "s"}`,
                        detail:
                          "Están arriba de todo en «GTF ingresadas», y sus piezas ya se pueden llevar a la sierra desde Consumos.",
                      });
                    }
                    encolarArchivado(marcados);
                  },
                },
              ]
            : []),
          {
            id: "validate",
            label: "Validar seleccionados",
            icon: ThumbsUp,
            onClick: async (ids) => {
              setBusy("bulk");
              const marcados = entries.filter((e) => ids.includes(e.id));
              await validateMany(ids);
              setSelectedIds([]);
              setBusy(null);
              encolarArchivado(marcados);
            },
          },
          {
            id: "reject",
            label: "Rechazar seleccionados",
            icon: ThumbsDown,
            variant: "danger",
            // No dispara nada todavía: rechazar exige motivo, y un lote sin
            // motivo es un rechazo que después nadie puede explicar.
            onClick: () => { setBulkRejecting(true); setBulkReason(""); },
          },
        ]}
      />

      {bulkRejecting && selectedPending.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] p-3 dark:bg-[var(--data-error-500)]/12">
          <label htmlFor="ctp-bulk-reason" className="text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            Motivo del rechazo de {selectedPending.length}:
          </label>
          <input
            id="ctp-bulk-reason"
            type="text"
            value={bulkReason}
            onChange={(e) => setBulkReason(e.target.value)}
            placeholder="Ej: volumen no coincide con la guía (mín. 3 caracteres)"
            className="h-10 min-w-0 flex-1 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--data-error-500)]"
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
            className="inline-flex h-10 items-center rounded-xl bg-[var(--data-error-600)] px-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            Confirmar rechazo
          </button>
          <button
            type="button"
            onClick={() => setBulkRejecting(false)}
            className="inline-flex h-10 items-center rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)]"
          >
            Cancelar
          </button>
        </div>
      )}

      {modo === "troza" ? (
        <CtpTrozasIndividuales period={period} />
      ) : (
      <CtpGuiasTable
        guias={guias}
        /* Autofiltros de cabecera: mismo `facetas` que el panel (dos lugares, un filtro). */
        filtrosColumna={{
          provider: {
            value: facetas.provider ?? "",
            options: stats?.providers ?? [],
            onChange: (v) => setFacetas((f) => ({ ...f, provider: v || undefined })),
          },
          species: {
            value: facetas.species ?? "",
            options: stats?.species ?? [],
            onChange: (v) => setFacetas((f) => ({ ...f, species: v || undefined })),
            placeholder: "Todas",
          },
        }}
        loading={loading}
        period={period}
        filtered={hayFiltro}
        filtrosActivos={filtrosActivos}
        onLimpiarFiltros={limpiarFiltros}
        pendingIds={pendingIds}
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        busy={busy}
        modoBandeja={recepcionSel === "pendiente"}
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
        sort={sort}
        onSort={ordenar}
      />
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

      {showForm && (
        <WoodEntryForm
          initialGtfNumber={formGtf ?? undefined}
          preset={formPreset}
          onClose={() => { setShowForm(false); setFormGtf(null); setFormPreset(undefined); }}
          onSaved={(o) => {
            setShowForm(false);
            setFormGtf(null);
            setFormPreset(undefined);
            setBandejaKey((k) => k + 1); // la guía ingresada sale de la bandeja
            void reload();
            // Sin señal el ingreso NO está en el libro: decirlo, no dar por guardado.
            if (o?.offline) {
              pushToast({
                tono: "warning",
                msg: "Sin señal: quedó anotado en el patio",
                detail: "El ingreso todavía NO está en el libro. Sube solo cuando vuelva la conexión.",
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
        return (
          <CtpDocumentoVisor
            documentos={[papeles.gtf, ...(papeles.lista ? [papeles.lista] : [])]}
            activo={guiaHoja}
            onActivo={setGuiaHoja}
            // Se archiva con el N° de guía, el proveedor y la especie: son los
            // tres datos con los que después se busca el papel en el Drive.
            onArchivar={(d) => metaArchivado(guiaEntry, d.nombre)}
            onClose={() => { setGuiaEntry(null); setGuiaHoja(0); }}
          />
        );
      })()}

      {costoGuia && (
        <CtpCostoGuiaModal
          guia={costoGuia}
          historial={entries}
          onGuardar={guardarCostoGuia}
          onClose={() => setCostoGuia(null)}
        />
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
              setFichaError("No se pudo recepcionar la guía. Probá de nuevo o revisá sus piezas.");
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
          onClose={() => { setFichaGuia(null); setFichaTrozas(null); setFichaError(null); }}
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
        const papeles = papelesDeGuia(docGuia, docTrozas, {
          impresoEl: hoyPE(),
          logo: logoDe(docGuia.providerName, docGuia.lineas[0].providerDocument),
        });
        return (
          <CtpDocumentoVisor
            documentos={[papeles.gtf, ...(papeles.lista ? [papeles.lista] : [])]}
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
