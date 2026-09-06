"use client";

/**
 * CtpEntriesView — tabla de Producción/Despacho del Libro CTP (ADR-127).
 * Producción y Despacho comparten esta misma tabla, adaptada por sección.
 * Saldos (balance de planta) vive en CtpSaldosView, componente hermano.
 */

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Plus, Search, Boxes, Truck, AlertCircle, PackagePlus, Calendar, Table, X } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { accionesDeLotes, accionesDeSeccion, accionesPorDeclarar } from "./ctp-entries-acciones";
import { csrfHeaders } from "@/lib/csrf-client";
import { useDebounce } from "@/hooks/use-debounce";
import { type CtpPeriod } from "@/lib/forestal/ctp-period";
import CtpDespachoGuiaModal from "./CtpDespachoGuiaModal";
import CtpGuiaDeLineaModal from "./CtpGuiaDeLineaModal";
import CtpProduccionImportModal from "./CtpProduccionImportModal";
import CtpDespachoDetalleModal from "./CtpDespachoDetalleModal";
import CtpProduccionDetalleModal from "./CtpProduccionDetalleModal";
import CtpEntriesTabla, { type SortKey } from "./CtpEntriesTabla";
import CtpProduccionDeLote from "./CtpProduccionDeLote";
import CtpTrozasDelLote from "./CtpTrozasDelLote";
import AdminModal from "@/components/admin/shared/AdminModal";
import CtpProduccionPendiente from "./CtpProduccionPendiente";
import CtpPapelesDespachoModal from "./CtpPapelesDespachoModal";
import CtpCorridaSinDeclarar from "./CtpCorridaSinDeclarar";
import CtpSeccionKpis from "./CtpSeccionKpis";
import CtpSinCertificar, { type DespachoSinCertificar } from "./CtpSinCertificar";
import { esLoteDeInventario, margenLote } from "@/lib/forestal/lotes-aserrio";
import { useLotesAserrio } from "./hooks/use-lotes-aserrio";
import { useCtpSeccion } from "@/hooks/use-ctp-secciones";
import CtpSimuladorModal from "./CtpSimuladorModal";
import { useActionToasts, ActionToasts } from "./cubicador-toasts";
import CtpFiltrosPanel, { BotonFiltros, type FacetaOpcion } from "./ctp-filtros-panel";
import {
  rangoActivo,
  rangosPuestos,
  SALIDA_LABEL,
  type CampoRango,
  type ClaveSalida,
  type RangoNumerico,
} from "@/lib/forestal/ctp-secciones-filtro";
import { nombreArchivoSeccion, seccionACsv } from "@/lib/forestal/ctp-secciones-csv";
import { corridasAMedioDeclarar } from "@/lib/forestal/produccion-paquetes";

// El anexo arrastra jsPDF/exceljs: entra solo cuando alguien lo pide.
const Anexo04Modal = dynamic(() => import("./Anexo04Modal"), { ssr: false });
import { COLUMNAS_PRODUCCION_OPCIONALES, type CtpEntry, type CtpSection } from "./ctp-section-shared";
import { ColumnasMenu, TablaSkeleton, useColumnasVisibles } from "./ctp-shared";
import { CtpPaginacion, usePaginacion } from "./ctp-tabla";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

const SECTION_META: Record<CtpSection, { label: string; icon: typeof Boxes; cta: string; empty: string }> = {
  /* El CTA de Producción ya no abre un formulario en blanco (ADR-349): la
     producción se registra DESDE UN LOTE, con sus trozas a la vista. Ver
     `accionesDeLotes` en `ctp-entries-acciones`. */
  produccion: { label: "Producción", icon: Boxes, cta: "Declarar producción", empty: "Sin transformaciones registradas. Elegí un lote en «Declarar producción»: salen sus trozas para elegir cuáles entran a la sierra." },
  despacho: { label: "Despacho", icon: Truck, cta: "Nuevo despacho", empty: "Sin despachos registrados. Registrá la salida de producto con su GTF." },
};

/** El buscador de la sección. Vive con la tabla: en la pantalla en Despacho,
 *  dentro del modal del libro en Producción — por eso está acá y no inline. */
function BuscadorSeccion({ section, label, value, onChange }: {
  section: CtpSection;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex h-12 flex-1 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4">
      <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
      <label htmlFor={`ctp-search-${section}`} className="sr-only">Buscar en {label}</label>
      <input
        id={`ctp-search-${section}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar por especie, producto o GTF..."
        className="w-full bg-transparent text-base text-[var(--text-primary)] outline-none"
      />
    </div>
  );
}

/**
 * Los dos carteles de la tabla: el período que no se pudo leer y el resultado
 * de mandar una corrida al inventario.
 *
 * Se escriben una sola vez porque se rendean en DOS lugares excluyentes: dentro
 * del libro (que en Producción es un modal) y, cuando el libro está cerrado, en
 * la pantalla — un error que sólo se ve abriendo un modal no se ve.
 */
function AvisosDelLibro({ error, mensaje, onCerrarMensaje }: {
  error: string | null;
  mensaje: string | null;
  onCerrarMensaje: () => void;
}) {
  return (
    <>
      {error && (
        <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div><strong>Error:</strong> {error}</div>
        </div>
      )}
      {mensaje && (
        <div className={`flex items-start justify-between gap-3 rounded-xl border-2 p-4 text-sm ${mensaje.startsWith("Error") ? "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)]" : "border-[var(--data-success-500)] bg-[var(--data-success-50)] text-[var(--data-success-700)]"}`}>
          <div className="flex items-start gap-2"><PackagePlus className="mt-0.5 h-5 w-5 shrink-0" /><span>{mensaje}</span></div>
          <button type="button" onClick={onCerrarMensaje} className="shrink-0 text-xs font-bold underline opacity-70 hover:opacity-100">Cerrar</button>
        </div>
      )}
    </>
  );
}

/**
 * Dónde vive el libro —la tabla «Todos / Registrados» con su buscador, sus
 * filtros y su paginación— (Brandon, 2026-09-02).
 *
 * En **Despacho** sigue en la pantalla: ahí la tabla ES el trabajo (se mira lo
 * que salió, se emiten anexos, se adjuntan papeles).
 *
 * En **Producción** el trabajo es otro: elegir el lote que entra hoy a la
 * sierra y tildar sus trozas. Ese lugar lo ocupa ahora la lista de trozas del
 * lote, y el libro pasa a ser una CONSULTA que se abre desde «Opciones». No es
 * una copia: es la misma tabla, con el mismo estado, movida de sitio.
 */
function ZonaLibro({ enModal, abierto, onCerrar, subtitulo, children }: {
  enModal: boolean;
  abierto: boolean;
  onCerrar: () => void;
  subtitulo: string;
  children: React.ReactNode;
}) {
  if (!enModal) return <>{children}</>;
  if (!abierto) return null;
  return (
    <AdminModal
      open
      onClose={onCerrar}
      variant="wide"
      title="Producción · Todos y registrados"
      description={subtitulo}
      icon={Table}
      /* Es una tabla de nueve columnas con totales: a `2xl` se leía en zigzag. */
      className="sm:w-[min(96vw,105rem)] sm:max-w-none"
    >
      <div className="space-y-3 p-4">{children}</div>
    </AdminModal>
  );
}



export function CtpEntriesView({
  section,
  period,
  presetProducto,
  presetEspecie,
  presetLoteAserrioId,
  onPresetUsado,
  onIr,
  onVerTodoElHistorico,
}: {
  section: CtpSection;
  period: CtpPeriod;
  /** Producto que llega desde el stock de Saldos: abre el formulario ya cargado. */
  presetProducto?: string | null;
  presetEspecie?: string | null;
  /** Lote de aserrío elegido en la pestaña Lotes (ADR-334): abre la corrida con él. */
  presetLoteAserrioId?: string | null;
  /** Aviso al shell de que ya se consumió el preset (producto o lote). */
  onPresetUsado?: () => void;
  /** Saltar a otra vista del libro (hoy: a Lotes, cuando no hay ninguno abierto). */
  onIr?: (vista: string) => void;
  /** Cambia el período activo a "Todo el histórico" (el aviso de corridas
   *  escondidas por fecha ofrece este atajo en vez de mandar a buscarlo). */
  onVerTodoElHistorico?: () => void;
}) {
  const meta = SECTION_META[section];
  /** Columnas opcionales de Producción, elegibles y persistidas por dispositivo. */
  const [colsProduccion, setColsProduccion] = useColumnasVisibles("ctp-produccion-cols", COLUMNAS_PRODUCCION_OPCIONALES);
  /** Bandeja de anexos emitidos abierta desde la barra (consulta, sin despacho). */
  const [verBandeja, setVerBandeja] = useState(false);
  /**
   * El LIBRO de producción —la tabla «Todos / Registrados»— abierto en un modal
   * (Brandon, 2026-09-02).
   *
   * La pantalla de Producción es donde se DECIDE qué madera entra hoy a la
   * sierra: ese lugar lo ocupa ahora la lista de trozas del lote elegido. Lo ya
   * declarado sigue estando entero, con sus chips, filtros y columnas, pero
   * como CONSULTA — se abre desde «Opciones» cuando se lo busca.
   */
  const [verLibro, setVerLibro] = useState(false);
  /** Hoy, para la columna «Fecha consumo» de la lista vacía (no se re-calcula). */
  const hoy = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [searchInput, setSearchInput] = useState("");
  // Sin debounce, `load` se re-creaba en cada tecla → un fetch por caracter.
  const search = useDebounce(searchInput, 350);

  /** Todo lo que se SABE de la sección: fetch, filtros, orden y derivados. */
  const {
    entries, loading, error, setError, recargar: load, totalSinFiltro,
    conAnexo, totalAnexos, recargarAnexos: cargarAnexos, sinAnexo,
    statusFilter, setStatusFilter, soloSinAnexo, setSoloSinAnexo,
    sort, setSort, facetas, setFacetas, activos, panelId, abierto, alternar, opciones,
    visible, totalesVista, kpis, statusCounts,
  } = useCtpSeccion(section, period, search);
  /** Corridas que existen pero el período activo no muestra — "Productos
   *  disponibles" no filtra por fecha, así que ya las cuenta. Sin este aviso
   *  se lee como que el import "se comió" un registro. */
  const escondidasPorPeriodo = totalSinFiltro != null ? Math.max(0, totalSinFiltro - entries.length) : 0;

  /**
   * Los filtros: en la CABECERA de su columna, estilo Excel (Brandon, 2026-09-03).
   *
   * La cabecera y el panel escriben el MISMO `facetas`: no hay dos filtros, hay
   * dos lugares desde donde tocar uno. Por eso `setFaceta` es uno solo.
   *
   * Reparto: lo que es una columna **visible** se filtra desde su cabecera; el
   * botón «Filtros» se queda con lo especializado (las marcas) y con las
   * columnas OCULTAS —si no, apagar la columna «Salida» con su filtro puesto
   * dejaría la tabla acotada y sin ningún control para desacotarla—. Eso es lo
   * que decide `soloMobile` abajo, columna por columna.
   *
   * En <640px no hay tabla (son cards), así que ahí el panel los muestra todos.
   */
  const setFaceta = (id: string, valor: string) => setFacetas((f) => ({ ...f, [id]: valor || undefined }));
  const enLaCabecera = {
    species: true,
    product: true,
    destino: section === "despacho",
    salida: section === "produccion" && colsProduccion.salida,
    permiso: section === "produccion" && colsProduccion.permiso,
  };
  const filtroCol = (id: keyof typeof enLaCabecera, options: FacetaOpcion[], extra: { etiqueta?: (v: string) => string; placeholder?: string } = {}) =>
    enLaCabecera[id]
      ? { value: (facetas[id] as string | undefined) ?? "", options, onChange: (v: string) => setFaceta(id, v), ...extra }
      : undefined;
  /**
   * Los rangos numéricos («≥ 0.5 m³», «entre 10 y 20 piezas»): mismo `facetas`,
   * otra clave. Un rango vacío se BORRA en vez de guardarse como
   * `{min:null,max:null}` — si quedara, el badge de «Filtros» contaría uno que
   * no filtra nada.
   */
  const setRango = (campo: CampoRango, r: RangoNumerico) =>
    setFacetas((f) => {
      const rangos = { ...f.rangos };
      if (rangoActivo(r)) rangos[campo] = r;
      else delete rangos[campo];
      return { ...f, rangos: Object.keys(rangos).length > 0 ? rangos : undefined };
    });
  const rangoCol = (campo: CampoRango) => ({
    valor: facetas.rangos?.[campo],
    onChange: (r: RangoNumerico) => setRango(campo, r),
  });
  const filtrosColumna = {
    species: filtroCol("species", opciones.species, { placeholder: "Todas" }),
    product: filtroCol("product", opciones.products),
    destino: filtroCol("destino", opciones.destinos),
    salida: filtroCol("salida", opciones.salidas, { etiqueta: (v: string) => SALIDA_LABEL[v as ClaveSalida] ?? v, placeholder: "Todas" }),
    permiso: filtroCol("permiso", opciones.permisos),
    /* Sólo en Producción: son sus columnas. Despacho no tiene consumido ni rend. */
    rangos:
      section === "produccion"
        ? { consumido: rangoCol("consumido"), piezas: rangoCol("piezas"), rend: rangoCol("rend") }
        : undefined,
  };
  /** Despacho para el que se está emitiendo el ANEXO N° 04 de la GTF. */
  const [anexoEntry, setAnexoEntry] = useState<CtpEntry | null>(null);
  // Los avisos del anexo (descargó, no se pudo, cargué el ya emitido) necesitan
  // dónde salir: sin esto el modal hablaba solo cuando se abría desde el Libro.
  const { toasts, push: pushToast, dismiss: dismissToast } = useActionToasts();
  const [showForm, setShowForm] = useState(false);
  /** Carga masiva del parte de turno (ADR-323), sólo en Producción. */
  const [importarParte, setImportarParte] = useState(false);
  /** Con qué producto abrir el formulario (viene de Saldos; se consume una vez). */
  const [productoDelStock, setProductoDelStock] = useState<{ producto: string; especie: string | null } | null>(null);

  // El producto que llega desde el stock abre el formulario una sola vez: se
  // avisa al padre para que lo limpie y volver a Saldos → Despacho no reabra
  // el modal con lo de la vez pasada.
  useEffect(() => {
    /* Sólo Despacho: en Producción no queda formulario que abrir y `showForm`
       en true apagaría los atajos de la vista sin dibujar nada. */
    if (!presetProducto || section !== "despacho") return;
    setProductoDelStock({ producto: presetProducto, especie: presetEspecie ?? null });
    setShowForm(true);
    onPresetUsado?.();
  }, [presetProducto, presetEspecie, onPresetUsado, section]);

  /**
   * La corrida sin declarar cuyo panel está abierto arriba de la tabla.
   *
   * Se guarda el ID y no la fila: así el panel se cierra solo cuando esa corrida
   * deja de estar pendiente (se declaró, se anuló) en vez de quedar mostrando
   * una copia vieja de algo que ya no existe.
   */
  const [corridaAbiertaId, setCorridaAbiertaId] = useState<string | null>(null);
  /** El lote que se está produciendo (ADR-349): su tabla de trozas se abre debajo. */
  const [loteProd, setLoteProd] = useState("");
  /** Piezas ya elegidas en otra pantalla que el panel del lote debe respetar. */
  const [preseleccion, setPreseleccion] = useState<string[] | undefined>(undefined);
  /**
   * Los despachos del período que HOY no podrían certificar, con su motivo.
   * Se pide con la misma ventana que la tabla: un hueco de otro mes no es
   * deuda de esta pantalla.
   */
  const [sinCertificar, setSinCertificar] = useState<DespachoSinCertificar[] | null>(null);
  useEffect(() => {
    if (section !== "despacho") return;
    const qs = new URLSearchParams({ traza: "1" });
    if (period.from) qs.set("from", period.from);
    if (period.to) qs.set("to", period.to);
    let vivo = true;
    fetch(`/api/admin/forestal/ctp?${qs}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { traza: null }))
      .then((j: { traza?: { detalle?: DespachoSinCertificar[] } }) => {
        if (vivo) setSinCertificar(j.traza?.detalle ?? []);
      })
      /* Es un aviso, no un bloqueo: sin la traza la pantalla sigue sirviendo
         para despachar, sólo que sin el resumen de lo que falta. */
      .catch(() => { if (vivo) setSinCertificar(null); });
    return () => { vivo = false; };
  }, [section, period.from, period.to, entries.length]);
  const lotes = useLotesAserrio();
  /** Los lotes que se pueden aserrar hoy, con lo que tienen esperando: se elige
   *  por peso (piezas y m³), no por nombre — el código del lote no dice nada. */
  /**
   * Los lotes que Producción puede usar (Brandon, 2026-09-02: «ahí estarán los
   * lotes para usar de aserrada y también aparecen los lotes de inventario que
   * se podrán usar para el volumen restante»).
   *
   * Antes: sólo `abierto` CON piezas. Eso dejaba afuera dos casos que existen
   * y que se declaran desde acá:
   *
   *  - **Lotes de inventario** ([[ctp-lote-inventario-2026-08-31]]): nacen sin
   *    trozas —son una existencia previa al sistema— así que `piezas` es 0 y
   *    nunca entraban en la lista, aunque su volumen sea justo lo que hay que
   *    declarar.
   *  - **Lotes con margen sin declarar** (ADR-365): ya aserrados, pero a los
   *    que les queda volumen por debajo del tope antes de cerrar. Ese resto se
   *    declara desde Producción y no había desde dónde tomarlo.
   *
   * El `status` deja de ser el filtro: lo es tener ALGO que declarar.
   */
  const lotesConMadera = useMemo(
    () =>
      lotes.lotes
        .filter((l) => l.status !== "cerrado")
        .map((l) => {
          /* Las piezas APARTADAS en el lote, no el patio de su especie: la
             tarjeta promete lo que se va a ver al abrirla. Con `trozasDelLote`
             un lote de 6 anunciaba «26 pza» —las 26 Tornillo del patio— y la
             tabla de abajo mostraba otra cosa. */
          const delLote = lotes.trozas.filter((t) => t.loteAserrioId === l.id);
          const suyas = delLote.filter((t) => !t.consumidaEnId);
          return {
            lote: l,
            piezas: suyas.length,
            volumenM3: Math.round(suyas.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0) * 10000) / 10000,
            /* Las que YA se aserraron (ADR-356): con esto la tarjeta puede
               decir que lo que se ve es el RESTO de un lote a medias, y no un
               lote nuevo esperando su primera corrida. */
            consumidas: delLote.length - suyas.length,
            /* Lo que le falta declarar al tope (ADR-358/365). `margenLote` sólo
               lo devuelve si el lote tiene una corrida VIVA: un lote abierto y
               sin producir da `null`, que es lo correcto — todavía no hay nada
               a medio declarar. */
            margenM3: margenLote(l)?.margenM3 ?? 0,
            inventario: esLoteDeInventario(l),
          };
        })
        /*
         * Entra si tiene madera LIBRE apartada, si le queda margen por declarar
         * (recuperación), o si es de inventario (nunca va a tener piezas y su
         * volumen es todo lo que hay).
         *
         * `lote.piezas` —el conteo del servidor— sólo vale como red para un
         * lote ABIERTO cuyo patio todavía no llegó al navegador: sobre uno ya
         * aserrado cuenta las piezas consumidas y colaba en la lista lotes que
         * no tienen nada que meter a la sierra (su trabajo pendiente ya está
         * representado por su corrida sin declarar, más abajo en el menú).
         */
        .filter(
          (x) =>
            x.piezas > 0 ||
            x.margenM3 > 0.01 ||
            x.inventario ||
            (x.lote.status === "abierto" && x.lote.piezas > 0),
        ),
    [lotes.lotes, lotes.trozas],
  );
  /* Se busca en TODOS los lotes y no sólo en los que tienen madera: el que llega
     desde la pestaña Lotes puede estar vacío todavía, y el panel sabe decir «no
     hay piezas» mucho mejor que una pantalla que no abre nada. */
  const loteElegido = useMemo(
    () => lotes.lotes.find((l) => l.id === loteProd) ?? null,
    [lotes.lotes, loteProd],
  );
  /**
   * Las corridas que consumieron y todavía no dijeron qué salió (ADR-340).
   * `quantity == null` es exactamente eso: materia prima adentro, producto sin
   * declarar. No es lo mismo que producir cero.
   */
  /* La sección se pagina del lado del cliente sobre el set del período, con la
     MISMA barra que el resto de las tablas del libro (ADR-344). */
  const { visibles: filasEnPagina, rango, porPagina, setPorPagina, ir } = usePaginacion(visible);
  const enProceso = useMemo(
    () => (section === "produccion" ? entries.filter((e) => e.status === "registrado" && e.quantity == null) : []),
    [entries, section],
  );
  /** La corrida del panel, releída de la lista: si ya se declaró, desaparece. */
  const corridaAbierta = useMemo(
    () => enProceso.find((e) => e.id === corridaAbiertaId) ?? null,
    [enProceso, corridaAbiertaId],
  );
  /**
   * Las corridas que ya declararon y todavía admiten producción de la MISMA
   * materia prima (ADR-365).
   *
   * No se listan todas juntas a propósito: casi toda corrida rinde menos del
   * tope y una lista de «les falta» leería el techo como una meta, que es
   * exactamente lo que ADR-358 no quiere. Se ofrece como atajo en la fila —el
   * operador ya sabe cuál es su corrida— y en el panel del lote.
   */
  const ampliables = useMemo(
    () => (section === "produccion" ? corridasAMedioDeclarar(entries) : []),
    [entries, section],
  );
  const idsAmpliables = useMemo(() => new Set(ampliables.map((c) => c.id)), [ampliables]);
  /** La corrida cuyo panel de ampliación está abierto arriba de la tabla. */
  const [ampliarId, setAmpliarId] = useState<string | null>(null);
  /** Despacho al que se le están adjuntando papeles (ADR-371). */
  const [papelesEntry, setPapelesEntry] = useState<CtpEntry | null>(null);
  /** La línea cuya guía se está mirando/editando (ADR-374). */
  const [guiaEntry, setGuiaEntry] = useState<CtpEntry | null>(null);
  const ampliando = useMemo(
    () => ampliables.filter((c) => c.id === ampliarId),
    [ampliables, ampliarId],
  );
  /**
   * Las piezas que ESA corrida se comió (ADR-326). Salen del mismo patio que
   * alimenta los lotes —`trozasDelPatio` trae también las consumidas— así que no
   * hay una segunda lectura de la misma madera que pueda decir otra cosa.
   */
  const trozasDeLaCorrida = useMemo(
    () => (corridaAbiertaId ? lotes.trozas.filter((t) => t.consumidaEnId === corridaAbiertaId) : []),
    [lotes.trozas, corridaAbiertaId],
  );
  /** El lote del que salió, si todavía existe: le da sus fechas al formulario. */
  const loteDeLaCorrida = useMemo(
    () =>
      corridaAbierta?.materiaPrimaRef
        ? (lotes.lotes.find((l) => l.code === corridaAbierta.materiaPrimaRef) ?? null)
        : null,
    [corridaAbierta, lotes.lotes],
  );
  /**
   * Lo que le quedó al lote de esa corrida: es lo único que todavía se elige.
   * Van las PIEZAS y no su cuenta — el panel las tilda una por una (ADR-364).
   */
  const restoDelLote = useMemo(() => {
    if (!loteDeLaCorrida || loteDeLaCorrida.status !== "abierto") return null;
    const libres = lotes.trozas.filter((t) => t.loteAserrioId === loteDeLaCorrida.id && !t.consumidaEnId);
    if (libres.length === 0) return null;
    return {
      loteId: loteDeLaCorrida.id,
      code: loteDeLaCorrida.code,
      trozas: libres,
      volumenM3: Math.round(libres.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0) * 10000) / 10000,
    };
  }, [loteDeLaCorrida, lotes.trozas]);
  /* «Producir este lote» abre el panel del lote, no un formulario en blanco: es
     el mismo camino que elegirlo desde el CTA (ADR-349). */
  useEffect(() => {
    if (!presetLoteAserrioId) return;
    setLoteProd(presetLoteAserrioId);
    setPreseleccion(undefined);
    /* Y se cierra el panel de la corrida: los dos se dibujan en el mismo lugar
       y llegar desde Lotes con uno abierto apilaba dos tablas de trozas. */
    setCorridaAbiertaId(null);
    onPresetUsado?.();
  }, [presetLoteAserrioId, onPresetUsado]);
  const [showSim, setShowSim] = useState(false);
  /** Cada incremento abre el menú de lotes (lo dispara la tecla `N`). */
  const [abrirLotes, setAbrirLotes] = useState(0);
  /** Ídem para el de corridas sin declarar: lo dispara su KPI. */
  const [abrirDeclarar, setAbrirDeclarar] = useState(0);
  const [annulId, setAnnulId] = useState<string | null>(null);
  const [annulReason, setAnnulReason] = useState("");
  const [pending, setPending] = useState(false);
  const [toProductId, setToProductId] = useState<string | null>(null);
  const [toProductMsg, setToProductMsg] = useState<string | null>(null);
  // Cadena de custodia (solo despacho): trazabilidad + COGS + certificado.
  const [chainEntry, setChainEntry] = useState<CtpEntry | null>(null);
  // Filtro por estado (chips, como Ingresos) + orden por columna, client-side
  // sobre el set completo del período (search es server-side, sin paginación).
  async function annul() {
    if (!annulId || annulReason.trim().length < 3) return;
    setPending(true);
    try {
      const r = await fetch("/api/admin/forestal/ctp", { method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify({ id: annulId, action: "annul", reason: annulReason.trim() }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setAnnulId(null); setAnnulReason(""); await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      /* La anulación se dispara desde una fila, y en Producción esa fila vive
         dentro del modal del libro: el cartel de arriba quedaría tapado. El
         toast (z-70) sale por encima de cualquiera de los dos. */
      pushToast({ tono: "warning", msg: "No se pudo anular la línea", detail: msg });
    }
    finally { setPending(false); }
  }

  async function sendToInventory(entryId: string) {
    setToProductId(entryId);
    setToProductMsg(null);
    try {
      const r = await fetch("/api/admin/forestal/ctp/to-product", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ entryId }),
      });
      const json: { ok?: boolean; message?: string; error?: string } = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.message ?? `HTTP ${r.status}`);
      setToProductMsg(json.message ?? "Creado como borrador en inventario.");
    } catch (e) {
      setToProductMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setToProductId(null);
    }
  }


  /**
   * Atajos de la vista, los mismos que en Ingresos para no tener que aprender
   * dos teclados: `N` abre el alta, `/` va al buscador, `R` recarga. Se apagan
   * mientras se escribe, con modal abierto y con cualquier modificador (Ctrl+N
   * del navegador no se toca).
   */
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const t = ev.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return;
      if (showForm || showSim || anexoEntry || chainEntry || verBandeja || annulId) return;
      /* Con el libro abierto, `N` elegiría un lote detrás del modal. El resto
         de los atajos sí siguen vivos: buscar y recargar son de la tabla. */
      if (verLibro && (ev.key === "n" || ev.key === "N")) return;

      if (ev.key === "n" || ev.key === "N") {
        ev.preventDefault();
        /* En Producción `N` abre el MISMO menú de lotes que el CTA: si abriera
           otra cosa, serían dos caminos para el mismo acto. */
        if (section === "produccion") setAbrirLotes((n) => n + 1);
        else setShowForm(true);
      } else if (ev.key === "/") {
        ev.preventDefault();
        /* En Producción el buscador vive DENTRO del libro: `/` lo abre y recién
           ahí enfoca —si no, el atajo apuntaría a un input que no existe. */
        if (section === "produccion" && !verLibro) {
          setVerLibro(true);
          window.setTimeout(() => document.getElementById(`ctp-search-${section}`)?.focus(), 80);
        } else {
          document.getElementById(`ctp-search-${section}`)?.focus();
        }
      } else if (ev.key === "r" || ev.key === "R") {
        ev.preventDefault();
        void load();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [section, load, showForm, showSim, anexoEntry, chainEntry, verBandeja, annulId, verLibro]);

  /** Opciones de los selectores: salen de lo cargado, no de un catálogo. */
  /** Descarga lo filtrado, con las columnas de la sección. */
  function descargarCsv() {
    const csv = seccionACsv(section, visible);
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivoSeccion(section, period.label);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    pushToast({
      tono: "success",
      msg: `${visible.length} ${visible.length === 1 ? "línea descargada" : "líneas descargadas"}`,
      detail: "Se abre en Excel con las columnas ya separadas.",
    });
  }

  const toggleSort = (by: SortKey) =>
    setSort((s) => (s.by === by ? { by, dir: s.dir === "asc" ? "desc" : "asc" } : { by, dir: "desc" }));

  /**
   * Los tres menús de la barra (ADR-360). Su contenido vive en
   * `ctp-entries-acciones`: son configuración —qué se ofrece, con qué
   * explicación y con qué cifra— y acá sólo se les atan los estados.
   *
   * La barra llegó a tener nueve controles en un renglón —buscar, filtros,
   * descargar, recargar, simular, parte de turno, dos selectores y el CTA— y a
   * 1280px envolvía a tres filas.
   */
  const opcionesMenu = useMemo(
    () =>
      accionesDeSeccion({
        section,
        visibles: visible.length,
        cargando: loading,
        totalAnexos,
        onDescargar: descargarCsv,
        onRecargar: () => void load(),
        onSimular: () => setShowSim(true),
        onParteDeTurno: () => setImportarParte(true),
        onAnexos: () => setVerBandeja(true),
        /* Sólo Producción: en Despacho la tabla sigue en la pantalla y una
           opción que abriera lo mismo en un modal sería un segundo camino. */
        onLibro: section === "produccion" ? () => setVerLibro(true) : undefined,
      }),
    // `descargarCsv` se redefine en cada render (cierra sobre `visible`): lo que
    // realmente cambia el menú es la sección, lo filtrado y lo que está en curso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [section, visible.length, loading, totalAnexos, load],
  );

  const lotesMenu = useMemo(
    () =>
      accionesDeLotes({
        lotes: lotesConMadera,
        loteAbierto: loteProd,
        /* Volver a elegir el lote abierto cierra su panel: el mismo gesto que
           lo abrió, que es lo que se espera de una opción marcada. */
        onElegir: (id) => {
          /* Elegir a mano parte de cero: arrastrar una preselección de otra
             pantalla haría que el lote se abra con tres tildadas sin motivo. */
          setPreseleccion(undefined);
          setAmpliarId(null);
          return setLoteProd((actual) => {
            /* Dos paneles distintos sobre la misma tabla se pisarían: abrir uno
               cierra el otro. */
            if (actual !== id) setCorridaAbiertaId(null);
            return actual === id ? "" : id;
          });
        },
        onIr,
      }),
    [lotesConMadera, loteProd, onIr],
  );

  const declararMenu = useMemo(
    () =>
      accionesPorDeclarar(
        enProceso,
        (c) => {
          setAmpliarId(null);
          setCorridaAbiertaId((actual) => {
            if (actual !== c.id) setLoteProd("");
            return actual === c.id ? null : c.id;
          });
        },
        corridaAbiertaId,
      ),
    [enProceso, corridaAbiertaId],
  );
  /**
   * Los dos grupos juntos, en el orden del trabajo: primero lo que se puede
   * meter a la sierra, después lo que ya salió de ella y falta declarar.
   *
   * El separador es lo que impide que se lean como una sola lista: elegir un
   * lote abre sus trozas para tildar; elegir una corrida abre el panel para
   * decir qué salió. Son dos actos distintos.
   */
  const menuLotes: MenuAccion[] = useMemo(() => {
    if (declararMenu.length === 0) return lotesMenu;
    const [primeroPorDeclarar, ...restoPorDeclarar] = declararMenu;
    return [
      ...lotesMenu,
      { ...primeroPorDeclarar, dividerBefore: true },
      ...restoPorDeclarar,
    ];
  }, [lotesMenu, declararMenu]);

  const Icon = meta.icon;
  return (
    <div className="space-y-3">
      {/* Ocho KPIs y no tres (`CtpSeccionKpis`): los m³ de materia prima eran el
          subtítulo de otra tarjeta, y merma, stock en planta, corridas sin
          declarar y materia prima sin origen no estaban en ningún lado. */}
      <CtpSeccionKpis
        section={section}
        kpis={kpis}
        soloVigentes={statusFilter === "registrado"}
        onSoloVigentes={() => setStatusFilter((f) => (f === "registrado" ? "" : "registrado"))}
        sinAnexo={sinAnexo}
        soloSinAnexo={soloSinAnexo}
        onSoloSinAnexo={() => setSoloSinAnexo((v) => !v)}
        /* La deuda lleva a resolverla: la tarjeta abre el mismo menú del botón. */
        onVerPendientes={() => setAbrirDeclarar((n) => n + 1)}
        /* La misma cuenta que dibuja el atajo de la fila (ADR-365): si la
           tarjeta la calculara aparte, podría decir 3 con 2 íconos en la tabla. */
        ampliables={idsAmpliables.size}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* En Producción el buscador se fue con la tabla —vive en el modal del
            libro— y en su lugar la barra dice qué se hace en esta pantalla y
            dónde quedó lo ya declarado. Un input que no filtra nada de lo que
            se ve es peor que ninguno. */}
        {section === "produccion" ? (
          <p className="min-w-0 flex-1 text-sm text-[var(--text-secondary)]">
            Elegí en <b className="text-[var(--text-primary)]">Lotes</b> la madera que entra hoy a la sierra: abajo
            sale su lista de trozas. Lo ya declarado está en{" "}
            <b className="text-[var(--text-primary)]">Opciones → Producción · Todos y registrados</b>.
          </p>
        ) : (
          <BuscadorSeccion section={section} label={meta.label} value={searchInput} onChange={setSearchInput} />
        )}
        {/* Tres controles y no nueve (ADR-360): filtrar, el resto plegado en
            «Opciones», y el CTA. Lo pendiente —declarar una corrida abierta—
            tiene su propio botón porque es deuda del libro, no una opción. */}
        <div className="flex items-center gap-2">
          {/* Filtrar y elegir columnas son de la TABLA: en Producción viajan
              con ella adentro del modal del libro. */}
          {section === "despacho" && (
            <BotonFiltros activos={activos} abierto={abierto} panelId={panelId} onToggle={alternar} />
          )}
          <ActionMenu
            label="Opciones"
            title="Descargar, recargar y las tareas del período"
            actions={opcionesMenu}
            size="md"
            compactoEnMovil
          />
          {/*
            UN solo menú «Lotes» (Brandon, 2026-09-02): antes eran dos botones
            —«Corridas sin declarar» y el CTA de elegir lote— más una tira de
            tarjetas debajo con el mismo contenido. Tres lugares para el mismo
            acto: decidir sobre qué madera se trabaja hoy.

            Adentro va todo lo que tiene trabajo pendiente, en dos grupos:
            primero los lotes con trozas para meter a la sierra, y después los
            ya aserrados a los que hay que sacarles la producción (la
            recuperación de ADR-340/365).
          */}
          {section === "produccion" ? (
            <ActionMenu
              label="Lotes"
              title="Los lotes con madera para aserrar y los ya aserrados a los que falta declararles lo que salió (atajo: N)"
              actions={menuLotes}
              badge={declararMenu.length > 0 ? declararMenu.length : undefined}
              icon={Boxes}
              variant="primary"
              size="md"
              className="max-sm:flex-1"
              abrirSignal={abrirLotes + abrirDeclarar}
              vacio="No hay lotes con madera ni corridas por declarar. Armá uno en la pestaña Lotes."
            />
          ) : (
            <button type="button" onClick={() => setShowForm(true)} className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark)] px-5 text-base font-bold text-white shadow-sm transition hover:brightness-110 sm:flex-none">
              <Plus className="h-5 w-5" /> {meta.cta}
            </button>
          )}
        </div>
      </div>
      {showSim && section === "produccion" && <CtpSimuladorModal onClose={() => setShowSim(false)} />}

      {/* Con el libro cerrado sus carteles no tienen dónde salir: se muestran
          acá. Nunca aparecen dos veces — `ZonaLibro` sólo existe abierta. */}
      {section === "produccion" && !verLibro && (
        <AvisosDelLibro error={error} mensaje={toProductMsg} onCerrarMensaje={() => setToProductMsg(null)} />
      )}

      {/* La corrida que ya consumió, con SUS TROZAS arriba de la tabla del
          libro: se elige en «Corridas sin declarar» y hasta ahora abría un
          formulario en blanco, sin mostrar la madera contra la que se declara. */}
      {section === "produccion" && corridaAbierta && (
        <CtpCorridaSinDeclarar
          corrida={corridaAbierta}
          trozas={trozasDeLaCorrida}
          lote={loteDeLaCorrida}
          resto={restoDelLote}
          cargando={lotes.cargando}
          /* Lo que todavía se ELIGE es lo que le queda al lote: el atajo cierra
             esta corrida y abre el panel donde se tildan sus trozas. */
          onProducirResto={(loteId, trozaIds) => {
            setCorridaAbiertaId(null);
            setPreseleccion(trozaIds);
            setLoteProd(loteId);
          }}
          onCerrar={() => setCorridaAbiertaId(null)}
          /* Sumar piezas engorda la corrida pero NO la cierra: se recarga la
             tabla (su volumen consumido cambió) y el panel se queda abierto
             para declarar lo que salga (ADR-364). */
          onSumarPiezas={({ loteId, trozaIds }) =>
            lotes.sumarACorrida({ loteId, corridaId: corridaAbierta.id, trozaIds })
          }
          onQuitarPiezas={({ trozaIds }) =>
            lotes.quitarDeCorrida({ corridaId: corridaAbierta.id, trozaIds })
          }
          onAviso={(msg, detalle) => {
            pushToast({ tono: "success", msg, detail: detalle });
            void load();
          }}
          onListo={(msg, detalle) => {
            pushToast({ tono: "success", msg, detail: detalle });
            setCorridaAbiertaId(null);
            void load();
          }}
          onError={(msg) => {
            pushToast({ tono: "warning", msg: "La producción no se pudo declarar", detail: msg });
            void load();
          }}
        />
      )}

      {/**
       * Agregar producción a una corrida ya declarada (ADR-365), desde la fila
       * del libro: es la puerta para la corrida cuyo lote ya se consumió entero
       * —ésa no aparece en el menú de lotes— y para la que nunca tuvo lote.
       */}
      {section === "produccion" && ampliando.length > 0 && (
        <CtpProduccionPendiente
          corridas={ampliando}
          trozas={lotes.trozas}
          titulo="Agregar producción a esta corrida"
          onListo={(msg, detalle) => {
            pushToast({ tono: "success", msg, detail: detalle });
            setAmpliarId(null);
            void load();
            void lotes.recargar();
          }}
          onError={(msg) =>
            pushToast({ tono: "warning", msg: "No se pudo ampliar la corrida", detail: msg })
          }
        />
      )}

      {/* La tira «Elegí el lote que entra a la sierra» se quitó (Brandon,
          2026-09-02: «quitalo porque ya estará en ese campo Lotes»): repetía,
          en tarjetas y ocupando media pantalla, exactamente las mismas
          opciones que ahora lista el menú «Lotes» de la barra de arriba. */}

      {section === "produccion" && loteElegido && (
        <CtpProduccionDeLote
          lote={loteElegido}
          preseleccion={preseleccion}
          lotes={lotesConMadera.map((x) => x.lote)}
          onLote={setLoteProd}
          estado={lotes}
          onCerrar={() => setLoteProd("")}
          /* Cerrar el LOTE: su madera vuelve al patio y el panel se va con él
             —ya no hay lote abierto que mostrar—, así que el aviso es un toast. */
          onCerrarLote={async (motivo) => {
            const r = await lotes.cerrarLote({ loteId: loteElegido.id, motivo });
            pushToast({
              tono: "success",
              msg: `Lote ${r.code} cerrado`,
              detail:
                r.liberadas > 0
                  ? `${r.liberadas} troza${r.liberadas === 1 ? "" : "s"} (${fmtM3(r.volumenM3)} m³) volvieron al patio` +
                    (r.teniaCorridas ? ". Lo que ya se aserró queda en el libro." : ".")
                  : "No le quedaba madera libre.",
            });
            setLoteProd("");
            return r;
          }}
          onListo={(msg, detalle) => {
            pushToast({ tono: "success", msg, detail: detalle });
            setLoteProd("");
            void load();
          }}
          /* Ampliar una corrida del lote NO cierra el panel: el lote sigue
             abierto con sus trozas esperando, y cerrarlo obligaría a volver a
             elegirlo para seguir (ADR-365). */
          onAviso={(msg, detalle) => {
            pushToast({ tono: "success", msg, detail: detalle });
            void load();
          }}
          onError={(msg) => {
            /* Toast y no cartel: si el consumo salió y la declaración no, este
               bloque se desmonta —el lote ya no está abierto— y el aviso se iría
               con él. */
            pushToast({ tono: "warning", msg: "La producción no se pudo declarar", detail: msg });
            void load();
          }}
        />
      )}

      {/*
        El lugar que ocupaba la tabla del libro es ahora la LISTA DE TROZAS DEL
        LOTE (Brandon, 2026-09-02): en Producción lo que se mira es la madera
        que va a entrar hoy a la sierra, no lo que ya se declaró.

        Con un lote elegido esa lista la dibuja `CtpProduccionDeLote` acá arriba
        —con sus checkboxes, su selección por rango y su barra de totales—. Sin
        lote, la tabla queda igual a la vista, vacía y con las columnas del
        formato, diciendo qué falta hacer: una pantalla en blanco no enseña
        dónde se empieza.
      */}
      {section === "produccion" && !loteElegido && !corridaAbierta && ampliando.length === 0 && (
        <div className="space-y-3">
          <CtpTrozasDelLote
            trozas={[]}
            soloLectura
            fechaConsumo={hoy}
            vacio={
              lotesConMadera.length > 0
                ? "Todavía no elegiste el lote. Abrí «Lotes» y elegí cuál entra hoy a la sierra: acá salen sus trozas con GTF, código de planta, diámetros y volumen."
                : "No hay lotes con madera esperando. Armá uno en «Lotes de aserrío» y sus trozas van a salir en esta lista."
            }
          />
          <div className="flex justify-center">
            {lotesConMadera.length > 0 ? (
              <button
                type="button"
                onClick={() => setAbrirLotes((v) => v + 1)}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark)] px-5 text-base font-bold text-white shadow-sm transition hover:brightness-110"
              >
                <Boxes className="h-5 w-5" aria-hidden />
                Elegir el lote que entra a la sierra
              </button>
            ) : (
              onIr && (
                <button
                  type="button"
                  onClick={() => onIr("lotes")}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 text-base font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]"
                >
                  <Boxes className="h-5 w-5" aria-hidden />
                  Armar un lote de aserrío
                </button>
              )
            )}
          </div>
        </div>
      )}

      {/* Lo que impide certificar, arriba de la tabla y no escondido en otra
          pestaña: es deuda que se paga antes de que salga el próximo camión. */}
      {section === "despacho" && sinCertificar !== null && (
        <CtpSinCertificar despachos={sinCertificar} onAbrir={(id) => {
          const d = entries.find((e) => e.id === id);
          if (d) setChainEntry(d);
        }} />
      )}

      {/*
        El libro: en Despacho acá mismo, en Producción dentro del modal que abre
        «Opciones → Producción · Todos y registrados» (Brandon, 2026-09-02).
        Es la MISMA tabla con el mismo estado — chips, filtros, columnas,
        paginación y totales viajan con ella.
      */}
      <ZonaLibro
        enModal={section === "produccion"}
        abierto={verLibro}
        onCerrar={() => setVerLibro(false)}
        subtitulo={`${visible.length} ${visible.length === 1 ? "línea" : "líneas"} en ${period.label}`}
      >
      {/* En el modal el buscador y los filtros van con la tabla: adentro se
          consulta el libro entero sin tener que cerrarlo para buscar. */}
      {section === "produccion" && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <BuscadorSeccion section={section} label={meta.label} value={searchInput} onChange={setSearchInput} />
          <div className="flex items-center gap-2">
            <BotonFiltros activos={activos} abierto={abierto} panelId={panelId} onToggle={alternar} />
            <ColumnasMenu columnas={COLUMNAS_PRODUCCION_OPCIONALES} visibles={colsProduccion} onChange={setColsProduccion} />
          </div>
        </div>
      )}

      {/* "Importé 17 m³ y acá sale menos": no se perdió nada — el período
          activo (por fecha) esconde corridas que SÍ existen. "Productos
          disponibles" no filtra por fecha y ya las cuenta; acá se avisa y se
          ofrece el mismo atajo en vez de mandar a buscarlo en el selector. */}
      {escondidasPorPeriodo > 0 && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--data-info-500)]/10 px-4 py-2.5 text-sm font-semibold text-[var(--data-info-700)] dark:text-[var(--data-info-500)]">
          <Calendar className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            {escondidasPorPeriodo} {escondidasPorPeriodo === 1 ? "corrida más existe" : "corridas más existen"} fuera
            de «{period.label}» — Productos disponibles ya {escondidasPorPeriodo === 1 ? "la cuenta" : "las cuenta"}.
          </span>
          {onVerTodoElHistorico && (
            <button
              type="button"
              onClick={onVerTodoElHistorico}
              className="font-bold underline decoration-dotted underline-offset-2 hover:text-[var(--text-primary)]"
            >
              Ver todo el histórico
            </button>
          )}
        </p>
      )}

      {/* Filtro por estado (chips, consistente con Ingresos): oculta anulados de un clic. */}
      {statusCounts.total > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <EntryChip label="Todos" count={statusCounts.total} active={statusFilter === ""} onClick={() => setStatusFilter("")} />
          {section === "despacho" && sinAnexo > 0 && (
            <EntryChip
              label="Sin anexo 04"
              count={sinAnexo}
              active={soloSinAnexo}
              tone="muted"
              onClick={() => setSoloSinAnexo((v) => !v)}
            />
          )}
          <EntryChip label="Registrados" count={statusCounts.registrado} active={statusFilter === "registrado"} onClick={() => setStatusFilter((f) => (f === "registrado" ? "" : "registrado"))} />
          {statusCounts.anulado > 0 && (
            <EntryChip label="Anulados" count={statusCounts.anulado} active={statusFilter === "anulado"} tone="muted" onClick={() => setStatusFilter((f) => (f === "anulado" ? "" : "anulado"))} />
          )}
        </div>
      )}

      {abierto && (
        <CtpFiltrosPanel
          id={panelId}
          activos={activos}
          /* `soloMobile` = «esta columna ya tiene su filtro en la cabecera».
             En desktop el panel se queda con las marcas y con lo que la tabla
             no está mostrando; en móvil (sin tabla) los muestra todos. */
          selects={[
            { id: "species", label: "Especie", value: facetas.species ?? "", options: opciones.species, soloMobile: enLaCabecera.species },
            { id: "product", label: "Producto", value: facetas.product ?? "", options: opciones.products, soloMobile: enLaCabecera.product },
            ...(section === "despacho"
              ? [{ id: "destino", label: "Destino", value: facetas.destino ?? "", options: opciones.destinos, soloMobile: enLaCabecera.destino }]
              : [
                  {
                    id: "salida",
                    label: "Salida",
                    value: facetas.salida ?? "",
                    options: opciones.salidas,
                    etiqueta: (v: string) => SALIDA_LABEL[v as ClaveSalida] ?? v,
                    soloMobile: enLaCabecera.salida,
                  },
                  { id: "permiso", label: "N° Permiso", value: facetas.permiso ?? "", options: opciones.permisos, soloMobile: enLaCabecera.permiso },
                ]),
          ]}
          toggles={[{ id: "cites", label: "CITES", on: facetas.cites === true }]}
          onSelect={setFaceta}
          onToggle={() => setFacetas((f) => ({ ...f, cites: f.cites === true ? undefined : true }))}
          onLimpiar={() => setFacetas({})}
        />
      )}

      {/**
       * Los rangos puestos, a la vista y con su cruz.
       *
       * Un rango vive en la cabecera de su columna, y esa columna se puede
       * APAGAR desde «Columnas»: sin este renglón quedaría la tabla acotada y
       * ningún control para desacotarla. Misma regla que los chips del patio —
       * un filtro escondido que explica por qué falta madera es peor que un
       * renglón de más.
       */}
      {rangosPuestos(facetas).length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {rangosPuestos(facetas).map(({ campo, texto }) => (
            <button
              key={campo}
              type="button"
              onClick={() => setRango(campo, { min: null, max: null })}
              title="Quitar este rango"
              className="inline-flex items-center gap-1 rounded-full border-2 border-[var(--accent)] bg-primary/10 px-2.5 py-1 text-sm font-bold tabular-nums text-[var(--accent-ink)] transition-colors hover:bg-primary/20 dark:text-[var(--accent)]"
            >
              {texto}
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ))}
        </div>
      )}

      <AvisosDelLibro error={error} mensaje={toProductMsg} onCerrarMensaje={() => setToProductMsg(null)} />

      {/* Las filas viven aparte (CtpEntriesTabla): acá quedan el estado, los
          KPIs, los filtros y los modales. */}
      <CtpEntriesTabla
        section={section}
        visible={filasEnPagina}
        sort={sort}
        onSort={toggleSort}
        conAnexo={conAnexo}
        toProductId={toProductId}
        onChain={setChainEntry}
        onAnexo={setAnexoEntry}
        onSendInventory={sendToInventory}
        onAnnul={(id) => { setAnnulId(id); setAnnulReason(""); }}
        ampliables={idsAmpliables}
        onPapeles={setPapelesEntry}
        onGuia={setGuiaEntry}
        onAmpliar={(id) => {
          /* Un solo panel arriba de la tabla: abrir éste cierra el del lote y el
             de la corrida sin declarar, como entre ellos dos. */
          setLoteProd("");
          setCorridaAbiertaId(null);
          setAmpliarId((actual) => (actual === id ? null : id));
        }}
        totalesVista={totalesVista}
        colsProduccion={colsProduccion}
        filtrosColumna={filtrosColumna}
      />

      {visible.length > 0 && (
        <CtpPaginacion
          rango={rango}
          porPagina={porPagina}
          onPorPagina={setPorPagina}
          onIr={ir}
          sustantivo={section === "produccion" ? "corrida" : "despacho"}
          plural={section === "produccion" ? "corridas" : "despachos"}
        />
      )}

      {/* Filtro activo sin resultados (pero sí hay datos): distinto de "sin datos". */}
      {!loading && entries.length > 0 && visible.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-8 text-center text-sm text-[var(--text-tertiary)]">
          Ninguna línea {statusFilter === "anulado" ? "anulada" : statusFilter === "registrado" ? "registrada" : ""} en {period.label}.
        </div>
      )}

      {/* ── Estados compartidos (vacío / cargando) ── */}
      {!loading && entries.length === 0 && (
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-12 text-center text-[var(--text-tertiary)]">
          <Icon className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="text-base font-medium">{search.trim() ? "Ninguna línea coincide con la búsqueda." : meta.empty}</p>
          {!search.trim() && period.from && (
            <p className="mt-1 text-sm">Mostrando {period.label} — puede haber líneas fuera de este período.</p>
          )}
        </div>
      )}
      {loading && <TablaSkeleton filas={4} columnas={9} />}
      </ZonaLibro>

      {importarParte && (
        <CtpProduccionImportModal
          onListo={() => { void load(); }}
          onClose={() => setImportarParte(false)}
        />
      )}
      {/* Sólo Despacho: la producción se registra desde el lote (ADR-349) y el
          formulario en blanco pedía a mano lo que el lote ya sabe.
          El alta es la GUÍA completa (ADR-362): sus datos y su lista de
          productos, que se convierte en una línea del libro por producto. */}
      {showForm && section === "despacho" && (
        <CtpDespachoGuiaModal
          presetProducto={productoDelStock?.producto ?? null}
          presetEspecie={productoDelStock?.especie ?? null}
          onClose={() => { setShowForm(false); setProductoDelStock(null); }}
          onSaved={({ lineas, offline }) => {
            setShowForm(false);
            setProductoDelStock(null);
            void load();
            if (offline) {
              pushToast({
                tono: "warning",
                msg: "Sin señal: quedó anotado en el patio",
                detail: `${lineas} producto${lineas === 1 ? "" : "s"} todavía NO están en el libro. Suben solos cuando vuelva la conexión.`,
              });
            } else {
              pushToast({
                tono: "success",
                msg: `Guía registrada · ${lineas} ${lineas === 1 ? "línea" : "líneas"}`,
                detail: "Ya se puede emitir el anexo 04 y el certificado desde la ficha del despacho.",
              });
            }
          }}
        />
      )}
      {verBandeja && (
        <Anexo04Modal
          rows={[]}
          abrirHistorial
          onAviso={(msg, tono) => pushToast({ tono, msg })}
          onCerrar={() => { setVerBandeja(false); cargarAnexos(); }}
        />
      )}

      {anexoEntry && (
        <Anexo04Modal
          rows={[]}
          especieGlobal={anexoEntry.speciesCommon ?? undefined}
          ctpEntryId={anexoEntry.id}
          declarado={{ cantidad: Number(anexoEntry.quantity ?? 0), unidad: anexoEntry.unit, piezas: anexoEntry.pieces }}
          // El anexo y la guía son los dos papeles del mismo camión: se miran
          // en el mismo modal en vez de en dos pantallas.
          despacho={anexoEntry.section === "despacho" ? anexoEntry : undefined}
          onAviso={(msg, tono) => pushToast({ tono, msg })}
          onCerrar={() => { setAnexoEntry(null); cargarAnexos(); }}
        />
      )}

      <ActionToasts toasts={toasts} onDismiss={dismissToast} />

      {/* Al cerrar se recarga: en la ficha se emite la GTF y se edita la atribución,
          y sin esto la fila seguía mostrando el número y el origen viejos. */}
      {chainEntry && section === "despacho" && (
        <CtpDespachoDetalleModal entry={chainEntry} onClose={() => { setChainEntry(null); void load(); }} />
      )}
      {/* Los papeles que viajan con el camión, archivados y etiquetados. */}
      {guiaEntry && (
        <CtpGuiaDeLineaModal
          linea={{
            id: guiaEntry.id,
            lineNo: guiaEntry.lineNo,
            entryDate: guiaEntry.entryDate,
            gtfNumber: guiaEntry.gtfNumber,
            gtfDatos: guiaEntry.gtfDatos,
            speciesCommon: guiaEntry.speciesCommon,
            productType: guiaEntry.productType,
          }}
          onClose={() => setGuiaEntry(null)}
          onCambio={() => void load()}
        />
      )}
      {papelesEntry && (
        <CtpPapelesDespachoModal
          gtfNumber={papelesEntry.gtfNumber}
          despachoId={papelesEntry.id}
          onClose={() => setPapelesEntry(null)}
          onListo={(msg) => {
            setPapelesEntry(null);
            pushToast({ tono: "success", msg, detail: "Están en el Drive, en «Papeles de despacho (CTP)»." });
          }}
        />
      )}

      {chainEntry && section === "produccion" && <CtpProduccionDetalleModal entry={chainEntry} onClose={() => setChainEntry(null)} />}

      {annulId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setAnnulId(null)}>
          <div className="w-full max-w-md rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <CardTitle as="h3" className="text-base font-bold text-[var(--text-primary)]">Anular línea</CardTitle>
            <p className="mt-1 text-sm text-[var(--text-tertiary)]">Indicá el motivo (queda en el historial, no se borra).</p>
            <input autoFocus value={annulReason} onChange={(e) => setAnnulReason(e.target.value)} placeholder="Motivo (min 3 caracteres)" className="mt-3 h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm outline-none focus:border-[var(--data-error-500)]" />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setAnnulId(null)} className="inline-flex h-10 items-center rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)]">Cancelar</button>
              <button type="button" disabled={annulReason.trim().length < 3 || pending} onClick={annul} className="inline-flex h-10 items-center rounded-xl bg-[var(--data-error-600)] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">Confirmar anulación</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Celda de rendimiento con alerta de sobre-declaración vs. el referencial SERFOR. */

/** Encabezado de columna ordenable: click alterna asc/desc; indica el estado con flecha. */

/** Chip de filtro por estado (mismo lenguaje que los de Ingresos). */
function EntryChip({ label, count, active, onClick, tone = "accent" }: {
  label: string; count: number; active: boolean; onClick: () => void; tone?: "accent" | "muted";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-bold transition ${
        active
          ? tone === "muted"
            ? "border-[var(--text-tertiary)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
            : "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
      }`}
    >
      {label}
      <span className={`rounded-full px-1.5 py-0.5 text-[length:var(--ts-2xs)] tabular-nums ${active ? "bg-[var(--surface-raised)]/70" : "bg-[var(--surface-sunken)]"}`}>{count}</span>
    </button>
  );
}
